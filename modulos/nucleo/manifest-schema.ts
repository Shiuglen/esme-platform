/**
 * Puerta pública (la que ya se importaba): el contrato vive en el núcleo.
 *
 *   core/ipc/module-schema.ts           ← el contrato (la forma)
 *   modulos/nucleo/manifest-schema.ts   ← esta puerta
 *
 * No hay dos reglas: hay una y dos puertas. Referencia: core/ipc/module-schema.ts.
 */
export {
  CATEGORIES,
  RUNTIMES,
  ManifestSchema,
  validaManifiesto,
} from "../../core/ipc/module-schema.ts";
export type { Manifest, Category } from "../../core/ipc/module-schema.ts";
