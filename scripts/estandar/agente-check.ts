/**
 * agente-check — la línea de comandos del juez de los agentes.
 *   npm run agente:check -- <agente.json> [--json]
 *
 * Por qué esto es tan poco: el juez de un agente vive en `tienda/agente.ts`
 * (junto a la spec que juzga), porque el módulo que trae una receta lo
 * verifica al entrar. Este fichero es sólo la ropa de la terminal: la misma
 * puerta, llamada desde el comando.
 *
 * Referencia: estandar/agente.spec.yaml, tienda/agente.ts, docs/TIENDA.md.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { juzgaAgente, motoresDe, type VeredictoAgente } from "../../tienda/agente.ts";

export { juzgaAgente, motoresDe };
export type { VeredictoAgente };

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const ruta = arg("--agente") ?? process.argv[2];
  if (!ruta || ruta.startsWith("--")) {
    console.error("uso: npm run agente:check -- <agente.json> [--json]");
    process.exit(2);
  }
  let x: unknown;
  try {
    x = JSON.parse(readFileSync(resolve(ruta), "utf8"));
  } catch (e) {
    console.error(`la receta no se puede leer: ${String((e as Error)?.message || e)}`);
    process.exit(1);
  }
  const r = juzgaAgente(x);
  if (tiene("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`agente : ${r.agente?.nombre ?? "?"}`);
    console.log(`motor  : ${r.agente?.motor ?? "?"}`);
    console.log(`veredicto: ${r.ok ? "ENTRA" : "FUERA"}`);
    for (const e of r.errores) console.log(`  ✗ ${e}`);
  }
  process.exit(r.ok ? 0 : 1);
}
