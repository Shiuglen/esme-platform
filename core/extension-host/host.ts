// Extension host — carga un módulo BUILDADO en su propio worker thread y lo
// habla por MessagePort con respuesta tipada.
//
// Arquitectura (ARQUITECTURA §2 y §16): worker aislado ahora; isolated-vm/WASM
// más adelante. El deny precocinado ya vive aquí: el módulo solo recibe lo que
// el host le pasa, publica su propia boca (exports), y cada llamada es una
// petición con nonce — nada cruza sin esta puerta.
//
// Lo que cambió (2026-10-20): el worker ya no es un ``módulo suelto``. El
// bootstrap (core/extension-host/sandbox.ts) cierra los núcleos de Node que el
// módulo no puede importar, ciega los globales (`fetch`, `process.env`) y
// monta UNA puerta (`globalThis.esme`) con las capacidades CONCEDIDAS. Aquí,
// en el host, esa puerta se sirve: la mente con permiso y forma verificada,
// el disco confinado al proyecto, la red con lista de dominios y tope de
// tiempo, los eventos con namespace y las vistas que el módulo propone.
import { Worker } from "node:worker_threads";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { MindMethods, CAPACIDAD_POR_METODO, type MindMethod, type MenteViva } from "../ipc/mind-schema.ts";
import { BOOTSTRAP } from "./sandbox.ts";
import { confinaRuta } from "../modulos/rutas.ts";
import type { VistaModulo } from "./puerta.ts";
import { ejecutaPrograma, type EntradaProc, type RastroProc } from "./proc.ts";

