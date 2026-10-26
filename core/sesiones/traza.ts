/**
 * LA TRAZA DE UNA SESIÓN — en qué se fue el tiempo, qué gastó cada turno y qué falló.
 *
 * Es la `trazaDe` del Taller de la app (app/src/main/taller/traza.ts), traída
 * al kit con las mismas cuentas, para que cualquier aparato con el registro
 * dé el mismo resumen. Sobre un registro del formato 1 da exactamente lo que
 * da la de la app (las pruebas lo comparan caso por caso); sobre el formato 2
 * solo cambia lo que el sobre añade:
 *
 *   - un `orden {mensaje}` abre el turno, y el `usuario` que le sigue va con
 *     él (como en el estado); lo demás de la sesión (puntos, dueños, órdenes)
 *     no es tiempo del motor y no entra;
 *   - un permiso en dos tiempos: la pregunta no es una espera, la respuesta
 *     (con lo que te esperó) sí;
 *   - un evento compactado vale lo que valían sus trozos: cada latido es una
 *     hora, así que compactar no cambia la traza.
 *
 * Las tareas sin hora dan las cuentas pero no los tiempos: no se inventan.
 *
 * Referencia: estandar/sesion.spec.yaml, core/sesiones/compactar.ts.
 */
import type { EventoMotor, Lectura, Linea } from "./registro.ts";

export type Tiempo = { modelo: number; herramientas: number; espera: number; proveedor: number };
export type Tokens = { entrada: number; salida: number; pensamiento: number };
export type Tramo = [number, number];
export type BarraCascada = { titulo: string; clase: string; desde: number; ms: number; estado: string; detalle?: string };
/**
 * La cascada de un turno, medida desde su inicio: cada herramienta en su sitio
 * y con su tamaño, tus esperas, las del proveedor y los atascos (los silencios
 * largos sin nada en marcha).
 */
export type Cascada = { total: number; barras: BarraCascada[]; esperas: Tramo[]; proveedor: Tramo[]; silencios: Tramo[]; omitidas: number };
export type TurnoTraza = {
  n: number;
  pedido: string;
  ms: number | null;
  motivo: string | null;
  error: string | null;
  herramientas: number;
  fallidas: number;
  tokens: Tokens | null;
  tiempo: Tiempo | null;
  /** Solo los últimos turnos (los que se ven) y con hora: la vista no carga miles de barras. */
  cascada: Cascada | null;
};
export type Traza = {
  turnos: TurnoTraza[];
  /** La suma de los turnos que tienen hora. */
  tiempo: Tiempo | null;
  /** Leer, editar, ejecutar…, de más a menos usadas. */
  porClase: { clase: string; veces: number; fallidas: number; ms: number | null }[];
  /** Lo que tardaron ellas, sin tu espera ni la del proveedor. */
  lentas: { titulo: string; clase: string; ms: number }[];
  fallidas: { titulo: string; clase: string; detalle?: string }[];
  /** El rato más largo sin señales ni nada en marcha: dónde se atascó. */
  silencio: { ms: number; despues: string } | null;
  conHoras: boolean;
};

/** Menos que esto es pensar, no atascarse. */
export const SILENCIO_MS = 30_000;
export const MAX_FALLIDAS = 8;
export const MAX_LENTAS = 3;
/** Los turnos que la vista enseña. */
export const CASCADAS = 8;
/** En un turno con cientos de herramientas, las más largas: el resto se cuenta, no se pinta. */
export const MAX_BARRAS = 120;
const FINAL = new Set(["completed", "failed"]);
// lo que un motor anuncia al abrir su sesión, antes de tu primer mensaje: no abre turno
const ANUNCIOS = new Set(["opciones", "uso", "contexto"]);
const DEL_MOTOR = new Set([
  "texto",
  "pensamiento",
  "herramienta",
  "plan",
  "contexto",
  "opciones",
  "usuario",
  "fin",
  "fallo",
  "reintento",
  "aprobado",
  "uso",
  "herencia",
  "permiso",
]);

/** Un evento del motor con su hora, como lo guarda el Taller. */
type Guardado = EventoMotor & { ts?: number };

