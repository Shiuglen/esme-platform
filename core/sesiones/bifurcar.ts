/**
 * BIFURCAR Y RECONCILIAR — una sesión que sale de otra, y dos copias que se separaron.
 *
 * Rebobinar no toca el registro: es leer el estado en el evento n (eso es
 * `estadoEn`, en core/sesiones/reductor.ts). Aquí están las dos cosas que sí
 * escriben un registro:
 *
 *   - **bifurcar**: una sesión NUEVA que empieza con las líneas 0..n de otra,
 *     tal cual (su cadena sigue valiendo), y sigue con un `dueno` que estrena
 *     su propia sesión y dice de dónde salió (`bifurca`: la sesión de origen,
 *     la última línea copiada y la huella de lo copiado). Con esa huella,
 *     quien tenga el origen comprueba que lo copiado es lo que había. Solo se
 *     bifurca por un sitio de fiar: lo que se copia no puede tener problemas,
 *     ni puede ponerlo en duda nada de lo que venía detrás. Así se rescata
 *     lo bueno de un registro roto: se bifurca antes del daño.
 *   - **reconciliar**: dos copias de la MISMA sesión que se separaron (el
 *     portátil escribió sin red mientras la sesión se mudaba al 101). Si una
 *     va por delante de la otra, gana esa y no se descarta nada. Si se
 *     separaron, gana la de época mayor en la primera línea distinta (el
 *     dueño más nuevo); si empatan, la de huella menor en esa línea, para que
 *     cualquier aparato elija la misma sin hablar con nadie. Lo de la otra se
 *     descarta y se dice.
 *
 * Una bifurcación es OTRA sesión: no se reconcilia con su origen.
 *
 * Referencia: estandar/sesion.spec.yaml (bifurca, dueno).
 */
import { GENESIS, huella, leer, sellar, sesionTras, type Bifurca, type Cadena, type Lectura, type Linea } from "./registro.ts";

/** Cómo se bifurca. */
export interface OpcionesBifurcar {
  /** El id de la sesión nueva. */
  sesion: string;
  /** El aparato que la abre: su dueño. */
  de: string;
  /** De qué sesión sale, si el registro no lo dice (uno del Taller, sin sobre). */
  desde?: string;
  /** La hora del dueño nuevo, en ms desde 1970. */
  ts?: number;
}

/** Lo que sale de bifurcar. */
export interface Bifurcacion {
  /** El registro nuevo: lo copiado y el dueño que lo dice. */
  texto: string;
  /** Por dónde va su cadena (para seguir escribiendo). */
  cadena: Cadena;
  /** El dueño que abre la sesión nueva. */
  dueno: Linea & { tipo: "dueno"; bifurca: Bifurca };
}

/** La sesión que dice un registro (la del primer dueño, o la de su última bifurcación). */
function sesionDe(eventos: readonly Linea[]): string | null {
  let sesion: string | null = null;
  for (const e of eventos) sesion = sesionTras(sesion, e);
  return sesion;
}

const lineas = (n: number) => `${n} ${n === 1 ? "línea" : "líneas"}`;

/** Una sesión nueva que empieza con las líneas 0..n de otra (`l`). */
export function bifurcar(l: Lectura, n: number, o: OpcionesBifurcar): Bifurcacion {
  if (!Number.isInteger(n) || n < 0 || n >= l.cadena.n) throw new Error(`El registro no tiene la línea ${n} (tiene ${lineas(l.cadena.n)}).`);
  if (n >= l.fiables) {
    const p = l.problemas[0];
    throw new Error(`Lo que se copiaría no verifica: solo son de fiar las ${lineas(l.fiables)} primeras (línea ${p.linea}: ${p.problema}).`);
  }
  if (typeof o.sesion !== "string" || o.sesion === "") throw new Error("La sesión nueva necesita su id («sesion»).");
  // lo de fiar se leyó entero y sin rechazar nada: sus líneas son las que se escribieron
  const prefijo = `${l.lineas.slice(0, n + 1).join("\n")}\n`;
  const lp = leer(prefijo);
  if (!lp.valida || lp.cadena.n !== n + 1) throw new Error("Lo que se copiaría no se lee igual que en el registro.");
  const dice = sesionDe(lp.eventos);
  if (dice !== null && o.desde !== undefined && o.desde !== dice) throw new Error(`Este registro es de la sesión «${dice}», no de «${o.desde}».`);
  const origen = dice ?? o.desde;
  if (origen === undefined || origen === "") {
    throw new Error("Este registro no dice de qué sesión es (es del Taller, sin sobre): di de qué sesión sale («desde»).");
  }
  if (o.sesion === origen) throw new Error(`La sesión nueva necesita otro id: «${origen}» es la de origen.`);
  // el orden de las claves es el de la spec: sesion, n, cabeza
  const bifurca: Bifurca = { sesion: origen, n, cabeza: lp.cadena.cabeza };
  const r = sellar(lp.cadena, { tipo: "dueno", sesion: o.sesion, bifurca, ...(o.ts !== undefined ? { ts: o.ts } : {}) }, o.de);
  return { texto: `${prefijo}${r.linea}\n`, cadena: r.cadena, dueno: r.evento as Bifurcacion["dueno"] };
}

