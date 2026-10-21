/**
 * equipo — un equipo de agentes, con su presupuesto repartido.
 *   npm run equipo -- <equipo.json> [--json]
 *
 * Lo que hace: juzga la receta del equipo (un arquitecto, sus trabajadores y
 * un presupuesto repartido) y dice cuánto lleva cada quien, y si el equipo
 * entero se pasa de su cap.
 *
 * Referencia: core/equipo.ts, estandar/equipo.spec.yaml.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { validaEquipo } from "../core/equipo.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const ruta = arg("--equipo") ?? process.argv[2];
  if (!ruta || ruta.startsWith("--")) {
    console.error("uso: npm run equipo -- <equipo.json> [--json]");
    process.exit(2);
  }
  if (!existsSync(resolve(ruta))) {
    console.error(`no encuentro el equipo: ${ruta}`);
    process.exit(1);
  }
  const v = validaEquipo(JSON.parse(readFileSync(resolve(ruta), "utf8")));

  if (tiene("--json")) console.log(JSON.stringify(v, null, 2));
  else {
    console.log(`equipo : ${v.equipo?.nombre ?? "?"} (${v.equipo?.id ?? "?"})`);
    console.log(`miembros: ${v.equipo?.miembros.length ?? 0} · total ${v.total_tokens} tokens · cap ${v.equipo?.cap.tokens ?? 0}`);
    for (const r of v.reparto) {
      console.log(`  ${r.rol.padEnd(12)} ${r.motor.padEnd(12)} ${String(r.tokens).padStart(8)} tokens`);
    }
    console.log(`veredicto: ${v.ok ? "ENTRA" : "FUERA"}`);
    for (const e of v.errores) console.log(`  ✗ ${e}`);
  }
  process.exit(v.ok ? 0 : 1);
}
