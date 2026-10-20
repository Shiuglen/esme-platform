// Extension host — carga un módulo BUILDADO en su propio worker thread y lo
// habla por MessagePort con respuesta tipada.
//
// Arquitectura (ARQUITECTURA §2): worker aislado ahora; isolated-vm/WASM más
// adelante. El deny precocinado ya vive aquí: el módulo solo recibe lo que el
// host le pasa, pública su propia boca (exports), y cada llamada es una
// petición con nonce — nada cruza sin esta puerta.
import { Worker } from "node:worker_threads";
import { MindMethods, CAPACIDAD_POR_METODO, type MindMethod, type MenteViva } from "../ipc/mind-schema.ts";

export interface Respuesta {
  nonce: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

// Script del worker (CommonJS por eval): importa el módulo y responde mensajes.
const BOOTSTRAP = `
const { workerData, parentPort, pathToFileURL } =
  Object.assign(require("node:worker_threads"), require("node:url"));
import(pathToFileURL(workerData.ruta).href).then((m) => {
  parentPort.on("message", async (req) => {
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

/** Abre el host con el módulo buildado. Un módulo = un mundo = un worker. */
export function abreHost(
  rutaModulo: string,
  opts: {
    permisos?: string[]; // las capacidades DECLARADAS en module.yaml
    mente?: MenteViva;   // el Tálamo real conectado (o stub en pruebas)
  } = {}
): {
  call: (fn: string, ...args: unknown[]) => Promise<unknown>;
  cerrar: () => Promise<void>;
} {
  const worker = new Worker(BOOTSTRAP, {
    eval: true,
    workerData: { ruta: rutaModulo },
  });

  const pendientes = new Map<string, (r: Respuesta) => void>();

  // El enrutador: cada respuesta del worker vuela a su promesa por nonce.
  worker.on("message", (m: Partial<Respuesta> & { ready?: boolean }) => {
    if (typeof m.nonce !== "string") return; // señales de vida (ready)
    const resolver = pendientes.get(m.nonce);
    if (resolver) resolver(m as Respuesta);
  });

  const listo = new Promise<void>((res, rej) => {
    worker.once("message", (m: { ready?: boolean; error?: string }) => {
      if (m.ready) res();
      else rej(new Error(m.error || "el módulo no cargó"));
    });
  });

  let n = 0;
  const call = async (fn: string, ...args: unknown[]): Promise<unknown> => {
    // La puerta del host: los métodos mind.* NO llegan al worker. El host los
    // intercepta, exige permiso declarado, verifica forma con el schema y
    // ejecuta contra la mente en ESTE proceso (la mente nunca sale del core).
    if (fn.startsWith("mind.")) {
      const metodo = fn.slice(5) as MindMethod;
      const schema = MindMethods[metodo];
      if (!schema) throw new Error(`metodo de mente desconocido: ${fn}`);
      const pide = CAPACIDAD_POR_METODO[metodo];
      const declarados = opts.permisos ?? [];
      if (!declarados.includes(pide))
        throw new Error(
          `permiso no concedido: '${fn}' exige '${pide}' y el módulo declaró [${declarados.join(", ") || "nada"}]`
        );
      const parsed = schema.safeParse(args[0] ?? {});
      if (!parsed.success)
        throw new Error(`forma ilegal en ${fn}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      const mente = opts.mente;
      if (!mente) throw new Error("no hay mente conectada a este host");
      if (metodo === "recall") {
        const d = parsed.data as { query: string; budget: number };
        return mente.recall(d.query, d.budget);
      }
      if (metodo === "remember") {
        if (!mente.remember) throw new Error("la mente no acepta remember");
        const d = parsed.data as { text: string; kind: string };
        return mente.remember(d.text, d.kind);
      }
      if (metodo === "intake") {
        if (!mente.intake) throw new Error("la mente no acepta intake");
        const d = parsed.data as { source: string; content: string; tags: string[] };
        return mente.intake(d.source, d.content, d.tags);
      }
    }
    await listo;
    const nonce = String(++n);
    return new Promise<unknown>((res, rej) => {
      pendientes.set(nonce, (r) => {
        pendientes.delete(nonce);
        r.ok ? res(r.result) : rej(new Error(r.error || "fallo en el módulo"));
      });
      worker.postMessage({ op: "call", fn, args, nonce });
    });
  };

  const cerrar = async () => {
    await worker.terminate();
  };

  return { call, cerrar };
}
