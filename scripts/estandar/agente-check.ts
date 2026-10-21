/**
 * agente-check — ¿esta receta de agente puede entrar en la tienda?
 *   npm run agente:check -- <agente.json> [--json]
 *
 * El tercer producto de la tienda con forma propia: una piel (un documento),
 * una herramienta (un módulo) y un AGENTE (una receta: motor + encargo +
 * presupuesto + memoria).
 *
 * Lo que comprueba: la forma, que el motor exista en la spec de motores, que
 * la memoria sea posible (los motores que no hablan MCP no pueden prometerla)
 * y que el presupuesto tenga techo. Un agente sin límite es un agujero de
 * tokens.
 *
 * Referencia: estandar/agente.spec.yaml, tienda/agente.ts.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { cargaMotorCached } from "../../motores/laya-adapter.ts";
import { validaAgente, type VeredictoAgente } from "../../tienda/agente.ts";

const raizKit = resolve(import.meta.dirname, "..", "..");

/** La spec de motores (la casa). */
export function motoresDe(ruta?: string) {
  return cargaMotorCached(ruta ?? join(raizKit, "estandar", "motor-capability.spec.yaml"));
}

/** El juez: una receta, con su veredicto. */
export function juzgaAgente(x: unknown, idEsperado?: string): VeredictoAgente {
  return validaAgente(x, motoresDe(), idEsperado);
}

/**
 * El juez sobre el MÓDULO: un módulo de categoría `agent` tiene que traer su
 * receta (`agente.json`).
 */
export function juzgaAgenteDeModulo(dirModulo: string, categoria: string): VeredictoAgente {
  const dir = resolve(dirModulo);
  if (categoria !== "agent") {
    return { ok: true, agente: null, errores: [] };
  }
  const ruta = join(dir, "agente.json");
  if (!existsSync(ruta)) {
    return {
      ok: false,
      agente: null,
      errores: ["es un módulo de agente y no trae agente.json (un agente es una receta, no una promesa)"],
    };
  }
  try {
    return juzgaAgente(JSON.parse(readFileSync(ruta, "utf8")));
  } catch (e) {
    return {
      ok: false,
      agente: null,
      errores: [`la receta no se puede leer: ${String((e as Error)?.message || e)}`],
    };
  }
}

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
