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
 * Resuelve el ejecutable de un programa permitido.
 *
 * Primero la ruta explícita; si no la hay, el PATH —pero sólo el PATH, y sólo
 * para un nombre que el anfitrión ya concedió.
 */
export function resuelveEjecutable(
  nombre: string,
  permitidos: readonly EntradaProc[]
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
  const path = process.env.PATH ?? "";
  for (const dir of path.split(delimiter).filter(Boolean)) {
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

/** El entorno del hijo: el mínimo, y sólo lo que el programa puede pedir. */
export function entornoHijo(
  entrada: EntradaProc,
  pedido: Readonly<Record<string, string>> | undefined
): Record<string, string> {
  const base: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    LANG: process.env.LANG ?? "C",
  };
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
