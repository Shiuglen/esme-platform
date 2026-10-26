/**
 * COMPACTAR — los trozos seguidos, en un solo evento.
 *
 * Lo que el motor escribe letra a letra llega a decenas de trozos por
 * segundo, y cada uno es una línea del registro. Para que viajar sea barato,
 * los trozos seguidos de un mismo tipo (texto o pensamiento) se juntan en un
 * solo evento, sin perder nada que el estado o la traza usen:
 *
 *   - el texto entero, en orden;
 *   - cada hora: la del primer trozo es el `ts` del evento, y las demás van
 *     en `latidos` (cada uno, los ms desde la hora anterior; si el evento no
 *     tiene `ts`, el primero es la hora entera);
 *   - y los sitios a los que se rebobina: un trozo al que apunta un
 *     `rebobinar` corta la junta, y el `hasta` se reescribe a su sitio nuevo.
 *
 * Lo único que se pierde es por dónde se cortaban los trozos. Compactar
 * escribe OTRO registro, con su propia cadena (el de antes no se reescribe:
 * solo se añade), y su mapa: a dónde fue a parar cada evento.
 *
 * Un turno del chat (un `texto` con `chat`) nunca se junta: es una respuesta
 * entera, no un trozo.
 *
 * Referencia: estandar/sesion.spec.yaml (compactar).
 */
import { CADENA_VACIA, huella, sellar, sinSobre, type Cadena, type Evento, type Lectura, type Linea } from "./registro.ts";

/** Lo que sale de compactar. */
export interface Compactacion {
  /** El registro compactado (otro registro, con su propia cadena). */
  texto: string;
  /** Sus eventos (con su sobre si son del formato 2). */
  eventos: Linea[];
  /** A dónde fue a parar cada evento: `mapa[n viejo]` es su `n` nuevo. */
  mapa: number[];
  /** Cuánto pesaba. */
  antes: { eventos: number; bytes: number };
  /** Cuánto pesa. */
  despues: { eventos: number; bytes: number };
}

/** Los tipos que llegan a trozos. */
export const TROZOS = ["texto", "pensamiento"] as const;

const SE_JUNTAN = new Set<string>(TROZOS);
const CLAVES_TROZO = new Set(["tipo", "texto", "ts", "latidos", "n", "epoca", "de", "ant"]);

/** Si un evento es un trozo que se puede juntar (un texto del chat no lo es: es una respuesta entera). */
function esTrozo(e: Linea): boolean {
  if (!SE_JUNTAN.has(e.tipo) || typeof (e as { texto?: unknown }).texto !== "string") return false;
  for (const k of Object.keys(e)) if (!CLAVES_TROZO.has(k)) return false;
  return true;
}

/** Las horas de un trozo: su `ts` y las de sus latidos, en ms desde 1970. */
function horasDe(e: Linea & { latidos?: number[] }): number[] {
  const horas: number[] = [];
  let t = e.ts;
  if (t !== undefined) horas.push(t);
  for (const l of e.latidos ?? []) {
    t = t === undefined ? l : t + l;
    horas.push(t);
  }
  return horas;
}

/** Junta unos trozos seguidos (del mismo tipo) en un evento. */
function juntar(trozos: Linea[]): Evento {
  const primero = trozos[0] as Linea & { texto: string };
  const horas = trozos.flatMap(horasDe);
  const ts = primero.ts;
  const resto = ts === undefined ? horas : horas.slice(1);
  const latidos: number[] = [];
  let antes = ts;
  for (const h of resto) {
    latidos.push(antes === undefined ? h : h - antes);
    antes = h;
  }
  return {
    tipo: primero.tipo as "texto" | "pensamiento",
    texto: trozos.map((t) => (t as { texto: string }).texto).join(""),
    ...(latidos.length ? { latidos } : {}),
    ...(ts !== undefined ? { ts } : {}),
  } as Evento;
}

/** Compacta un registro que verifica: otro registro, más pequeño, que se reproduce igual. */
export function compactar(l: Lectura): Compactacion {
  if (!l.valida) throw new Error("Solo se compacta un registro que verifica.");
  const eventos = l.eventos;
  const pos = (e: Linea, i: number) => e.n ?? i;
  // los sitios a los que se rebobina: ahí se corta la junta
  const cortes = new Set<number>();
  for (const e of eventos) if (e.tipo === "orden" && e.que === "rebobinar" && Number.isInteger(e.hasta)) cortes.add(e.hasta!);

  // 1. las juntas (cada grupo es un evento nuevo, con los eventos viejos que lleva), y el mapa
  const grupos: Linea[][] = [];
  const mapa: number[] = [];
  for (const [i, e] of eventos.entries()) {
    const g = grupos[grupos.length - 1];
    const u = g?.[g.length - 1];
    const sigue =
      u !== undefined &&
      esTrozo(e) &&
      esTrozo(u) &&
      u.tipo === e.tipo &&
      (u.ant === undefined) === (e.ant === undefined) &&
      u.de === e.de &&
      !cortes.has(pos(u, i - 1));
    if (sigue) g.push(e);
    else grupos.push([e]);
    mapa[pos(e, i)] = grupos.length - 1;
  }

  // 2. el registro nuevo: las del formato 1 tal cual, las del 2 selladas otra vez por quien las escribió
  let c: Cadena = CADENA_VACIA;
  let texto = "";
  const nuevos: Linea[] = [];
  for (const g of grupos) {
    const viejo = g[0];
    let e: Evento = g.length > 1 ? juntar(g) : sinSobre(viejo);
    if (e.tipo === "orden" && e.que === "rebobinar" && Number.isInteger(e.hasta) && e.hasta! >= 0) e = { ...e, hasta: mapa[e.hasta!] };
    if (viejo.ant === undefined) {
      const linea = JSON.stringify(e);
      texto += `${linea}\n`;
      nuevos.push(e as Linea);
      c = { ...c, n: c.n + 1, cabeza: huella(c.cabeza, linea) };
    } else {
      const r = sellar(c, e, viejo.de!);
      if (r.evento.epoca !== viejo.epoca) throw new Error(`Compactar: la época de la línea ${viejo.n} no se puede volver a sellar igual.`);
      texto += `${r.linea}\n`;
      nuevos.push(r.evento);
      c = r.cadena;
    }
  }

  const bytes = (lineas: string[]) => lineas.reduce((s, x) => s + Buffer.byteLength(x) + 1, 0);
  return {
    texto,
    eventos: nuevos,
    mapa,
    antes: { eventos: eventos.length, bytes: bytes(l.lineas) },
    despues: { eventos: nuevos.length, bytes: Buffer.byteLength(texto) },
  };
}
