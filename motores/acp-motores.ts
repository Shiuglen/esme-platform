/**
 * LOS MOTORES — cómo se habla con cada uno.
 *
 * Un motor es el CEREBRO que habla con la mente: claude-code, opencode,
 * codex, gemini, el shell, ollama o el local. La mente es la misma para
 * todos; lo que cambia es el motor. Por eso lo que se declara aquí NO es lo
 * que el motor sabe (eso está en la spec: `estandar/motor-capability.spec.yaml`)
 * sino CÓMO se le habla: con qué binario, por qué transporte y dónde está su
 * salud.
 *
 * Lo que este fichero NO hace: ejecutar motores. Eso es cosa de la app (el
 * Taller). Aquí sólo vive el contrato, para que el router, el compat-check y
 * quien programa un motor nuevo tengan un solo sitio donde mirar.
 *
 * Referencia: docs/MOTORES.md, estandar/motor-capability.spec.yaml.
 */
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { Motor } from "./laya-adapter.ts";

/** Cómo se le habla a un motor. */
export type Transporte = "stdio-jsonrpc" | "http" | "shell";

export interface MotorAcp {
  /** El id del motor (el mismo de la spec). */
  id: Motor;
  /** El binario que se lanza (el nombre, no la ruta: lo busca el PATH). */
  binario: string;
  /** Por dónde se habla con él. */
  transporte: Transporte;
  /** Los argumentos de arranque (los puede cambiar quien lo lanza). */
  argsBase: string[];
  /** La salud del motor, si la tiene (la ruta que responde «estoy vivo»). */
  salud: string | null;
  /** Si se puede cancelar la ejecución (un motor que no se para, para). */
  cancela: boolean;
}

/**
 * Los motores, uno por uno.
 *
 * Los argumentos de arranque son los DE SUBAIDA: el que sabe cómo se lanza
 * una versión concreta los cambia (un flag nuevo, un modelo, un puerto). Lo
 * que no cambia es el binario y el transporte: de eso habla la casa.
 */
export const MOTORES_ACP: Record<string, MotorAcp> = {
  "claude-code": {
    id: "claude-code",
    binario: "claude",
    transporte: "stdio-jsonrpc",
    argsBase: ["--acp"],
    salud: null,
    cancela: true,
  },
  opencode: {
    id: "opencode",
    binario: "opencode",
    transporte: "stdio-jsonrpc",
    argsBase: ["acp"],
    salud: null,
    cancela: true,
  },
  codex: {
    id: "codex",
    binario: "codex",
    transporte: "stdio-jsonrpc",
    argsBase: ["acp"],
    salud: null,
    cancela: true,
  },
  gemini: {
    id: "gemini",
    binario: "gemini",
    transporte: "stdio-jsonrpc",
    argsBase: ["--experimental-acp"],
    salud: null,
    cancela: true,
  },
  shell: {
    id: "shell",
    binario: "", // el shell es el shell: no hay binario que lanzar
    transporte: "shell",
    argsBase: [],
    salud: null,
    cancela: true,
  },
  ollama: {
    id: "ollama",
    binario: "ollama",
    transporte: "http",
    argsBase: ["serve"],
    salud: "http://localhost:11434/api/tags",
    cancela: true,
  },
  local: {
    id: "local",
    binario: "", // el local es el cerebro: no se lanza, está dentro
    transporte: "stdio-jsonrpc",
    argsBase: [],
    salud: null,
    cancela: true,
  },
};

/** El motor, si la casa lo conoce. */
export function motorDe(id: string): MotorAcp | null {
  return MOTORES_ACP[id] ?? null;
}

/** ¿Está el binario en el PATH? (la pregunta que se le hace a un motor nuevo) */
export function existeEnElPath(nombre: string): boolean {
  if (!nombre) return false;
  const camino = process.env.PATH ?? "";
  for (const carpeta of camino.split(delimiter)) {
    if (!carpeta) continue;
    const ruta = join(carpeta, nombre);
    try {
      if (existsSync(ruta)) return true;
    } catch {
      // una carpeta que no se puede leer no es una carpeta: se sigue
    }
  }
  return false;
}

/**
 * ¿Está este motor instalado en ESTA máquina?
 *
 * Ojo con lo que esto NO dice: que el binario esté no significa que el motor
 * funcione (puede faltar la llave, el modelo o la red). Por eso el
 * compat-check lo llama «instalado» y no «listo».
 */
export function estaInstalado(id: string): boolean {
  const m = motorDe(id);
  if (!m) return false;
  if (!m.binario) return true; // shell y local: no hay binario que buscar
  return existeEnElPath(m.binario);
}
