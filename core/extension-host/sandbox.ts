/**
 * La CÁPSULA — cómo un módulo deja de ser un programa suelto.
 *
 * La verdad incómoda: un módulo en un worker de Node tiene `fetch`,
 * `process.env` (con las llaves de la persona dentro) y puede importar
 * `node:fs` o `node:child_process` sin que nadie le pregunte. El manifiesto
 * declaraba capacidades, pero el código no las cumplía: el permiso era
 * decorativo.
 *
 * Aquí la palabra se cumple de tres maneras, todas verificables:
 *
 *  1. **Importar está cerrado.** Un hook de resolución (`module.registerHooks`)
 *     rechaza los módulos del núcleo de Node que un módulo no debería tocar
 *     (el sistema de ficheros, los procesos, la red cruda, el inspector).
 *     No es una promesa del módulo: es un `throw` del cargador.
 *  2. **Los globales se ciegan.** `fetch`, `WebSocket` y `process` (con su
 *     `env`) desaparecen del mundo del módulo. Lo que el módulo necesita de
 *     verdad, lo pide por la puerta.
 *  3. **La puerta decide.** Las capacidades concedidas se montan en
 *     `globalThis.esme`; las que no, no existen.
 *
 * Referencia: docs/ARQUITECTURA.md §2 y §16.
 */

/**
 * Los núcleos de Node que un módulo NO puede importar. Ni siquiera si su
 * manifiesto los declara: `fs:project` y `net:fetch` son puertas con forma,
 * no atajos al sistema.
 *
 * - `fs` / `child_process` / `worker_threads`: el disco y los procesos son del
 *   anfitrión, no del módulo.
 * - `net` / `tls` / `http` / `https` / `dgram`: la red cruda sería una puerta
 *   trasera a `net:fetch` (sin lista de dominios y sin tope de tiempo).
 * - `os` / `process`: filtran el nombre de la máquina, la carpeta del usuario y
 *   las llaves del entorno.
 * - `inspector` / `v8` / `vm` / `repl` / `perf_hooks`: rompen la cápsula hacia
 *   dentro.
 * - `module`: **el que desarma la cápsula**. `module.registerHooks` deja
 *   redirigir el cargador: un módulo que lo importara podría reabrir
 *   `node:fs` para sí solo. Por eso está aquí, y no por casualidad.
 */
export const NUCLEOS_PROHIBIDOS: readonly string[] = [
  "node:fs",
  "node:fs/promises",
  "node:child_process",
  "node:worker_threads",
  "node:cluster",
  "node:net",
  "node:tls",
  "node:http",
  "node:https",
  "node:dgram",
  "node:dns",
  "node:os",
  "node:process",
  "node:module",
  "node:vm",
  "node:v8",
  "node:repl",
  "node:inspector",
  "node:inspector/promises",
  "node:perf_hooks",
  "node:diagnostics_channel",
  "node:trace_events",
  "node:async_hooks",
  "node:sea",
  "node:sqlite",
  "node:test",
  "node:wasi",
];

/** Los mismos, sin el prefijo: `require("fs")` también cuenta. */
export const MODULOS_PROHIBIDOS: readonly string[] = [
  "fs",
  "fs/promises",
  "child_process",
  "worker_threads",
  "cluster",
  "net",
  "tls",
  "http",
  "https",
  "dgram",
  "dns",
  "os",
  "process",
  "module",
  "vm",
  "v8",
  "repl",
  "inspector",
  "perf_hooks",
  "diagnostics_channel",
  "trace_events",
  "async_hooks",
  "sea",
  "sqlite",
  "test",
];

/** ¿Este especificador es un núcleo prohibido? (con o sin `node:`) */
export function esProhibido(especificador: string): boolean {
  const s = especificador.startsWith("node:") ? especificador.slice(5) : especificador;
  return NUCLEOS_PROHIBIDOS.includes(`node:${s}`) || MODULOS_PROHIBIDOS.includes(s);
}

/**
 * El script del worker (CommonJS por `eval`): sella el mundo y monta la puerta.
 *
 * Recibe en `workerData`:
 *   - `ruta`: dónde está el módulo compilado.
 *   - `capacidades`: qué puerta se le monta (lo concedido, no lo declarado).
 *   - `proyecto`: la raíz de `fs:project` (o null).
 *   - `dominios`: los dominios que `net:fetch` puede tocar (o null = ninguno).
 *   - `entorno`: lo que el módulo puede saber de la máquina.
 */
