/**
 * npm y tsx desde una prueba, también en Windows.
 *
 * En Windows `npm` es npm.cmd, y Node no lanza un .cmd sin shell (desde la
 * CVE-2024-27980). Con shell, cmd.exe reinterpreta los argumentos. Y
 * `node_modules/.bin/tsx` es un guion de sh, que Windows no sabe lanzar.
 * Por eso los dos se lanzan como lo que son, un .js, con el mismo node que
 * corre la prueba.
 */
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** Un programa listo para lanzar: el ejecutable y lo que va antes de los argumentos. */
export interface Lanzador {
  programa: string;
  antes: string[];
}

/**
 * Cómo se lanza npm aquí: el npm-cli.js que npm deja en `npm_execpath` (las
 * pruebas corren dentro de `npm test`) o, en Windows, el que viaja junto a
 * node.exe. Fuera de Windows, sin ninguno de los dos, `npm` a secas.
 */
export function comoLanzarNpm(): Lanzador {
  const execpath = process.env.npm_execpath;
  if (execpath && /npm-cli\.[cm]?js$/.test(execpath) && existsSync(execpath)) {
    return { programa: process.execPath, antes: [execpath] };
  }
  const junto = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (process.platform === "win32" && existsSync(junto)) {
    return { programa: process.execPath, antes: [junto] };
  }
  return { programa: "npm", antes: [] };
}

/** `npm <args>`, sin shell, en cualquier sistema. */
export function npm(args: readonly string[], opts: ExecFileSyncOptions = {}): string | Buffer {
  const { programa, antes } = comoLanzarNpm();
  return execFileSync(programa, [...antes, ...args], opts);
}

/** Cómo se lanza tsx: su cli (el `bin` de su package.json) con este node. */
export function comoLanzarTsx(): Lanzador {
  const paquete = createRequire(import.meta.url).resolve("tsx/package.json");
  const { bin } = JSON.parse(readFileSync(paquete, "utf8")) as { bin: string | Record<string, string> };
  const cli = typeof bin === "string" ? bin : bin.tsx;
  if (!cli) throw new Error("el package.json de tsx no dice dónde está su cli");
  return { programa: process.execPath, antes: [join(dirname(paquete), cli)] };
}
