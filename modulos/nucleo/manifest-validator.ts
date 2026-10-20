/**
 * Puerta pública (la que ya se importaba): el dictamen vive con los ficheros.
 *
 *   tienda/modulo-manifiesto.ts           ← la verdad
 *   modulos/nucleo/manifest-validator.ts  ← esta puerta
 *
 * Referencia: tienda/modulo-manifiesto.ts.
 */
export {
  validaModuloFile,
  leeManifiesto,
  rutaEntrada,
  entradaConfineda,
} from "../../tienda/modulo-manifiesto.ts";
export type { DictamenModulo } from "../../tienda/modulo-manifiesto.ts";
export type { Manifest } from "../../core/ipc/module-schema.ts";
