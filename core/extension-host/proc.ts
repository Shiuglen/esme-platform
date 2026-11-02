/**
 * LA PUERTA DE LOS PROGRAMAS — lanzar un ejecutable sin abrir la casa.
 *
 * Qué es esto. Hasta ahora un módulo no podía lanzar nada: `child_process` es
 * un núcleo prohibido de la cápsula y la lista de capacidades no tenía hueco
 * para él. Con esta puerta, un módulo puede pedir que el ANFITRIÓN lance un
 * programa —REA, por ejemplo— y reciba su salida.
 *
 * Por qué el anfitrión y no el módulo. El hijo de un módulo hereda el disco, el
 * entorno y la red del anfitrión. Si lo lanza el propio módulo, la cápsula no
 * es una cápsula: es un sugerencias. Si lo lanza el anfitrión, todo lo que el
 * hijo hace pasa por cuatro guardas que aquí están escritas:
 *
 *   1. **Lista de programas.** No se lanza lo que el módulo pida: se lanza lo
 *      que el anfitrión ha concedido, y sólo por su nombre lógico. Un módulo
 *      que invente un nombre recibe un no, no una ejecución.
 *   2. **Argumentos en array.** Nunca una cadena con comillas: sin shell no hay
 *      interpretación, no hay `;`, no hay `$(...)`, no hay redirección.
 *   3. **Directorio de trabajo confinado.** El hijo nace dentro del proyecto.
 *   4. **Entorno mínimo, tiempo tope y salida tope.** El hijo no ve las llaves
 *      de la persona, no vive para siempre y no llena la memoria.
 *
 * La puerta no promete que el programa sea inocuo: REA lanza navegadores y
 * captura pantallas. Lo que promete es que la persona lo ha concedido, y que
 * el resto de efectos que declara REA (red, UI) se piden por sus capacidades
 * normales.
 *
 * Referencia: docs/REA.md, core/rea/capacidades.ts, core/extension-host/host.ts.
 */
import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { confinaRuta } from "../modulos/rutas.ts";

/** Un programa que el anfitrión ha permitido lanzar. */
export interface EntradaProc {
  /** El nombre lógico: lo que el módulo pide («rea»). */
  nombre: string;
  /** La ruta absoluta. Si no está, se busca en el PATH. */
  ruta?: string;
  /** Argumentos que SIEMPRE se anteponen a los del módulo. */
  argvFijos?: readonly string[];
  /** Variables de entorno que el programa puede recibir (claves, no valores). */
  envPermitidas?: readonly string[];
  /** Qué hace, en castellano: se le enseña a quien concede. */
  descripcion: string;
}

/** La configuración de la puerta. */
export interface OpcionesProc {
  /** Los programas permitidos. Sin lista, no se lanza nada. */
  permitidos?: readonly EntradaProc[];
  /** La raíz del proyecto: el cwd del hijo está confinado aquí. */
  proyecto?: string | null;
  /** Tope de tiempo por defecto (ms). */
  timeoutPorDefecto?: number;
  /** Tope de bytes de salida por defecto (stdout + stderr). */
  maxBytesPorDefecto?: number;
}

/** Lo que el módulo pide. */
export interface PeticionProc {
  /** El nombre lógico del programa («rea»). */
  programa: string;
  /** Los argumentos, en array. */
  args?: readonly string[];
  /** Variables de entorno pedidas: sólo valen las permitidas. */
  env?: Readonly<Record<string, string>>;
  /** El directorio de trabajo, dentro del proyecto. */
  cwd?: string;
  /** Tope de tiempo (ms). */
  timeoutMs?: number;
  /** Tope de bytes de salida. */
  maxBytes?: number;
}

/**
 * El rastro de un lanzamiento.
 *
 * Por qué existe. Una puerta que lanza programas y no deja rastro es una
 * puerta que trabaja a ciegas: nadie puede decir después qué se lanzó, con
 * qué argumentos ni cómo acabó. La trazabilidad no es un adorno: es lo que
 * hace revisable la capacidad más peligrosa de la casa.
 */
export interface RastroProc {
  /** El nombre lógico del programa. */
  programa: string;
  /** Los argumentos (tal cual los pidió el módulo). */
  args: string[];
  /** El código de salida (null si lo mataron o no arrancó). */
  codigo: number | null;
  /** Cuánto tardó (ms). */
  ms: number;
  /** Si la salida se cortó por el tope. */
  truncado: boolean;
  /** Si lo mataron por tiempo. */
  timeout: boolean;
}

/** Lo que el módulo recibe. */
export interface ResultadoProc {
  /** El código de salida (null si lo mató el tiempo o no arrancó). */
  codigo: number | null;
  /** La salida estándar. */
  stdout: string;
  /** La salida de error. */
  stderr: string;
  /** Si la salida se cortó por el tope de bytes. */
  truncado: boolean;
  /** Si lo mató el tiempo. */
  timeout: boolean;
  /** Cuánto tardó, en ms. */
  ms: number;
}

