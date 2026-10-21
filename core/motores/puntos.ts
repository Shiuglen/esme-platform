/**
 * LOS PUNTOS — el estado de tu PC, medido.
 *
 * Cada persona tiene SU máquina y SUS agentes. La pregunta de todos los días
 * es «¿qué se está comiendo la memoria ahora mismo?», y la respuesta tiene
 * que ser un número: si no, es una impresión.
 *
 * Aquí se miden los procesos que la casa conoce (los motores declarados en
 * la spec de motores) y se devuelve UN PUNTO por proceso: con su memoria
 * residente, su CPU y si se pasa del tope. Nada más: esto no es un monitor
 * de sistema, no mira pantallas ni teclas ni ficheros. Es lo mínimo para que
 * la ventana pueda dibujarlos como puntos (al estilo Dots) sin inventar nada.
 *
 * Lo que NO se hace aquí: estimar. Si el sistema no dice cuánto usa un
 * proceso, el punto lo dice (`null`), en vez de suponer un número bonito.
 *
 * Referencia: estandar/puntos.spec.yaml, docs/PUNTOS.md, motores/acp-motores.ts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { MOTORES_ACP } from "../../motores/acp-motores.ts";

/** Las claves del punto (la forma que declara estandar/puntos.spec.yaml). */
export const CLAVES_PUNTO = [
  "id",
  "motor",
  "proceso",
  "pid",
  "estado",
  "memoria_mb",
  "cpu_pct",
  "desde",
  "pasado",
  "carga",
] as const;

/** Un proceso, medido. */
export interface Punto {
  /** Un id estable: motor + pid + arranque. */
  id: string;
  /** El motor (si se sabe cuál es). */
  motor: string | null;
  /** El nombre del proceso. */
  proceso: string;
  /** El pid. */
  pid: number;
  /** El estado. */
  estado: "vivo" | "zombi" | "desconocido";
  /** La memoria residente, en MiB (null si no se pudo medir). */
  memoria_mb: number | null;
  /** El porcentaje de CPU (null si no se pudo medir). */
  cpu_pct: number | null;
  /** Desde cuándo (epoch ms), si el sistema lo dice. */
  desde: number | null;
  /** ¿Se pasa del tope de memoria? */
  pasado: boolean;
  /**
   * El desglose de la memoria (si el proceso lo sabe).
   *
   * No es un adorno: «pesos» y «caché» se comportan distinto (la caché se
   * puede soltar; los pesos, no). Pero el sistema operativo NO lo dice: lo
   * sabe quien tiene el modelo en la memoria (el cerebro, la app). Así que
   * aquí va a null cuando no se sabe — y lo que no se sabe, no se inventa.
   */
  carga?: {
    pesos_mb: number | null;
    cache_mb: number | null;
    libre_mb: number | null;
  };
}

/** El tope por defecto: el que se pasa, se ve. */
export const TOPE_MB = 2048;

/** Las opciones de la consulta. */
export interface OpcionesPuntos {
  /** Sólo estos motores (por defecto: todos los que la casa conoce). */
  motores?: string[];
  /** Sólo estos PID. */
  pids?: number[];
  /** El tope de memoria por punto. */
  tope_mb?: number;
  /**
   * TODOS los procesos, no sólo los motores.
   *
   * La pregunta de la RAM no es «cuánto usa el agente» sino «qué se está
   * comiendo la máquina». Esto es lo segundo: la lista completa, ordenada
   * por memoria. (Lo primero es un caso particular.)
   */
  todos?: boolean;
}

/** El motor al que pertenece un proceso (por su binario), si se sabe. */
export function motorDe(proceso: string): string | null {
  for (const [id, m] of Object.entries(MOTORES_ACP)) {
    if (!m.binario) continue;
    if (proceso === m.binario || proceso.startsWith(`${m.binario}-`) || proceso.includes(`/${m.binario}`)) {
      return id;
    }
  }
  return null;
}

/** Lo que el sistema dice de un proceso (plataforma a plataforma). */
interface Lectura {
  proceso: string;
  pid: number;
  estado: Punto["estado"];
  memoria_mb: number | null;
  cpu_pct: number | null;
  desde: number | null;
}

