/**
 * arena — la cata a ciegas, de punta a punta.
 *   npm run arena -- cata --tarea "..." [--categoria pruebas] [--modulo <dir>]...
 *   npm run arena -- revelar --ciega <f> --clave <f> --elige A
 *   npm run arena -- juzgar <f>
 *   npm run arena -- paladar <f>...
 *   npm run arena -- verificar <f> --huella <hex>
 *
 * El flujo es el de una subasta ciega, y va en este orden porque el orden ES
 * la garantía:
 *
 *   1. `cata` corre a los participantes, reparte las etiquetas a ciegas y
 *      escribe DOS ficheros: el documento ciego (lo que se enseña) y la clave
 *      (la sal y las fichas: el secreto del organizador). Muestra la HUELLA
 *      de la parte ciega: eso es lo que hay que entregar antes de seguir.
 *   2. La persona elige, sin ver nombres (la etiqueta y las medidas).
 *   3. `revelar` junta el veredicto con la clave y escribe el documento
 *      revelado, y comprueba que el COMPROMISO sigue verificando: si el mapa
 *      se cambió por el camino, lo dice (arena contaminada).
 *   4. `paladar` agrega varias arenas y dice qué motor gana cada categoría
 *      (sólo si hay catas de sobra y la tasa pasa la mitad).
 *
 * Referencia: estandar/arena.spec.yaml, core/arena/, docs/ARENA.md.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { leeManifiesto } from "../tienda/modulo-manifiesto.ts";
import { ejecutaCata, revelaCata } from "../core/arena/ejecuta.ts";
import { juzgaArena, validaArena, vistaCiega, CATEGORIAS_ARENA, type Arena, type CategoriaArena } from "../core/arena/arena.ts";
import { mismaHuella } from "../core/arena/ciego.ts";
import {
  agregaPaladar,
  categoriaDe,
  proponePaladar,
  resumenPaladar,
} from "../core/arena/paladar.ts";

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
};
const todos = (flag: string): string[] => {
  const salida: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === flag && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
      salida.push(process.argv[i + 1]);
    }
  });
  return salida;
};
const uso = (): void => {
  console.error(
    [
      "uso:",
      "  arena cata --tarea «...» [--categoria pruebas] [--modulo <dir>]... [--salida <dir>]",
      "  arena revelar --ciega <f> --clave <f> --elige A [--nota «...»]",
      "  arena juzgar <f>",
      "  arena paladar <f>...",
      "  arena verificar <f> --huella <hex>",
    ].join("\n")
  );
};

const [comando, ...resto] = process.argv.slice(2);

if (comando === "cata") {
  const tarea = arg("--tarea");
  if (!tarea) {
    uso();
    process.exit(2);
  }
  const categoriaRaw = arg("--categoria");
  const categoria = (categoriaRaw ?? categoriaDe(tarea)) as CategoriaArena;
  if (!(CATEGORIAS_ARENA as readonly string[]).includes(categoria)) {
    console.error(`la categoría «${categoria}» no es de las cerradas: ${CATEGORIAS_ARENA.join(", ")}`);
    process.exit(2);
  }

  const participantes: Array<{ motor: string; dir: string }> = [];
  for (const dir of todos("--modulo")) {
    const dictamen = leeManifiesto(resolve(dir));
    if (!dictamen.ok || !dictamen.manifest) {
      console.error(`«${dir}» no tiene un module.yaml que se pueda leer: ${dictamen.errores.join("; ")}`);
      process.exit(1);
    }
    participantes.push({ motor: dictamen.manifest.id, dir: resolve(dir) });
  }
  if (participantes.length < 2) {
    console.error("una cata necesita al menos dos participantes (--modulo)");
    process.exit(2);
  }

  const salida = resolve(arg("--salida") ?? process.cwd());
  mkdirSync(salida, { recursive: true });

  const r = await ejecutaCata({
    tarea,
    categoria,
    participantes,
    ...(arg("--sal") ? { sal: arg("--sal") as string } : {}),
  });

  const ciega = join(salida, "arena.ciega.json");
  const clave = join(salida, "arena.clave.json");
  writeFileSync(ciega, JSON.stringify(r.arena, null, 2) + "\n");
  writeFileSync(
    clave,
    JSON.stringify({ arena: r.arena.id, sal: r.sal, fichas: r.fichas }, null, 2) + "\n"
  );

  console.log("— la cata, a ciegas —");
  console.log(`tarea: ${r.arena.tarea}`);
  console.log(`categoría: ${r.arena.categoria}`);
  for (const p of r.arena.participantes) {
    const m = p.medidas;
    console.log(
      `  ${p.etiqueta}: ${m.ms} ms · ${m.tokens} tokens · ${m.cambios} cambios${m.ok ? "" : " · NO CONTESTÓ"}`
    );
  }
  console.log("");
  console.log(`compromiso: ${r.arena.compromiso.hash}`);
  console.log(`HUELLA (entrégala antes de revelar): ${r.huella}`);
  console.log(`documento ciego: ${ciega}`);
  console.log(`la clave (no la mires): ${clave}`);
  for (const i of r.incidencias) console.log(`  ⚠ ${i}`);
  process.exit(0);
}

if (comando === "revelar") {
  const rutaCiega = arg("--ciega");
  const rutaClave = arg("--clave");
  const elegida = arg("--elige");
  if (!rutaCiega || !rutaClave || !elegida) {
    uso();
    process.exit(2);
  }
  const ciega = JSON.parse(readFileSync(resolve(rutaCiega), "utf8")) as Arena;
  const clave = JSON.parse(readFileSync(resolve(rutaClave), "utf8")) as {
    sal: string;
    fichas: Record<string, { motor: string; modelo?: string; coste_usd?: number }>;
  };
  const nota = arg("--nota") ?? undefined;
  const revelada = revelaCata(ciega, {
    sal: clave.sal,
    fichas: clave.fichas,
    elegida,
    ...(nota ? { nota } : {}),
  });
  const salida = resolve(rutaCiega).replace(/\.ciega\.json$/, ".revelada.json");
  writeFileSync(salida, JSON.stringify(revelada, null, 2) + "\n");

  const juicio = juzgaArena(revelada);
  console.log("— la revelación —");
  for (const [etiqueta, ficha] of Object.entries(clave.fichas)) {
    const gano = etiqueta === elegida ? " ← la elegida" : "";
    console.log(`  ${etiqueta}: ${ficha.motor}${ficha.modelo ? ` (${ficha.modelo})` : ""}${gano}`);
  }
  console.log("");
  console.log(`integridad: ${juicio.integridad}`);
  for (const e of juicio.errores) console.error(`  ✗ ${e}`);
  console.log(`documento revelado: ${salida}`);
  process.exit(juicio.ok ? 0 : 1);
}

if (comando === "juzgar") {
  const ruta = resto.find((r) => !r.startsWith("--"));
  if (!ruta) {
    uso();
    process.exit(2);
  }
  const doc = JSON.parse(readFileSync(resolve(ruta), "utf8")) as Arena;
  const forma = validaArena(doc);
  const juicio = juzgaArena(doc);
  console.log(`documento: ${ruta}`);
  console.log(`forma: ${forma.ok ? "válida" : "ROTA"}`);
  console.log(`integridad: ${juicio.integridad}`);
  for (const e of juicio.errores) console.error(`  ✗ ${e}`);
  if (forma.ok && juicio.integridad === "sin_revelar") {
    console.log("— la vista ciega —");
    const vista = vistaCiega(doc);
    for (const p of vista.participantes) {
      console.log(
        `  ${p.etiqueta}: ${p.medidas.ms} ms · ${p.medidas.tokens} tokens · ${p.medidas.cambios} cambios`
      );
    }
    console.log(`huella: ${vista.huella}`);
  }
  process.exit(juicio.ok ? 0 : 1);
}

if (comando === "paladar") {
  const rutas = resto.filter((r) => !r.startsWith("--"));
  if (!rutas.length) {
    uso();
    process.exit(2);
  }
  const arenas: Arena[] = [];
  for (const r of rutas) {
    if (!existsSync(resolve(r))) {
      console.error(`no encuentro ${r}`);
      process.exit(1);
    }
    arenas.push(JSON.parse(readFileSync(resolve(r), "utf8")) as Arena);
  }
  const paladar = agregaPaladar(arenas);
  const resumen = resumenPaladar(paladar);
  if (!resumen.length) {
    console.log("todavía no hay catas limpias que enseñen nada");
    process.exit(0);
  }
  console.log("— el paladar —");
  for (const c of resumen) {
    console.log(`${c.categoria}:`);
    for (const m of c.motores) {
      console.log(`  ${m.motor}: ${m.ganadas}/${m.catas} catas (${(m.tasa * 100).toFixed(0)} %)`);
    }
    const p = c.propuesta ?? proponePaladar(paladar, c.categoria);
    console.log(
      p
        ? `  → para «${c.categoria}», tu cata dice ${p.motor} (${p.ganadas}/${p.catas})`
        : "  → todavía no hay paladar (hacen falta catas, o la tasa no pasa la mitad)"
    );
  }
  process.exit(0);
}

if (comando === "verificar") {
  const ruta = resto.find((r) => !r.startsWith("--"));
  const huella = arg("--huella");
  if (!ruta || !huella) {
    uso();
    process.exit(2);
  }
  const doc = JSON.parse(readFileSync(resolve(ruta), "utf8")) as Arena;
  const vista = vistaCiega(doc);
  const misma = mismaHuella(vista.huella, huella);
  console.log(
    misma
      ? `✓ la huella coincide: el documento es el que te enseñaron`
      : `✗ la huella NO coincide: el documento cambió después de la cata`
  );
  process.exit(misma ? 0 : 1);
}

uso();
process.exit(2);
