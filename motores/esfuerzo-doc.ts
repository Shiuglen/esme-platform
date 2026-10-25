/**
 * El ESFUERZO leído del disco — el borde del documento.
 *
 * El núcleo (`core/esfuerzo.ts`) es puro: no lee yaml (la casa no arrastra
 * dependencias — tests/consumible.test.ts). Este fichero está al borde,
 * como laya-adapter: lee el DOCUMENTO (estandar/esfuerzo.spec.yaml y, si
 * la mente trajo el suyo, el de encima), lo convierte en fichas y devuelve
 * la tabla lista para resolver.
 *
 * Referencia: core/esfuerzo.ts, estandar/esfuerzo.spec.yaml.
 */
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import { deDocumento, mezclaTablas, type EntradaEsfuerzo, type TablaEsfuerzo } from "../core/esfuerzo.ts";

/**
 * LEE la tabla del disco y, si la mente trajo un documento encima, lo
 * mezcla encima (lo que la mente escribó, gana pieza por pieza).
 */
export function cargaEsfuerzo(ruta: string, encima?: string): TablaEsfuerzo {
  let entradas: EntradaEsfuerzo[] = deDocumento(
    yaml.loadAll(readFileSync(ruta, "utf8")) as unknown[],
    "tabla",
  );
  if (encima) {
    const suyas = deDocumento(yaml.loadAll(readFileSync(encima, "utf8")) as unknown[], "mente");
    entradas = mezclaTablas(entradas, suyas);
  }
  return { ruta, entradas };
}

/** Las fichas de la spec escrita (para el conformador: la regla y sus fichas). */
export function fichasDe(ruta: string): Array<Record<string, unknown>> {
  const docs = (yaml.loadAll(readFileSync(ruta, "utf8")) ?? []) as Array<Record<string, unknown> | null>;
  return docs.filter((d): d is Record<string, unknown> => !!d && typeof d.motor === "string");
}
