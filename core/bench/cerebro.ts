/**
 * cerebro — hablar con un cerebro de verdad, desde el kit.
 *
 * La Prueba 0 real necesita un cerebro: se COPIA el hogar de la mente (para
 * no tocar el candado ni los recuerdos de la mente viva), se arranca un
 * cerebro sobre la copia con su puerto y su token, y se le pregunta.
 *
 * Aquí solo la mecánica (puro: sin consola, sin ficheros). El CLI vive en
 * scripts/prueba0-real.ts.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** El hogar de la mente: el mismo que usa la app (DAIMON_HOME o el de por defecto). */
export function hogarDeLaMente(): string {
  const env = process.env.DAIMON_HOME;
  if (env) return resolve(env);
  return join(homedir(), "Daimon", "data", "mente_v2");
}

/** El python del cerebro (el de la app: con onnxruntime y todo). */
export function pythonDelCerebro(): string {
  return process.env.DAIMON_PYTHON ?? join(homedir(), "Daimon", ".venv", "bin", "python");
}

export interface CerebroVivo {
  url: string;
  token: string;
  proceso: ChildProcess;
}

/** Arranca un cerebro sobre el hogar dado y devuelve su url y su token. */
export async function arrancaCerebro(
  home: string,
  python: string = pythonDelCerebro()
): Promise<CerebroVivo> {
  const token = randomBytes(32).toString("hex");
  const proceso = spawn(
    python,
    ["-m", "daimon.cli", "serve", "--home", home, "--port", "0", "--token", token],
    {
      cwd: resolve(homedir(), "Daimon"),
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const anuncio = await new Promise<{ port: number; token: string }>((res, rej) => {
    let buffer = "";
    const t = setTimeout(() => rej(new Error("el cerebro no anunció nada en 120 s")), 120_000);
    proceso.stdout?.on("data", (d: Buffer) => {
      buffer += d.toString("utf8");
      const m = /\{[^\n]*"port"[^\n]*\}/.exec(buffer);
      if (m) {
        clearTimeout(t);
        try {
          res(JSON.parse(m[0]) as { port: number; token: string });
        } catch (e) {
          rej(e);
        }
      }
    });
    proceso.on("exit", (code) => {
      clearTimeout(t);
      rej(new Error(`el cerebro murió al arrancar (código ${String(code)})`));
    });
  });
  return {
    url: `http://127.0.0.1:${anuncio.port}`,
    token: anuncio.token ?? token,
    proceso,
  };
}

/** Le pregunta a la mente y devuelve el contexto que compuso. */
export async function preguntaAlCerebro(
  url: string,
  token: string,
  query: string,
  ms = 30_000
): Promise<{ context: string; tokens: number }> {
  const r = await fetch(`${url}/recall`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, budget: 0 }),
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`la mente respondió ${r.status}`);
  const j = (await r.json()) as { context?: string; tokens?: number };
  return { context: j.context ?? "", tokens: j.tokens ?? 0 };
}
