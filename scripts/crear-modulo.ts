/**
 * crear-modulo — la línea de comandos del constructor.
 *   npm run crear:modulo -- --id esme.tu.slug --nombre "Mi módulo" \
 *        [--categoria tool] [--permisos mind:read,mind:write] [--dir <ruta>]
 *
 * Por qué esto es tan poco: el constructor vive en `tienda/crea.ts`, porque
 * la puerta de entrada de la era es PUBLICABLE (un tercero que instala el kit
 * tiene que poder crear su módulo sin el repo). Este fichero es sólo la ropa
 * de la terminal: la misma puerta, llamada desde el comando.
 *
 * Referencia: docs/ENTRADA.md, tienda/crea.ts.
 */
import { CATEGORIES, type Category } from "../core/ipc/module-schema.ts";
import { CAPABILITIES, type Capability } from "../core/extension-host/capability.ts";
import { raizDelPaquete } from "../core/paquete.ts";
import { creaModulo, type OpcionesCrear } from "../tienda/crea.ts";
import { verificaModulo, renderVerificacion } from "../tienda/verifica.ts";

export { creaModulo };
export type { OpcionesCrear };

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const raizKit = raizDelPaquete();

  const id = arg("--id") ?? "";
  const nombre = arg("--nombre") ?? arg("--name") ?? "";
  if (!id || !nombre) {
    console.error(
      "uso: npm run crear:modulo -- --id esme.tu.slug --nombre \"Mi módulo\" [--categoria tool] [--permisos mind:read,mind:write] [--dir <ruta>]"
    );
    process.exit(2);
  }
  const cat = arg("--categoria");
  if (cat && !CATEGORIES.includes(cat as Category)) {
    console.error(`categoría desconocida: ${cat} (valen: ${CATEGORIES.join(", ")})`);
    process.exit(2);
  }
  // sin --permisos, cada categoría pide lo que necesita (el manifiesto lo
  // decide); con --permisos, manda quien lo dice.
  const argPermisos = arg("--permisos");
  const permisos = argPermisos
    ? argPermisos.split(",").map((p) => p.trim()).filter(Boolean)
    : [];
  for (const p of permisos) {
    if (!CAPABILITIES.includes(p as Capability)) {
      console.error(`permiso desconocido: ${p} (valen: ${CAPABILITIES.join(", ")})`);
      process.exit(2);
    }
  }

  const opcion: OpcionesCrear = {
    id,
    nombre,
    categoria: (cat as Category) ?? "tool",
    ...(argPermisos ? { permisos: permisos as Capability[] } : {}),
    dir: arg("--dir") ?? undefined,
  };

  const { dir, creado } = await creaModulo(opcion, raizKit);
  if (!creado) {
    console.error(`ya existe ${dir} — no se pisa el trabajo de nadie`);
    process.exit(1);
  }
  console.log(`módulo : ${dir}`);

  // nace juzgado: se verifica de verdad, y se dice lo que diga el juez.
  const resultado = await verificaModulo(dir);
  console.log(renderVerificacion(resultado));
  process.exit(resultado.veredicto?.entra ? 0 : 1);
}
