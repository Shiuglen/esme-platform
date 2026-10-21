/**
 * cambios — qué cambió entre dos versiones de una cosa.
 *   npm run cambios -- <carpeta-antes> <carpeta-despues>
 *
 * La misma medida que hace el turno: instantánea por contenido (hash), diff
 * de Myers con tope y los números que NO se saben se quedan en null (un
 * binario no tiene líneas; un diff enorme tampoco).
 *
 * Referencia: core/turno/cambios.ts, core/turno.ts.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { instantanea, compara } from "../core/turno/cambios.ts";
import { cambiosDe } from "../core/turno.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const antes = arg("--antes") ?? process.argv[2];
  const despues = arg("--despues") ?? process.argv[3];
  if (!antes || !despues || antes.startsWith("--") || despues.startsWith("--")) {
    console.error("uso: npm run cambios -- <carpeta-antes> <carpeta-despues> [--json]");
    process.exit(2);
  }
  for (const d of [antes, despues]) {
    if (!existsSync(resolve(d))) {
      console.error(`no encuentro la carpeta: ${d}`);
      process.exit(1);
    }
  }

  const a = instantanea(resolve(antes));
  const b = instantanea(resolve(despues));
  const r = compara(a, b);

  if (tiene("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    for (const c of cambiosDe(r)) {
      const a_ = c.anadidos === null ? "?" : `+${c.anadidos}`;
      const b_ = c.borrados === null ? "?" : `-${c.borrados}`;
      console.log(`  ${a_.padStart(5)} ${b_.padStart(5)}  ${c.ruta}`);
    }
    console.log("");
    console.log(
      `total    : +${r.anadidos} -${r.borrados} en ${r.ficheros.length} ficheros${r.truncado ? " (truncado: hay números que no se saben)" : ""}`
    );
  }
  process.exit(0);
}
