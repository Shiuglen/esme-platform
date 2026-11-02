/**
 * JUNTAR Y COMPACTAR — los trozos seguidos, en un solo evento.
 *
 * Lo que el motor escribe letra a letra llega a decenas de trozos por
 * segundo. Apuntar cada uno en su línea es lo que hace hoy el Taller, y con
 * sobre pesa el triple. Así que se juntan en dos momentos:
 *
 *   - AL ESCRIBIR (`juntarUno`, `juntarPorLatido`, y el Escritor): los trozos
 *     seguidos de un mismo tipo van en una sola línea hasta el siguiente
 *     latido (el primer trozo que lleva hora) o el siguiente evento que no es
 *     un trozo. Solo el primero de cada línea pudo traer hora, así que la
 *     línea lleva esa y nada más. Lo que espera sin escribir es menos de un
 *     latido de texto.
 *   - AL COMPACTAR (`compactar`): todos los trozos seguidos, también a
 *     través de los latidos. Escribe otro registro.
 *
 * Compactar no pierde nada que el estado o la traza usen:
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
 * entera, no un trozo. Y lo que una bifurcación copió de otra sesión (hasta
 * su `dueno`, incluido) va tal cual: es la prueba de dónde salió, y su
 * `bifurca` tiene que seguir casando. Se compacta lo que viene después.
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

/** Un trozo que se puede juntar al escribir: un texto o un pensamiento con su texto y, si acaso, su hora (nada más). */
export function esTrozoSuelto(e: Evento): boolean {
  if (!SE_JUNTAN.has(e.tipo) || typeof (e as { texto?: unknown }).texto !== "string") return false;
  for (const k of Object.keys(e)) if (k !== "tipo" && k !== "texto" && k !== "ts") return false;
  return true;
}

/** Un paso de juntar al escribir: lo que hay que escribir ya, en orden, y el trozo que se queda esperando. */
export interface PasoJunta {
  escribir: Evento[];
  pendiente: Evento | null;
}

/**
 * Junta un evento más al escribir. Un trozo sin hora sigue al que espera, si
 * es de su tipo; un trozo con hora (un latido), o de otro tipo, empieza otra
 * línea; y cualquier otro evento hace escribir lo que esperaba, y después se
 * escribe él. No cambia nada de lo que recibe.
 */
export function juntarUno(pendiente: Evento | null, e: Evento): PasoJunta {
  if (!esTrozoSuelto(e)) return { escribir: pendiente ? [pendiente, e] : [e], pendiente: null };
  if (pendiente !== null && pendiente.tipo === e.tipo && e.ts === undefined) {
    const texto = (pendiente as { texto: string }).texto + (e as { texto: string }).texto;
    return { escribir: [], pendiente: { ...pendiente, texto } as Evento };
  }
  return { escribir: pendiente ? [pendiente] : [], pendiente: { ...e } };
}

/** Lo que escribiría el Escritor con unos eventos: los trozos, juntos hasta el siguiente latido. */
export function juntarPorLatido(eventos: Iterable<Evento>): Evento[] {
  const salida: Evento[] = [];
  let pendiente: Evento | null = null;
  for (const e of eventos) {
    const paso = juntarUno(pendiente, e);
    for (const x of paso.escribir) salida.push(x);
    pendiente = paso.pendiente;
  }
  if (pendiente !== null) salida.push(pendiente);
  return salida;
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
  // lo que copió una bifurcación, hasta su dueño (el de la última, si hay varias): tal cual
  let copiado = -1;
  for (let i = eventos.length - 1; i >= 0 && copiado < 0; i--) if (eventos[i].tipo === "dueno" && (eventos[i] as { bifurca?: unknown }).bifurca !== undefined) copiado = i;

  // 1. las juntas (cada grupo es un evento nuevo, con los eventos viejos que lleva), y el mapa
  const grupos: Linea[][] = [];
  const mapa: number[] = [];
  for (const [i, e] of eventos.entries()) {
    const g = grupos[grupos.length - 1];
    const u = g?.[g.length - 1];
    const sigue =
      i > copiado &&
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
  for (const [k, g] of grupos.entries()) {
    const viejo = g[0];
    if (k <= copiado) {
      // hasta ahí cada grupo es un evento, y su línea es la que se escribió; acaba en el dueño, que dice quién sigue
      texto += `${l.lineas[k]}\n`;
      nuevos.push(viejo);
      c = { ...c, n: c.n + 1, cabeza: huella(c.cabeza, l.lineas[k]) };
      if (k === copiado) c = { ...c, epoca: viejo.epoca!, dueno: viejo.de!, cerrada: false };
      continue;
    }
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
