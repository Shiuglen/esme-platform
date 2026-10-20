/**
 * casa — el veredicto de TODA la casa, en un comando.
 *
 *   npm run casa
 *
 * Es la pregunta que se hace siempre al final: «¿está todo en verde?». Y la
 * respuesta tiene que ser UNA, no seis. Aquí se comprueba lo que se puede
 * comprobar y se dice lo que no (si una casa no está en esta máquina, se dice
 * que no está: nunca se presume).
 *
 * Las casas:
 *   - el kit     (este repo): lint, tests, specs
 *   - el cerebro (Python, el repo de la app): sus tests
 *   - la app     (TypeScript, el repo de la app): typecheck y tests
 *   - la frontera: la spec, el cerebro y la app diciendo lo mismo
 *   - la tienda  : el índice y los artefactos, verificados por la raíz
 *   - la prueba 0: el número no ha empeorado
 *
 * Sale con 1 si algo no está en verde.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const appRepo = join(homedir(), "Daimon");
const hayApp = existsSync(join(appRepo, "app", "package.json"));
const hayCerebro = existsSync(join(appRepo, "daimon", "server.py"));
const venv = join(appRepo, ".venv", "bin", "python");

type Veredicto = "ok" | "falla" | "ausente";

interface Casa {
  id: string;
  nombre: string;
  cmd: string[];
  cwd: string;
  /** Si la casa no está en esta máquina: se dice y se sigue. */
  opcional?: boolean;
  /** Cómo leer el número de tests de la salida. */
  cuenta?: (salida: string) => string | null;
}

const casas: Casa[] = [
  {
    id: "kit-lint",
    nombre: "el kit · tipos",
    cmd: ["npx", "tsc", "--noEmit"],
    cwd: raiz,
  },
  {
    id: "kit-tests",
    nombre: "el kit · tests",
    cmd: ["npx", "vitest", "run"],
    cwd: raiz,
    cuenta: (s) => s.match(/Tests\s+(\d+) passed/)?.[1] ?? null,
  },
  {
    id: "kit-specs",
    nombre: "el kit · specs",
    cmd: ["npx", "tsx", "scripts/spec-lint.ts"],
    cwd: raiz,
  },
  {
    id: "frontera",
    nombre: "la frontera · spec ↔ cerebro ↔ app",
    cmd: ["npx", "vitest", "run", "tests/frontera.test.ts", "tests/contrato-app.test.ts"],
    cwd: raiz,
  },
  {
    id: "tienda",
    nombre: "la tienda · índice y artefactos",
    cmd: ["npx", "tsx", "scripts/verificar.ts"],
    cwd: raiz,
  },
  {
    id: "prueba0",
    nombre: "la prueba 0 · el número no empeora",
    cmd: ["npx", "vitest", "run", "tests/prueba0.test.ts"],
    cwd: raiz,
  },
  {
    id: "cerebro",
    nombre: "el cerebro · tests (Python)",
    cmd: [existsSync(venv) ? venv : "python3", "-m", "pytest", "tests", "-q"],
    cwd: appRepo,
    opcional: true,
    cuenta: (s) => s.match(/(\d+) passed/)?.[1] ?? null,
  },
  {
    id: "app-typecheck",
    nombre: "la app · tipos",
    cmd: ["npx", "tsc", "--noEmit", "-p", "tsconfig.json"],
    cwd: join(appRepo, "app"),
    opcional: true,
  },
  {
    id: "app-tests",
    nombre: "la app · tests",
    cmd: ["npx", "vitest", "run"],
    cwd: join(appRepo, "app"),
    opcional: true,
    cuenta: (s) => s.match(/Tests\s+(\d+) passed/)?.[1] ?? null,
  },
];

const marca = (v: Veredicto): string => (v === "ok" ? "✓" : v === "falla" ? "✗" : "—");

/** Sin los códigos de color: los números se leen, no se adivinan. */
const sinColores = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

const linea = (nombre: string, v: Veredicto, detalle: string): string =>
  `  ${marca(v)} ${nombre.padEnd(38)} ${detalle}`;

console.log("LA CASA — el veredicto de todo\n");
let fallos = 0;
for (const casa of casas) {
  const existe = existsSync(casa.cwd);
  if (!existe && casa.opcional) {
    console.log(linea(casa.nombre, "ausente", "no está en esta máquina"));
    continue;
  }
  const r = spawnSync(casa.cmd[0], casa.cmd.slice(1), {
    cwd: casa.cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
    timeout: 20 * 60 * 1000,
  });
  const salida = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const ok = r.status === 0;
  if (!ok) fallos++;
  const cuenta = casa.cuenta?.(sinColores(salida));
  const detalle = ok
    ? cuenta
      ? `${cuenta} tests`
      : "en verde"
    : (salida.split("\n").filter((l) => l.trim()).slice(-2).join(" · ").slice(0, 120) ||
      `código ${r.status}`);
  console.log(linea(casa.nombre, ok ? "ok" : "falla", detalle));
}

console.log("");
if (fallos) {
  console.log(`✗ ${fallos} casa(s) en rojo.`);
  process.exit(1);
}
console.log(`✓ toda la casa en verde${hayApp && hayCerebro ? " (kit + cerebro + app)" : ""}.`);