export const BOOTSTRAP = `
const { workerData, parentPort, pathToFileURL } =
  Object.assign(require("node:worker_threads"), require("node:url"));

// --- 1. LA CÁPSULA: los núcleos prohibidos no se pueden importar ---
const PROHIBIDOS = ${JSON.stringify(NUCLEOS_PROHIBIDOS)};
const PROHIBIDOS_CORTOS = ${JSON.stringify(MODULOS_PROHIBIDOS)};
require("node:module").registerHooks({
  resolve(espec, contexto, siguiente) {
    const s = espec.startsWith("node:") ? espec.slice(5) : espec;
    if (PROHIBIDOS.includes("node:" + s) || PROHIBIDOS_CORTOS.includes(s)) {
      throw new Error(
        "el módulo no puede importar '" + espec + "': la cápsula lo cierra (pide su necesidad por la puerta)"
      );
    }
    return siguiente(espec, contexto);
  },
});

// --- 2. LOS GLOBALES SE CIEGAN ---
// La red cruda no existe: la puerta es la red.
try { delete globalThis.fetch; } catch {}
try { delete globalThis.WebSocket; } catch {}
try { delete globalThis.navigator; } catch {}
// El entorno (con las llaves de la persona) tampoco: se queda lo inofensivo.
const procesoReal = globalThis.process;
try {
  const entornoFalso = Object.freeze({
    env: Object.freeze({}),
    platform: procesoReal.platform,
    arch: procesoReal.arch,
    version: procesoReal.version,
    versions: Object.freeze({}),
    cwd: () => "/",
    exit: () => { throw new Error("un módulo no puede terminar el proceso"); },
  });
  globalThis.process = entornoFalso;
} catch {}

// --- 3. LA PUERTA: lo que el módulo ve ---
const esperando = new Map();
let n = 0;
// La puerta: una petición, un nonce, una respuesta.
const pedir = (tipo, carga) =>
  new Promise((res, rej) => {
    const nonce = "p" + (++n);
    esperando.set(nonce, { res, rej });
    parentPort.postMessage({ op: "puerta", tipo, nonce, carga });
  });
// La mente: el proxy que NO habla con la mente, habla con el HOST.
const pedirMente = (metodo, args) =>
  new Promise((res, rej) => {
    const nonce = "m" + (++n);
    esperando.set(nonce, { res, rej });
    parentPort.postMessage({ op: "mente", metodo, nonce, args: args ?? {} });
  });

globalThis.mente = new Proxy({}, {
  get(_objeto, metodo) {
    return (args) => pedirMente(String(metodo), args ?? {});
  },
});

const capacidades = workerData.capacidades || {};
const puerta = {
  id: workerData.id,
  version: workerData.version,
  entorno: Object.freeze(workerData.entorno || {}),
};
if (workerData.proyecto) puerta.proyecto = workerData.proyecto;

if (capacidades.mente) {
  // La mente del módulo: la misma puerta, con forma.
  puerta.mente = new Proxy({}, {
    get(_objeto, metodo) {
      return (args) => pedirMente(String(metodo), args ?? {});
    },
  });
}
if (capacidades.fs) {
  puerta.fs = {
    leer: (ruta) => pedir("fs", { accion: "leer", ruta }),
    escribir: (ruta, texto) => pedir("fs", { accion: "escribir", ruta, texto }),
    listar: (ruta) => pedir("fs", { accion: "listar", ruta }),
  };
}
if (capacidades.net) {
  puerta.net = {
    fetch: (url, opts) => pedir("net", { url, opts: opts || {} }),
  };
}
if (capacidades.ipc) {
  puerta.ipc = {
    emit: (evento, carga) => pedir("ipc", { evento, carga }),
  };
}
if (capacidades.ui) {
  puerta.ui = {
    render: (vista) => pedir("ui", { vista }),
  };
}
globalThis.esme = Object.freeze(puerta);

// --- 4. EL MÓDULO ---
import(pathToFileURL(workerData.ruta).href).then((m) => {
  parentPort.on("message", async (req) => {
    if (req && (req.op === "puerta" || req.op === "mente")) {
      const w = esperando.get(req.nonce);
      if (!w) return;
      esperando.delete(req.nonce);
      req.ok ? w.res(req.result) : w.rej(new Error(req.error || "la puerta no respondió"));
      return;
    }
    try {
      const fn = m[req.fn];
      if (typeof fn !== "function") throw new Error("fn no exportado: " + req.fn);
      const result = await fn(...req.args);
      parentPort.postMessage({ nonce: req.nonce, ok: true, result });
    } catch (e) {
      parentPort.postMessage({ nonce: req.nonce, ok: false, error: String((e && e.message) || e) });
    }
  });
  parentPort.postMessage({ ready: true });
}).catch((e) => parentPort.postMessage({ ready: false, error: String(e) }));
`;