/** Une los tramos que se pisan: [[0,10],[5,20]] → [[0,20]]. */
function unir(ts: Tramo[]): Tramo[] {
  const o = ts.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Tramo[] = [];
  for (const [a, b] of o) {
    const u = out[out.length - 1];
    if (u && a <= u[1]) u[1] = Math.max(u[1], b);
    else out.push([a, b]);
  }
  return out;
}
const largo = (ts: Tramo[]) => ts.reduce((s, [a, b]) => s + (b - a), 0);
/** Cuánto de [a, b] cubren unos tramos ya unidos. */
function cubierto([a, b]: Tramo, ts: Tramo[]): number {
  let s = 0;
  for (const [x, y] of ts) {
    const i = Math.max(a, x);
    const f = Math.min(b, y);
    if (f > i) s += f - i;
  }
  return s;
}
/** Lo que queda de unos tramos al quitarles otros (los dos, unidos). */
const sinLos = (ts: Tramo[], quitar: Tramo[]) => ts.reduce((s, t) => s + (t[1] - t[0]) - cubierto(t, quitar), 0);
const recortar = (ts: Tramo[], [a, b]: Tramo): Tramo[] =>
  ts.map(([x, y]): Tramo => [Math.max(a, x), Math.min(b, y)]).filter(([x, y]) => y > x);
/** Los trozos de [a, b] que no cubre nada de unos tramos ya unidos. */
function huecos([a, b]: Tramo, ts: Tramo[]): Tramo[] {
  const out: Tramo[] = [];
  let desde = a;
  for (const [x, y] of ts) {
    if (y <= desde || x >= b) continue;
    if (x > desde) out.push([desde, x]);
    desde = Math.max(desde, y);
  }
  if (desde < b) out.push([desde, b]);
  return out;
}
const relativo = (ts: Tramo[], cero: number): Tramo[] => ts.map(([a, b]): Tramo => [a - cero, b - cero]);

type Herr = { titulo: string; clase: string; estado: string; detalle?: string; desde?: number; hasta?: number; ms?: number };
type Turno = {
  pedido: string;
  eventos: Guardado[];
  herr: Map<string, Herr>;
  fin?: Extract<Guardado, { tipo: "fin" }>;
  error: string | null;
  esperas: Tramo[];
  proveedor: Tramo[];
};

const primeraLinea = (s: string) => {
  const l = s.trim().split("\n")[0].trim();
  return l.length > 100 ? `${l.slice(0, 99)}…` : l;
};

function despuesDe(e: Guardado, herr: Map<string, Herr>): string {
  switch (e.tipo) {
    case "herramienta":
      return `«${herr.get(e.id)?.titulo || "una herramienta"}»`;
    case "usuario":
      return "tu mensaje";
    case "texto":
      return "escribir";
    case "pensamiento":
      return "pensar";
    case "permiso":
      return "tu permiso";
    case "reintento":
      return "esperar al proveedor";
    default:
      return e.tipo;
  }
}

type Tiempos = { tiempo: Tiempo | null; total: number | null; silencio: { ms: number; despues: string } | null; cascada: Cascada | null };

