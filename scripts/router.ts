/**
 * router — lo que el router aprendió de tus veredictos (y de tus catas).
 *   npm run router -- <registro.jsonl> [--arenas <carpeta>] [--tarea "..."] [--json]
 *
 * El registro (laya.jsonl) guarda cada decisión del router: la tarea, el
 * motor que eligió, su confianza y su razonamiento. Cuando tú apruebas o
 * corriges esa decisión, se anota tu veredicto — y de ahí se aprende la
 * tabla «este tipo de tarea va a este motor».
 *
 * Y con `--arenas` se le dan las CATAS (las arenas reveladas): de ahí sale el
 * PALADAR — lo que tu gusto medido dice por categoría («para pruebas, tu
 * cata dice Qwen»). El palate es la segunda memoria: va detrás de tu
 * veredicto exacto, y delante de la suposición del router.
 *
 * Aquí se ve: la tabla, cuántas decisiones hubo, cuántas con veredicto, la
 * CONCORDANCIA (de las decisiones con veredicto, ¿cuántas ratificaste?), el
 * paladar, y —si preguntas por una tarea— qué motor saldría y por qué.
 *
 * Referencia: core/router/aprende.ts, core/arena/paladar.ts, docs/LAYA.md.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { aprendeDe, eligeConAprendido, leeRegistro } from "../core/router/aprende.ts";
import { categoriaDe } from "../core/arena/paladar.ts";
import { leeArenas, type Arena } from "../core/arena/arena.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
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
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const ruta = arg("--registro") ?? process.argv[2];
  if (!ruta || ruta.startsWith("--")) {
    console.error("uso: npm run router -- <registro.jsonl> [--arenas <carpeta>] [--tarea \"...\"]");
    process.exit(2);
  }
  if (!existsSync(resolve(ruta))) {
    console.error(`no encuentro el registro: ${ruta}`);
    process.exit(1);
  }

  // las arenas: una carpeta de documentos, o ficheros sueltos
  const arenas: Arena[] = [];
  for (const dir of todos("--arenas")) {
    const absoluta = resolve(dir);
    if (!existsSync(absoluta)) {
      console.error(`no encuentro las arenas: ${dir}`);
      process.exit(1);
    }
    const ficheros = statSync(absoluta).isDirectory()
      ? readdirSync(absoluta)
          .filter((f) => f.endsWith(".json"))
          .map((f) => join(absoluta, f))
      : [absoluta];
    for (const f of ficheros) {
      const leidas = leeArenas(readFileSync(f, "utf8"));
      if (!leidas.length) console.error(`«${f}» no trae ninguna arena (se salta)`);
      arenas.push(...leidas);
    }
  }

  const registro = leeRegistro(readFileSync(resolve(ruta), "utf8"));
  const a = aprendeDe(registro, arenas.length ? { arenas } : {});

  if (tiene("--json")) console.log(JSON.stringify(a, null, 2));
  else {
    console.log(`decisiones : ${a.decisiones} · con veredicto ${a.veredictos} · correcciones ${a.correcciones}`);
    console.log(`concordancia: ${(a.concordancia * 100).toFixed(1)}% (lo que ratificaste de lo que eligió el router)`);
    console.log(`aprendido   : ${Object.keys(a.tabla).length} tareas con motor conocido`);
    for (const [firma, motor] of Object.entries(a.tabla)) {
      console.log(`  ${firma} → ${motor}`);
    }
    const paladar = a.paladar ?? {};
    if (Object.keys(paladar).length) {
      console.log(`paladar     : ${Object.keys(paladar).length} categorías con cata de sobra`);
      for (const [categoria, cata] of Object.entries(paladar)) {
        console.log(`  ${categoria} → ${cata.motor} (${cata.ganadas}/${cata.catas} catas)`);
      }
    } else if (arenas.length) {
      console.log("paladar     : todavía no hay catas de sobra (hacen falta 3)");
    }
    const tarea = arg("--tarea");
    if (tarea) {
      const categoria = categoriaDe(tarea);
      const eleccion = eligeConAprendido(tarea, a, () => "laya", categoria);
      console.log("");
      console.log(`para «${tarea}» (${categoria}): ${eleccion.ruta} — de ${eleccion.de}`);
    }
  }
  process.exit(0);
}
