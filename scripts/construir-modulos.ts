/**
 * construir — los módulos se construyen SIEMPRE igual.
 *
 * Un solo sitio decide los flags de esbuild. Los tests, el CI y la publicación
 * tienen que producir los MISMOS bytes: si el tarball publicado sale de un
 * build y el repo se construye de otra forma, la tienda deja de cuadrar con
 * el código que la firma (y "reproducible" es una promesa, no un adorno).
 *
 * Referencia: modulos/*, tienda/empaque.ts, tests/setup/build-modulos.ts.
 */
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MODULOS = [
  "modulos/ejemplo-hola-mundo",
  "modulos/ejemplo-troceo-pro",
  "modulos/ejemplo-puerta",
];

export const raizKit = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Construye un módulo y devuelve la ruta de su dist. */
export async function construyeModulo(modulo: string, raiz = raizKit): Promise<string> {
  const salida = resolve(raiz, modulo, "dist/index.js");
  await build({
    entryPoints: [resolve(raiz, modulo, "src/index.ts")],
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

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const salidas = await construyeTodos();
  for (const s of salidas) console.log(`✓ construido ${s}`);
}
