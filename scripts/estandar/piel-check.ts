/**
 * piel-check — la línea de comandos del juez de las pieles.
 *   npm run piel:check -- <piel.json> [--json]
 *
 * Por qué esto es tan poco: el juez de una piel vive en `tienda/piel.ts`
 * (junto a la spec que juzga), porque el módulo que trae una piel lo
 * verifica al entrar. Este fichero es sólo la ropa de la terminal: la misma
 * puerta, llamada desde el comando.
 *
 * Referencia: estandar/piel.spec.yaml, tienda/piel.ts, docs/TIENDA.md.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { juzgaPiel, specDe, type ResultadoPiel } from "../../tienda/piel.ts";

export { juzgaPiel, specDe };
export type { ResultadoPiel };

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const ruta = arg("--piel") ?? process.argv[2];
  if (!ruta || ruta.startsWith("--")) {
    console.error("uso: npm run piel:check -- <piel.json> [--json]");
    process.exit(2);
  }
  let x: unknown;
  try {
    x = JSON.parse(readFileSync(resolve(ruta), "utf8"));
  } catch (e) {
    console.error(`la piel no se puede leer: ${String((e as Error)?.message || e)}`);
    process.exit(1);
  }
  const r = juzgaPiel(x);
  if (tiene("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`piel   : ${(r.piel as { nombre?: string })?.nombre ?? "?"}`);
    console.log(`veredicto: ${r.ok ? "ENTRA" : "FUERA"}`);
    for (const e of r.errores) console.log(`  ✗ ${e}`);
  }
  process.exit(r.ok ? 0 : 1);
}