export const TIMEOUT_POR_DEFECTO = 30_000;
export const MAX_BYTES_POR_DEFECTO = 1_048_576;

/**
 * El techo duro de la salida de un hijo.
 *
 * Por qué 512 MB y no 64. MEDIDO, no estimado: la evidencia de REA de una app
 * de Electron de 27 MB (el asar por defecto de Electron, analizado en esta
 * máquina el 21-oct-2026) pesa 209 MB de JSON. Con un techo de 64 MB la
 * salida llegaba cortada, y una evidencia cortada no es una evidencia: es un
 * JSON que no se puede leer.
 *
 * El tope por DEFECTO sigue siendo 1 MB: un módulo que pide algo normal no
 * llena la memoria de nadie. Este techo es el límite de la casa, no su
 * costumbre.
 */
export const MAX_BYTES_TECHO = 512 * 1_048_576;

/**
 * Dónde se busca un programa: la plataforma, su PATH y (en Windows) su
 * PATHEXT. Por defecto, los de este proceso; las pruebas pasan otros.
 */
export interface EntornoBusqueda {
  plataforma: NodeJS.Platform;
  path?: string;
  pathext?: string;
}

/**
 * En Windows solo se lanzan binarios. Un .cmd o un .bat necesita cmd.exe, y
 * cmd.exe vuelve a interpretar los argumentos (comillas, `&`, `%VAR%`): la
 * guarda «sin shell» dejaría de valer. Node, además, se niega a lanzarlos
 * sin shell desde la CVE-2024-27980.
 */
const EXTENSIONES_BINARIAS = new Set([".exe", ".com"]);

const esFichero = (ruta: string): boolean => {
  try {
    return statSync(ruta).isFile();
  } catch {
    return false;
  }
};

/**
 * Los nombres con que un programa existe en Windows. «node» es node.exe: se
 * prueban las extensiones de PATHEXT, en su orden, salvo que el nombre ya
 * traiga una de ellas («python3.11» no la trae: es python3.11.exe).
 */
function candidatasWindows(nombre: string, pathext: string): string[] {
  const extensiones = pathext
    .split(";")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.startsWith("."));
  const punto = nombre.lastIndexOf(".");
  const suya = punto > 0 ? nombre.slice(punto).toLowerCase() : "";
  if (suya && extensiones.includes(suya)) return [nombre];
  return extensiones.map((e) => `${nombre}${e}`);
}

/**
 * Resuelve el ejecutable de un programa permitido.
 *
 * Primero la ruta explícita; si no la hay, el PATH —pero sólo el PATH, y sólo
 * para un nombre que el anfitrión ya concedió. En Windows, el nombre se
 * completa con PATHEXT (node → node.exe) y solo valen binarios.
 */
export function resuelveEjecutable(
  nombre: string,
  permitidos: readonly EntradaProc[],
  entorno: EntornoBusqueda = {
    plataforma: process.platform,
    path: process.env.PATH,
    pathext: process.env.PATHEXT,
  }
): { ok: true; ruta: string; entrada: EntradaProc } | { ok: false; error: string } {
  const entrada = permitidos.find((p) => p.nombre === nombre);
  if (!entrada) {
    const lista = permitidos.map((p) => p.nombre).join(", ") || "ninguno";
    return { ok: false, error: `programa no permitido: «${nombre}» (los permitidos son: ${lista})` };
  }
  if (entrada.ruta) {
    if (!isAbsolute(entrada.ruta)) {
      return { ok: false, error: `la ruta del programa «${nombre}» tiene que ser absoluta: ${entrada.ruta}` };
    }
    return { ok: true, ruta: entrada.ruta, entrada };
  }
  const dirs = (entorno.path ?? "").split(delimiter).filter(Boolean);
  if (entorno.plataforma === "win32") {
    // Windows no tiene bit de ejecución: lo que existe con una extensión
    // binaria se puede lanzar.
    let script: string | null = null;
    for (const dir of dirs) {
      for (const candidata of candidatasWindows(nombre, entorno.pathext ?? ".COM;.EXE;.BAT;.CMD")) {
        const intento = join(dir, candidata);
        if (!esFichero(intento)) continue;
        const extension = candidata.slice(candidata.lastIndexOf(".")).toLowerCase();
        if (EXTENSIONES_BINARIAS.has(extension)) return { ok: true, ruta: intento, entrada };
        script ??= intento;
      }
    }
    if (script) {
      return {
        ok: false,
        error:
          `«${nombre}» es ${script}: un script que solo corre dentro de cmd.exe, y cmd.exe ` +
          `reinterpreta los argumentos. Pon en el libro la ruta de un .exe (o lanza el .js con node).`,
      };
    }
    return { ok: false, error: `programa no encontrado en el PATH: «${nombre}»` };
  }
  for (const dir of dirs) {
    const intento = join(dir, nombre);
    try {
      if (!statSync(intento).isFile()) continue;
      accessSync(intento, constants.X_OK);
      return { ok: true, ruta: intento, entrada };
    } catch {
      // sigue buscando
    }
  }
  return { ok: false, error: `programa no encontrado en el PATH: «${nombre}»` };
}

