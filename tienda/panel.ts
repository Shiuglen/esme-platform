// panel — el juez de la tienda: qué entra, qué queda fuera y POR QUÉ.
// Cruza las tres llaves: índice firmado (firma.ts), manifiesto (validator)
// y bench de la Prueba 0 (bench.ts). La salida es un veredicto legible.
import { verificarIndex, type Veredicto } from "./firma.ts";

export interface FilaPanel {
  id: string;
  version: string | null;
  entra: boolean;
  causa: string;
  /** Quién lo publicó (la huella del firmante, 16 hex) — si se sabe. */
  publicado_por: string | null;
  /** Cuándo lo publicó. */
  publicado_en: string | null;
  /**
   * Lo que el módulo PIDE (sus permisos).
   *
   * Por qué está aquí y no sólo en el manifiesto: la persona decide si
   * instala antes de instalar. Un módulo que pide lanzar programas tiene que
   * decirlo en la vitrina, no en el consentimiento que aparece después.
   */
  permisos: string[];
}

export interface Panel {
  firmaVerifica: boolean | "sin-firma";
  huella: string | null; // quién firmó el índice (16 hex)
  claves: string[]; // las claves que el índice declara (huellas)
  filas: FilaPanel[];
}

interface EntradaIndice {
  id?: unknown;
  version?: unknown;
  category?: unknown;
  bench?: unknown;
  bench_ciclo?: unknown;
  firma_ok?: unknown;
  publicado_por?: unknown;
  publicado_en?: unknown;
  permisos?: unknown;
}

interface BenchIndice {
  modulo?: string;
  version?: string;
  casos?: number;
  recall_base?: number;
  recall_con?: number;
  tokens_base?: number;
  tokens_con?: number;
  fecha?: string;
  semilla?: number;
}

interface BenchCicloIndice {
  modulo?: string;
  version?: string;
  casos?: number;
  ciclo_ok?: unknown;
  tokens_ciclo?: number;
}

/** Levanta el panel de un índice **NO** firmado aún: juzga por contenido. */
export function panelDe(
  indice: Record<string, unknown>,
  opts: { pubKey?: string } = {}
): Panel {
  let firmaVerifica: Panel["firmaVerifica"] = "sin-firma";
  if (indice.signature && opts.pubKey) {
    const r: Veredicto = verificarIndex(indice, opts.pubKey);
    firmaVerifica = r.ok;
  }

  const filas: FilaPanel[] = [];
  const modulos = Array.isArray(indice.modulos) ? (indice.modulos as EntradaIndice[]) : [];
  // la procedencia de cada entrada: quién lo publicó y cuándo
  const procedencia = (
    m: EntradaIndice
  ): { publicado_por: string | null; publicado_en: string | null; permisos: string[] } => ({
    publicado_por: typeof m.publicado_por === "string" ? m.publicado_por : null,
    publicado_en: typeof m.publicado_en === "string" ? m.publicado_en : null,
    // lo que el módulo pide: se ve en la vitrina, antes de instalar
    permisos: Array.isArray(m.permisos) ? (m.permisos as unknown[]).map(String) : [],
  });
  for (const m of modulos) {
    const id = typeof m.id === "string" ? m.id : "<sin id>";
    const version = typeof m.version === "string" ? m.version : null;
    const herramienta = m.category === "tool";

    // módulos herramienta: el bench es el CICLO completo, no el recall
    if (herramienta || (!m.bench && m.bench_ciclo)) {
      const c = m.bench_ciclo as BenchCicloIndice | undefined;
      if (!c) {
        filas.push({ id, version, entra: false, causa: "sin bench de ciclo: el índice no publica eso", ...procedencia(m) });
        continue;
      }
      const tokens = Math.round((c.tokens_ciclo ?? 0) * 10) / 10;
      if (c.ciclo_ok === true && (c.casos ?? 0) >= 3 && (c.tokens_ciclo ?? 1e9) <= 500) {
        filas.push({
          id,
          version,
          entra: true,
          causa: `el ciclo funciona: ${c.casos} escenarios, ${tokens} tokens por ciclo`,
          ...procedencia(m),
        });
      } else {
        filas.push({
          id,
          version,
          entra: false,
          causa: `el ciclo de la herramienta no pasa (ciclo_ok=${String(c.ciclo_ok)}, ${c.casos ?? 0} escenarios, ${tokens} tokens)`,
          ...procedencia(m),
        });
      }
      continue;
    }

    if (!m.bench) {
      filas.push({ id, version, entra: false, causa: "sin bench de la Prueba 0: el índice no publica eso", ...procedencia(m) });
      continue;
    }
    const b = m.bench as BenchIndice;
    const recallDelta = (b.recall_con ?? 0) - (b.recall_base ?? 0);
    const tokensMejora =
      ((b.tokens_base ?? 1) - (b.tokens_con ?? 1)) / Math.max(b.tokens_base ?? 1, 1);
    if ((b.casos ?? 0) >= 10 && (recallDelta >= 0.01 || tokensMejora >= 0.1)) {
      filas.push({
        id,
        version,
        entra: true,
        causa:
          recallDelta >= 0.01
            ? `la Prueba 0 lo avala: +${recallDelta.toFixed(3)} recall en ${b.casos} casos`
            : `gasta ${(tokensMejora * 100).toFixed(1)}% menos tokens`,
        ...procedencia(m),
      });
    } else {
      filas.push({
        id,
        version,
        entra: false,
        causa: `la Prueba 0 no lo avala (guardó ${recallDelta.toFixed(3)}, tokens −${(tokensMejora * 100).toFixed(1)}%, ${b.casos ?? 0} casos)`,
        ...procedencia(m),
      });
    }
  }
  return {
    firmaVerifica,
    huella:
      indice.signature && typeof indice.signature === "object"
        ? ((indice.signature as { signed_by?: string }).signed_by ?? null)
        : null,
    claves: Object.keys((indice.claves as Record<string, unknown>) ?? {}),
    filas,
  };
}

/** Render en texto para panel.md (lo que el mantenedor editorializa). */
export function render(p: Panel): string {
  const lineas: string[] = [];
  lineas.push(`# Panel de la tienda`);
  lineas.push("");
  const estado = p.firmaVerifica === true ? "verificada" : p.firmaVerifica === false ? "FALLA" : "sin verificar (falta clave)";
  const quien = p.huella ? ` (huella ${p.huella.slice(0, 8)}…, ${p.claves.length} clave(s) declaradas)` : "";
  lineas.push(`Firma del índice: ${estado}${quien}`);
  lineas.push("");
  for (const f of p.filas) {
    const quien = f.publicado_por
      ? ` — publicado por ${f.publicado_por.slice(0, 8)}…${f.publicado_en ? ` el ${f.publicado_en}` : ""}`
      : "";
    // lo que pide, en la vitrina: una puerta se pide antes de abrirla
    const pide = f.permisos.length ? ` · pide ${f.permisos.join(", ")}` : "";
    lineas.push(
      `- ${f.entra ? "✓ ENTRA" : "✗ FUERA"} \`${f.id}\`` +
        (f.version ? ` @${f.version}` : "") +
        ` — ${f.causa}${pide}${quien}`
    );
  }
  lineas.push("");
  return lineas.join("\n");
}
