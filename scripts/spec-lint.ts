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
import { juzgaPielDeModulo } from "../tienda/piel.ts";
import { juzgaAgenteDeModulo } from "../tienda/agente.ts";
import { compruebaConformidad } from "./estandar/conformidad.ts";
import { EXCEPCIONES_ALCANCE, huerfanosDelNucleo } from "./estandar/alcance.ts";
import { leePaqueteDeCarpeta } from "../tienda/paquete-disco.ts";
import { nivelDe as aislamientoDe, NIVELES } from "../core/paquetes/manifiesto.ts";

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
  // el nivel lo decide DÓNDE vive el módulo, no lo que dice su manifiesto
  const nivel = nivelDe(`modulos/${d}/`);
  let manifiesto: { license?: string; schema_version?: unknown } | null = null;
  try {
    manifiesto = yaml.load(readFileSync(ruta, "utf8")) as typeof manifiesto;
  } catch {
    // un YAML roto lo dice el dictamen de abajo, con su motivo
  }
  if (nivel === "mit" && manifiesto && manifiesto.license !== "MIT") {
    fallos++;
    console.error(`✗ ${d}: vive en el núcleo (MIT) pero declara '${String(manifiesto.license)}'`);
  }
  // un module.yaml v2 (el paquete) se dictamina como paquete, con las
  // mismas reglas del índice que la v1
  if (manifiesto?.schema_version === 2) {
    const p = leePaqueteDeCarpeta(join(dir, d), { exigirBenchmarks: true });
    if (p.ok) {
      const n = aislamientoDe(p.paquete!);
      console.log(`✓ ${d}: ${p.id} v${p.paquete!.version} (${nivel}, paquete v2, nivel ${n}: ${NIVELES[n]})`);
      for (const a of p.avisos) console.log(`  ⚠ ${a}`);
    } else {
      fallos++;
      console.error(`✗ ${d} (${p.id})`);
      for (const e of p.errores) console.error(`  ✗ ${e}`);
    }
    continue;
  }
  const r = validaModuloFile(ruta, { exigirBenchmarks: true });
  if (r.ok) {
    console.log(`✓ ${d}: ${r.id} v${r.manifest?.version} (${nivel})`);
    for (const a of r.avisos) console.log(`  ⚠ ${a}`);
    // y la v1, vista como paquete: una sola contribución, los mismos ficheros
    const v2 = leePaqueteDeCarpeta(join(dir, d));
    if (v2.ok) console.log("  ✓ también como paquete v2");
    else {
      fallos++;
      console.error(`✗ ${d}: como paquete v2 no vale`);
      for (const e of v2.errores) console.error(`  ✗ ${e}`);
    }
    // el guard de la identidad: un módulo de tema trae una piel, y la piel
    // tiene que ser válida (y se tiene que LEER). La estética es el
    // producto: no es skinneable, y el juez está antes de la puerta.
    if (r.manifest?.category === "agent") {
      const agente = juzgaAgenteDeModulo(join(dir, d), "agent");
      if (agente.ok) console.log(`  ✓ receta: ${agente.agente?.motor} con techo de ${agente.agente?.presupuesto.tokens} tokens`);
      else {
        fallos++;
        console.error(`✗ ${d}: la receta del agente no vale`);
        for (const e of agente.errores) console.error(`  ✗ ${e}`);
      }
    }
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
  let manifiesto: { schema_version?: unknown; engines?: string[]; works_with?: string[] } | null = null;
  try {
    manifiesto = yaml.load(readFileSync(ruta, "utf8")) as typeof manifiesto;
  } catch {
    continue; // ya dicho arriba
  }
  // en la v2, los motores con los que trabaja van en works_with
  const declarados = manifiesto?.schema_version === 2 ? manifiesto.works_with : manifiesto?.engines;
  for (const e of declarados ?? []) {
    if (!idsMotores.has(e)) {
      fallos++;
      console.error(`✗ ${d}: declara el motor «${e}», que no está en la spec de motores`);
    }
  }
}

// 3. la conformidad: las specs y el código son la misma cosa
const separaciones = compruebaConformidad();
for (const f of separaciones) {
  fallos++;
  console.error(`✗ ${f.spec}: ${f.problema}`);
}
if (!separaciones.length) console.log("✓ specs y código: no se han separado");

// 4. el alcance: ningún fichero del núcleo sin prueba que lo alcance
const huerfanos = huerfanosDelNucleo(raiz, EXCEPCIONES_ALCANCE);
for (const h of huerfanos) {
  fallos++;
  console.error(`✗ ${h}: está en el núcleo y ninguna prueba lo alcanza`);
}
if (!huerfanos.length) console.log("✓ núcleo: ningún fichero sin prueba");

if (archivos.length === 0) console.error("no hay modulos en modulos/");
process.exit(fallos > 0 ? 1 : 0);
