/**
 * LOS RANGOS DE VERSIÓN — lo justo, y nada raro.
 *
 * Una plantilla fija cada paquete que usa por su HUELLA (los bytes exactos)
 * y dice, con un rango, qué versiones habría aceptado. El rango no elige
 * nada: comprueba que la huella fijada es de una versión que el autor
 * quería. Por eso basta con lo que se escribe a mano en un `uses`:
 *
 *   `*`  ·  `1.2.3` / `=1.2.3`  ·  `1` / `1.2` (esa serie)  ·
 *   `^1.2` (compatible, como npm)  ·  `~1.2.3` (parches)  ·  `>=1.2`
 *
 * Fuera: prereleases, `||`, rangos con espacios. Si un día hacen falta,
 * entran con su prueba. La comparación de dos versiones es la de la casa
 * (`core/modulos/actualiza.ts`): no hay dos reglas.
 *
 * Referencia: estandar/paquete.spec.yaml.
 */
import { comparaVersiones } from "../modulos/actualiza.ts";

/** Semver estricto, como el manifiesto v1. */
const VERSION = /^\d+\.\d+\.\d+$/;
/** Lo que se puede escribir en un `uses`. */
const RANGO = /^(?:\*|(=|\^|~|>=)?(\d+)(?:\.(\d+))?(?:\.(\d+))?)$/;

/** ¿Es una versión (semver estricto)? */
export const esVersion = (v: string): boolean => VERSION.test(v);

/** ¿Es un rango que la spec admite? */
export const esRango = (r: string): boolean => RANGO.test(r);

/** ¿Esta versión entra en el rango? (Una versión o un rango mal escritos: no.) */
export function cumple(version: string, rango: string): boolean {
  if (!esVersion(version)) return false;
  const m = RANGO.exec(rango);
  if (!m) return false;
  if (rango === "*") return true;
  const op = m[1] ?? "";
  const mayor = Number(m[2]);
  const menor = m[3] === undefined ? null : Number(m[3]);
  const parche = m[4] === undefined ? null : Number(m[4]);
  const base = `${mayor}.${menor ?? 0}.${parche ?? 0}`;
  if (comparaVersiones(version, base) < 0) return false;
  if (op === ">=") return true;

  // el techo (exclusivo) de cada forma
  let techo: string;
  if (op === "^") {
    if (mayor > 0 || menor === null) techo = `${mayor + 1}.0.0`;
    else if (menor > 0 || parche === null) techo = `0.${menor + 1}.0`;
    else techo = `0.0.${parche + 1}`;
  } else if (op === "~") {
    techo = menor === null ? `${mayor + 1}.0.0` : `${mayor}.${menor + 1}.0`;
  } else {
    // sin operador o con «=»: la versión entera es exacta; una parcial es su serie
    if (menor !== null && parche !== null) return comparaVersiones(version, base) === 0;
    techo = menor === null ? `${mayor + 1}.0.0` : `${mayor}.${menor + 1}.0`;
  }
  return comparaVersiones(version, techo) < 0;
}
