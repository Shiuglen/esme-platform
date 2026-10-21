/**
 * EL TURNO — una conversación es una lista de DATOS.
 *
 * Lo que pasó entre la pregunta y la respuesta, escrito: la respuesta (lo que
 * ve la persona), la actividad (los pasos de las herramientas, PLEGADOS), los
 * ficheros que cambió, y los tokens y el coste (medidos, no estimados).
 *
 * Por qué el kit se ocupa de esto: dos reglas de la casa que, sin un
 * contrato, se incumplen sin que nadie lo note.
 *
 *   1. **«Los pasos se pliegan, el chat queda limpio».** Esa regla se puede
 *      MEDIR: la respuesta es la mayor parte de lo que la persona lee. Si los
 *      pasos pesan más que la respuesta, el chat se ensució. `limpiezaDelTurno`
 *      da el número, y `LIMPIEZA_MINIMA` es el listón de la casa.
 *   2. **«Lo que cambió en cada turno»**: un turno que no dice qué tocó no es
 *      un turno, es un mensaje.
 *
 * Lo que este fichero NO es: un formato de chat. La ventana decide cómo lo
 * dibuja; aquí sólo está lo que pasó.
 *
 * Referencia: estandar/turno.spec.yaml, core/talamus/modos.ts.
 */
import type { ModoContexto } from "../talamus/modos.ts";
import type { ResultadoCambios } from "./cambios.ts";

/** Un paso de herramienta. */
export interface PasoTurno {
  /** Qué se hizo. */
  paso: string;
  /** Si salió bien. */
  estado: "ok" | "fallo";
  /** El resultado en una línea (opcional). */
  detalle?: string;
}

/**
 * Un fichero que el turno tocó.
 *
 * `anadidos` y `borrados` pueden ser NULL: cuando no se sabe (un binario no
 * tiene líneas, o el diff era más grande que el tope). Un 0 falso sería una
 * mentira, y aquí los números se_FALSEAN.
 */
export interface CambioTurno {
  /** La ruta. */
  ruta: string;
  /** Las líneas que se añadieron (null si no se sabe). */
  anadidos: number | null;
  /** Las líneas que se quitaron (null si no se sabe). */
  borrados: number | null;
}

/** El turno: lo que pasó. */
export interface Turno {
  /** El id estable. */
  id: string;
  /** El motor que respondió. */
  motor: string;
  /** El modo del contexto que se usó. */
  modo: ModoContexto;
  /** Lo que se preguntó. */
  pregunta: string;
  /** Lo que vio la persona. */
  respuesta: string;
  /** Los pasos (plegados). */
  actividad: PasoTurno[];
  /** Lo que el turno tocó. */
  cambios: CambioTurno[];
  /** Los tokens. */
  tokens: {
    /** Lo que metió el Tálamo. */
    contexto: number;
    /** Lo que mide la respuesta. */
    respuesta: number;
    /** Lo que costó la actividad (con sus detalles). */
    actividad: number;
    /**
     * Lo que la actividad CUESTA cuando va plegada: UNA línea («3 pasos»),
     * no una por paso. Es lo que la persona ve de verdad, y por eso es lo
     * que cuenta para la limpieza: plegar es lo que mantiene el chat limpio,
     * y su beneficio se puede medir.
     */
    actividad_plegada: number;
    /** La suma de todo. */
    total: number;
  };
  /** El coste (si el motor es de API). */
  coste_usd?: number;
  /** El presupuesto que respeta. */
  presupuesto?: { tokens: number; segundos: number };
}

/**
 * El listón de limpieza: qué porcentaje de lo que se lee tiene que ser la
 * respuesta. Por debajo de esto, el chat se ensució.
 */
export const LIMPIEZA_MINIMA = 0.6;

/** Los tokens de un texto: la cuenta de la casa (4 caracteres ≈ 1 token). */
export function tokensDe(texto: string): number {
  return Math.ceil((texto ?? "").length / 4);
}

/** Lo que se le pasa al constructor del turno. */
export interface PiezasTurno {
  id: string;
  motor: string;
  modo: ModoContexto;
  pregunta: string;
  respuesta: string;
  actividad?: PasoTurno[];
  cambios?: CambioTurno[];
  /** Los tokens del contexto (los que metió el Tálamo). */
  tokens_contexto?: number;
  /** El coste, si lo hubo. */
  coste_usd?: number;
  presupuesto?: { tokens: number; segundos: number };
}

/**
 * Arma un turno y cuadra sus números.
 *
 * Los tokens de la respuesta y de los pasos se miden sobre el texto; el del
 * contexto lo dice el Tálamo; y el total es la suma. Si las partes no
 * cuadran, el turno se dice mal — no se corrige en silencio (la regla del
 * contrato: el total coincide).
 */
