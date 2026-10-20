/**
 * globalSetup: los módulos de ejemplo se CONSTRUYEN antes de los tests.
 *
 * Sin esto, los tests que abren un host dependen de un `dist/` que no está en
 * el repo (`dist/` está en .gitignore) y en un clon recién hecho nadie ha
 * construido todavía: el test se cae por un fichero que nadie ha pedido.
 * Referencia: tests/extension-host.test.ts, tests/mind-ops.test.ts.
 */
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const MODULOS = ["modulos/ejemplo-hola-mundo", "modulos/ejemplo-troceo-pro"];

export default async function construyeModulos(): Promise<void> {
  for (const modulo of MODULOS) {
    await build({
      entryPoints: [resolve(raiz, modulo, "src/index.ts")],
      bundle: true,
      format: "esm",
      platform: "node",
      outfile: resolve(raiz, modulo, "dist/index.js"),
      logLevel: "silent",
    });
  }
}
