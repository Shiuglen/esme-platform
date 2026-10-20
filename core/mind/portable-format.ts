/**
 * `.mind` — valida la estructura de una mente portable en disco.
 * docs/SYNC.md + estandar/mind-format.spec.yaml. Aún no serializa vectores:
 * primero la estructura y sus garantías (exclusión mínima, metadatos).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EXCLUSION_MINIMA } from "./redaction.ts";
import { validaRumbo } from "./rumbo.ts";

export interface Dictamen {
  ok: boolean;
  errores: string[];
}

/** Los directorios que una mente portable SIEMPRE tiene (aunque estén vacíos). */
export const DIRECTORIOS_MENTE = ["embeddings", "crs-delta"] as const;

export function validaMindDir(ruta: string): Dictamen {
  const errores: string[] = [];
  const requiereDir = [...DIRECTORIOS_MENTE];
  const requiereFile = ["metadata.json", "cognition.sig", "exclusion-list.json"];

  for (const d of requiereDir)
    if (!existsSync(join(ruta, d))) errores.push(`falta el directorio ${d}/`);
  for (const f of requiereFile)
    if (!existsSync(join(ruta, f))) errores.push(`falta ${f}`);

  if (existsSync(join(ruta, "exclusion-list.json"))) {
    try {
      const lista = JSON.parse(
        readFileSync(join(ruta, "exclusion-list.json"), "utf8")
      ) as string[];
      for (const min of EXCLUSION_MINIMA)
        if (!lista.includes(min))
          errores.push(`la exclusión mínima no es negociable: falta '${min}'`);
    } catch {
      errores.push("exclusion-list.json no es JSON válido");
    }
  }
  // el rumbo (para qué trabaja la mente) es OPCIONAL: las mentes viejas no lo tienen, pero si está, tiene que valer
  if (existsSync(join(ruta, "rumbo.json"))) {
    try {
      const r = JSON.parse(readFileSync(join(ruta, "rumbo.json"), "utf8")) as unknown;
      errores.push(...validaRumbo(r));
    } catch {
      errores.push("rumbo.json no es JSON válido");
    }
  }
  if (existsSync(join(ruta, "metadata.json"))) {
    try {
      const meta = JSON.parse(
        readFileSync(join(ruta, "metadata.json"), "utf8")
      ) as Record<string, unknown>;
      for (const k of ["schema_version", "created_at", "motor", "recall", "counts"])
        if (!(k in meta)) errores.push(`metadata.json: falta '${k}'`);
    } catch {
      errores.push("metadata.json no es JSON válido");
    }
  }
  return { ok: errores.length === 0, errores };
}
