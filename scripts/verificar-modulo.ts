/**
 * verificar-modulo — la línea de comandos del verificador.
 *   npm run verificar:modulo -- <carpeta-del-módulo> [--salida <dir>] [--firmar] [--json]
 *
 * Por qué esto es tan poco: el verificador vive en `tienda/verifica.ts`,
 * porque la puerta de entrada de la era es PUBLICABLE (un tercero que instala
 * el kit tiene que poder verificar su módulo sin el repo). Este fichero es
 * sólo la ropa de la terminal: la misma puerta, llamada desde el comando.
 *
 * Referencia: docs/ENTRADA.md, tienda/verifica.ts.
 */
import { verificaModulo, renderVerificacion } from "../tienda/verifica.ts";

export { verificaModulo, renderVerificacion };

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
    console.error("uso: npm run verificar:modulo -- <carpeta-del-módulo> [--salida <dir>] [--firmar] [--json]");
    process.exit(2);
  }
  const resultado = await verificaModulo(dir, {
    salida: arg("--salida") ?? undefined,
    firmar: tiene("--firmar"),
  });
  if (tiene("--json")) console.log(JSON.stringify(resultado, null, 2));
  else console.log(renderVerificacion(resultado));
  // un módulo que no entra es un fallo del VERIFICADOR, no del script:
  // por eso el código de salida lo dice (la CI lo lee).
  const entra = resultado.veredicto?.entra ?? false;
  process.exit(entra ? 0 : 1);
}