export interface Respuesta {
  nonce: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Lo que el módulo puede saber de la máquina. */
export interface EntornoHost {
  plataforma: string;
  versionNode: string;
  maquina: string;
}

/**
 * Las opciones del host.
 *
 * `permisos` son las capacidades DECLARADAS en el manifiesto.
 * `concedidas` son las que la persona autorizó. Lo que se monta en la puerta
 * es la INTERSECCIÓN: lo declarado y no concedido no existe para el módulo.
 */
export interface OpcionesHost {
  /** Las capacidades DECLARADAS en module.yaml. */
  permisos?: string[];
  /** Las capacidades CONCEDIDAS por la persona (gana sobre las declaradas). */
  concedidas?: string[];
  /** El Tálamo real conectado (o un stub en pruebas). */
  mente?: MenteViva;
  /** La raíz de `fs:project`: fuera de aquí no se lee ni se escribe. */
  proyecto?: string;
  /** Los dominios que `net:fetch` puede tocar. Vacío = la red está cerrada. */
  dominios?: string[];
  /**
   * Los programas que `proc:spawn` puede lanzar (por nombre lógico).
   *
   * Sin esta lista, `proc:spawn` no lanza nada: la puerta existe, pero está
   * cerrada. Quien concede decide también QUÉ se puede lanzar.
   */
  programas?: EntradaProc[];
  /** Quién recibe los eventos que emite el módulo. */
  onEvento?: (evento: string, carga: unknown) => void;
  /**
   * Quién recibe el RASTRO de cada programa lanzado.
   *
   * Sin esto, la puerta de los programas trabaja a ciegas: nadie puede decir
   * después qué se lanzó, con qué argumentos ni cómo acabó.
   */
  onPrograma?: (rastro: RastroProc) => void;
  /** Quién recibe las vistas que el módulo propone. */
  onVista?: (vista: VistaModulo) => void;
  /** El id y la versión del módulo (para la puerta y los eventos). */
  id?: string;
  version?: string;
}

/** Lo que un host abierto puede hacer. */
export interface Host {
  /** Llama a una función exportada por el módulo. */
  call: (fn: string, ...args: unknown[]) => Promise<unknown>;
  /** Cierra el worker. */
  cerrar: () => Promise<void>;
  /** Las vistas que el módulo ha propuesto, por orden. */
  vistas: () => VistaModulo[];
  /**
   * Las capacidades que el módulo ha USADO de verdad (no las que pidió).
   *
   * Esto es lo que permite juzgarlo: un módulo que pide `net:fetch` y nunca
   * lo usa está pidiendo más de lo que necesita, y eso lo tiene que saber
   * quien lo va a instalar.
   */
  usadas: () => string[];
  /**
   * Se resuelve cuando el módulo ha cargado (o se rechaza si no pudo).
   * Quien abre el host lo espera antes de decir que el módulo está vivo.
   */
  listo: Promise<void>;
}

/** Abre el host con el módulo buildado. Un módulo = un mundo = un worker. */
export function abreHost(
  rutaModulo: string,
  opts: OpcionesHost = {}
): Host {
  const declaradas = opts.permisos ?? [];
  // La puerta se monta con lo CONCEDIDO. Por defecto (pruebas, uso directo)
  // se concede lo declarado: quien abre el host es quien decide.
  const concedidas = opts.concedidas ?? declaradas;
  const efecto = (c: string): boolean => declaradas.includes(c) && concedidas.includes(c);

  const entorno: EntornoHost = {
    plataforma: process.platform,
    versionNode: process.versions.node ?? "0",
    // La huella, no el nombre: el nombre identifica a la persona.
    maquina: createHash("sha256").update(`${process.platform}:${process.arch}`).digest("hex").slice(0, 16),
  };

  const worker = new Worker(BOOTSTRAP, {
    eval: true,
    workerData: {
      ruta: rutaModulo,
      id: opts.id ?? "esme.modulo",
      version: opts.version ?? "0.0.0",
      proyecto: opts.proyecto ?? null,
      capacidades: {
        // La mente sólo se monta si hay una detrás: un módulo sin mente
        // conectada no tiene a quién preguntar, y la puerta no finge que sí
        // (la frontera lo dice: «el host lo dice en vez de fingir»).
        mente:
          (efecto("mind:read") || efecto("mind:write")) && Boolean(opts.mente),
        fs: efecto("fs:project"),
        net: efecto("net:fetch"),
        ipc: efecto("ipc:emit"),
        ui: efecto("ui:render"),
        proc: efecto("proc:spawn"),
      },
      entorno,
    },
  });

  const pendientes = new Map<string, (r: Respuesta) => void>();
  const vistas: VistaModulo[] = [];
  // Lo que el módulo ha USADO (no lo que pidió): el juez lo necesita.
  const usadas = new Set<string>();
  const usa = (c: string): void => {
    usadas.add(c);
  };

  // El enrutador: cada respuesta del worker vuela a su promesa por nonce.
  // Y la puerta hacia dentro: si el mensaje trae op:"mente" o op:"puerta", es
  // el módulo preguntando al host (nunca al revés).
  worker.on(
    "message",
    (
      m: Partial<Respuesta> & {
        ready?: boolean;
        op?: string;
        tipo?: string;
        metodo?: string;
        args?: unknown;
        carga?: unknown;
      }
    ) => {
      if (m.op === "puerta" && typeof m.nonce === "string") {
        void respondePuerta({ nonce: m.nonce, tipo: m.tipo, carga: m.carga });
        return;
      }
      if (m.op === "mente" && typeof m.nonce === "string") {
        void respondeMente({ nonce: m.nonce, metodo: m.metodo, args: m.args });
        return;
      }
      if (typeof m.nonce !== "string") return; // señales de vida (ready)
      const resolver = pendientes.get(m.nonce);
      if (resolver) resolver(m as Respuesta);
    }
  );

  /**
   * La mente, servida. Permiso declarado, forma verificada con zod, y la
   * mente en ESTE proceso: el módulo recibe la RESPUESTA, nunca la mente.
   */
  const ejecutaMente = async (metodo: string, args: unknown): Promise<unknown> => {
    const schema = MindMethods[metodo as MindMethod];
    if (!schema) throw new Error(`metodo de mente desconocido: mind.${metodo}`);
    const pide = CAPACIDAD_POR_METODO[metodo as MindMethod];
    const declarados = declaradas;
    if (!declarados.includes(pide))
      throw new Error(
        `permiso no concedido: 'mind.${metodo}' exige '${pide}' y el módulo declaró [${declarados.join(", ") || "nada"}]`
      );
    if (!efecto(pide))
      throw new Error(
        `permiso '${pide}' declarado pero NO concedido: sin la palabra de la persona, la puerta no se monta`
      );
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      throw new Error(
        `forma ilegal en mind.${metodo}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`
      );
    }
    usa(pide);
    const mente = opts.mente;
    if (!mente) throw new Error("no hay mente conectada a este host");
    const valor = parsed.data as Record<string, unknown>;
    switch (metodo as MindMethod) {
      case "recall":
        return mente.recall(String(valor.query), Number(valor.budget));
      case "remember":
        if (!mente.remember) throw new Error("la mente no acepta remember");
        return mente.remember(String(valor.text), String(valor.kind));
      case "intake":
        if (!mente.intake) throw new Error("la mente no acepta intake");
        return mente.intake(String(valor.source), String(valor.content), (valor.tags as string[]) ?? []);
      case "rumbo":
        if (!mente.rumbo) throw new Error("la mente no acepta rumbo");
        return mente.rumbo();
      default:
        throw new Error(`metodo de mente sin ejecutar: mind.${metodo}`);
    }
  };

