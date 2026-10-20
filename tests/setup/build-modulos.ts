/**
 * globalSetup: los módulos de ejemplo se CONSTRUYEN antes de los tests.
 *
 * Sin esto, los tests que abren un host dependen de un `dist/` que no está en
 * el repo (`dist/` está en .gitignore) y en un clon recién hecho nadie ha
 * construido todavía: el test se cae por un fichero que nadie ha pedido.
 *
 * Los flags salen de scripts/construir-modulos.ts (un solo sitio): los tests,
 * el CI y la publicación tienen que producir los mismos bytes.
 * Referencia: tests/extension-host.test.ts, tests/mind-ops.test.ts.
 */
import { construyeTodos } from "../../scripts/construir-modulos.ts";

export default async function construyeModulos(): Promise<void> {
  await construyeTodos();
}
