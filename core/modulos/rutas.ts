/**
 * LAS RUTAS QUE NO SE ESCAPAN.
 *
 * Dos confines, la misma idea:
 *   - la ENTRADA de un módulo se queda dentro de su carpeta;
 *   - el DISCO de `fs:project` se queda dentro del proyecto.
 *
 * La comparación es por SEGMENTOS, no por prefijo de texto: `/tmp/ab` no es
 * hijo de `/tmp/a` (con un prefijo de texto, lo sería, y eso sería una
 * puerta de atrás).
 *
 * Referencia: core/extension-host/host.ts, tienda/modulo-manifiesto.ts.
 */
import { resolve, isAbsolute, sep } from "node:path";

/** Una ruta confinada, o el motivo por el que no se puede confinar. */
export type Confinada = { ruta: string } | { error: string };

/**
 * La entrada de un módulo, dentro de SU carpeta. Siempre.
 *
 * Un manifiesto firmado por alguien que no es de fiar puede pedir
 * `entry: "../../../etc/passwd"`. La firma no lo vuelve bueno: la entrada se
 * queda dentro de la carpeta del módulo.
 */
export function confinaEntrada(dirModulo: string, entry: string): Confinada {
  if (isAbsolute(entry)) return { error: `entry absoluta no permitida: ${entry}` };
  const base = resolve(dirModulo);
  const ruta = resolve(base, entry);
  if (ruta !== base && !ruta.startsWith(base + sep)) {
    return { error: `entry fuera de la carpeta del módulo: ${entry}` };
  }
  return { ruta };
}

/**
 * Una ruta dentro de la raíz. Ni `..` ni rutas absolutas se escapan.
 */
export function confinaRuta(raiz: string, ruta: string): Confinada {
  const base = resolve(raiz);
  const destino = resolve(base, ruta);
  if (destino === base) return { ruta: destino };
  if (!destino.startsWith(base + sep)) {
    return { error: `ruta fuera del proyecto: ${ruta}` };
  }
  return { ruta: destino };
}