/** Linux: /proc lo tiene todo (y no hay que lanzar nada). */
function leeLinux(): Lectura[] {
  const salida: Lectura[] = [];
  const paginas = 4096; // el tamaño de página habitual (x86-64)
  const reloj = 100; // CLK_TCK: 100 en Linux
  let pids: string[];
  try {
    pids = readdirSync("/proc").filter((d) => /^\d+$/.test(d));
  } catch {
    return salida;
  }

  // La CPU se mide con DOS muestras: los ticks acumulados desde que arrancó
  // el proceso no dicen cuánto está usando AHORA (un proceso de dos horas con
  // un segundo de vida real daría un 0,01% y parecería parado).
  const t0 = Date.now();
  const primera = new Map<number, number>();
  for (const pid of pids) {
    const t = leerTicks(pid);
    if (t !== null) primera.set(Number(pid), t);
  }
  dormir(300); // sin esto no hay «ahora»: sólo hay «desde entonces»
  const t1 = Date.now();
  const dt = Math.max((t1 - t0) / 1000, 0.001);

  for (const pid of pids) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      // el nombre va entre paréntesis y puede tener espacios: se corta por el
      // último paréntesis
      const corte = stat.lastIndexOf(")");
      const comm = stat.slice(stat.indexOf("(") + 1, corte).replace(/[()]/g, "");
      const campos = stat.slice(corte + 2).split(" ");
      const starttime = Number(campos[19] ?? 0);
      const state = campos[0] ?? "R";

      const ticks = leerTicks(pid);
      const antes = primera.get(Number(pid));
      let cpu: number | null = null;
      if (ticks !== null && antes !== undefined) {
        cpu = Math.round((((ticks - antes) / reloj / dt) * 100) * 10) / 10;
      }

      let rss: number | null = null;
      try {
        const statm = readFileSync(`/proc/${pid}/statm`, "utf8").split(" ");
        const paginasResidentes = Number(statm[1] ?? 0);
        if (Number.isFinite(paginasResidentes)) rss = (paginasResidentes * paginas) / (1024 * 1024);
      } catch {
        rss = null; // sin permiso: se dice que no se sabe
      }

      // el arranque: clocks desde el boot
      let desde: number | null = null;
      try {
        const uptime = readFileSync("/proc/uptime", "utf8").split(" ")[0];
        const boot = Date.now() - Number(uptime) * 1000;
        desde = boot + (starttime / reloj) * 1000;
      } catch {
        desde = null;
      }

      salida.push({
        proceso: comm,
        pid: Number(pid),
        estado: state === "Z" ? "zombi" : "vivo",
        memoria_mb: rss,
        cpu_pct: cpu,
        desde,
      });
    } catch {
      // el proceso se murió mientras lo mirábamos: no es un error
    }
  }
  return salida;
}

/** Los ticks de CPU acumulados de un proceso (null si no se puede leer). */
function leerTicks(pid: string): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const corte = stat.lastIndexOf(")");
    const campos = stat.slice(corte + 2).split(" ");
    return Number(campos[11] ?? 0) + Number(campos[12] ?? 0);
  } catch {
    return null;
  }
}

/** Dormir sin bloquear el bucle de eventos (y sin dependencias). */
function dormir(ms: number): void {
  const buffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buffer, 0, 0, ms);
}

/** macOS: ps lo dice todo en una línea. */
function leeMac(): Lectura[] {
  let crudo = "";
  try {
    crudo = execFileSync("ps", ["-Ao", "pid=,pcpu=,rss=,lstart=,comm="], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  const salida: Lectura[] = [];
  for (const linea of crudo.split("\n")) {
    const m = linea.match(/^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(.{24})\s+(.*)$/);
    if (!m) continue;
    salida.push({
      proceso: m[5].trim().split("/").pop() ?? m[5].trim(),
      pid: Number(m[1]),
      estado: "vivo",
      memoria_mb: Number(m[3]) / 1024,
      cpu_pct: Number(m[2]),
      desde: Date.parse(m[4]) || null,
    });
  }
  return salida;
}

/** Los puntos: lo que la casa está corriendo ahora mismo, medido. */
export function puntos(opts: OpcionesPuntos = {}): Punto[] {
  const tope = opts.tope_mb ?? TOPE_MB;
  const lecturas =
    platform() === "linux" ? leeLinux() : platform() === "darwin" ? leeMac() : [];

  const motores = opts.motores;
  const pids = opts.pids ? new Set(opts.pids) : null;

  const salida: Punto[] = [];
  for (const l of lecturas) {
    const motor = motorDe(l.proceso);
    if (pids) {
      if (!pids.has(l.pid)) continue;
    } else if (motores) {
      if (!motor || !motores.includes(motor)) continue;
    } else if (opts.todos) {
      // todos los procesos: la máquina entera, ordenada por memoria
    } else {
      // sin filtros: sólo los procesos de los motores que la casa conoce
      if (!motor) continue;
    }
    const memoria = l.memoria_mb === null ? null : Math.round(l.memoria_mb * 10) / 10;
    salida.push({
      id: `${motor ?? l.proceso}:${l.pid}:${l.desde ?? 0}`,
      motor,
      proceso: l.proceso,
      pid: l.pid,
      estado: l.estado,
      memoria_mb: memoria,
      cpu_pct: l.cpu_pct,
      desde: l.desde,
      pasado: memoria !== null && memoria > tope,
      // el desglose (pesos/caché/libre) no lo sabe el sistema operativo:
      // lo completa quien tiene el modelo en la memoria
      carga: { pesos_mb: null, cache_mb: null, libre_mb: null },
    });
  }
  return salida.sort((a, b) => (b.memoria_mb ?? -1) - (a.memoria_mb ?? -1));
}

/** El texto que se ve en la terminal (la versión «sin ventana» de los puntos). */
export function renderPuntos(lista: Punto[], tope = TOPE_MB): string {
  if (!lista.length) return "puntos: ninguno (no hay motores corriendo aquí)";
  const lineas = [`puntos (tope ${tope} MiB)`];
  for (const p of lista) {
    const mem = p.memoria_mb === null ? "?" : `${Math.round(p.memoria_mb)} MiB`;
    const cpu = p.cpu_pct === null ? "?" : `${p.cpu_pct}%`;
    lineas.push(
      `  ${p.pasado ? "!" : " "} ${(p.motor ?? "?").padEnd(12)} ${String(p.pid).padEnd(7)} ${mem.padStart(9)} ${cpu.padStart(6)}  ${p.proceso}`
    );
  }
  const pasado = lista.filter((p) => p.pasado);
  if (pasado.length) {
    lineas.push(`  ${pasado.length} punto(s) por encima del tope`);
  }
  return lineas.join("\n");
}
