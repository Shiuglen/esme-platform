/**
 * spec-lint: valida el module.yaml de cada módulo contra la spec viva.
 * La tienda y el CI no publican nada que esto rechace (docs/TIENDA.md).
 *
 * Y comprueba la frontera de la licencia: el repo promete open core (MIT +
 * licencia comunitaria) y los módulos del núcleo son MIT. Si el contrato se
 * rompe, se dice aquí y no en un juicio.
 */
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as yaml from "js-yaml";
import { validaModuloFile } from "../modulos/nucleo/manifest-validator.ts";
import { licenciasPresentes, nivelDe } from "../core/licensing.ts";

const raiz = resolve(import.meta.dirname, "..");
const dir = join(raiz, "modulos");
const archivos = readdirSync(dir).filter((d) => {
  try {
    return statSync(join(dir, d)).isDirectory();
  } catch {
    return false;
  }
});

let fallos = 0;

// 0. la frontera de la licencia: el repo tiene que traer las dos
const licencias = licenciasPresentes(raiz);
if (!licencias.mit) {
  fallos++;
  console.error("✗ el repo no trae LICENSE (el núcleo es MIT: sin el fichero, no hay licencia)");
}
if (!licencias.comunitaria) {
  fallos++;
  console.error("✗ el repo no trae LICENSE-COMMUNITY.md (decisión 1: la capa comunitaria también se publica)");
}

for (const d of archivos) {
  const ruta = join(dir, d, "module.yaml");
  if (!existsSync(ruta)) {
    console.log(`· ${d}: no es módulo (sin module.yaml)`);
    continue;
  }
  const r = validaModuloFile(ruta, { exigirBenchmarks: true });
  // el nivel lo decide DÓNDE vive el módulo, no lo que dice su manifiesto
  const nivel = nivelDe(`modulos/${d}/`);
  if (nivel === "mit") {
    const manifiesto = yaml.load(readFileSync(ruta, "utf8")) as { license?: string };
    if (manifiesto?.license !== "MIT") {
      fallos++;
      console.error(`✗ ${d}: vive en el núcleo (MIT) pero declara '${String(manifiesto?.license)}'`);
    }
  }
  if (r.ok) {
    console.log(`✓ ${d}: ${r.id} v${r.manifest?.version} (${nivel})`);
    for (const a of r.avisos) console.log(`  ⚠ ${a}`);
  } else {
    fallos++;
    console.error(`✗ ${d} (${r.id})`);
    for (const e of r.errores) console.error(`  ✗ ${e}`);
  }
}
if (archivos.length === 0) console.error("no hay modulos en modulos/");
process.exit(fallos > 0 ? 1 : 0);