/** Lo que sale de reconciliar dos copias. */
export interface Reconciliacion {
  /** La que se queda: «a», «b», o «iguales» si son la misma copia. */
  gana: "a" | "b" | "iguales";
  /** La primera línea en que se separaron (null si no se separaron: una va por delante, o son iguales). */
  separacion: number | null;
  /** Lo que se descarta de la otra, desde la línea en que se separaron (se dice, no se tira en silencio). */
  descartadas: Linea[];
  /** El registro que queda: el de la que gana, línea a línea. */
  texto: string;
  /** Por qué, en una frase. */
  motivo: string;
}

const textoDe = (l: Lectura) => (l.lineas.length ? `${l.lineas.join("\n")}\n` : "");

/** La huella de una línea de un registro, encerrando todo lo anterior. */
function huellaEn(l: Lectura, i: number): string {
  const ant = l.eventos[i].ant;
  if (ant !== undefined) return huella(ant, l.lineas[i]);
  let h = GENESIS;
  for (let k = 0; k <= i; k++) h = huella(h, l.lineas[k]);
  return h;
}

/** Cuál de dos copias de una sesión se queda, y qué se descarta de la otra. */
export function reconciliar(a: Lectura, b: Lectura): Reconciliacion {
  if (!a.valida || !b.valida) throw new Error("Solo se reconcilian dos copias que verifican.");
  const [sa, sb] = [sesionDe(a.eventos), sesionDe(b.eventos)];
  if (sa !== null && sb !== null && sa !== sb) throw new Error(`No son copias de la misma sesión: una es «${sa}» y la otra «${sb}».`);
  const comun = Math.min(a.lineas.length, b.lineas.length);
  let i = 0;
  while (i < comun && a.lineas[i] === b.lineas[i]) i += 1;

  if (i === comun) {
    if (a.lineas.length === b.lineas.length) return { gana: "iguales", separacion: null, descartadas: [], texto: textoDe(a), motivo: "Son la misma copia." };
    const gana = a.lineas.length > b.lineas.length ? "a" : "b";
    const g = gana === "a" ? a : b;
    return {
      gana,
      separacion: null,
      descartadas: [],
      texto: textoDe(g),
      motivo: `Una va por delante de la otra: gana la que llega a la línea ${g.lineas.length - 1}, y no se descarta nada.`,
    };
  }
  if (i === 0) throw new Error("No son copias de la misma sesión: no comparten ni la primera línea.");

  const [ea, eb] = [a.eventos[i].epoca ?? 0, b.eventos[i].epoca ?? 0];
  let gana: "a" | "b";
  let por: string;
  if (ea !== eb) {
    gana = ea > eb ? "a" : "b";
    por = `gana la de la época ${Math.max(ea, eb)} (la otra seguía en la ${Math.min(ea, eb)})`;
  } else {
    gana = huellaEn(a, i) < huellaEn(b, i) ? "a" : "b";
    por = `las dos en la época ${ea}: gana la de huella menor en esa línea, para que cualquier aparato elija la misma`;
  }
  const [g, p] = gana === "a" ? [a, b] : [b, a];
  const descartadas = p.eventos.slice(i);
  return {
    gana,
    separacion: i,
    descartadas,
    texto: textoDe(g),
    motivo: `Se separaron en la línea ${i}: ${por}. De la otra se ${descartadas.length === 1 ? "descarta 1 evento" : `descartan ${descartadas.length} eventos`}.`,
  };
}
