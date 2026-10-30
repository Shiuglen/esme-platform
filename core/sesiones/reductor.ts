/**
 * REPRODUCIR UNA SESIÓN — del registro al estado.
 *
 * El estado de una sesión no se guarda: se reproduce leyendo su registro de
 * principio a fin. Aquí está esa lectura, pura (el mismo registro da el mismo
 * estado, en cualquier aparato) y de una sola pasada:
 *
 *   - **los turnos**: lo que se pidió, lo que respondió y lo que pensó, sus
 *     pasos (juntados por id, como llegan de ACP), su plan, su fin y su error.
 *     Los abre un `orden {mensaje}` o un `usuario` suelto, como la traza;
 *   - **la sesión**: su id, su dueño y su época, el traspaso que espera, el
 *     cierre, lo gastado, el contexto y las opciones del motor;
 *   - **lo que espera**: los permisos que se preguntaron y aún no se
 *     respondieron;
 *   - **rebobinar**: el contenido (turnos, plan, puntos) vuelve a como estaba
 *     tras un evento; lo gastado no vuelve, porque ya se pagó.
 *
 * Lo que este fichero NO es: la traza (en qué se fue el tiempo: eso es
 * core/sesiones/traza.ts) ni el chat (core/sesiones/hilo.ts). Esto es lo que
 * cualquier ventana necesita para enseñar una sesión.
 *
 * Referencia: estandar/sesion.spec.yaml, core/sesiones/registro.ts.
 */
import type { ModoContexto } from "../talamus/modos.ts";
import { diffLineas, lineasDe } from "../turnos/cambios.ts";
import { armaTurno, type CambioTurno, type PasoTurno, type Turno } from "../turnos/turno.ts";
import { sesionTras, type Bifurca, type DatosChat, type EventoMotor, type Formato, type Lectura, type Linea, type OpcionMotor } from "./registro.ts";

type Del<T extends EventoMotor["tipo"]> = Extract<EventoMotor, { tipo: T }>;

/** Un paso (una herramienta), con todo lo que se supo de él. */
export type PasoEstado = Omit<Del<"herramienta">, "tipo">;

/** Un plan: sus pasos con su estado. */
export type PlanEstado = Del<"plan">["pasos"];

/** Un turno del estado. */
export interface TurnoEstado {
  /** Su número, desde 1. */
  n: number;
  /** Su primer evento. */
  desde: number;
  /** Su último evento (un turno llega hasta antes del siguiente). */
  hasta: number;
  /** Lo que se pidió. */
  pedido: string;
  /** Lo que respondió el motor (todo su texto). */
  respuesta: string;
  /** Lo que pensó. */
  pensamiento: string;
  /** Sus pasos, en el orden en que empezaron. */
  pasos: PasoEstado[];
  /** Su último plan. */
  plan: PlanEstado | null;
  /** Cómo acabó (null si no acabó). */
  fin: Omit<Del<"fin">, "tipo"> | null;
  /** Su primer fallo. */
  error: string | null;
  /** Lo que la mente le pasó al motor antes de empezar. */
  herencia: Omit<Del<"herencia">, "tipo"> | null;
}

/** Un permiso que espera respuesta. */
export type PermisoEstado = Pick<Del<"permiso">, "titulo" | "id" | "clase" | "opciones">;

/** Un punto: lo que dejó un turno. */
export interface PuntoEstado {
  /** El evento en que se apuntó. */
  n: number;
  commit?: string;
  rama?: string;
  chat?: DatosChat;
}

/** Lo gastado: la suma de lo que dice cada `fin`. */
export interface UsoEstado {
  entrada: number;
  salida: number;
  pensamiento: number;
}

