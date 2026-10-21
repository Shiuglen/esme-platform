/**
 * EL CATÁLOGO DE RECURSOS, FIRMADO — las piezas con las que se construye.
 *
 * El hermano gemelo de la lista de deseos: mismo tipo de documento, misma
 * firma, mismo camino de confianza (la estirpe). Lo que cambia es lo que
 * lleva dentro y para qué sirve: los recursos son las piezas de fuera con las
 * que se puede construir lo que falta.
 *
 * Referencia: core/tienda/documento-firmado.ts, core/tienda/recursos.ts.
 */
import { juzgaRecurso, type Recurso } from "./recursos.ts";
import {
  firmaDocumento,
  verificaDocumento,
  confiaDocumento,
  type DocumentoFirmado,
} from "./documento-firmado.ts";

/** La versión del catálogo. */
export const RECURSOS_VERSION = 1;

/** La clave del documento (los bytes que se firman). */
export const CLAVE_RECURSO = "recursos";

/** El catálogo firmado. */
export type CatalogoRecursosFirmado = DocumentoFirmado<Recurso>;

/** Los recursos de un documento (bajo su clave). */
export function recursosDe(doc: CatalogoRecursosFirmado): Recurso[] {
  return (doc[CLAVE_RECURSO] as Recurso[]) ?? [];
}

/** Firma el catálogo. */
export function firmaCatalogo(
  recursos: Recurso[],
  privPem: string,
  firmante: string,
  emitido = Date.now()
): CatalogoRecursosFirmado {
  return firmaDocumento<Recurso>(CLAVE_RECURSO, recursos, RECURSOS_VERSION, privPem, firmante, emitido);
}

/** Verifica el catálogo firmado. */
export function verificaCatalogo(
  texto: string,
  pubPem: string | string[]
): { ok: true; recursos: Recurso[]; emitido: number; firmante: string } | { ok: false; motivo: string } {
  const v = verificaDocumento<Recurso>(CLAVE_RECURSO, texto, pubPem, (e) => juzgaRecurso(e).ok);
  if (v.ok === false) return { ok: false, motivo: v.motivo };
  return { ok: true, recursos: v.elementos, emitido: v.emitido, firmante: v.firmante };
}

/** La confianza en el catálogo (caminando la estirpe, como el índice). */
export function confiaCatalogo(
  texto: string,
  pubRaiz: string,
  rutaLedger: string
): { ok: boolean; via: "directa" | "cadena" | "delegada" | "ninguna"; recursos?: Recurso[] } {
  return confiaDocumento<Recurso>(CLAVE_RECURSO, texto, pubRaiz, rutaLedger, (e) =>
    juzgaRecurso(e).ok
  );
}
