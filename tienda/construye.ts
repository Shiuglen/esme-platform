/**
 * construir — los módulos se construyen SIEMPRE igual.
 *
 * Un solo sitio decide los flags de esbuild. Los tests, el CI y la publicación
 * tienen que producir los MISMOS bytes: si el tarball publicado sale de un
 * build y el repo se construye de otra forma, la tienda deja de cuadrar con
 * el código que la firma (y "reproducible" es una promesa, no un adorno).
 *
 * POR QUÉ VIVE AQUÍ Y NO EN `scripts/`: porque construir un módulo es parte
 * de la PUERTA DE ENTRADA, y la puerta de entrada es publicable (un tercero
 * que instala el kit tiene que poder verificar su módulo sin el repo).
 *
 * Referencia: modulos/*, tienda/empaque.ts, tests/setup/build-modulos.ts.
 */
import { build } from "esbuild";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { raizDelPaquete } from "../core/paquete.ts";

export const MODULOS = [
  "modulos/ejemplo-hola-mundo",
  "modulos/ejemplo-troceo-pro",
  "modulos/ejemplo-puerta",
];

/**
 * La raíz de la casa.
 *
 * Se busca por el NOMBRE del paquete, no contando niveles: este fichero
 * compilado vive en `dist/tienda/`, y `resolve(dirname, "..")` daría `dist/`.
 */
export const raizKit = raizDelPaquete();

/**
 * Construye un módulo y devuelve la ruta de su dist.
 *
 * `modulo` puede ser una ruta RELATIVA al kit (`modulos/ejemplo-puerta`) o una
 * ABSOLUTA (el módulo de cualquiera, que vive fuera de la casa): en el segundo
 * caso la carpeta es la que sea, y `raiz` no se mira.
 */
export async function construyeModulo(modulo: string, raiz = raizKit): Promise<string> {
  const dir = isAbsolute(modulo) ? modulo : resolve(raiz, modulo);
  const salida = resolve(dir, "dist/index.js");
  await build({
    entryPoints: [resolve(dir, "src/index.ts")],
    bundle: true,
    format: "esm",
    platform: "node", // los módulos son de Node: sin esto, "node:fs" no resuelve
    outfile: salida,
    logLevel: "silent",
  });
  return salida;
}

export async function construyeTodos(raiz = raizKit): Promise<string[]> {
  const salidas: string[] = [];
  for (const modulo of MODULOS) salidas.push(await construyeModulo(modulo, raiz));
  return salidas;
}

/**
 * Los módulos que hay en la casa AHORA: cada carpeta de `modulos/` con un
 * `src/index.ts` dentro.
 *
 * Por qué existe: `MODULOS` es la lista PUBLICADA (los tres que la tienda
 * firma). Un módulo de cualquiera que llega en una PR también es un módulo de
 * la casa, y la CI tiene que construirlo — si no, el lint de specs lo echa por
 * no tener `dist/`, y el que llega se encuentra con un fallo que no es suyo.
 */
export function modulosDe(raiz = raizKit): string[] {
  const dir = join(raiz, "modulos");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => {
      try {
        return statSync(join(dir, d)).isDirectory();
      } catch {
        return false;
      }
    })
    .filter((d) => existsSync(join(dir, d, "src", "index.ts")))
    .map((d) => join("modulos", d));
}

/** Construye TODOS los módulos de la casa (los de ejemplo y los de cualquiera). */
export async function construyeTodosLosModulos(raiz = raizKit): Promise<string[]> {
  const salidas: string[] = [];
  for (const modulo of modulosDe(raiz)) salidas.push(await construyeModulo(modulo, raiz));
  return salidas;
}

