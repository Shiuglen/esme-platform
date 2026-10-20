/**
 * esme.nucleo.troceo-pro — el troceo por filas de tabla.
 *
 * El hallazgo del 12-oct hecho módulo: una tabla troceada como un bloque
 * entero no entra en el presupuesto del pack, y las preguntas sobre una
 * fila concreta se quedan sin contexto. Troceando por fila, cada dato
 * cabe y el recall del examen real pasa de 0.25 a 1.00 (ver bench.json
 * y `npm run bench` para reproducir la medición).
 */
export const MODULO_ID = "esme.nucleo.troceo-pro";

import { trocea } from "../../../core/mind/troceo.ts";
import type { Trozo } from "../../../core/mind/troceo.ts";

/** Interfaz pública del módulo: troceo con tablas por fila. */
export type { Trozo };

/** API principal: lo mismo que el núcleo usa, empaquetado como módulo. */
export function troceaConFilas(idFuente: string, texto: string): Trozo[] {
  return trocea(idFuente, texto);
}

/** Diferencial del módulo: solo las filas de tabla, listas para indexar. */
export function filasDe(trozos: Trozo[]): Trozo[] {
  return trozos.filter((t) => t.tipo === "fila-tabla");
}