/** El estado de una sesión: lo que sale de reproducir su registro. */
export interface Estado {
  /** Su id (el del primer `dueno`, o el de la bifurcación que la estrenó). */
  sesion: string | null;
  /** De dónde salió, si es una bifurcación (la última, si se bifurcó más de una vez). */
  bifurca: Bifurca | null;
  /** El formato del registro. */
  formato: Formato | null;
  /** La época (0 si no hubo dueño). */
  epoca: number;
  /** El que escribe (null si no hubo dueño). */
  dueno: string | null;
  /** Si está cerrada. */
  cerrada: boolean;
  /** Un traspaso que espera a su nuevo dueño. */
  traspaso: { a: string; motivo?: string } | null;
  /** Sus turnos. */
  turnos: TurnoEstado[];
  /** El último plan. */
  plan: PlanEstado | null;
  /** Lo gastado (no vuelve al rebobinar). */
  uso: UsoEstado;
  /** El último contexto que dijo el motor. */
  contexto: Omit<Del<"contexto">, "tipo"> | null;
  /** Las opciones del motor. */
  opciones: OpcionMotor[];
  /** Los permisos que esperan respuesta. */
  permisos: PermisoEstado[];
  /** Los puntos. */
  puntos: PuntoEstado[];
  /** Cuántos eventos se leyeron. */
  eventos: number;
}

/** Las claves del estado (las de la spec). */
export const CLAVES_ESTADO = [
  "sesion",
  "bifurca",
  "formato",
  "epoca",
  "dueno",
  "cerrada",
  "traspaso",
  "turnos",
  "plan",
  "uso",
  "contexto",
  "opciones",
  "permisos",
  "puntos",
  "eventos",
] as const satisfies ReadonlyArray<keyof Estado>;

/** Las claves de un turno del estado (las de la spec). */
export const CLAVES_TURNO_ESTADO = [
  "n",
  "desde",
  "hasta",
  "pedido",
  "respuesta",
  "pensamiento",
  "pasos",
  "plan",
  "fin",
  "error",
  "herencia",
] as const satisfies ReadonlyArray<keyof TurnoEstado>;

// lo que un motor anuncia al abrir su sesión, antes del primer mensaje: no abre turno (como la traza)
const ANUNCIOS = new Set(["opciones", "uso", "contexto"]);
/** Lo que no es del paso en un evento `herramienta`: su tipo y su sobre. */
const FUERA_DEL_PASO = new Set(["tipo", "ts", "n", "epoca", "de", "ant"]);
const DE_LA_SESION = new Set(["orden", "punto", "dueno", "traspaso", "cierre"]);
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

/** Lo que rebobinar devuelve: lo demás (la sesión, lo gastado) sigue como está. */
interface Contenido {
  turnos: TurnoEstado[];
  plan: PlanEstado | null;
  permisos: PermisoEstado[];
  puntos: PuntoEstado[];
}

const vacio = (): Contenido => ({ turnos: [], plan: null, permisos: [], puntos: [] });

// una copia que se puede seguir tocando sin tocar la foto (los textos se comparten: no cambian)
function copiar(c: Contenido): Contenido {
  return {
    turnos: c.turnos.map((t) => ({ ...t, pasos: t.pasos.map((p) => ({ ...p })) })),
    plan: c.plan,
    permisos: [...c.permisos],
    puntos: [...c.puntos],
  };
}

/** La posición de un evento: su `n`, o su sitio si es del formato 1. */
const posicion = (e: Linea, i: number) => e.n ?? i;

function formatoDe(eventos: readonly Linea[]): Formato | null {
  let v1 = false;
  let v2 = false;
  for (const e of eventos) {
    if (e.ant === undefined) v1 = true;
    else v2 = true;
  }
  return v1 && v2 ? "mixto" : v2 ? 2 : v1 ? 1 : null;
}

const esRebobinar = (e: Linea): e is Linea & { tipo: "orden"; hasta: number } =>
  e.tipo === "orden" && e.que === "rebobinar" && Number.isInteger(e.hasta);

/** El estado de una sesión: su registro, reproducido de principio a fin. */
export function estadoDe(entrada: Lectura | readonly Linea[]): Estado {
  const eventos = esLista(entrada) ? entrada : entrada.eventos;
  return reproducir(eventos, esLista(entrada) ? formatoDe(entrada) : entrada.formato, eventos.length);
}

/** El estado tal como estaba tras el evento `n` (rebobinar sin tocar el registro). */
export function estadoEn(entrada: Lectura | readonly Linea[], n: number): Estado {
  const eventos = esLista(entrada) ? entrada : entrada.eventos;
  let hasta = 0;
  while (hasta < eventos.length && posicion(eventos[hasta], hasta) <= n) hasta += 1;
  return reproducir(eventos, esLista(entrada) ? formatoDe(entrada) : entrada.formato, hasta);
}

function esLista(x: Lectura | readonly Linea[]): x is readonly Linea[] {
  return Array.isArray(x);
}

