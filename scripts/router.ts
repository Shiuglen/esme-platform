/**
 * router — lo que el router aprendió de tus veredictos.
 *   npm run router -- <registro.jsonl> [--json]
 *
 * El registro (laya.jsonl) guarda cada decisión del router: la tarea, el
 * motor que eligió, su confianza y su razonamiento. Cuando tú apruebas o
 * corriges esa decisión, se anota tu veredicto — y de ahí se aprende la
 * tabla «este tipo de tarea va a este motor».
 *
 * Aquí se ve: la tabla, cuántas decisiones hubo, cuántas con veredicto, y la
 * CONCORDANCIA (de las decisiones con veredicto, ¿cuántas ratificaste?).
 *
 * Referencia: core/router/aprende.ts, docs/LAYA.md.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { aprendeDe, leeRegistro } from "../core/router/aprende.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const ruta = arg("--registro") ?? process.argv[2];
  if (!ruta || ruta.startsWith("--")) {
    console.error("uso: npm run router -- <registro.jsonl> [--json]");
    process.exit(2);
  }
  if (!existsSync(resolve(ruta))) {
    console.error(`no encuentro el registro: ${ruta}`);
    process.exit(1);
  }
  const registro = leeRegistro(readFileSync(resolve(ruta), "utf8"));
  const a = aprendeDe(registro);

  if (tiene("--json")) console.log(JSON.stringify(a, null, 2));
  else {
    console.log(`decisiones : ${a.decisiones} · con veredicto ${a.veredictos} · correcciones ${a.correcciones}`);
    console.log(`concordancia: ${(a.concordancia * 100).toFixed(1)}% (lo que ratificaste de lo que eligió el router)`);
    console.log(`aprendido   : ${Object.keys(a.tabla).length} tareas con motor conocido`);
    for (const [firma, motor] of Object.entries(a.tabla)) {
      console.log(`  ${firma} → ${motor}`);
    }
  }
  process.exit(0);
}
