/**
 * Tálamo — arma el paquete de contexto visible por ejecución.
 * Referencia: doc specs de la absorción (12-oct): el fallo de hoy era
 * semántica pura: tablas y fragmentos largos fallaban. El packager separa:
 * (1) trocea por filas de tabla y por apartados, (2) Laya opina "relevante /
 * marginal / ruido", (3) al encajonar sobra budget antes de nada.
 */
export interface Recuerdo {
  id: string;
  texto: string;
  tokens: number;         // presupuesto medido, no estimado
  score: number;          // la Lente: similitud semántica 0–1
  fuente?: { tabla?: boolean };
}

export type VeredictoTalamo = "relevante" | "marginal" | "ruido";

export interface Paquete {
  seleccionados: Recuerdo[];
  tokens_gastados: number;
  veredictos: { id: string; veredicto: VeredictoTalamo }[];
}

/** Umbral del Tálamo: lo que la Lente pone bajo esto y con etiqueta ruidosa, no entra. */
export const UMBRAL_SALIENCIA = 0.25;

export function veredicto(r: Recuerdo): VeredictoTalamo {
  if (r.score < UMBRAL_SALIENCIA) return "ruido";
  if (r.score < 0.45) return "marginal";
  return "relevante";
}

/**
 * selectMemoriesForPack: orden por score descendente, consume budget de tokens
 * sin cortar un recuerdo por la mitad (si no cabe entero, se busca el siguiente),
 * los "ruido" jamás suben. Los "marginal" solo si suelto budget > 30%.
 */
export function selectMemoriesForPack(
  query: string,
  candidates: Recuerdo[],
  budget: number
): Paquete {
  const orden = [...candidates].sort((a, b) => b.score - a.score);
  const seleccionados: Recuerdo[] = [];
  const veredictos: Paquete["veredictos"] = [];
  let gastados = 0;

  for (const r of orden) {
    const v = veredicto(r);
    veredictos.push({ id: r.id, veredicto: v });
    if (v === "ruido") continue;
    const esMarginal = v === "marginal";
    if (esMarginal && gastados > 0 && gastados / budget > 0.7) continue;
    if (gastados + r.tokens > budget) continue;
    seleccionados.push(r);
    gastados += r.tokens;
  }
  // traza para laya.jsonl (180 días, sin datos personales): el query se recorta
  return {
    seleccionados,
    tokens_gastados: gastados,
    veredictos,
  };
}

/** QR del pack: quién decidió qué y con qué evidencia (para el Reglamento de la OPA). */
export function traceDeDecisión(p: Paquete, query: string) {
  return { q: query.slice(0, 64), n: p.seleccionados.length, gasto: p.tokens_gastados };
}