/** Reparte el tiempo de un turno con hora, calcula lo que tardó cada herramienta, su silencio más largo y su cascada. */
function tiemposDe(tu: Turno): Tiempos {
  const conHora = tu.eventos.filter((e) => e.ts !== undefined);
  const inicio = tu.eventos[0]?.ts;
  if (inicio === undefined || !conHora.length) return { tiempo: null, total: null, silencio: null, cascada: null };
  const ultimo = conHora[conHora.length - 1].ts!;
  const total = tu.fin?.ms ?? ultimo - inicio;
  const ventana: Tramo = [inicio, inicio + total];
  const espera = unir(recortar(tu.esperas, ventana));
  const proveedor = unir(recortar(tu.proveedor, ventana));
  const ajeno = unir([...espera, ...proveedor]); // lo que no es del motor: tú y el proveedor
  const spans: Tramo[] = [];
  const barras: BarraCascada[] = [];
  for (const h of tu.herr.values()) {
    if (h.desde === undefined) continue;
    const s: Tramo = [h.desde, Math.max(h.desde, h.hasta ?? ultimo)];
    h.ms = s[1] - s[0] - cubierto(s, ajeno);
    spans.push(s);
    barras.push({ titulo: h.titulo, clase: h.clase, desde: s[0] - inicio, ms: s[1] - s[0], estado: h.estado, ...(h.detalle ? { detalle: h.detalle } : {}) });
  }
  const herramientas = sinLos(unir(recortar(spans, ventana)), ajeno);
  const t: Tiempo = { espera: largo(espera), proveedor: sinLos(proveedor, espera), herramientas, modelo: 0 };
  t.modelo = Math.max(0, total - t.espera - t.proveedor - t.herramientas);
  // El silencio: entre dos señales seguidas, lo que no cubre nada en marcha (una herramienta, tu permiso, el proveedor).
  const ocupado = unir([...spans, ...ajeno]);
  let silencio: { ms: number; despues: string } | null = null;
  const silencios: Tramo[] = [];
  for (let i = 1; i < conHora.length; i++) {
    const a = conHora[i - 1].ts!;
    const b = conHora[i].ts!;
    const ms = b - a - cubierto([a, b], ocupado);
    if (ms > (silencio?.ms ?? 0)) silencio = { ms, despues: despuesDe(conHora[i - 1], tu.herr) };
    for (const h of huecos([a, b], ocupado)) if (h[1] - h[0] >= SILENCIO_MS) silencios.push(h);
  }
  // las más largas, si son demasiadas; y en el orden en que empezaron
  const pintadas = barras.length > MAX_BARRAS ? [...barras].sort((x, y) => y.ms - x.ms).slice(0, MAX_BARRAS) : barras;
  const cascada: Cascada = {
    total,
    barras: [...pintadas].sort((x, y) => x.desde - y.desde),
    esperas: relativo(espera, inicio),
    proveedor: relativo(proveedor, inicio),
    silencios: relativo(silencios, inicio),
    omitidas: barras.length - pintadas.length,
  };
  return { tiempo: { modelo: t.modelo, herramientas: t.herramientas, espera: t.espera, proveedor: t.proveedor }, total, silencio, cascada };
}

/**
 * Los eventos tal como los cuenta la traza: los del motor, con un evento
 * compactado deshecho en sus latidos (un trozo por hora), y con lo de la
 * sesión fuera, salvo el `orden {mensaje}` que abre un turno (va como su
 * `usuario`; el `usuario` que le sigue, que es lo que recibió el motor, va
 * con él y no abre otro).
 */
function delMotor(eventos: readonly Linea[]): { eventos: Guardado[]; siguen: Set<Guardado> } {
  const out: Guardado[] = [];
  // los `usuario` que siguen a su orden (van en su turno, no abren otro)
  const siguen = new Set<Guardado>();
  let esperaUsuario = false;
  for (const e of eventos) {
    if (e.tipo === "orden") {
      if (e.que === "mensaje") {
        out.push({ tipo: "usuario", texto: e.texto ?? "", ...(e.ts !== undefined ? { ts: e.ts } : {}) });
        esperaUsuario = true;
      }
      continue;
    }
    if (!DEL_MOTOR.has(e.tipo)) continue;
    if (e.tipo === "usuario" && esperaUsuario) {
      esperaUsuario = false;
      siguen.add(e as Guardado);
      out.push(e as Guardado);
      continue;
    }
    if (e.tipo === "permiso" && (e.concedido === undefined || e.ms === undefined)) continue; // la pregunta no es una espera
    if ((e.tipo === "texto" || e.tipo === "pensamiento") && e.latidos?.length) {
      out.push({ tipo: e.tipo, texto: e.texto, ...(e.ts !== undefined ? { ts: e.ts } : {}) });
      let t = e.ts;
      for (const l of e.latidos) {
        t = t === undefined ? l : t + l;
        out.push({ tipo: e.tipo, texto: "", ts: t });
      }
      continue;
    }
    out.push(e as Guardado);
  }
  return { eventos: out, siguen };
}

