/**
 * spec-lint: valida el module.yaml de cada módulo contra la spec viva.
 * La tienda y el CI no publican nada que esto rechace (docs/TIENDA.md).
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { validaModuloFile } from "../modulos/nucleo/manifest-validator.ts";

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
for (const d of archivos) {
  const ruta = join(dir, d, "module.yaml");
  if (!existsSync(ruta)) {
    console.log(`· ${d}: no es módulo (sin module.yaml)`);
    continue;
  }
  const r = validaModuloFile(ruta, { exigirBenchmarks: true });
  if (r.ok) {
    console.log(`✓ ${d}: ${r.id} v${r.manifest?.version}`);
    for (const a of r.avisos) console.log(`  ⚠ ${a}`);
  } else {
    fallos++;
    console.error(`✗ ${d} (${r.id})`);
    for (const e of r.errores) console.error(`  ✗ ${e}`);
  }
}
if (archivos.length === 0) console.error("no hay modulos en modulos/");
process.exit(fallos > 0 ? 1 : 0);
