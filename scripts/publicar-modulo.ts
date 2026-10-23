/**
 * publicar-modulo — la línea de comandos del publicador.
 *   npm run publicar:modulo -- <carpeta-del-módulo> [--tienda <dir>] [--firma <artefacto.json>]
 *
 * Por qué esto es tan poco: el publicador vive en `tienda/publica.ts`, porque
 * la puerta de entrada de la era es PUBLICABLE (un tercero que instala el kit
 * tiene que poder publicar su módulo sin el repo). Este fichero es sólo la
 * ropa de la terminal: la misma puerta, llamada desde el comando.
 *
 * Referencia: docs/ENTRADA.md, tienda/publica.ts.
 */
import { publicaModulo, type OpcionesPublicar, type ResultadoPublicar } from "../tienda/publica.ts";

export { publicaModulo };
export type { OpcionesPublicar, ResultadoPublicar };

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const dir = arg("--dir") ?? process.argv[2];
  if (!dir || dir.startsWith("--")) {
    console.error(
      "uso: npm run publicar:modulo -- <carpeta-del-módulo> [--tienda <dir>] [--firma <artefacto.json>] [--dry]"
    );
    process.exit(2);
  }
  const r = await publicaModulo(dir, {
    tienda: arg("--tienda") ?? undefined,
    firma: arg("--firma") ?? undefined,
    dry: tiene("--dry"),
  });
  if (r.ok) {
    console.log(`módulo   : ${r.id} v${r.version}`);
    console.log(`entrada  : ${JSON.stringify(r.entrada)}`);
    console.log(`paquete  : ${r.paquete}`);
    console.log(`firmante : ${r.firmante}`);
    if (r.razon) console.log(`ojo      : ${r.razon}`);
    console.log("siguiente: npm run tienda:publicar-modulos (sube lo firmado al repo de la tienda)");
  } else {
    console.error(`no publicado: ${r.razon}`);
  }
  process.exit(r.ok ? 0 : 1);
}
