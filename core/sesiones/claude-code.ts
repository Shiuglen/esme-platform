/**
 * IMPORTAR UNA SESIÓN DE CLAUDE CODE — su `.jsonl`, hecho registro de Esme.
 *
 * Claude Code guarda cada sesión en un `.jsonl`: una línea por bloque de un
 * mensaje, y cada línea apunta a la de antes (`parentUuid`). No es una lista:
 * es un ÁRBOL. Rebobinar deja ramas muertas, los subagentes escriben las
 * suyas (`isSidechain`), una compactación corta el hilo (y sigue por
 * `logicalParentUuid`), y hay líneas que no son mensajes (el resumen, las
 * copias de los ficheros, el último prompt…). Así que importar es:
 *
 *   1. ENCONTRAR EL HILO: el que acaba en el último mensaje, de padre en
 *      padre y cruzando las compactaciones (Claude Code enlaza cada una con
 *      la línea de antes; si ese enlace no llegó al fichero, se empalma igual,
 *      y se cuenta), con lo que cuelga de él sin ser otra rama: un mensaje
 *      con varias llamadas es una línea por bloque y cada resultado cuelga de
 *      su llamada, y lo que dejan los hooks va de lado. Lo demás (lo que se
 *      dejó al rebobinar) no entra, y se cuenta.
 *   2. LEERLO COMO TURNOS: lo que escribe la persona abre un turno (`orden
 *      {mensaje}`) o, si el turno está en marcha, lo corrige (`orden
 *      {corregir}`); Esc lo para (`orden {parar}`); un aviso que compuso el
 *      sistema es lo que recibió el motor (`usuario`), y con el turno en
 *      marcha no lo corta. Si Claude Code numera el turno (`turnPosition`),
 *      manda su número: uno nuevo abre turno aunque venga oculto o el motor
 *      deba una respuesta, y el del turno abierto sigue en él. Lo que llega a
 *      la cola con el turno en marcha (`queued_command`) es lo mismo: lo de
 *      la persona lo corrige, y un aviso no lo corta. Del motor: lo que
 *      piensa y dice, sus herramientas (con su clase, sus rutas, su diff y su
 *      error), el plan de TodoWrite, los reintentos de la API y el cambio de
 *      modelo (`opciones`). Cada turno acaba en su `fin`, con lo que gastó.
 *   3. SELLARLO: un registro nuevo, que empieza con un `dueno` que dice de
 *      dónde viene (`origen: "claude-code"`).
 *
 * El uso: Claude Code repite el de un mensaje en cada línea suya, así que
 * se cuenta una vez por mensaje (lo mayor de cada campo: las versiones viejas
 * lo hacían crecer de línea en línea). La entrada es la que no salió de la
 * caché, la caché va aparte, la salida incluye lo pensado (como la cuenta
 * Anthropic) y el `uso` va acumulado, como el del motor propio.
 *
 * Lo que no está en el fichero no se inventa: una herramienta acaba a la
 * hora de su resultado; un turno que se quedó a medias (el fichero acaba con
 * el motor trabajando) no lleva `fin`; lo oculto (`isMeta`) no entra, salvo
 * lo que lleva la marca de un turno (es lo que recibió el motor); y un
 * aviso del sistema justo detrás de una orden local que el motor no contesta
 * (`/model`, `/clear`…) se lee como lo que el motor recibió por esa orden.
 *
 * Es puro: el mismo `.jsonl` da siempre el mismo registro. No lee ni escribe
 * ficheros (eso es core/sesiones/fichero.ts).
 *
 * Referencia: estandar/sesion.spec.yaml (dueno: `origen`), docs/SESIONES.md.
 */
import { CADENA_VACIA, sellar, TIPOS_MOTOR, type Cadena, type Evento, type EventoMotor, type OpcionMotor } from "./registro.ts";

/** El `origen` del dueño de una sesión importada de Claude Code. */
export const ORIGEN_CLAUDE_CODE = "claude-code";

/** Cómo se importa. */
export interface OpcionesImportar {
  /** El aparato que la importa: su dueño. */
  de: string;
  /** El id de la sesión, si no vale el de Claude Code (o si el fichero no lo trae). */
  sesion?: string;
}

