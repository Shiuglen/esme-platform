/**
 * EL REGISTRO DE UNA SESIÓN — un fichero al que solo se añade.
 *
 * Una sesión es su `eventos.jsonl`: una línea por evento, y cada línea con su
 * SOBRE (su número, la época de su dueño, el aparato que la escribió, la hora
 * y la huella de todo lo anterior). Aquí está cómo se escribe una línea
 * (`sellar`) y cómo se lee un registro entero (`leer`), con las tres reglas
 * del contrato comprobadas al leer:
 *
 *   1. **solo se añade**: la cadena de huellas encierra todo lo anterior, así
 *      que una línea cambiada, quitada, movida o repetida se nota (y se dice
 *      dónde, una sola vez);
 *   2. **un solo escritor**: dentro de una época solo escribe su dueño, y lo
 *      que llega con una época vieja (el portátil que despierta después de la
 *      mudanza) se rechaza;
 *   3. **lo que se lee es lo que se escribió**: el formato 1 del Taller (sin
 *      sobre) se lee tal cual, una última línea cortada por un apagón se deja
 *      fuera y se dice, y un tipo que no se conoce se conserva.
 *
 * Lo que este fichero NO es: el estado de la sesión (eso es reproducir, en
 * core/sesiones/reductor.ts) ni el fichero en disco (core/sesiones/fichero.ts).
 * Aquí solo hay texto que entra y texto que sale.
 *
 * Referencia: estandar/sesion.spec.yaml, docs/SESIONES.md.
 */
import { hash } from "node:crypto";

/** Los formatos: el 1 son las líneas del Taller sin sobre; el 2 lleva sobre. */
export const FORMATOS = [1, 2] as const;

/** Las claves del sobre, en el orden en que van en la línea. */
export const CLAVES_SOBRE = ["n", "epoca", "de", "ts", "ant"] as const;

/** El algoritmo de la cadena. */
export const ALGORITMO = "sha256";

/** La huella de antes de la primera línea. */
export const GENESIS = "0".repeat(64);

/** Cada cuánto llevan hora los trozos de texto (como hoy en el Taller). */
export const LATIDO_MS = 1000;

/** La época que abre el primer dueño. */
export const EPOCA_INICIAL = 1;

/** Los tipos que dice un motor (los de EventoMotor). */
export const TIPOS_MOTOR = [
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
] as const;

/** Los tipos de la sesión. */
export const TIPOS_SESION = ["orden", "punto", "dueno", "traspaso", "cierre"] as const;

/** Un tipo de evento que el contrato conoce. */
export type TipoEvento = (typeof TIPOS_MOTOR)[number] | (typeof TIPOS_SESION)[number];

/**
 * Los campos de cada tipo, además de `tipo` (y de `ts`, que es del sobre).
 * Los que acaban en «?» son opcionales. Es la lista de la spec, tal cual.
 */
export const CAMPOS_EVENTO: Readonly<Record<TipoEvento, readonly string[]>> = {
  texto: ["texto", "latidos?", "chat?"],
  pensamiento: ["texto", "latidos?"],
  herramienta: ["id", "titulo?", "estado?", "clase?", "nombre?", "rutas?", "detalle?", "diff?"],
  plan: ["pasos"],
  contexto: ["usado", "total", "coste?"],
  opciones: ["opciones"],
  usuario: ["texto"],
  fin: ["motivo", "ms", "tokens?"],
  fallo: ["mensaje"],
  reintento: ["ms", "motivo"],
  aprobado: ["titulo", "clase?"],
  uso: ["entrada", "salida", "pensamiento?", "cacheLectura?", "cacheEscritura?"],
  herencia: ["tokens", "recuerdos"],
  permiso: ["titulo", "id?", "clase?", "opciones?", "concedido?", "ms?"],
  orden: ["que", "desde?", "texto?", "turno?", "hasta?", "a?", "concedido?", "opcion?", "id?", "chat?"],
  punto: ["commit?", "rama?", "chat?"],
  dueno: ["sesion?", "bifurca?", "origen?"],
  traspaso: ["a", "motivo?"],
  cierre: ["motivo?"],
};

/**
 * Las órdenes: lo que pide una persona desde cualquier aparato, cada una con
 * los campos que necesita (además de `que`, y de `desde?`, que llevan todas).
 */
export const CAMPOS_ORDEN = {
  mensaje: ["texto", "chat?"],
  aprobar: ["concedido", "opcion?", "id?"],
  corregir: ["texto"],
  parar: [],
  mudarse: ["a"],
  juzgar: ["turno"],
  rebobinar: ["hasta"],
} as const satisfies Record<string, readonly string[]>;

