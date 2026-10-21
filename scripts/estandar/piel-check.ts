/**
 * piel-check — ¿esta piel puede entrar en la tienda?
 *   npm run piel:check -- <piel.json> [--json]
 *
 * El guard de la identidad. La arquitectura (§12) dice que «la estética ES el
 * producto, no skinneable», y el mecanismo que lo protege es un juez: una
 * piel que trae una opción que no existe, o que no se lee, no entra.
 *
 * Lo que comprueba (todo lo que dice estandar/piel.spec.yaml):
 *
 *   1. la FORMA: los campos son los que la spec dice, y las opciones están
 *      en la lista cerrada (una piel no inventa: «aproximar» no es una opción);
 *   2. la LECTURA: el texto contrasta con el fondo y con la superficie, de
 *      día y de noche (WCAG AA). Una piel que nadie lee no es una piel;
 *   3. lo que falta se hereda de la base (Tinta y Luz) — por eso una piel
 *      puede ser sólo un color.
 *
 * Referencia: estandar/piel.spec.yaml, tienda/piel.ts, docs/TIENDA.md.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { cargaSpecPiel, validaPiel, type SpecPiel } from "../../tienda/piel.ts";

const raizKit = resolve(import.meta.dirname, "..", "..");

export interface ResultadoPiel {
  /** ¿La piel es válida? */
  ok: boolean;
  /** Los errores (qué arreglar). */
  errores: string[];
  /** La piel completa (con lo heredado de la base). */
  piel: unknown;
  /** La ruta de la spec usada. */
  spec: string;
}

/** La spec de la piel (la de la casa, si no se dice otra). */
export function specDe(ruta?: string): SpecPiel {
  return cargaSpecPiel(ruta ?? join(raizKit, "estandar", "piel.spec.yaml"));
}

/** Juzga una piel (el objeto ya leído). */
export function juzgaPiel(x: unknown, spec?: SpecPiel): ResultadoPiel {
  const s = spec ?? specDe();
  const { piel, errores } = validaPiel(x, s);
  return { ok: errores.length === 0, errores, piel, spec: "estandar/piel.spec.yaml" };
}

/**
 * Juzga la piel de un MÓDULO.
 *
 * Un módulo de categoría `theme` tiene que traer su piel (`piel.json`): sin
 * ella, el tema no es un tema (es una promesa).
 */
export function juzgaPielDeModulo(
  dirModulo: string,
  categoria: string,
  spec?: SpecPiel
): ResultadoPiel {
  const dir = resolve(dirModulo);
  if (categoria !== "theme") {
    return { ok: true, errores: [], piel: null, spec: "estandar/piel.spec.yaml" };
  }
  const ruta = join(dir, "piel.json");
  if (!existsSync(ruta)) {
    return {
      ok: false,
      errores: ["es un módulo de tema y no trae piel.json (la piel es un documento, no una promesa)"],
      piel: null,
      spec: "estandar/piel.spec.yaml",
    };
  }
  try {
    return juzgaPiel(JSON.parse(readFileSync(ruta, "utf8")), spec);
  } catch (e) {
    return {
      ok: false,
      errores: [`la piel no se puede leer: ${String((e as Error)?.message || e)}`],
      piel: null,
      spec: "estandar/piel.spec.yaml",
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
