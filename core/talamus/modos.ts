/**
 * LOS MODOS DEL TÁLAMO — la misma pregunta, tres presupuestos.
 *
 * El Tálamo arma el paquete de contexto que ve la ejecución (core/talamus/
 * context-packager.ts). Hasta ahora tenía un solo modo. Pero un motor grande
 * con 200K de contexto y un modelo local con 32K no pueden gastar lo mismo:
 * y hay un modo para cuando lo que importa es el coste.
 *
 * Los tres modos, con sus reglas:
 *
 *   - **estándar**: lo de siempre. Los marginales entran si sobra presupuesto.
 *   - **ahorrador**: sólo lo relevante, con la mitad de presupuesto. Es el
 *     «token saver» de las GUIs de agentes: el mismo elenco, la misma
 *     pregunta, menos tokens.
 *   - **equipo**: más presupuesto (el equipo comparte el contexto) y los
 *     marginales antes.
 *
 * Lo importante: **el ahorro no se promete, se mide**. `comparaModos` devuelve
 * el porcentaje real, sobre una pregunta y unos candidatos de verdad. Un
 * ahorrador que no ahorra es un adorno, y aquí se ve.
 *
 * Referencia: estandar/contexto.spec.yaml, core/talamus/context-packager.ts.
 */
import {
  selectMemoriesForPack,
  veredicto,
  UMBRAL_SALIENCIA,
  type Paquete,
  type Recuerdo,
} from "./context-packager.ts";

/** Los modos del contexto. */
export type ModoContexto = "estandar" | "ahorrador" | "equipo";

/** Las reglas de un modo. */
export interface ReglaModo {
  /** El nombre que ve la persona. */
  nombre: string;
  /** El presupuesto de tokens del paquete. */
  budget: number;
  /** El score mínimo para entrar. */
  minimo: number;
  /** Si los marginales pueden entrar. */
  marginales: boolean;
  /** Cuánto presupuesto libre tiene que quedar para que un marginal entre. */
  margen: number;
}

/**
 * Los tres modos.
 *
 * Los presupuestos no son redondos por casualidad: son fracciones del
 * contexto de un motor normal (200K tokens en la ventana) para que el número
 * que sale sea el que se ve en la interfaz.
 */
export const MODOS: Record<ModoContexto, ReglaModo> = {
  estandar: {
    nombre: "Estándar",
    budget: 400,
    minimo: UMBRAL_SALIENCIA,
    marginales: true,
    margen: 0.3,
  },
  ahorrador: {
    nombre: "Ahorrador",
    budget: 150,
    minimo: 0.45,
    marginales: false,
    margen: 0,
  },
  equipo: {
    nombre: "Equipo",
    budget: 1200,
    minimo: UMBRAL_SALIENCIA,
    marginales: true,
    margen: 0.1,
  },
};

/**
 * Un modo empaqueta con sus reglas.
 *
 * El empaque es SIEMPRE el del Tálamo (una sola implementación): lo que
 * cambia son sus parámetros (presupuesto, umbral y margen). Si el ahorrador
 * fuera otro empaque, dejarían de ser comparables — y un ahorro medido
 * contra otro algoritmo no es un ahorro: es otra cosa.
 */
export function empaquetaEn(
  query: string,
  candidatos: Recuerdo[],
  modo: ModoContexto
): Paquete {
  const regla = MODOS[modo];
  return selectMemoriesForPack(query, candidatos, regla.budget, {
    umbral: regla.minimo,
    margen: regla.margen,
    marginales: regla.marginales,
  });
}

/** El resultado de comparar: los tokens y el ahorro REAL. */
export interface ResultadoModos {
  estandar: Paquete;
  ahorrador: Paquete;
  equipo: Paquete;
  /** El ahorro del ahorrador sobre el estándar, en porcentaje (0-100). */
  ahorro_pct: number;
  /** Los tokens ahorrados (número entero). */
  tokens_ahorrados: number;
}

/**
 * Compara los tres modos con la misma pregunta y los mismos candidatos.
 *
 * El ahorro sale de los tokens de verdad: no hay porcentaje escrito a mano.
 */
export function comparaModos(
  query: string,
  candidatos: Recuerdo[]
): ResultadoModos {
  const estandar = empaquetaEn(query, candidatos, "estandar");
  const ahorrador = empaquetaEn(query, candidatos, "ahorrador");
  const equipo = empaquetaEn(query, candidatos, "equipo");
  const tokensEstandar = estandar.tokens_gastados;
  const tokensAhorrador = ahorrador.tokens_gastados;
  const ahorro =
    tokensEstandar > 0 ? ((tokensEstandar - tokensAhorrador) / tokensEstandar) * 100 : 0;
  return {
    estandar,
    ahorrador,
    equipo,
    ahorro_pct: Math.round(ahorro * 10) / 10,
    tokens_ahorrados: Math.max(0, tokensEstandar - tokensAhorrador),
  };
}