/** Una orden. */
export type Orden = keyof typeof CAMPOS_ORDEN;

/** Las órdenes, en la lista cerrada de la spec. */
export const ORDENES = Object.keys(CAMPOS_ORDEN) as Orden[];

/** Lo que el chat de la app guarda de más en un turno o en el Hilo (va tal cual). */
export type DatosChat = Record<string, unknown>;

/** Una opción de configuración del motor (las de tipo «select»). */
export interface OpcionMotor {
  id: string;
  nombre: string;
  actual: string;
  valores: Array<{ id: string; nombre: string; descripcion?: string }>;
}

/** Lo que dice un motor: los EventoMotor de hoy, más lo que el sobre necesita. */
export type EventoMotor =
  | { tipo: "texto"; texto: string; latidos?: number[]; chat?: DatosChat }
  | { tipo: "pensamiento"; texto: string; latidos?: number[] }
  | {
      tipo: "herramienta";
      id: string;
      titulo?: string;
      estado?: string;
      clase?: string;
      nombre?: string;
      rutas?: string[];
      detalle?: string;
      diff?: Array<{ ruta: string; antes?: string; despues: string }>;
    }
  | { tipo: "plan"; pasos: Array<{ texto: string; estado: string }> }
  | { tipo: "contexto"; usado: number; total: number; coste?: { cantidad: number; moneda: string } }
  | { tipo: "opciones"; opciones: OpcionMotor[] }
  | { tipo: "usuario"; texto: string }
  | { tipo: "fin"; motivo: string; ms: number; tokens?: { entrada: number; salida: number; pensamiento: number } }
  | { tipo: "fallo"; mensaje: string }
  | { tipo: "reintento"; ms: number; motivo: string }
  | { tipo: "aprobado"; titulo: string; clase?: string }
  | { tipo: "uso"; entrada: number; salida: number; pensamiento?: number; cacheLectura?: number; cacheEscritura?: number }
  | { tipo: "herencia"; tokens: number; recuerdos: number }
  | {
      tipo: "permiso";
      titulo: string;
      id?: string;
      clase?: string;
      opciones?: Array<{ id: string; nombre: string; tipo: string }>;
      concedido?: boolean;
      ms?: number;
    };

/** De dónde salió una sesión bifurcada. */
export interface Bifurca {
  /** La sesión de la que salió. */
  sesion: string;
  /** El último evento que se copió. */
  n: number;
  /** La huella de lo copiado (la de la línea `n`). */
  cabeza: string;
}

/** Lo que hace la sesión. */
export type EventoSesion =
  | {
      tipo: "orden";
      que: Orden;
      desde?: string;
      texto?: string;
      turno?: number;
      hasta?: number;
      a?: string;
      concedido?: boolean;
      opcion?: string;
      id?: string;
      chat?: DatosChat;
    }
  | { tipo: "punto"; commit?: string; rama?: string; chat?: DatosChat }
  | { tipo: "dueno"; sesion?: string; bifurca?: Bifurca; origen?: string }
  | { tipo: "traspaso"; a: string; motivo?: string }
  | { tipo: "cierre"; motivo?: string };

/** Un evento: lo que pasó, con su hora si la lleva. */
export type Evento = (EventoMotor | EventoSesion) & { ts?: number };

/** El sobre de una línea del formato 2. */
export interface Sobre {
  /** Su número de orden: la posición en el registro. */
  n: number;
  /** La época del dueño que la escribió. */
  epoca: number;
  /** El aparato que la escribió. */
  de: string;
  /** La hora, en ms desde 1970 (opcional). */
  ts?: number;
  /** La huella de todo lo anterior. */
  ant: string;
}

/** Un evento tal como se lee: con su sobre si es del formato 2 (las del 1 no lo llevan). */
export type Linea = Evento & Partial<Sobre>;

/** Por dónde va la cadena: lo que hace falta para escribir la línea siguiente. */
export interface Cadena {
  /** Cuántas líneas lleva (el número de la siguiente). */
  n: number;
  /** La huella de todo lo escrito (el génesis si no hay nada). */
  cabeza: string;
  /** La época (0 si aún no hubo dueño). */
  epoca: number;
  /** El único que escribe (null si aún no hubo dueño). */
  dueno: string | null;
  /** Si la sesión está cerrada (solo cabe un dueño que la reabra). */
  cerrada: boolean;
}

/** La cadena de un registro vacío. */
export const CADENA_VACIA: Cadena = Object.freeze({ n: 0, cabeza: GENESIS, epoca: 0, dueno: null, cerrada: false });

