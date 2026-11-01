/**
 * LAS FIXTURES DE LA APP — las siete listas instalables de hoy, copiadas tal cual.
 *
 * Los adaptadores (`core/paquetes/adaptadores/`) convierten cada lista de la
 * app en paquetes, y sus pruebas no pueden depender de que la app esté al
 * lado. Por eso se copian aquí, una vez, desde un commit de la app:
 *
 *   npx tsx scripts/paquetes/fixtures-app.ts <carpeta app/ de Shiuglen/esme>
 *
 * Cada lista sale como `{ fuente: { repo, commit, fichero }, datos }`, sin
 * fechas: dos pasadas sobre el mismo commit dan los mismos bytes. Si uno de
 * los ficheros tiene cambios sin commitear, no se copia nada (la fuente
 * diría un commit que no es el de los datos).
 *
 * Referencia: core/paquetes/adaptadores/, tests/paquete-adaptadores.test.ts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** De dónde sale cada lista (rutas dentro de la carpeta `app/`). */
export const FUENTES = {
  "pieles-casa": "src/renderer/tinta/pieles-casa.ts",
  "pieles-tienda": "src/renderer/tinta/pieles-tienda.ts",
  productos: "src/main/tienda/productos.json",
  skills: "src/main/skills/catalogo.json",
  herramientas: "src/main/herramientas/destacadas.json",
  tareas: "src/main/taller/plantillas-casa.ts",
  "motores-acp": "src/main/motores/acp-motores.ts",
  "espejo-acp": "src/main/motores/catalogo-registry.ts",
} as const;

export type Lista = keyof typeof FUENTES;

/**
 * El literal `ESPEJO` de `catalogo-registry.ts`: desde su `= [` hasta la
 * primera línea que es solo `]`. Es JSON (la app lo escribe así para poder
 * regenerarlo); si deja de serlo, esto falla en voz alta.
 */
export function espejoDe(texto: string): unknown[] {
  const i = texto.indexOf("const ESPEJO");
  if (i < 0) throw new Error("catalogo-registry.ts no trae «const ESPEJO»");
  const ini = texto.indexOf("= [", i) + 2;
  const fin = texto.indexOf("\n]\n", ini);
  if (ini < 2 || fin < 0) throw new Error("no encuentro dónde empieza y acaba el literal ESPEJO");
  return JSON.parse(texto.slice(ini, fin + 2)) as unknown[];
}

const git = (dir: string, ...args: string[]): string =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();

/** Las siete listas (ocho ficheros), leídas de la app. */
export async function listasDe(app: string): Promise<Record<Lista, unknown[]>> {
  const ruta = (l: Lista) => join(app, FUENTES[l]);
  const modulo = async (l: Lista) => (await import(pathToFileURL(ruta(l)).href)) as Record<string, unknown[]>;
  const json = (l: Lista) => JSON.parse(readFileSync(ruta(l), "utf8")) as unknown;
  return {
    "pieles-casa": (await modulo("pieles-casa")).PIELES_CASA,
    "pieles-tienda": (await modulo("pieles-tienda")).PIELES_TIENDA,
    productos: (json("productos") as { productos: unknown[] }).productos,
    skills: json("skills") as unknown[],
    herramientas: json("herramientas") as unknown[],
    tareas: (await modulo("tareas")).PLANTILLAS_CASA,
    "motores-acp": (await modulo("motores-acp")).MOTORES_ACP,
    "espejo-acp": espejoDe(readFileSync(ruta("espejo-acp"), "utf8")),
  };
}

async function main(argv: string[]): Promise<number> {
  const app = argv[0] ? resolve(argv[0]) : "";
  if (!app) {
    console.error("uso: npx tsx scripts/paquetes/fixtures-app.ts <carpeta app/ de Shiuglen/esme>");
    return 2;
  }
  const raizApp = git(app, "rev-parse", "--show-toplevel");
  const commit = git(app, "rev-parse", "HEAD");
  const sucios = git(app, "status", "--porcelain", "--", ...Object.values(FUENTES));
  if (sucios) {
    console.error(`hay cambios sin commitear en las fuentes (no serían las del commit ${commit.slice(0, 7)}):\n${sucios}`);
    return 1;
  }
  const listas = await listasDe(app);
  const destino = resolve(import.meta.dirname, "..", "..", "tests", "fixtures", "app");
  mkdirSync(destino, { recursive: true });
  for (const [lista, datos] of Object.entries(listas) as Array<[Lista, unknown[]]>) {
    if (!Array.isArray(datos)) throw new Error(`${lista}: no es una lista`);
    const fuente = { repo: "Shiuglen/esme", commit, fichero: relative(raizApp, join(app, FUENTES[lista])) };
    writeFileSync(join(destino, `${lista}.json`), `${JSON.stringify({ fuente, datos }, null, 2)}\n`);
    console.log(`${lista}: ${datos.length} → tests/fixtures/app/${lista}.json`);
  }
  return 0;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`, "file:///").href) {
  process.exit(await main(process.argv.slice(2)));
}