/** Lo que había en el `.jsonl`, contado: lo que entró y lo que no. */
export interface InformeImportar {
  /** Las líneas con algo. */
  lineas: number;
  /** Las que no se leen (JSON roto, o una línea cortada a medias). */
  rotas: number;
  /** Las del hilo: las que acaban en el último mensaje, de padre en padre, y las que cuelgan de él sin ser otra rama (las otras líneas de un mensaje partido en bloques y los resultados de sus llamadas). */
  hilo: number;
  /** Las de la sesión que quedaron fuera del hilo (lo que se dejó al rebobinar). Los adjuntos que cuelgan del hilo (lo de los hooks) se cuentan en `otros`. */
  fueraDelHilo: number;
  /** Las de los subagentes (sus ramas: en el hilo, el subagente es su herramienta). */
  laterales: number;
  /** Las repetidas (el mismo uuid otra vez: vale la primera). */
  repetidos: number;
  /** Si el hilo empieza a medias: su primer padre no está en el fichero. */
  aMedias: boolean;
  /** Las compactaciones cuyo enlace no está en el fichero: el hilo sigue por la línea de antes (la que enlazan las demás). */
  empalmes: number;
  /** Lo que no es de nadie: lo oculto, la salida de una orden local, un Esc sin turno en marcha… */
  meta: number;
  /** Los resúmenes de una compactación (los escribe el motor para sí mismo). */
  resumenes: number;
  /** Lo demás, por tipo: las líneas que no son mensajes, los bloques que no se conocen… */
  otros: Record<string, number>;
  /** Los turnos que salen. */
  turnos: number;
  /** Las herramientas que se llamaron (sin TodoWrite, que es el plan). */
  herramientas: number;
  /** Las que se quedaron sin resultado. */
  sinResultado: number;
  /** Las imágenes (no se guardan: se dice que estaban). */
  imagenes: number;
}

/** Lo que sale de importar. */
export interface Importacion {
  /** El registro, listo para guardar como `eventos.jsonl`. */
  texto: string;
  /** Por dónde va su cadena (para seguir escribiendo). */
  cadena: Cadena;
  /** El id de la sesión. */
  sesion: string;
  /** Lo que entró y lo que no. */
  informe: InformeImportar;
}

/** Lo que se guarda de lo que devuelve una herramienta, como mucho. */
const MAX_DETALLE = 1000;
/** Lo largo de un título, como mucho. */
const MAX_TITULO = 160;
/** El modelo de los mensajes que no escribió ningún modelo (un error de la API, un «no hace falta responder»). */
const SINTETICO = "<synthetic>";
/** Lo que apunta Claude Code cuando la persona pulsa Esc (y «… for tool use]» si fue al pedir permiso). */
const ESC = "[Request interrupted by user";
/** La salida de una orden local (`/model`) o de la terminal (`!ls`): no es de nadie. */
const SALIDA_LOCAL = /^\s*<(local-command-(stdout|stderr)|bash-(stdout|stderr))>/;
/** Los campos que dicen sobre qué trabaja una herramienta, por orden: el primero que haya la nombra (lo que se busca, antes que dónde). */
const CAMPOS_TITULO = ["file_path", "notebook_path", "command", "pattern", "path", "url", "query", "description", "prompt"];
/** La clase de cada herramienta de Claude Code (las de ACP); las demás, «other». */
const CLASES: Readonly<Record<string, string>> = {
  Read: "read",
  NotebookRead: "read",
  Edit: "edit",
  MultiEdit: "edit",
  Write: "edit",
  NotebookEdit: "edit",
  Bash: "execute",
  BashOutput: "execute",
  KillBash: "execute",
  KillShell: "execute",
  Grep: "search",
  Glob: "search",
  LS: "search",
  WebFetch: "fetch",
  WebSearch: "fetch",
  Task: "think",
  Agent: "think",
  ExitPlanMode: "switch_mode",
};
/** El plan, como en ACP: ni herramienta ni resultado. */
const PLAN = "TodoWrite";
/** Los motivos de un `fin` que se dicen tal cual; lo demás acabó bien (`end_turn`). */
const MOTIVOS = new Set(["max_tokens", "refusal"]);
/** Lo que dice un motor; lo que anuncia no abre turno ni es el motor diciendo algo (como en el estado). */
const DEL_MOTOR = new Set<string>(TIPOS_MOTOR);
const ANUNCIOS = new Set(["opciones", "uso", "contexto"]);

type Json = Record<string, unknown>;

/** Lo que gastó un mensaje. */
interface Gasto {
  entrada: number;
  salida: number;
  pensamiento: number;
  cacheLectura: number;
  cacheEscritura: number;
}