/** Un problema de un registro: en qué línea (su posición) y qué pasa. */
export interface Problema {
  linea: number;
  problema: string;
}

/** El formato de un registro: 1, 2, o el 1 seguido del 2. */
export type Formato = 1 | 2 | "mixto";

/** Lo que sale de leer un registro. */
export interface Lectura {
  /**
   * Los eventos aceptados, en orden. Si el registro no es válido, se quedan
   * fuera los que se rechazan (una línea rota, el que escribió sin ser el
   * dueño, con una época vieja o tras el cierre); los que no casan con la
   * cadena se quedan dentro, porque no se sabe cuál cambió.
   */
  eventos: Linea[];
  /** Cada evento aceptado tal como se escribió (sin su salto ni su «\r»). */
  lineas: string[];
  /** El formato (null si no hay ninguna línea). */
  formato: Formato | null;
  /** Por dónde va la cadena (para seguir escribiendo). */
  cadena: Cadena;
  /** Si la última línea se cortó a medias (un apagón): se deja fuera. */
  cortada: boolean;
  /** Si la última línea está entera pero sin su salto final. */
  sinSalto: boolean;
  /** Hasta dónde vale el texto (sin la línea cortada, si la hay). */
  aceptado: number;
  /** Lo que no cuadra, por orden. */
  problemas: Problema[];
  /** Si no hay ningún problema. */
  valida: boolean;
}

/** La huella de una línea, encerrando la de todo lo anterior: sha256(anterior + "\n" + línea), en UTF-8. */
export function huella(anterior: string, linea: string): string {
  return hash(ALGORITMO, `${anterior}\n${linea}`);
}

const RESERVADAS = ["n", "epoca", "de", "ant"] as const;

/**
 * Sella un evento: le pone su sobre y devuelve la línea que se escribe (sin
 * el salto) y la cadena que queda. Comprueba lo del escritor: lo primero es un
 * `dueno`, después solo escribe el dueño, y tras un `cierre` solo cabe un
 * `dueno`. La forma del evento no la mira (eso es `validarEvento`): un tipo
 * nuevo se puede sellar.
 */
export function sellar(c: Cadena, evento: Evento, de: string): { linea: string; cadena: Cadena; evento: Linea } {
  const tipo: unknown = evento?.tipo;
  if (typeof tipo !== "string" || tipo === "") throw new Error("Un evento necesita su «tipo».");
  if (typeof de !== "string" || de === "") throw new Error("Hace falta el aparato que escribe («de»).");
  for (const k of RESERVADAS) {
    if (k in evento) throw new Error(`«${k}» es del sobre: un evento no puede usarlo como campo.`);
  }
  const { ts, ...cuerpo } = evento;
  if (ts !== undefined && !Number.isFinite(ts)) throw new Error("La hora («ts») tiene que ser un número.");
  let { epoca, dueno, cerrada } = c;
  if (evento.tipo === "dueno") {
    epoca += 1;
    dueno = de;
    cerrada = false;
  } else {
    if (dueno === null) throw new Error("Lo primero que se apunta en un registro con sobre es un `dueno`.");
    if (cerrada) throw new Error("La sesión está cerrada: solo cabe un `dueno` que la reabra.");
    if (de !== dueno) throw new Error(`«${de}» no es el dueño de la sesión (lo es «${dueno}»): solo el dueño escribe.`);
    if (evento.tipo === "cierre") cerrada = true;
  }
  const sellado = { n: c.n, epoca, de, ...(ts !== undefined ? { ts } : {}), ant: c.cabeza, ...cuerpo } as Linea;
  const linea = JSON.stringify(sellado);
  return { linea, cadena: { n: c.n + 1, cabeza: huella(c.cabeza, linea), epoca, dueno, cerrada }, evento: sellado };
}

