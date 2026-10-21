/**
 * ejecutar — un turno de verdad, medido.
 *   npm run ejecutar -- <carpeta-del-módulo> "<consulta>" [--motor opencode] [--modo estandar]
 *
 * Abre el módulo con su cápsula y su puerta, le hace la consulta, y mide lo
 * que pasó: los tokens, los ficheros que tocó, la limpieza del chat y los
 * permisos que se le montaron (lo CONCEDIDO, no lo pedido).
 *
 * Referencia: core/turnos/ejecuta.ts, core/turnos/turno.ts.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ejecutaTurno } from "../core/turnos/ejecuta.ts";
import { programasDeLaCasa } from "../core/modulos/programas.ts";
import type { ModoContexto } from "../core/talamus/modos.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const dir = arg("--dir") ?? process.argv[2];
  const consulta = arg("--consulta") ?? (process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "");
  if (!dir || dir.startsWith("--") || !consulta) {
    console.error(
      'uso: npm run ejecutar -- <carpeta-del-módulo> "<consulta>" [--motor opencode] [--modo estandar] [--json]'
    );
    process.exit(2);
  }
  if (!existsSync(resolve(dir))) {
    console.error(`no encuentro el módulo: ${dir}`);
    process.exit(1);
  }

  const r = await ejecutaTurno({
    dirModulo: resolve(dir),
    consulta,
    motor: arg("--motor") ?? undefined,
    modo: (arg("--modo") as ModoContexto) ?? undefined,
    programas: programasDeLaCasa(),
  });

  if (tiene("--json")) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`turno    : ${r.turno.id}`);
    console.log(`respuesta: ${r.turno.respuesta.slice(0, 200)}`);
    console.log(`tokens   : ${r.turno.tokens.total} (respuesta ${r.turno.tokens.respuesta} · actividad ${r.turno.tokens.actividad})`);
    console.log(`limpieza : ${Math.round(r.limpieza * 100)}%`);
    console.log(`permisos : montados [${r.concedidos.join(", ") || "nada"}]${r.pendientes.length ? ` · pendientes [${r.pendientes.join(", ")}]` : ""}`);
    if (r.cambios.ficheros.length) {
      console.log("cambios  :");
      for (const f of r.cambios.ficheros) {
        console.log(`  ${f.ruta} (+${f.anadidos ?? "?"} -${f.borrados ?? "?"})`);
      }
    } else {
      console.log("cambios  : nada");
    }
    if (r.error) console.log(`error    : ${r.error}`);
  }
  process.exit(r.error ? 1 : 0);
}