export function armaTurno(p: PiezasTurno): Turno {
  const actividad = p.actividad ?? [];
  const cambios = p.cambios ?? [];
  const tokensRespuesta = tokensDe(p.respuesta);
  const tokensActividad = actividad.reduce(
    (n, a) => n + tokensDe(`${a.paso}${a.detalle ?? ""}`),
    0
  );
  const contexto = p.tokens_contexto ?? 0;
  // plegada: una sola línea (si hay un paso, su nombre; si hay varios, el
  // recuento). Es lo que se ve con los pasos plegados.
  const plegada =
    actividad.length === 0
      ? 0
      : actividad.length === 1
        ? tokensDe(actividad[0].paso)
        : tokensDe(`${actividad.length} pasos`);
  return {
    id: p.id,
    motor: p.motor,
    modo: p.modo,
    pregunta: p.pregunta,
    respuesta: p.respuesta,
    actividad,
    cambios,
    tokens: {
      contexto,
      respuesta: tokensRespuesta,
      actividad: tokensActividad,
      actividad_plegada: plegada,
      total: contexto + tokensRespuesta + tokensActividad,
    },
    ...(p.coste_usd === undefined ? {} : { coste_usd: p.coste_usd }),
    ...(p.presupuesto ? { presupuesto: p.presupuesto } : {}),
  };
}

/**
 * El peso de la actividad: cuánto trabajo hay detrás de la respuesta.
 *
 * No es una regla (no hay listón): es el dato que explica un turno pesado.
 * Diez veces más trabajo que respuesta es un turno que enseña el processo y
 * olvida el resultado.
 */
export function pesoDeLaActividad(t: Turno): number {
  if (t.tokens.respuesta === 0) return t.tokens.actividad > 0 ? Infinity : 0;
  return t.tokens.actividad / t.tokens.respuesta;
}

/**
 * La limpieza de una SESIÓN: qué porcentaje de lo que se lee son respuestas.
 *
 * La regla de la casa es de la conversación, no del turno suelto: lo que se
 * ensucia es el chat entero.
 */
export function limpiezaDeLaSesion(turnos: Turno[]): number {
  const respuesta = turnos.reduce((n, t) => n + t.tokens.respuesta, 0);
  const plegada = turnos.reduce((n, t) => n + t.tokens.actividad_plegada, 0);
  if (respuesta + plegada === 0) return 1;
  return respuesta / (respuesta + plegada);
}

/**
 * Los cambios de un turno, en la forma del turno.
 *
 * Lo que no se sabe, se queda sin saber (null): un binario no tiene líneas
 * que contar, y un diff enorme tampoco.
 */
export function cambiosDe(r: ResultadoCambios): CambioTurno[] {
  return r.ficheros.map((f) => ({
    ruta: f.ruta,
    anadidos: f.anadidos,
    borrados: f.borrados,
  }));
}

/**
 * La limpieza del turno: qué porcentaje de lo que se lee es la respuesta.
 *
 * Es la regla de la casa, en un número: si la actividad pesa más que la
 * respuesta, el chat se ensució y hay que plegarla más (o no mostrarla).
 */
export function limpiezaDelTurno(t: Turno): number {
  // lo que la persona LEE: la respuesta y los pasos PLEGADOS (una línea).
  // El texto escondido de los pasos no se lee: por eso va aparte.
  const leido = t.tokens.respuesta + t.tokens.actividad_plegada;
  if (leido === 0) return 1; // un turno sin nada que leer está limpio por definición
  return t.tokens.respuesta / leido;
}

/** ¿El turno está limpio (según el listón de la casa)? */
export function turnoLimpio(t: Turno): boolean {
  return limpiezaDelTurno(t) >= LIMPIEZA_MINIMA;
}

/** Los errores del turno (lo que no cuadra). */
export function erroresTurno(t: Turno): string[] {
  const e: string[] = [];
  const suma =
    t.tokens.contexto + t.tokens.respuesta + t.tokens.actividad;
  if (t.tokens.actividad_plegada > t.tokens.actividad) {
    e.push("tokens: lo plegado no puede costar más que lo desplegado");
  }
  if (suma !== t.tokens.total) {
    e.push(`tokens: el total (${t.tokens.total}) no es la suma de las partes (${suma})`);
  }
  if (t.tokens.respuesta === 0 && t.actividad.length > 0) {
    e.push("respuesta: hay pasos pero no hay respuesta (el chat se queda en blanco)");
  }
  if (t.coste_usd !== undefined && t.coste_usd < 0) e.push("coste_usd: negativo");
  if (t.presupuesto && t.tokens.total > t.presupuesto.tokens) {
    e.push(
      `presupuesto: el turno pasó de ${t.presupuesto.tokens} tokens (va en ${t.tokens.total})`
    );
  }
  return e;
}

/** El resumen que se ve en una línea (para un panel o un log). */
export function resumenTurno(t: Turno): string {
  const limp = Math.round(limpiezaDelTurno(t) * 100);
  const coste = t.coste_usd === undefined ? "" : ` · $${t.coste_usd.toFixed(2)}`;
  return (
    `${t.motor} · ${t.modo} · ${t.tokens.total} tokens · ` +
    `limpieza ${limp}% · ${t.cambios.length} ficheros${coste}`
  );
}
