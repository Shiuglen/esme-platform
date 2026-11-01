/**
 * globalSetup: los módulos de la casa se CONSTRUYEN antes de los tests.
 *
 * Sin esto, los tests que abren un host dependen de un `dist/` que no está en
 * el repo (`dist/` está en .gitignore) y en un clon recién hecho nadie ha
 * construido todavía: el test se cae por un fichero que nadie ha pedido.
 *
 * Se construyen TODOS los de `modulos/`, no solo los tres que la tienda
 * publica: `tests/programas.test.ts` abre `ejemplo-rea`, y `spec:lint` (que la
 * release corre justo después de `npm test`) mira la entrada de cada módulo.
 *
 * Los flags salen de tienda/construye.ts (un solo sitio): los tests, el CI y
 * la publicación tienen que producir los mismos bytes.
 * Referencia: tests/extension-host.test.ts, tests/mind-ops.test.ts.
 */
import { construyeTodosLosModulos } from "../../tienda/construye.ts";

export default async function construyeModulos(): Promise<void> {
  await construyeTodosLosModulos();
}
