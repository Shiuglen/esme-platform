/**
 * LA RAÍZ DEL PAQUETE — un solo sitio sabe dónde está la casa.
 *
 * Por qué este fichero existe. La casa guarda cosas relativas a su propia
 * raíz: los contratos (`estandar/`), la raíz de confianza
 * (`tienda/raiz.pub.pem`), el índice firmado, el libro de rotaciones. Cada
 * uno de esos se buscaba con `resolve(import.meta.dirname, "..")`, y eso
 * funciona SOLO en el layout del repo (código fuente).
 *
 * En cuanto el kit se compila a `dist/`, la misma cuenta da `dist/`:
 * `dist/core/tienda/deseos.js` subiendo dos niveles llega a `dist/`, donde no
 * hay `estandar/`. El resultado no es un error ruidoso: es un **silencio**.
 * La raíz de confianza no se encuentra (nada se verifica, nada se instala) y
 * los contratos no se ven (un deseo puede «cumplirse» con una spec que nadie
 * escribió). Un paquete publicado que finge funcionar es peor que uno que
 * no funciona.
 *
 * La regla: **la raíz se busca por el nombre, no por la cuenta de niveles**.
 * Se sube desde este fichero hasta encontrar el `package.json` que dice
 * `esme-platform`. Da igual si el código está en `core/` (fuente) o en
 * `dist/core/` (compilado), y da igual dónde se instale (el repo, o
 * `node_modules/`): el nombre es el ancla, no la profundidad.
 *
 * Referencia: docs/MODULOS.md, core/tienda/deseos.ts, tienda/raiz.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** El nombre del paquete: el ancla de la casa. */
export const NOMBRE_PAQUETE = "esme-platform";

/**
 * La raíz del kit: la carpeta que contiene su `package.json`.
 *
 * Sube desde `desde` (por defecto, desde este mismo fichero) hasta dar con
 * el `package.json` del kit. Si no lo encuentra, **lo dice**: una raíz que no
 * se sabe no es una raíz, y devolver un sitio cualquiera sería volver a
 * esconder el fallo.
 */
export function raizDelPaquete(desde: string = import.meta.dirname): string {
  let dir = resolve(desde);
  for (;;) {
    const candidato = join(dir, "package.json");
    if (existsSync(candidato)) {
      try {
        const pkg = JSON.parse(readFileSync(candidato, "utf8")) as { name?: unknown };
        if (pkg.name === NOMBRE_PAQUETE) return dir;
      } catch {
        // un package.json ilegible no es el nuestro: se sigue subiendo
      }
    }
    const padre = dirname(dir);
    if (padre === dir) break;
    dir = padre;
  }
  throw new Error(
    `no encuentro la raíz del kit (ningún package.json dice «${NOMBRE_PAQUETE}» subiendo desde ${desde})`
  );
}

/**
 * La raíz del kit, o `null` si no se encuentra.
 *
 * Para las preguntas honestas («¿esta copia trae raíz de confianza?»): si
 * no hay kit, la respuesta es que no, no una excepción.
 */
export function raizDelPaqueteSiExiste(desde: string = import.meta.dirname): string | null {
  try {
    return raizDelPaquete(desde);
  } catch {
    return null;
  }
}

/**
 * Una ruta dentro del kit.
 *
 * Es `join(raizDelPaquete(), ...)`, pero sin repetir la cuenta de niveles en
 * cada sitio: el que llama dice QUÉ quiere, no DÓNDE está.
 */
export function rutaDelPaquete(...partes: string[]): string {
  return join(raizDelPaquete(), ...partes);
}
