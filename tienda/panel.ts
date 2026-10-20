// panel — el juez de la tienda: qué entra, qué queda fuera y POR QUÉ.
// Cruza las tres llaves: índice firmado (firma.ts), manifiesto (validator)
// y bench de la Prueba 0 (bench.ts). La salida es un veredicto legible.
import { verificarIndex, type Veredicto } from "./firma.ts";

export interface FilaPanel {
  id: string;
  version: string | null;
  entra: boolean;
  causa: string;
}

export interface Panel {
  firmaVerifica: boolean | "sin-firma";
  filas: FilaPanel[];
}

interface EntradaIndice {
  id?: unknown;
  version?: unknown;
  bench?: unknown;
  firma_ok?: unknown;
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
  for (const m of modulos) {
    const id = typeof m.id === "string" ? m.id : "<sin id>";
    const version = typeof m.version === "string" ? m.version : null;
    if (!m.bench) {
      filas.push({ id, version, entra: false, causa: "sin bench de la Prueba 0: el índice no publica eso" });
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
      });
    } else {
      filas.push({
        id,
        version,
        entra: false,
        causa: `la Prueba 0 no lo avala (guardó ${recallDelta.toFixed(3)}, tokens −${(tokensMejora * 100).toFixed(1)}%, ${b.casos ?? 0} casos)`,
      });
    }
  }
  return { firmaVerifica, filas };
}

/** Render en texto para panel.md (lo que el mantenedor editorializa). */
export function render(p: Panel): string {
  const lineas: string[] = [];
  lineas.push(`# Panel de la tienda`);
  lineas.push("");
  lineas.push(`Firma del índice: ${p.firmaVerifica === true ? "verificada" : p.firmaVerifica === false ? "FALLA" : "sin verificar (falta clave)"}`);
  lineas.push("");
  for (const f of p.filas) {
    lineas.push(`- ${f.entra ? "✓ ENTRA" : "✗ FUERA"} \`${f.id}\`` + (f.version ? ` @${f.version}` : "") + ` — ${f.causa}`);
  }
  lineas.push("");
  return lineas.join("\n");
}
