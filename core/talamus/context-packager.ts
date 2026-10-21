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
  /**
   * Lo que NO entró y por qué (sólo si se pidió el detalle).
   *
   * Es la diferencia entre recortar en silencio y recortar explainado: un
   * recorte que no se puede revisar no se puede corregir.
   */
  fuera?: Array<{ id: string; tokens: number; motivo: "ruido" | "marginal" | "no-cabe" }>;
  /**
   * El recibo del paquete: qué pregunta lo pidió, cuántos recuerdos llevaba y
   * qué costó.
   *
   * Viaja CON el paquete, no aparte: un recibo que hay que ir a buscar a otro
   * fichero no es un recibo. Y no lleva datos personales: la pregunta se
   * recorta a 64 caracteres (es la traza que va al registro, 180 días).
   */
  traza: TrazaPaquete;
}

/** El recibo del paquete (lo que se registra de cada ejecución). */
export interface TrazaPaquete {
  /** La pregunta, recortada (sin datos personales). */
  q: string;
  /** Cuántos recuerdos entraron. */
  n: number;
  /** Cuántos tokens costó. */
  gasto: number;
}

/** Umbral del Tálamo: lo que la Lente pone bajo esto y con etiqueta ruidosa, no entra. */
export const UMBRAL_SALIENCIA = 0.25;

export function veredicto(r: Recuerdo, umbral = UMBRAL_SALIENCIA): VeredictoTalamo {
  if (r.score < umbral) return "ruido";
  if (r.score < 0.45) return "marginal";
  return "relevante";
}

/** Las reglas del empaque (con las de la casa por defecto). */
export interface OpcionesEmpaque {
  /** El score mínimo para entrar (por debajo: ruido). */
  umbral?: number;
  /**
   * Cuánto presupuesto libre tiene que quedar para que un MARGINAL entre
   * (0,3 = entran cuando queda el 30 %; es el valor de la casa).
   */
  margen?: number;
  /** Si los marginales pueden entrar siquiera (false = sólo lo relevante). */
  marginales?: boolean;
  /**
   * Que el empaque diga lo que dejó fuera y por qué.
   *
   * Cuesta un poco más (hay que llevar la cuenta), pero un recorte sin
   * explicación no se puede revisar: es elCompactar que se docta.
   */
  detalle?: boolean;
}

/**
 * selectMemoriesForPack: orden por score descendente, consume budget de tokens
 * sin cortar un recuerdo por la mitad (si no cabe entero, se busca el siguiente),
 * los "ruido" jamás suben. Los "marginal" solo si suelto budget > 30%.
 *
 * Las reglas son PARÁMETROS (con los valores de la casa por defecto): así los
 * modos del contexto (core/talamus/modos.ts) usan ESTE empaque y no otro.
 */
export function selectMemoriesForPack(
  query: string,
  candidates: Recuerdo[],
  budget: number,
  opts: OpcionesEmpaque = {}
): Paquete {
  const umbral = opts.umbral ?? UMBRAL_SALIENCIA;
  const margen = opts.margen ?? 0.3;
  const marginales = opts.marginales ?? true;
  const detalle = opts.detalle ?? false;
  const fuera: NonNullable<Paquete["fuera"]> = [];
  const orden = [...candidates].sort((a, b) => b.score - a.score);
  const seleccionados: Recuerdo[] = [];
  const veredictos: Paquete["veredictos"] = [];
  let gastados = 0;

  for (const r of orden) {
    const v = veredicto(r, umbral);
    veredictos.push({ id: r.id, veredicto: v });
    if (v === "ruido") {
      if (detalle) fuera.push({ id: r.id, tokens: r.tokens, motivo: "ruido" });
      continue;
    }
    const esMarginal = v === "marginal";
    if (esMarginal && !marginales) {
      if (detalle) fuera.push({ id: r.id, tokens: r.tokens, motivo: "marginal" });
      continue;
    }
    if (esMarginal && gastados > 0 && gastados / budget > 1 - margen) {
      if (detalle) fuera.push({ id: r.id, tokens: r.tokens, motivo: "marginal" });
      continue;
    }
    if (gastados + r.tokens > budget) {
      if (detalle) fuera.push({ id: r.id, tokens: r.tokens, motivo: "no-cabe" });
      continue;
    }
    seleccionados.push(r);
    gastados += r.tokens;
  }
  // traza para laya.jsonl (180 días, sin datos personales): el query se recorta
  const paquete: Paquete = {
    seleccionados,
    tokens_gastados: gastados,
    veredictos,
    ...(detalle ? { fuera } : {}),
    traza: { q: query.slice(0, 64), n: seleccionados.length, gasto: gastados },
  };
  return paquete;
}

/**
 * QR del pack: quién decidió qué y con qué evidencia (para el Reglamento de la OPA).
 *
 * El mismo recibo que viaja en el paquete (`p.traza`), pero para quien ya
 * tiene el paquete y quiere el QR suelto.
 */
export function traceDeDecision(p: Paquete, query: string): TrazaPaquete {
  return { q: query.slice(0, 64), n: p.seleccionados.length, gasto: p.tokens_gastados };
}