  const respondeMente = async (m: { nonce: string; metodo?: string; args?: unknown }): Promise<void> => {
    try {
      const result = await ejecutaMente(String(m.metodo ?? ""), m.args);
      worker.postMessage({ op: "mente", nonce: m.nonce, ok: true, result });
    } catch (e) {
      worker.postMessage({
        op: "mente",
        nonce: m.nonce,
        ok: false,
        error: String((e as Error)?.message || e),
      });
    }
  };

  /**
   * LA PUERTA, servida. Cada capacidad se sirve en el HOST: el módulo nunca
   * toca el disco, la red ni el bus de eventos por su cuenta.
   */
  const respondePuerta = async (m: { nonce: string; tipo?: string; carga?: unknown }): Promise<void> => {
    try {
      const carga = (m.carga ?? {}) as Record<string, unknown>;
      const op = String(m.tipo ?? "");
      let result: unknown;
      if (op === "fs") {
        result = await sirveFs(carga);
      } else if (op === "net") {
        result = await sirveNet(carga);
      } else if (op === "ipc") {
        result = sirveIpc(carga);
      } else if (op === "ui") {
        result = sirveUi(carga);
      } else if (op === "proc") {
        result = await sirveProc(carga);
      } else {
        throw new Error(`puerta desconocida: ${op}`);
      }
      worker.postMessage({ op: "puerta", nonce: m.nonce, ok: true, result });
    } catch (e) {
      worker.postMessage({
        op: "puerta",
        nonce: m.nonce,
        ok: false,
        error: String((e as Error)?.message || e),
      });
    }
  };

  /** `fs:project` — el disco, confinado a la carpeta del proyecto. */
  const sirveFs = async (carga: Record<string, unknown>): Promise<unknown> => {
    usa("fs:project");
    const raiz = opts.proyecto;
    if (!raiz) throw new Error("fs:project sin proyecto: no hay carpeta a la que confinedarse");
    const dentro = confinaRuta(raiz, String(carga.ruta ?? "."));
    if ("error" in dentro) throw new Error(dentro.error);
    const ruta = dentro.ruta;
    const accion = String(carga.accion ?? "");
    if (accion === "leer") {
      return readFile(ruta, "utf8");
    }
    if (accion === "escribir") {
      await mkdir(dirname(ruta), { recursive: true });
      const texto = String(carga.texto ?? "");
      await writeFile(ruta, texto, "utf8");
      return { bytes: Buffer.byteLength(texto, "utf8") };
    }
    if (accion === "listar") {
      const entradas = await readdir(ruta, { withFileTypes: true });
      return entradas.map((e) => ({ nombre: e.name, esDirectorio: e.isDirectory() }));
    }
    throw new Error(`acción de disco desconocida: ${accion}`);
  };

