/**
 * turno — la limpieza de un turno, en un número.
 *   npm run turno -- <turno.json> [--json]
 *
 * «Los pasos se pliegan, el chat queda limpio» es una regla de la casa, y
 * una regla que no se mide no se cumple: aquí sale el porcentaje de lo que la
 * persona lee que es la RESPUESTA (y no los pasos de las herramientas).
 *
 * Con un listón: por debajo del 60 %, el chat se ensució.
 *
 * Referencia: core/turno.ts, estandar/turno.spec.yaml.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  erroresTurno,
  limpiezaDelTurno,
  pesoDeLaActividad,
  resumenTurno,
  turnoLimpio,
  LIMPIEZA_MINIMA,
  type Turno,
} from "../core/turno.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const ruta = arg("--turno") ?? process.argv[2];
  if (!ruta || ruta.startsWith("--")) {
    console.error("uso: npm run turno -- <turno.json> [--json]");
    process.exit(2);
  }
  if (!existsSync(resolve(ruta))) {
    console.error(`no encuentro el turno: ${ruta}`);
    process.exit(1);
  }
  const turno = JSON.parse(readFileSync(resolve(ruta), "utf8")) as Turno;
  const limpieza = limpiezaDelTurno(turno);
  const errores = erroresTurno(turno);

  if (tiene("--json")) {
    console.log(JSON.stringify({ limpieza, limpio: turnoLimpio(turno), errores }, null, 2));
  } else {
    console.log(resumenTurno(turno));
    console.log(`limpieza : ${Math.round(limpieza * 100)}% (listón ${Math.round(LIMPIEZA_MINIMA * 100)}%)`);
    console.log(`trabajo  : ${pesoDeLaActividad(turno).toFixed(1)}× la respuesta`);
    for (const e of errores) console.log(`  ✗ ${e}`);
  }
  process.exit(turnoLimpio(turno) && !errores.length ? 0 : 1);
}