/** La traza de una sesión: en qué se fue el tiempo, qué gastó cada turno y qué falló. */
export function trazaDe(entrada: Lectura | readonly Linea[]): Traza {
  const { eventos, siguen } = delMotor(Array.isArray(entrada) ? (entrada as readonly Linea[]) : (entrada as Lectura).eventos);
  const turnos: Turno[] = [];
  const nuevo = (pedido: string): Turno => {
    const t: Turno = { pedido, eventos: [], herr: new Map(), error: null, esperas: [], proveedor: [] };
    turnos.push(t);
    return t;
  };
  let tu: Turno | undefined;
  for (const e of eventos) {
    if (e.tipo === "usuario" && !siguen.has(e)) tu = nuevo(primeraLinea(e.texto));
    else if (!tu && ANUNCIOS.has(e.tipo)) continue;
    tu ??= nuevo("");
    tu.eventos.push(e);
    switch (e.tipo) {
      case "herramienta": {
        // por turno: un id de herramienta puede repetirse en otra sesión de la misma tarea
        const h = tu.herr.get(e.id) ?? { titulo: "", clase: "other", estado: "pending" };
        if (e.titulo) h.titulo = e.titulo;
        if (e.clase) h.clase = e.clase;
        if (e.estado) h.estado = e.estado;
        if (e.detalle) h.detalle = e.detalle;
        if (e.ts !== undefined) {
          h.desde ??= e.ts;
          if (FINAL.has(h.estado)) h.hasta ??= e.ts;
        }
        tu.herr.set(e.id, h);
        break;
      }
      case "fin":
        tu.fin = e as Extract<Guardado, { tipo: "fin" }>;
        break;
      case "fallo":
        tu.error ??= e.mensaje;
        break;
      case "permiso":
        if (e.ts !== undefined) tu.esperas.push([e.ts - e.ms!, e.ts]);
        break;
      case "reintento":
        if (e.ts !== undefined) tu.proveedor.push([e.ts, e.ts + e.ms]);
        break;
    }
  }

  const filas: TurnoTraza[] = [];
  let suma: Tiempo | null = null;
  let silencio: Traza["silencio"] = null;
  for (const [i, tu] of turnos.entries()) {
    const x = tiemposDe(tu);
    const herr = [...tu.herr.values()];
    filas.push({
      n: i + 1,
      pedido: tu.pedido,
      ms: tu.fin?.ms ?? (tu.error && x.total !== null ? x.total : null),
      motivo: tu.fin?.motivo ?? null,
      error: tu.error,
      herramientas: herr.length,
      fallidas: herr.filter((h) => h.estado === "failed").length,
      tokens: tu.fin?.tokens ?? null,
      tiempo: x.tiempo,
      cascada: i >= turnos.length - CASCADAS ? x.cascada : null,
    });
    if (x.tiempo) {
      suma ??= { modelo: 0, herramientas: 0, espera: 0, proveedor: 0 };
      for (const k of ["modelo", "herramientas", "espera", "proveedor"] as const) suma[k] += x.tiempo[k];
    }
    if (x.silencio && x.silencio.ms > (silencio?.ms ?? 0)) silencio = x.silencio;
  }

  const todas = turnos.flatMap((tu) => [...tu.herr.values()]);
  const clases = new Map<string, Traza["porClase"][number]>();
  for (const h of todas) {
    const c = clases.get(h.clase) ?? { clase: h.clase, veces: 0, fallidas: 0, ms: null };
    c.veces++;
    if (h.estado === "failed") c.fallidas++;
    if (h.ms !== undefined) c.ms = (c.ms ?? 0) + h.ms;
    clases.set(h.clase, c);
  }
  return {
    turnos: filas,
    tiempo: suma,
    porClase: [...clases.values()].sort((a, b) => b.veces - a.veces),
    lentas: todas
      .filter((h) => (h.ms ?? 0) > 0)
      .sort((a, b) => b.ms! - a.ms!)
      .slice(0, MAX_LENTAS)
      .map((h) => ({ titulo: h.titulo, clase: h.clase, ms: h.ms! })),
    fallidas: todas
      .filter((h) => h.estado === "failed")
      .slice(0, MAX_FALLIDAS)
      .map((h) => ({ titulo: h.titulo, clase: h.clase, ...(h.detalle ? { detalle: h.detalle } : {}) })),
    silencio: silencio && silencio.ms >= SILENCIO_MS ? silencio : null,
    conHoras: eventos.some((e) => e.ts !== undefined),
  };
}
