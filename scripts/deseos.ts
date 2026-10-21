/**
 * deseos — la lista de deseos de la tienda, juzgada.
 *   npm run deseos -- <deseos.json> [--json]
 *
 * Lo que guardas en tu X son deseos: «esto le falta a Esme». Y un deseo
 * cumplido dice con qué módulo se cumplió — y ese módulo tiene que estar en
 * la tienda (si no, el deseo miente).
 *
 * El script también dice qué está pidiendo la gente (la demanda escrita): lo
 * que hay que construir.
 *
 * Referencia: core/tienda/deseos.ts, estandar/deseo.spec.yaml.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { juzgaDeseos, demanda } from "../core/tienda/deseos.ts";

const raizKit = resolve(import.meta.dirname, "..");

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const ruta = arg("--deseos") ?? process.argv[2];
  if (!ruta || ruta.startsWith("--")) {
    console.error("uso: npm run deseos -- <deseos.json> [--json]");
    process.exit(2);
  }
  if (!existsSync(resolve(ruta))) {
    console.error(`no encuentro la lista: ${ruta}`);
    process.exit(1);
  }

  // los módulos que hay en la tienda (para comprobar los deseos «hecho»)
  let modulos: string[] = [];
  const indice = join(raizKit, "tienda", "index.json");
  try {
    const idx = JSON.parse(readFileSync(indice, "utf8")) as { modulos?: Array<{ id: string }> };
    modulos = (idx.modulos ?? []).map((m) => m.id);
  } catch {
    // sin índice, se juzga sin comprobar los módulos publicados
  }

  const v = juzgaDeseos(JSON.parse(readFileSync(resolve(ruta), "utf8")), modulos);

  if (tiene("--json")) {
    console.log(JSON.stringify({ ...v, demanda: demanda(v.deseos) }, null, 2));
  } else {
    console.log(`deseos : ${v.deseos.length}`);
    for (const d of v.deseos) {
      console.log(
        `  ${d.estado.padEnd(10)} ${d.autor.padEnd(14)} ${d.texto.slice(0, 60)}${d.modulo ? ` → ${d.modulo}` : ""}`
      );
    }
    const pide = demanda(v.deseos);
    if (Object.keys(pide).length) {
      console.log("");
      console.log("lo que pide la gente:");
      for (const [etiqueta, n] of Object.entries(pide)) console.log(`  ${etiqueta.padEnd(16)} ${n}`);
    }
    for (const e of v.errores) console.log(`  ✗ ${e}`);
  }
  process.exit(v.ok ? 0 : 1);
}
