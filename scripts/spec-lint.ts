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
import { cargaMotorCached, MOTORES_CONOCIDOS } from "../motores/laya-adapter.ts";
import { juzgaPielDeModulo } from "./estandar/piel-check.ts";

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
    // el guard de la identidad: un módulo de tema trae una piel, y la piel
    // tiene que ser válida (y se tiene que LEER). La estética es el
    // producto: no es skinneable, y el juez está antes de la puerta.
    if (r.manifest?.category === "theme") {
      const piel = juzgaPielDeModulo(join(dir, d), "theme");
      if (piel.ok) console.log(`  ✓ piel: válida y se lee`);
      else {
        fallos++;
        console.error(`✗ ${d}: la piel no vale`);
        for (const e of piel.errores) console.error(`  ✗ ${e}`);
      }
    }
  } else {
    fallos++;
    console.error(`✗ ${d} (${r.id})`);
    for (const e of r.errores) console.error(`  ✗ ${e}`);
  }
}

// 1. la spec de motores: lo que declara tiene que existir en el código
const rutaMotores = join(raiz, "estandar", "motor-capability.spec.yaml");
const motores = cargaMotorCached(rutaMotores);
const idsMotores = new Set(motores.map((m) => m.id));
for (const id of MOTORES_CONOCIDOS) {
  if (!idsMotores.has(id)) {
    fallos++;
    console.error(`✗ el motor «${id}» lo promete el código y la spec no lo declara`);
  }
}
for (const m of motores) {
  if (!(MOTORES_CONOCIDOS as readonly string[]).includes(m.id)) {
    fallos++;
    console.error(`✗ la spec declara el motor «${m.id}», que el código no conoce`);
  }
  // el adaptador tiene que existir: un puntero a un fichero fantasma es un
  // motor que nadie sabe usar
  if (m.adapter && !existsSync(join(raiz, m.adapter))) {
    fallos++;
    console.error(`✗ el motor «${m.id}» apunta a un adaptador que no existe: ${m.adapter}`);
  }
  if (!m.source || !m.verificado_en) {
    fallos++;
    console.error(`✗ el motor «${m.id}» declara números sin decir de dónde salen`);
  }
  console.log(`✓ motor ${m.id} (${m.capabilities.runtimes.join(", ") || "sin módulos"})`);
}

// 2. los módulos declaran motores que existen (si declaran alguno)
for (const d of archivos) {
  const ruta = join(dir, d, "module.yaml");
  if (!existsSync(ruta)) continue;
  const manifiesto = yaml.load(readFileSync(ruta, "utf8")) as { engines?: string[] } | null;
  for (const e of manifiesto?.engines ?? []) {
    if (!idsMotores.has(e)) {
      fallos++;
      console.error(`✗ ${d}: declara el motor «${e}», que no está en la spec de motores`);
    }
  }
}

if (archivos.length === 0) console.error("no hay modulos en modulos/");
process.exit(fallos > 0 ? 1 : 0);
