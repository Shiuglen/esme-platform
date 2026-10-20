/**
 * La raíz de confianza: la clave que el consumidor CONGELA.
 *
 * Viaja en el repo (es una clave pública: no hay nada que esconder) y es el
 * ancla de toda la estirpe: el índice y los artefactos los firma la llave
 * VIVA, pero la cadena de rotaciones demuestra que esa llave viene de esta.
 *
 * Por qué existe: la clave de desarrollo (`.keys/index-dev.pem`) es de quien
 * PUBLICA, y no viaja. Sin un ancla en el repo, un clon recién hecho no tiene
 * con quién verificar nada — y el que verifica no debería necesitar la
 * privada de nadie.
 *
 * Referencia: docs/TIENDA.md (la tienda), tienda/rotacion.ts (la estirpe).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const NOMBRE_RAIZ = "raiz.pub.pem";

/** La raíz congelada del repo, o null si este repo no la trae. */
export function leeRaiz(raiz?: string): string | null {
  const base = raiz ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const ruta = join(base, "tienda", NOMBRE_RAIZ);
  if (!existsSync(ruta)) return null;
  const pem = readFileSync(ruta, "utf8").trim();
  return pem || null;
}
