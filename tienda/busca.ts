/**
 * BUSCAR EN LA TIENDA — lo que hay, y lo que mejora de verdad.
 *
 * Publicar sin que nadie pueda encontrar lo publicado es publicar en un
 * cajón. Así que la tienda se busca: por texto (el id, la categoría, la causa
 * del veredicto) y, cuando no hay texto, **por lo que cada módulo ha
 * demostrado**: el que más recall mejora, el que menos tokens gasta.
 *
 * Y el orden no es una opinión: sale de los números que el juez escribió en el
 * índice firmado. Buscar es, en el fondo, leer el índice.
 *
 * Referencia: tienda/veredictos-modulos.ts (la forma de los números).
 */
import type { VeredictoModulo } from "../core/modulos/veredicto.ts";

/** Una entrada del índice, tal y como la tienda la publica. */
export interface EntradaIndice {
  id: string;
  version: string;
  category?: string;
  bench?: { recall_base?: number; recall_con?: number; tokens_base?: number; tokens_con?: number; casos?: number };
  bench_ciclo?: { casos?: number; ciclo_ok?: boolean; tokens_ciclo?: number };
  firma_ok?: boolean;
  artefacto?: { tar?: string; bytes?: number };
  /** Qué hace (para poder buscarlo: un módulo sin descripción no se encuentra). */
  descripcion?: string;
  /** El vocabulario semántico del módulo (sus decision_criteria). */
  etiquetas?: string[];
  publicado_por?: string;
  publicado_en?: string;
}

/** El índice de la tienda. */
export interface IndiceTienda {
  modulos?: EntradaIndice[];
}

/** Un módulo, con su medida y su posición. */
export interface ResultadoBusqueda {
  id: string;
  version: string;
  category: string;
  entra: boolean;
  /** La mejora medida (recall) o null si no es de memoria. */
  mejora: number | null;
  /** Los tokens por ciclo (si es de herramienta). */
  tokens_ciclo: number | null;
  /** Los tokens ahorrados (si es de memoria). */
  tokens_ahorrados: number | null;
  /** Por qué aparece (la coincidencia). */
  porque: string;
}

/** Los tokens de una palabra (la cuenta de la casa: 4 caracteres). */
const palabras = (t: string): string[] =>
  (t ?? "")
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñ]+/)
    .filter((p) => p.length > 2);

/**
 * Busca en la tienda.
 *
 * Sin texto: sale TODO, ordenado por lo que mejora (el que más recall
 * mejora primero; y los de herramienta, por los tokens que gasta).
 *
 * Con texto: salen los que coinciden, y también se pueden ordenar.
 */
export function buscaEnTienda(
  indice: IndiceTienda,
  texto = "",
  opts: { soloEntran?: boolean; limite?: number } = {}
): ResultadoBusqueda[] {
  const modulos = indice.modulos ?? [];
  const palabrasBuscadas = palabras(texto);
  const salida: ResultadoBusqueda[] = [];

  for (const m of modulos) {
    const entra = m.firma_ok !== false;
    if (opts.soloEntran && !entra) continue;

    const mejora =
      m.bench && typeof m.bench.recall_con === "number" && typeof m.bench.recall_base === "number"
        ? m.bench.recall_con - m.bench.recall_base
        : null;
    const tokensAhorrados =
      m.bench && typeof m.bench.tokens_base === "number" && typeof m.bench.tokens_con === "number"
        ? m.bench.tokens_base - m.bench.tokens_con
        : null;
    const tokensCiclo =
      typeof m.bench_ciclo?.tokens_ciclo === "number" ? m.bench_ciclo.tokens_ciclo : null;

    // ¿coincide con lo que se busca?
    const textoModulo = `${m.id} ${m.category ?? ""} ${m.descripcion ?? ""} ${m.publicado_en ?? ""}`;
    const palabrasModulo = palabras(textoModulo);
    const coincidencia = palabrasBuscadas.filter(
      (p) => palabrasModulo.includes(p) || (m.etiquetas ?? []).some((t) => palabras(t).includes(p))
    );
    if (palabrasBuscadas.length && !coincidencia.length) continue;

    salida.push({
      id: m.id,
      version: m.version,
      category: m.category ?? "tool",
      entra,
      mejora,
      tokens_ciclo: tokensCiclo,
      tokens_ahorrados: tokensAhorrados,
      porque: coincidencia.length
        ? `coincide con «${coincidencia.join(", ")}»`
        : mejora !== null
          ? `mejora ${mejora.toFixed(3)} de recall en ${m.bench?.casos ?? "?"} casos`
          : tokensCiclo !== null
            ? `el ciclo funciona con ${Math.round(tokensCiclo)} tokens`
            : "sin medida",
    });
  }

  // el orden: primero lo que más mejora; a igual, lo que menos tokens gasta
  salida.sort((a, b) => {
    const ma = a.mejora ?? (a.tokens_ciclo !== null ? -a.tokens_ciclo / 1000 : -1);
    const mb = b.mejora ?? (b.tokens_ciclo !== null ? -b.tokens_ciclo / 1000 : -1);
    if (ma !== mb) return mb - ma;
    return a.id.localeCompare(b.id);
  });

  return opts.limite ? salida.slice(0, opts.limite) : salida;
}

/** El texto que ve la persona (la lista de la tienda, ordenada). */
export function renderBusqueda(lista: ResultadoBusqueda[]): string {
  if (!lista.length) return "nada coincide";
  const lineas: string[] = [];
  for (const r of lista) {
    lineas.push(
      `${r.entra ? "✓" : "✗"} ${r.id.padEnd(34)} v${r.version.padEnd(7)} ${r.category.padEnd(8)} — ${r.porque}`
    );
  }
  return lineas.join("\n");
}