/** El entorno del que sale el del hijo: la plataforma y sus variables. */
export interface EntornoPadre {
  plataforma: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
}

/**
 * El entorno del hijo: el mínimo, y sólo lo que el programa puede pedir.
 *
 * En Windows, además, SystemRoot (sin él, un programa no inicia la red ni
 * los proveedores de cifrado del sistema) y USERPROFILE (el HOME de
 * Windows). Ninguna de las dos es un secreto.
 */
export function entornoHijo(
  entrada: EntradaProc,
  pedido: Readonly<Record<string, string>> | undefined,
  padre: EntornoPadre = { plataforma: process.platform, env: process.env }
): Record<string, string> {
  const base: Record<string, string> = {
    PATH: padre.env.PATH ?? "",
    HOME: padre.env.HOME ?? "",
    LANG: padre.env.LANG ?? "C",
  };
  if (padre.plataforma === "win32") {
    base.SystemRoot = padre.env.SystemRoot ?? padre.env.SYSTEMROOT ?? "";
    base.USERPROFILE = padre.env.USERPROFILE ?? "";
  }
  const permitidas = new Set(entrada.envPermitidas ?? []);
  for (const [clave, valor] of Object.entries(pedido ?? {})) {
    if (!permitidas.has(clave)) continue;
    base[clave] = String(valor);
  }
  return base;
}

/**
 * Lanza un programa permitido y devuelve su salida.
 *
 * Falla con un motivo en castellano cuando algo no cuadra. No hay forma
 * "mágica" y no hay valor por defecto silencioso: el módulo ve el fallo.
 */
export function ejecutaPrograma(
  peticion: PeticionProc,
  opts: OpcionesProc = {}
): Promise<ResultadoProc> {
  const permitidos = opts.permitidos ?? [];
  const resuelta = resuelveEjecutable(peticion.programa, permitidos);
  if (!resuelta.ok) return Promise.reject(new Error(resuelta.error));

  const args = peticion.args ?? [];
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) {
    return Promise.reject(new Error("los argumentos tienen que ser un array de texto, no una cadena"));
  }

  let cwd = opts.proyecto ?? process.cwd();
  if (opts.proyecto) {
    const dentro = confinaRuta(opts.proyecto, peticion.cwd ?? ".");
    if ("error" in dentro) return Promise.reject(new Error(dentro.error));
    cwd = dentro.ruta;
  } else if (peticion.cwd) {
    return Promise.reject(
      new Error("proc:spawn sin proyecto: no hay carpeta a la que confinarse")
    );
  }

  const timeoutMs = Math.min(Math.max(peticion.timeoutMs ?? opts.timeoutPorDefecto ?? TIMEOUT_POR_DEFECTO, 100), 300_000);
  const maxBytes = Math.min(
    Math.max(peticion.maxBytes ?? opts.maxBytesPorDefecto ?? MAX_BYTES_POR_DEFECTO, 1024),
    MAX_BYTES_TECHO
  );
  const argv = [...(resuelta.entrada.argvFijos ?? []), ...args];
  const env = entornoHijo(resuelta.entrada, peticion.env);
  const inicio = Date.now();

  return new Promise<ResultadoProc>((resolve, reject) => {
    let hijo;
    try {
      hijo = spawn(resuelta.ruta, argv, {
        cwd,
        env,
        // sin shell: los argumentos no se interpretan, no hay metacarácter
        shell: false,
        // sin entrada: el hijo no puede pedirle nada a la persona
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (e) {
      reject(new Error(`no se pudo lanzar «${peticion.programa}»: ${String((e as Error)?.message || e)}`));
      return;
    }

    let stdout = "";
    let stderr = "";
    let truncado = false;
    let terminado = false;

    const recoge = (actual: string, trozo: Buffer): string => {
      const texto = trozo.toString("utf8");
      if (Buffer.byteLength(actual + texto, "utf8") > maxBytes) {
        truncado = true;
        return actual.slice(0, Math.max(0, maxBytes - Buffer.byteLength(actual, "utf8")));
      }
      return actual + texto;
    };

    hijo.stdout?.on("data", (d: Buffer) => {
      stdout = recoge(stdout, d);
    });
    hijo.stderr?.on("data", (d: Buffer) => {
      stderr = recoge(stderr, d);
    });

    const reloj = setTimeout(() => {
      if (terminado) return;
      terminado = true;
      try {
        hijo.kill("SIGKILL");
      } catch {
        // el hijo ya no estaba
      }
      resolve({
        codigo: null,
        stdout,
        stderr,
        truncado,
        timeout: true,
        ms: Date.now() - inicio,
      });
    }, timeoutMs);

    hijo.on("error", (e) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      reject(new Error(`no se pudo lanzar «${peticion.programa}»: ${String(e?.message || e)}`));
    });

    hijo.on("close", (code) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      resolve({
        codigo: code ?? null,
        stdout,
        stderr,
        truncado,
        timeout: false,
        ms: Date.now() - inicio,
      });
    });
  });
}