function reproducir(eventos: readonly Linea[], formato: Formato | null, cuantos: number): Estado {
  // las fotos que hará falta sacar: las de los eventos a los que se rebobina
  const objetivos: number[] = [];
  for (let i = 0; i < cuantos; i++) {
    const e = eventos[i];
    if (esRebobinar(e) && e.hasta >= 0 && e.hasta < posicion(e, i)) objetivos.push(e.hasta);
  }
  objetivos.sort((a, b) => a - b);
  const fotos = new Map<number, Contenido>();
  let io = 0;

  const s: Omit<Estado, keyof Contenido | "formato" | "eventos"> = {
    sesion: null,
    bifurca: null,
    epoca: 0,
    dueno: null,
    cerrada: false,
    traspaso: null,
    uso: { entrada: 0, salida: 0, pensamiento: 0 },
    contexto: null,
    opciones: [],
  };
  let c = vacio();
  let esperaUsuario = false;
  let indices = new Map<string, number>();
  let deTurno: TurnoEstado | undefined;

  const abrir = (pedido: string, desde: number): TurnoEstado => {
    const t: TurnoEstado = {
      n: c.turnos.length + 1,
      desde,
      hasta: desde,
      pedido,
      respuesta: "",
      pensamiento: "",
      pasos: [],
      plan: null,
      fin: null,
      error: null,
      herencia: null,
    };
    c.turnos.push(t);
    return t;
  };

  for (let i = 0; i < cuantos; i++) {
    const e = eventos[i];
    const p = posicion(e, i);
    // las fotos de los eventos que no están (una línea rechazada): el estado de antes
    while (io < objetivos.length && objetivos[io] < p) {
      if (!fotos.has(objetivos[io])) fotos.set(objetivos[io], copiar(c));
      io += 1;
    }
    const tipo = e.tipo as string;
    if (!DEL_MOTOR.has(tipo) && !DE_LA_SESION.has(tipo)) continue; // se conserva, no se aplica

    let turno = c.turnos[c.turnos.length - 1];
    if (e.tipo === "usuario") {
      if (esperaUsuario && turno) esperaUsuario = false;
      else turno = abrir(e.texto, p);
    } else if (e.tipo === "orden" && e.que === "mensaje") {
      turno = abrir(e.texto ?? "", p);
      esperaUsuario = true;
    } else if (!turno && DEL_MOTOR.has(tipo) && !ANUNCIOS.has(tipo)) {
      turno = abrir("", p);
    }
    if (turno !== deTurno) {
      deTurno = turno;
      indices = new Map(turno ? turno.pasos.map((x, k) => [x.id, k]) : []);
    }
    if (turno) turno.hasta = p;

    switch (e.tipo) {
      case "texto":
        turno.respuesta += e.texto;
        break;
      case "pensamiento":
        turno.pensamiento += e.texto;
        break;
      case "herramienta": {
        // sus campos, sin el tipo ni el sobre (sin copias de más: hay tareas con miles de pasos)
        const k = indices.get(e.id);
        const campos = e as unknown as Record<string, unknown>;
        if (k === undefined) {
          const paso: Record<string, unknown> = {};
          for (const clave in campos) if (!FUERA_DEL_PASO.has(clave)) paso[clave] = campos[clave];
          indices.set(e.id, turno.pasos.length);
          turno.pasos.push(paso as PasoEstado);
        } else {
          const paso = turno.pasos[k] as Record<string, unknown>;
          for (const clave in campos) {
            const valor = campos[clave];
            if (valor !== undefined && !FUERA_DEL_PASO.has(clave)) paso[clave] = valor;
          }
        }
        break;
      }
      case "plan":
        turno.plan = e.pasos;
        c.plan = e.pasos;
        break;
      case "contexto":
        s.contexto = { usado: e.usado, total: e.total, ...(e.coste ? { coste: e.coste } : {}) };
        break;
      case "opciones":
        s.opciones = e.opciones;
        break;
      case "fin":
        turno.fin = { motivo: e.motivo, ms: e.ms, ...(e.tokens ? { tokens: e.tokens } : {}) };
        if (e.tokens) {
          s.uso.entrada += e.tokens.entrada;
          s.uso.salida += e.tokens.salida;
          s.uso.pensamiento += e.tokens.pensamiento;
        }
        break;
      case "fallo":
        turno.error ??= e.mensaje;
        break;
      case "herencia":
        turno.herencia = { tokens: e.tokens, recuerdos: e.recuerdos };
        break;
      case "permiso":
        if (e.concedido === undefined) {
          c.permisos.push({
            titulo: e.titulo,
            ...(e.id !== undefined ? { id: e.id } : {}),
            ...(e.clase !== undefined ? { clase: e.clase } : {}),
            ...(e.opciones !== undefined ? { opciones: e.opciones } : {}),
          });
        } else {
          const k = e.id !== undefined ? c.permisos.findIndex((x) => x.id === e.id) : 0;
          if (k >= 0 && k < c.permisos.length) c.permisos.splice(k, 1);
        }
        break;
      case "dueno":
        s.epoca = e.epoca ?? s.epoca + 1;
        s.dueno = e.de ?? null;
        s.cerrada = false;
        s.traspaso = null;
        s.sesion = sesionTras(s.sesion, e);
        if (e.bifurca !== undefined) s.bifurca = e.bifurca;
        break;
      case "traspaso":
        s.traspaso = { a: e.a, ...(e.motivo !== undefined ? { motivo: e.motivo } : {}) };
        break;
      case "cierre":
        s.cerrada = true;
        break;
      case "punto":
        c.puntos.push({
          n: p,
          ...(e.commit !== undefined ? { commit: e.commit } : {}),
          ...(e.rama !== undefined ? { rama: e.rama } : {}),
          ...(e.chat !== undefined ? { chat: e.chat } : {}),
        });
        break;
      case "orden":
        if (esRebobinar(e) && e.hasta < p) {
          const foto = e.hasta < 0 ? vacio() : fotos.get(e.hasta);
          if (foto) {
            c = copiar(foto);
            c.permisos = []; // lo que esperaba, ya no espera
            esperaUsuario = false;
            deTurno = undefined;
          }
        }
        break;
    }
    if (io < objetivos.length && objetivos[io] === p) {
      fotos.set(p, copiar(c));
      while (io < objetivos.length && objetivos[io] === p) io += 1;
    }
  }

  // en el orden de la spec
  return {
    sesion: s.sesion,
    bifurca: s.bifurca,
    formato,
    epoca: s.epoca,
    dueno: s.dueno,
    cerrada: s.cerrada,
    traspaso: s.traspaso,
    turnos: c.turnos,
    plan: c.plan,
    uso: s.uso,
    contexto: s.contexto,
    opciones: s.opciones,
    permisos: c.permisos,
    puntos: c.puntos,
    eventos: cuantos,
  };
}