/** Un turno mientras se lee. */
interface Turno {
  /** El número que le puso Claude Code (`turnPosition.turnIndex`), si lo marcó. */
  indice: number | undefined;
  /** La hora a la que empezó. */
  inicio: number | undefined;
  /** La hora de lo último que pasó en él. */
  ultima: number | undefined;
  /** Si un modelo dijo algo en él. */
  salida: boolean;
  /** Las herramientas que esperan su resultado. */
  pendientes: Set<string>;
  /** Si el motor debe una respuesta: la del resultado de una herramienta. */
  debe: boolean;
  /** Si lo acabó un error de la API. */
  roto: boolean;
  /** Lo que gastó cada mensaje del motor. */
  gastos: Map<string, Gasto>;
  /** El último mensaje del motor, y su motivo para parar. */
  mensaje: string | null;
  motivo: string | null;
  /** Si ya dijo algo, o ya pensó algo (lo siguiente va separado). */
  dijo: boolean;
  penso: boolean;
}

const esObjeto = (x: unknown): x is Json => typeof x === "object" && x !== null && !Array.isArray(x);
const cadena = (x: unknown): string => (typeof x === "string" ? x : "");
const recorta = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

function horaDe(x: unknown): number | undefined {
  if (typeof x !== "string") return undefined;
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : undefined;
}

/** Los bloques de un mensaje (un texto suelto es un bloque de texto). */
function bloquesDe(content: unknown): Json[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? content.filter(esObjeto) : [];
}

function gastoDe(u: unknown): Gasto | null {
  if (!esObjeto(u)) return null;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);
  const detalle = esObjeto(u.output_tokens_details) ? u.output_tokens_details : {};
  return {
    entrada: n(u.input_tokens),
    salida: n(u.output_tokens),
    pensamiento: n(detalle.thinking_tokens),
    cacheLectura: n(u.cache_read_input_tokens),
    cacheEscritura: n(u.cache_creation_input_tokens),
  };
}

const CAMPOS_GASTO = ["entrada", "salida", "pensamiento", "cacheLectura", "cacheEscritura"] as const;

function combina(a: Gasto, b: Gasto, f: (x: number, y: number) => number): Gasto {
  const g = { ...a };
  for (const k of CAMPOS_GASTO) g[k] = f(a[k], b[k]);
  return g;
}

const CERO: Gasto = { entrada: 0, salida: 0, pensamiento: 0, cacheLectura: 0, cacheEscritura: 0 };

function opcionDeModelo(actual: string, vistos: readonly string[]): OpcionMotor {
  return { id: "modelo", nombre: "Modelo", actual, valores: vistos.map((v) => ({ id: v, nombre: v })) };
}

/** El título de una herramienta: su nombre y la primera línea de lo que la nombra. */
function tituloDe(nombre: string, input: Json): string {
  let valor = CAMPOS_TITULO.map((k) => cadena(input[k])).find((v) => v.trim() !== "");
  valor ??= Object.values(input).find((v): v is string => typeof v === "string" && v.trim() !== "");
  const linea = (valor ?? "").trim().split("\n")[0].trimEnd();
  return recorta(linea ? `${nombre} ${linea}` : nombre, MAX_TITULO);
}

function rutaDe(input: Json): string {
  return cadena(input.file_path) || cadena(input.notebook_path) || cadena(input.path);
}

type Diff = NonNullable<Extract<EventoMotor, { tipo: "herramienta" }>["diff"]>;

/** Lo que cambia una edición: cada trozo, de lo que había a lo que queda (un fichero nuevo no tenía nada). */
function diffDe(nombre: string, input: Json, ruta: string): Diff | null {
  if (!ruta) return null;
  const trozo = (e: Json) => (typeof e.old_string === "string" && typeof e.new_string === "string" ? { ruta, antes: e.old_string, despues: e.new_string } : null);
  if (nombre === "Edit") {
    const d = trozo(input);
    return d ? [d] : null;
  }
  if (nombre === "MultiEdit" && Array.isArray(input.edits)) {
    const d = input.edits.filter(esObjeto).flatMap((e) => trozo(e) ?? []);
    return d.length ? d : null;
  }
  if (nombre === "Write" && typeof input.content === "string") return [{ ruta, despues: input.content }];
  return null;
}