/** El evento sin su sobre (la hora se queda: también la llevan las líneas del formato 1). */
export function sinSobre(l: Linea): Evento {
  const { n: _n, epoca: _e, de: _d, ant: _a, ...evento } = l;
  return evento as Evento;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Lo que no cuadra en el sobre de una línea (`h` es la huella que se espera: si casa, ya es una huella). */
function sobreRoto(o: Record<string, unknown>, h: string): string | null {
  if (!Number.isInteger(o.n) || (o.n as number) < 0) return "el sobre está roto: «n» no es un número de línea";
  if (!Number.isInteger(o.epoca) || (o.epoca as number) < EPOCA_INICIAL) return "el sobre está roto: «epoca» no es una época";
  if (typeof o.de !== "string" || o.de === "") return "el sobre está roto: falta «de»";
  if (typeof o.ant !== "string" || (o.ant !== h && !HEX64.test(o.ant))) return "el sobre está roto: «ant» no es una huella";
  if (o.ts !== undefined && !Number.isFinite(o.ts)) return "el sobre está roto: «ts» no es una hora";
  return null;
}

/**
 * Lee un registro entero y comprueba la cadena, los números y el escritor.
 *
 * `cabeza` es la que guardó quien copió el registro (la de sus primeras `n`
 * líneas; si no se dice `n`, la del registro entero): la última línea no tiene
 * a nadie detrás que note si cambió, y la cabeza sí lo nota.
 *
 * Las líneas sin sobre del principio no traen huella que comprobar: la suya
 * se calcula cuando hace falta (al llegar al primer sobre, o al pedir la
 * cabeza), no antes. Un registro del Taller de hoy se lee sin gastar en eso.
 */
export function leer(texto: string, opciones: { cabeza?: string; n?: number } = {}): Lectura {
  const eventos: Linea[] = [];
  const lineas: string[] = [];
  const problemas: Problema[] = [];
  let h = GENESIS;
  let k = 0;
  let epoca = 0;
  let dueno: string | null = null;
  let cerrada = false;
  let v1 = false;
  let v2 = false;
  let desfase = 0;
  // desde dónde no está comprobado aún lo anterior (lo de antes lo encierra un «ant» que casó)
  let desde = 0;
  let cortada = false;
  let sinSalto = false;
  let aceptado = texto.length;
  let cabezaEn = opciones.n === 0 ? GENESIS : undefined;
  let inicio = texto.charCodeAt(0) === 0xfeff ? 1 : 0;
  // las líneas sin sobre aún sin huella (mientras no haga falta)
  const sinHuella: string[] = [];
  const perezosa = opciones.cabeza === undefined;

  while (inicio < texto.length) {
    let fin = texto.indexOf("\n", inicio);
    const ultima = fin === -1;
    if (ultima) fin = texto.length;
    const siguiente = fin + 1;
    let cruda = texto.slice(inicio, fin);
    if (cruda.charCodeAt(cruda.length - 1) === 13) cruda = cruda.slice(0, -1);
    if (cruda.charCodeAt(0) !== 123 && cruda.trim() === "") {
      inicio = siguiente;
      continue;
    }
    let o: Record<string, unknown> | null = null;
    let rota = false;
    try {
      const v: unknown = JSON.parse(cruda);
      if (v !== null && typeof v === "object" && !Array.isArray(v)) o = v as Record<string, unknown>;
    } catch {
      rota = true;
    }
    if (rota && ultima) {
      cortada = true;
      aceptado = inicio;
      break;
    }
    if (ultima) sinSalto = true;

    if (o === null || typeof o.tipo !== "string") {
      problemas.push({ linea: k, problema: rota ? "la línea está rota (no es JSON)" : "no es un evento: le falta «tipo»" });
    } else if (o.n === undefined && o.epoca === undefined && o.de === undefined && o.ant === undefined) {
      // formato 1: sin sobre, tal cual
      if (v2) problemas.push({ linea: k, problema: "una línea sin sobre después del formato 2: el registro no puede volver al 1" });
      else {
        v1 = true;
        eventos.push(o as Linea);
        lineas.push(cruda);
      }
    } else {
      v2 = true;
      for (const x of sinHuella) h = huella(h, x);
      sinHuella.length = 0;
      const roto = sobreRoto(o, h);
      if (roto) problemas.push({ linea: k, problema: roto });
      else {
        // la cadena: una sola explicación por línea, y se sigue desde lo que la línea dice
        if (o.n !== k + desfase) {
          problemas.push({ linea: k, problema: `es la línea ${k} y dice ser la ${o.n as number}: falta, sobra o se movió alguna línea` });
          desfase = (o.n as number) - k;
          h = o.ant as string;
          desde = k;
        } else if (o.ant !== h) {
          const cual = desde === k - 1 ? `cambió la línea ${k - 1}` : `cambió alguna línea de la ${desde} a la ${k - 1}`;
          problemas.push({ linea: k, problema: `la huella no casa: ${cual} (o el «ant» de esta)` });
          h = o.ant as string;
          desde = k;
        } else desde = k;

        const e = o.epoca as number;
        const de = o.de as string;
        let regla: string | null = null;
        if (o.tipo === "dueno") {
          if (e <= epoca) regla = `un dueño tiene que subir la época: la sesión va por la ${epoca} y este dice ${e}`;
        } else if (dueno === null) regla = "la primera línea con sobre tiene que ser un `dueno`";
        else if (e < epoca) regla = `época vieja: la ${e}, y la sesión va por la ${epoca} («${de}» escribió después de dejar de ser el dueño)`;
        else if (e > epoca) regla = `la época ${e} no la abrió ningún dueño`;
        else if (de !== dueno) regla = `«${de}» no es el dueño de la época ${epoca} (lo es «${dueno}»)`;
        else if (cerrada) regla = "tras el cierre solo cabe un `dueno` que la reabra";

        if (regla) problemas.push({ linea: k, problema: regla });
        else {
          if (o.tipo === "dueno") {
            epoca = e;
            dueno = de;
            cerrada = false;
          } else if (o.tipo === "cierre") cerrada = true;
          eventos.push(o as Linea);
          lineas.push(cruda);
        }
      }
    }
    if (perezosa && !v2) sinHuella.push(cruda);
    else h = huella(h, cruda);
    k += 1;
    if (k === opciones.n) cabezaEn = h;
    inicio = siguiente;
  }

  if (opciones.cabeza !== undefined) {
    const n = opciones.n ?? k;
    if (n > k) problemas.push({ linea: k, problema: `la cabeza no casa: el registro tiene ${k} líneas y la cabeza es de ${n}` });
    else if ((opciones.n === undefined ? h : cabezaEn) !== opciones.cabeza) {
      problemas.push({ linea: Math.max(n - 1, 0), problema: `la cabeza no casa: alguna de las primeras ${n} líneas no es la que se guardó` });
    }
  }

  const cadena: Cadena = { n: k, cabeza: h, epoca, dueno, cerrada };
  if (sinHuella.length > 0) {
    let calculada: string | undefined;
    Object.defineProperty(cadena, "cabeza", {
      enumerable: true,
      get: () => {
        if (calculada === undefined) {
          calculada = h;
          for (const x of sinHuella) calculada = huella(calculada, x);
        }
        return calculada;
      },
    });
  }

  return {
    eventos,
    lineas,
    formato: v1 && v2 ? "mixto" : v2 ? 2 : v1 ? 1 : null,
    cadena,
    cortada,
    sinSalto: sinSalto && !cortada,
    aceptado,
    problemas,
    valida: problemas.length === 0,
  };
}

const CONOCIDOS = new Set<string>([...TIPOS_MOTOR, ...TIPOS_SESION]);

/** Si un tipo es de los que el contrato conoce. */
export function esConocido(tipo: string): tipo is TipoEvento {
  return CONOCIDOS.has(tipo);
}

/**
 * Lo que no cuadra en la forma de un evento, según la spec: un tipo que no
 * existe, un campo que falta, uno que su tipo no tiene, o una orden que no
 * está en la lista. Vacío si está bien. (Las claves del sobre no cuentan.)
 */
export function validarEvento(e: Evento | Linea): string[] {
  const tipo = (e as { tipo?: unknown }).tipo;
  if (typeof tipo !== "string") return ["un evento necesita su «tipo»"];
  if (!esConocido(tipo)) return [`«${tipo}» no es un tipo de evento`];
  const problemas = faltanYSobran(tipo, CAMPOS_EVENTO[tipo], e as Record<string, unknown>, ["tipo", ...CLAVES_SOBRE]);
  if (tipo === "orden") {
    const que = (e as { que?: unknown }).que;
    if (typeof que === "string" && !(que in CAMPOS_ORDEN)) problemas.push(`orden: «${que}» no es una orden`);
    else if (typeof que === "string") {
      const campos: readonly string[] = CAMPOS_ORDEN[que as Orden];
      for (const c of campos) {
        if (!c.endsWith("?") && (e as Record<string, unknown>)[c] === undefined) problemas.push(`orden ${que}: falta «${c}»`);
      }
    }
  }
  return problemas;
}

function faltanYSobran(tipo: string, campos: readonly string[], e: Record<string, unknown>, aparte: readonly string[]): string[] {
  const problemas: string[] = [];
  const todos = new Set<string>();
  for (const c of campos) {
    const opcional = c.endsWith("?");
    const nombre = opcional ? c.slice(0, -1) : c;
    todos.add(nombre);
    if (!opcional && e[nombre] === undefined) problemas.push(`${tipo}: falta «${nombre}»`);
  }
  for (const k of Object.keys(e)) {
    if (!todos.has(k) && !aparte.includes(k) && e[k] !== undefined) problemas.push(`${tipo}: «${k}» no es un campo de su tipo`);
  }
  return problemas;
}