const lineas = (s: string) => (s === "" ? [] : lineasDe(s));

/**
 * Un turno del estado, plegado en un turno del contrato (estandar/turno.spec.yaml):
 * la pregunta, la respuesta, los pasos (ok o fallo) y lo que cambió en cada
 * fichero (del primer «antes» al último «después» de sus diffs). Los tokens
 * del contexto son los que la mente le pasó al motor.
 */
export function turnoDelContrato(t: TurnoEstado, o: { id?: string; motor: string; modo?: ModoContexto }): Turno {
  const actividad: PasoTurno[] = t.pasos.map((p) => ({
    paso: p.titulo || p.nombre || p.id,
    estado: p.estado === "completed" ? "ok" : "fallo",
    ...(p.detalle ? { detalle: p.detalle } : {}),
  }));
  const ficheros = new Map<string, { antes?: string; despues: string }>();
  for (const p of t.pasos) {
    for (const d of p.diff ?? []) {
      const f = ficheros.get(d.ruta);
      if (f) f.despues = d.despues;
      else ficheros.set(d.ruta, { antes: d.antes, despues: d.despues });
    }
  }
  const cambios: CambioTurno[] = [...ficheros].map(([ruta, f]) => {
    const r = diffLineas(lineas(f.antes ?? ""), lineas(f.despues));
    return { ruta, anadidos: r?.anadidos ?? null, borrados: r?.borrados ?? null };
  });
  return armaTurno({
    id: o.id ?? String(t.n),
    motor: o.motor,
    modo: o.modo ?? "estandar",
    pregunta: t.pedido,
    respuesta: t.respuesta,
    actividad,
    cambios,
    ...(t.herencia ? { tokens_contexto: t.herencia.tokens } : {}),
  });
}
