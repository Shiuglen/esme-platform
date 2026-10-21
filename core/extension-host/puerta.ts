/**
 * LA PUERTA — lo que un módulo ve de Esme, y nada más.
 *
 * Por qué existe este fichero: hasta ahora el módulo recibía `globalThis.mente`
 * (la mente) y, por el hecho de estar en un worker de Node, TODO lo demás:
 * `fetch`, `process.env`, `import("node:fs")`. El manifiesto declaraba
 * capacidades (`net:fetch`, `fs:project`…) y el código no las cumplía: la
 * declaración era decorativa y el permiso era mentira.
 *
 * Aquí está la palabra: un módulo ve UNA puerta, y en esa puerta sólo hay lo
 * que declaró Y la persona concedió. Lo que no está, no existe: no hay que
 * confiar en que el módulo sea bueno, hay que quitarle la opción.
 *
 * Referencia: docs/ARQUITECTURA.md §2 y §16, core/extension-host/sandbox.ts.
 */
import type { MenteDelModulo } from "../ipc/sdk.ts";

/** Lo que un módulo sabe de la máquina: lo mínimo y lo que no identifica. */
export interface EntornoSeguro {
  /** "linux" | "darwin" | "win32" */
  readonly plataforma: string;
  /** La versión de Node que lo ejecuta. */
  readonly versionNode: string;
  /** La huella de la máquina (hash), NUNCA su nombre: el nombre identifica. */
  readonly maquina: string;
}

/** Archivos: solo dentro de la carpeta del proyecto y solo por la puerta. */
export interface PuertaFs {
  /** Lee un fichero del proyecto. */
  leer(ruta: string): Promise<string>;
  /** Escribe un fichero del proyecto. */
  escribir(ruta: string, texto: string): Promise<{ bytes: number }>;
  /** Lista una carpeta del proyecto. */
  listar(ruta: string): Promise<{ nombre: string; esDirectorio: boolean }[]>;
}

/** Red: solo por la puerta, y solo a los dominios que la persona autorizó. */
export interface PuertaNet {
  fetch(
    url: string,
    opts?: {
      metodo?: string;
      cuerpo?: string;
      cabeceras?: Record<string, string>;
      /** Tope de milisegundos (por defecto 10 000). */
      ms?: number;
    }
  ): Promise<{ estado: number; cuerpo: string; cabeceras: Record<string, string> }>;
}

/** Eventos: el módulo habla y la app (u otro módulo) escucha. */
export interface PuertaIpc {
  /** Emite un evento con su namespace de módulo: "mi-modulo:algo". */
  emit(evento: string, carga?: unknown): Promise<void>;
}

/** Una vista que el módulo quiere que se vea. */
export interface VistaModulo {
  tipo: "texto" | "markdown" | "tabla" | "grafico";
  titulo?: string;
  cuerpo: unknown;
}

/** La superficie de UI: el módulo propone, la app decide si se ve. */
export interface PuertaUi {
  render(vista: VistaModulo): Promise<{ id: string }>;
}

/**
 * Los programas: lanzar un ejecutable que el anfitrión ha concedido.
 *
 * El módulo pide por NOMBRE LÓGICO («rea»), nunca por ruta: la ruta la
 * resuelve el anfitrión, que sabe qué tiene permitido. Los argumentos van en
 * array (sin shell no hay metacarácter) y el hijo nace dentro del proyecto.
 */
export interface PuertaProc {
  /** Lanza un programa permitido y devuelve su salida. */
  ejecutar(peticion: {
    /** El nombre lógico del programa («rea»). */
    programa: string;
    /** Los argumentos, en array. */
    args?: string[];
    /** Variables de entorno: sólo valen las permitidas para ese programa. */
    env?: Record<string, string>;
    /** El directorio de trabajo, dentro del proyecto. */
    cwd?: string;
    /** Tope de tiempo (ms). */
    timeoutMs?: number;
    /** Tope de bytes de salida. */
    maxBytes?: number;
  }): Promise<{
    codigo: number | null;
    stdout: string;
    stderr: string;
    truncado: boolean;
    timeout: boolean;
    ms: number;
  }>;
}

/**
 * La puerta entera. Lo que falta, falta de verdad: una capacidad no concedida
 * NO aparece (no aparece como `undefined` con un error dentro: no aparece).
 */
export interface EsmeDelModulo {
  /** El id del módulo (quién habla). */
  readonly id: string;
  /** Su versión. */
  readonly version: string;
  /** Lo mínimo de la máquina. */
  readonly entorno: EntornoSeguro;
  /** La carpeta del proyecto (raíz de `fs:project`), si lo hay. */
  readonly proyecto?: string;
  /** La mente, si el módulo tiene `mind:read`/`mind:write`. */
  readonly mente?: MenteDelModulo;
  /** Los archivos del proyecto, si tiene `fs:project`. */
  readonly fs?: PuertaFs;
  /** La red, si tiene `net:fetch`. */
  readonly net?: PuertaNet;
  /** Los eventos, si tiene `ipc:emit`. */
  readonly ipc?: PuertaIpc;
  /** La UI, si tiene `ui:render`. */
  readonly ui?: PuertaUi;
  /** Los programas, si tiene `proc:spawn`. */
  readonly proc?: PuertaProc;
}

/**
 * La puerta tal y como la ve el módulo, desde dentro del worker.
 *
 * `globalThis.esme` es la puerta. Si no hay puerta, `esme()` lo dice: un
 * módulo sin puerta no finge que la tiene.
 */
declare global {
  // eslint-disable-next-line no-var
  var esme: EsmeDelModulo | undefined;
}

/** La puerta del módulo. Si no la hay, dice por qué. */
export function esme(): EsmeDelModulo {
  const e = globalThis.esme;
  if (!e) throw new Error("este módulo no tiene puerta (el host no le dio ninguna)");
  return e;
}