  /** `net:fetch` — la red, con lista de dominios y tope de tiempo. */
  const sirveNet = async (carga: Record<string, unknown>): Promise<unknown> => {
    usa("net:fetch");
    const permitidos = opts.dominios ?? [];
    const url0 = String(carga.url ?? "");
    const o = (carga.opts ?? {}) as Record<string, unknown>;
    const ms = Math.min(Math.max(Number(o.ms ?? 10_000), 100), 60_000);
    const metodo = String(o.metodo ?? "GET").toUpperCase();
    const cuerpo = o.cuerpo === undefined ? undefined : String(o.cuerpo);
    const cabeceras = (o.cabeceras ?? {}) as Record<string, string>;

    let url = new URL(url0);
    let redir = 0;
    // Cada salto se comprueba: un redirect no puede sacar de la lista.
    while (redir < 4) {
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error(`esquema no permitido: ${url.protocol}`);
      }
      const dominio = url.hostname.toLowerCase();
      if (!permitidos.some((d) => dominio === d.toLowerCase() || dominio.endsWith(`.${d.toLowerCase()}`))) {
        throw new Error(`dominio no concedido: ${dominio}`);
      }
      const control = new AbortController();
      const reloj = setTimeout(() => control.abort(), ms);
      let r: Response;
      try {
        r = await fetch(url, {
          method: metodo,
          body: cuerpo,
          headers: cabeceras,
          redirect: "manual",
          signal: control.signal,
        });
      } finally {
        clearTimeout(reloj);
      }
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        redir++;
        url = new URL(r.headers.get("location")!, url);
        continue;
      }
      const cuerpoTexto = await r.text();
      const cab: Record<string, string> = {};
      r.headers.forEach((v, k) => {
        cab[k] = v;
      });
      return { estado: r.status, cuerpo: cuerpoTexto, cabeceras: cab };
    }
    throw new Error("demasiados saltos de redirección");
  };

  /** `ipc:emit` — los eventos, con namespace del módulo. */
  const sirveIpc = (carga: Record<string, unknown>): unknown => {
    usa("ipc:emit");
    const crudo = String(carga.evento ?? "");
    if (!crudo) throw new Error("evento sin nombre");
    const id = opts.id ?? "esme.modulo";
    const evento = crudo.startsWith(`${id}:`) ? crudo : `${id}:${crudo}`;
    opts.onEvento?.(evento, carga.carga);
    return { ok: true, evento };
  };

  /** `ui:render` — el módulo propone; la app decide si se ve. */
  const sirveUi = (carga: Record<string, unknown>): unknown => {
    usa("ui:render");
    const vista = carga.vista as VistaModulo | undefined;
    if (!vista || typeof vista !== "object") throw new Error("vista sin forma");
    if (!["texto", "markdown", "tabla", "grafico"].includes(vista.tipo)) {
      throw new Error(`tipo de vista desconocido: ${String(vista.tipo)}`);
    }
    vistas.push(vista);
    opts.onVista?.(vista);
    return { id: `vista-${vistas.length}` };
  };

  /**
   * `proc:spawn` — los programas, por nombre lógico.
   *
   * El módulo no sabe la ruta: la resuelve el anfitrión, que sólo resuelve los
   * nombres que están en la lista concedida. El hijo nace dentro del proyecto,
   * con un entorno mínimo, un tope de tiempo y un tope de salida.
   */
  const sirveProc = async (carga: Record<string, unknown>): Promise<unknown> => {
    usa("proc:spawn");
    const programa = String(carga.programa ?? "");
    if (!programa) throw new Error("proc:spawn sin programa: hay que decir cuál, por su nombre lógico");
    const args = Array.isArray(carga.args) ? (carga.args as unknown[]).map((a) => String(a)) : [];
    const env =
      carga.env && typeof carga.env === "object" && !Array.isArray(carga.env)
        ? Object.fromEntries(
            Object.entries(carga.env as Record<string, unknown>).map(([k, v]) => [k, String(v)])
          )
        : undefined;
    const r = await ejecutaPrograma(
      {
        programa,
        args,
        env,
        cwd: typeof carga.cwd === "string" ? carga.cwd : undefined,
        timeoutMs: typeof carga.timeoutMs === "number" ? carga.timeoutMs : undefined,
        maxBytes: typeof carga.maxBytes === "number" ? carga.maxBytes : undefined,
      },
      {
        permitidos: opts.programas ?? [],
        proyecto: opts.proyecto ?? null,
      }
    );
    // el rastro: qué se lanzó, con qué y cómo acabó
    opts.onPrograma?.({
      programa,
      args,
      codigo: r.codigo,
      ms: r.ms,
      truncado: r.truncado,
      timeout: r.timeout,
    });
    return r;
  };

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
      const metodo = fn.slice(5);
      return ejecutaMente(metodo, args[0]);
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

  return { call, cerrar, vistas: () => [...vistas], usadas: () => [...usadas], listo };
}