/** Importa el `.jsonl` de una sesión de Claude Code: el registro de Esme que la cuenta. */
export function importarClaudeCode(jsonl: string, o: OpcionesImportar): Importacion {
  if (typeof o?.de !== "string" || o.de === "") throw new Error("Hace falta el aparato que escribe («de»).");
  const informe: InformeImportar = {
    lineas: 0,
    rotas: 0,
    hilo: 0,
    fueraDelHilo: 0,
    laterales: 0,
    repetidos: 0,
    aMedias: false,
    empalmes: 0,
    meta: 0,
    resumenes: 0,
    otros: {},
    turnos: 0,
    herramientas: 0,
    sinResultado: 0,
    imagenes: 0,
  };
  const otro = (clave: string) => {
    informe.otros[clave] = (informe.otros[clave] ?? 0) + 1;
  };

  // 1. las líneas de la sesión, en su orden y por su uuid (las de los subagentes y las repetidas, fuera)
  const orden: Json[] = [];
  const sitio = new Map<string, number>();
  for (const bruta of jsonl.split("\n")) {
    const linea = bruta.endsWith("\r") ? bruta.slice(0, -1) : bruta;
    if (linea.trim() === "") continue;
    informe.lineas += 1;
    let x: unknown;
    try {
      x = JSON.parse(linea);
    } catch {
      x = undefined;
    }
    if (!esObjeto(x)) informe.rotas += 1;
    else if (typeof x.uuid !== "string") otro(cadena(x.type) || "sin tipo");
    else if (x.isSidechain === true) informe.laterales += 1;
    else if (sitio.has(x.uuid)) informe.repetidos += 1;
    else {
      sitio.set(x.uuid, orden.length);
      orden.push(x);
    }
  }
  const hoja = orden.at(-1);
  if (!hoja) throw new Error("El fichero no tiene ningún mensaje de Claude Code: no hay sesión que importar.");

  // 2. el hilo: del último mensaje hacia atrás, de padre en padre (y cruzando las compactaciones)
  const enHilo = new Set<number>();
  for (let k: number | undefined = orden.length - 1; k !== undefined && !enHilo.has(k); ) {
    enHilo.add(k);
    const x: Json = orden[k];
    const padre = cadena(x.parentUuid) || cadena(x.logicalParentUuid);
    const suyo = padre ? sitio.get(padre) : undefined;
    if (suyo === undefined && x.type === "system" && x.subtype === "compact_boundary" && k > 0) {
      // Claude Code enlaza cada compactación con la línea de antes; si ese enlace no se escribió, se hace lo mismo
      informe.empalmes += 1;
      k -= 1;
      continue;
    }
    if (!padre) break;
    k = suyo;
    if (k === undefined) informe.aMedias = true;
  }
  // …y lo que cuelga de él sin ser otra rama: un mensaje con varias llamadas es una línea por bloque, cada
  // resultado cuelga de su llamada (y el hilo pasa solo por una), y lo que dejan los hooks también va de lado
  const mensajesDelHilo = new Set<string>();
  const llamadasDelHilo = new Set<string>();
  const anota = (x: Json) => {
    for (const b of bloquesDe(esObjeto(x.message) ? x.message.content : undefined)) if (b.type === "tool_use") llamadasDelHilo.add(cadena(b.id));
  };
  for (const k of enHilo) {
    const x = orden[k];
    if (x.type !== "assistant") continue;
    const id = esObjeto(x.message) ? cadena(x.message.id) : "";
    if (id) mensajesDelHilo.add(id);
    anota(x);
  }
  const deLado = new Set<number>();
  orden.forEach((x, k) => {
    const p = sitio.get(cadena(x.parentUuid));
    if (enHilo.has(k) || p === undefined || !(enHilo.has(p) || deLado.has(p))) return;
    const m = esObjeto(x.message) ? x.message : {};
    const bloques = bloquesDe(m.content);
    if (x.type === "attachment") deLado.add(k);
    else if (x.type === "assistant" && mensajesDelHilo.has(cadena(m.id))) {
      enHilo.add(k);
      anota(x);
    } else if (x.type === "user" && bloques.length > 0 && bloques.every((b) => b.type === "tool_result" && llamadasDelHilo.has(cadena(b.tool_use_id)))) enHilo.add(k);
  });
  const hilo = [...enHilo].sort((a, b) => a - b).map((k) => orden[k]);
  informe.hilo = hilo.length;
  informe.fueraDelHilo = orden.length - hilo.length - deLado.size;
  if (deLado.size > 0) informe.otros.attachment = (informe.otros.attachment ?? 0) + deLado.size;

  const sesion = o.sesion || cadena(hoja.sessionId);
  if (!sesion) throw new Error("No se sabe de qué sesión es: el fichero no trae su id («sessionId»), y hay que darlo («sesion»).");

  // 3. sellar: cada evento en su línea, con la hora de la línea de la que sale
  let c: Cadena = CADENA_VACIA;
  const lineas: string[] = [];
  let turno: Turno | null = null;
  // lo mismo que hace el estado al reproducir (core/sesiones/reductor.ts): para contar sus turnos
  let esperaEco = false;
  const evento = (e: Evento, ts: number | undefined) => {
    if (e.tipo === "orden" && e.que === "mensaje") {
      informe.turnos += 1;
      esperaEco = true;
    } else if (e.tipo === "usuario") {
      if (esperaEco && informe.turnos > 0) esperaEco = false;
      else informe.turnos += 1;
    } else if (DEL_MOTOR.has(e.tipo) && !ANUNCIOS.has(e.tipo)) {
      esperaEco = false;
      if (informe.turnos === 0) informe.turnos = 1;
    }
    const r = sellar(c, ts === undefined ? e : { ...e, ts }, o.de);
    lineas.push(r.linea);
    c = r.cadena;
    if (turno && ts !== undefined) turno.ultima = ts;
  };

  const primera = hilo.map((x) => horaDe(x.timestamp)).find((t) => t !== undefined);
  evento({ tipo: "dueno", sesion, origen: ORIGEN_CLAUDE_CODE }, primera);

  const modelos: string[] = [];
  let modelo: string | null = null;
  /** Cada herramienta llamada, por su id: su nombre (para leer su resultado). */
  const llamadas = new Map<string, string>();
  /** Las que aún esperan su resultado (sin el plan, que no es una herramienta). */
  const esperan = new Set<string>();
  let total: Gasto = CERO;

  const nuevo = (inicio: number | undefined, indice?: number): Turno => ({
    indice,
    inicio,
    ultima: inicio,
    salida: false,
    pendientes: new Set(),
    debe: false,
    roto: false,
    gastos: new Map(),
    mensaje: null,
    motivo: null,
    dijo: false,
    penso: false,
  });
  /** El turno en el que cae lo que pasa (si no hay ninguno abierto, uno). */
  const enCurso = (ts: number | undefined): Turno => (turno ??= nuevo(ts));
  const enMarcha = (t: Turno | null) => t !== null && t.salida && !t.roto && (t.pendientes.size > 0 || t.debe);

  /**
   * Cierra el turno: lo gastado (acumulado) y su `fin`. Un turno parado lleva
   * siempre su fin; uno que acabó, si un modelo dijo algo; uno que sigue en
   * marcha al acabar el fichero, o que rompió la API, solo lo gastado.
   */
  const cerrar = (como: "acabo" | "parado" | "final") => {
    const t = turno;
    if (!t) return;
    turno = null;
    const gastos = [...t.gastos.values()];
    const gasto = gastos.length ? gastos.reduce((a, b) => combina(a, b, (x, y) => x + y)) : null;
    if (gasto) {
      total = combina(total, gasto, (x, y) => x + y);
      evento({ tipo: "uso", ...total }, t.ultima);
    }
    const acabo = como === "parado" || (t.salida && !t.roto && !(como === "final" && enMarcha(t)));
    if (!acabo) return;
    const motivo = como === "parado" ? "cancelled" : t.motivo !== null && MOTIVOS.has(t.motivo) ? t.motivo : "end_turn";
    const ms = t.inicio !== undefined && t.ultima !== undefined ? Math.max(0, t.ultima - t.inicio) : 0;
    const tokens = gasto ? { entrada: gasto.entrada, salida: gasto.salida, pensamiento: gasto.pensamiento } : undefined;
    evento({ tipo: "fin", motivo, ms, ...(tokens ? { tokens } : {}) }, t.ultima);
  };

  /** Lo que devolvió una herramienta, en texto (las imágenes se dicen, no se guardan). */
  const contenidoDe = (content: unknown): string => {
    if (typeof content === "string") return content;
    const partes: string[] = [];
    for (const b of bloquesDe(content)) {
      if (b.type === "text") partes.push(cadena(b.text));
      else if (b.type === "image") {
        informe.imagenes += 1;
        partes.push("[imagen]");
      }
    }
    return partes.join("\n");
  };

  const resultado = (b: Json, ts: number | undefined) => {
    const id = cadena(b.tool_use_id);
    const nombre = llamadas.get(id);
    if (nombre === undefined) {
      otro("tool_result sin llamada");
      return;
    }
    const t = enCurso(ts);
    t.pendientes.delete(id);
    esperan.delete(id);
    t.debe = true;
    const contenido = contenidoDe(b.content);
    if (nombre === PLAN) return;
    const fallo = b.is_error === true;
    // lo que devuelve una orden, o un error, se queda en su detalle; lo demás (un fichero leído) no
    const detalle = fallo || CLASES[nombre] === "execute" ? contenido : "";
    evento({ tipo: "herramienta", id, estado: fallo ? "failed" : "completed", ...(detalle ? { detalle: recorta(detalle, MAX_DETALLE) } : {}) }, ts);
  };

  const llamada = (b: Json, t: Turno, ts: number | undefined) => {
    const id = cadena(b.id);
    if (!id) {
      otro("tool_use sin id");
      return;
    }
    const nombre = cadena(b.name) || "?";
    const input = esObjeto(b.input) ? b.input : {};
    llamadas.set(id, nombre);
    t.pendientes.add(id);
    if (nombre === PLAN) {
      const todos = Array.isArray(input.todos) ? input.todos.filter(esObjeto) : [];
      evento({ tipo: "plan", pasos: todos.map((x) => ({ texto: cadena(x.content), estado: cadena(x.status) || "pending" })) }, ts);
      return;
    }
    const clase = CLASES[nombre] ?? "other";
    const ruta = rutaDe(input);
    const diff = diffDe(nombre, input, ruta);
    informe.herramientas += 1;
    esperan.add(id);
    evento(
      {
        tipo: "herramienta",
        id,
        titulo: tituloDe(nombre, input),
        estado: "pending",
        clase,
        nombre,
        ...((clase === "read" || clase === "edit") && ruta ? { rutas: [ruta] } : {}),
        ...(diff ? { diff } : {}),
      },
      ts,
    );
  };

  const delMotor = (x: Json, ts: number | undefined) => {
    const m = esObjeto(x.message) ? x.message : {};
    const bloques = bloquesDe(m.content);
    if (m.model === SINTETICO) {
      // un error de la API acaba el turno; lo demás («No response requested.») no es de nadie
      if (x.isApiErrorMessage !== true) {
        informe.meta += 1;
        return;
      }
      const t = enCurso(ts);
      const mensaje = bloques.map((b) => cadena(b.text)).filter((s) => s.trim() !== "").join("\n");
      evento({ tipo: "fallo", mensaje: mensaje || "La API falló." }, ts);
      t.roto = true;
      return;
    }
    const t = enCurso(ts);
    if (typeof m.model === "string" && m.model !== "" && m.model !== modelo) {
      modelo = m.model;
      if (!modelos.includes(modelo)) modelos.push(modelo);
      evento({ tipo: "opciones", opciones: [opcionDeModelo(modelo, modelos)] }, ts);
    }
    // lo gastado: una vez por mensaje (Claude Code lo repite en cada línea suya)
    const id = cadena(m.id) || cadena(x.uuid);
    const gasto = gastoDe(m.usage);
    if (gasto) {
      const antes = t.gastos.get(id);
      t.gastos.set(id, antes ? combina(antes, gasto, Math.max) : gasto);
    }
    if (id !== t.mensaje) {
      t.mensaje = id;
      t.motivo = null;
    }
    if (typeof m.stop_reason === "string") t.motivo = m.stop_reason;
    t.salida = true;
    t.debe = false;
    for (const b of bloques) {
      if (b.type === "thinking" || b.type === "text") {
        const dicho = cadena(b.type === "text" ? b.text : b.thinking);
        if (dicho.trim() === "") continue;
        const ya = b.type === "text" ? t.dijo : t.penso;
        evento({ tipo: b.type === "text" ? "texto" : "pensamiento", texto: ya ? `\n\n${dicho}` : dicho }, ts);
        if (b.type === "text") t.dijo = true;
        else t.penso = true;
      } else if (b.type === "tool_use") llamada(b, t, ts);
      else otro(`bloque:${cadena(b.type) || "sin tipo"}`);
    }
  };

  const dePersona = (x: Json, ts: number | undefined) => {
    // el resumen de una compactación lo escribe el motor para sí: el turno sigue (aunque lleve la marca del turno)
    if (x.isCompactSummary === true) {
      informe.resumenes += 1;
      return;
    }
    // el número de turno que le pone Claude Code: lo lleva lo que recibió el motor al empezar el turno, aunque venga oculto
    const indice = esObjeto(x.turnPosition) && typeof x.turnPosition.turnIndex === "number" ? x.turnPosition.turnIndex : undefined;
    if (x.isMeta === true && indice === undefined) {
      informe.meta += 1;
      return;
    }
    const m = esObjeto(x.message) ? x.message : {};
    const partes: string[] = [];
    for (const b of bloquesDe(m.content)) {
      if (b.type === "tool_result") resultado(b, ts);
      else if (b.type === "text") {
        if (cadena(b.text).trim() !== "") partes.push(cadena(b.text));
      } else if (b.type === "image") {
        informe.imagenes += 1;
        partes.push("[imagen]");
      } else otro(`bloque:${cadena(b.type) || "sin tipo"}`);
    }
    if (partes.length === 0) return;
    const dice = partes.join("\n\n");
    if (dice.startsWith(ESC)) {
      // Esc para el turno en marcha (o el que aún no tuvo respuesta); con el turno acabado, no para nada
      if (turno && (enMarcha(turno) || !turno.salida)) {
        evento({ tipo: "orden", que: "parar" }, ts);
        cerrar("parado");
      } else informe.meta += 1;
      return;
    }
    if (SALIDA_LOCAL.test(dice)) {
      informe.meta += 1;
      return;
    }
    const aviso = x.isMeta === true || x.promptSource === "system" || (esObjeto(x.origin) && typeof x.origin.kind === "string" && x.origin.kind !== "user");
    // ¿es del turno que está abierto? Si Claude Code le puso número, lo dice el número; si no, que el turno siga en marcha
    if (indice !== undefined ? turno?.indice === indice : enMarcha(turno)) {
      // en su turno, lo que escribe la persona lo corrige; un aviso no lo corta
      if (aviso) informe.meta += 1;
      else evento({ tipo: "orden", que: "corregir", texto: dice }, ts);
      return;
    }
    cerrar("acabo");
    turno = nuevo(ts, indice);
    evento(aviso ? { tipo: "usuario", texto: dice } : { tipo: "orden", que: "mensaje", texto: dice }, ts);
  };

  const delSistema = (x: Json, ts: number | undefined) => {
    if (x.subtype !== "api_error") {
      otro(typeof x.subtype === "string" ? `system:${x.subtype}` : "system");
      return;
    }
    enCurso(ts);
    const error = esObjeto(x.error) ? x.error : {};
    const motivo = cadena(error.message) || cadena(x.content) || "La API falló.";
    if (typeof x.retryInMs === "number" && Number.isFinite(x.retryInMs) && x.retryInMs >= 0) evento({ tipo: "reintento", ms: x.retryInMs, motivo }, ts);
    else evento({ tipo: "fallo", mensaje: motivo }, ts);
  };

  /** Un adjunto: solo cuenta, salvo lo que llegó a la cola con el turno en marcha (si no lo compuso el sistema, es de la persona y lo corrige). */
  const adjunto = (x: Json, ts: number | undefined) => {
    const a = esObjeto(x.attachment) ? x.attachment : {};
    const dice = cadena(a.prompt);
    if (a.type !== "queued_command" || (a.commandMode ?? "prompt") !== "prompt" || dice.trim() === "") otro("attachment");
    else if (a.isMeta === true) informe.meta += 1;
    else if (turno) evento({ tipo: "orden", que: "corregir", texto: dice }, ts);
    else {
      turno = nuevo(ts);
      evento({ tipo: "orden", que: "mensaje", texto: dice }, ts);
    }
  };

  for (const x of hilo) {
    const ts = horaDe(x.timestamp);
    if (x.type === "user") dePersona(x, ts);
    else if (x.type === "assistant") delMotor(x, ts);
    else if (x.type === "system") delSistema(x, ts);
    else if (x.type === "attachment") adjunto(x, ts);
    else otro(cadena(x.type) || "sin tipo");
  }
  cerrar("final");
  informe.sinResultado = esperan.size;

  return { texto: lineas.map((l) => `${l}\n`).join(""), cadena: c, sesion, informe };
}
