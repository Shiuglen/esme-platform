/**
 * EL MANIFIESTO EN DISCO — la capa que lee ficheros.
 *
 * El contrato (la forma) vive en `core/ipc/module-schema.ts`; esta capa sabe
 * de disco y de YAML, y por eso NO vive en el núcleo (el núcleo no arrastra
 * dependencias: quien consume el kit no paga un parser de YAML).
 *
 * Lo que añade de verdad: **la entrada confinada**. Un manifiesto firmado por
 * alguien que no es de fiar puede pedir `entry: "../../../etc/passwd"`. La
 * firma no lo vuelve bueno: la entrada se queda dentro de la carpeta del
 * módulo, como el disco de `fs:project` se queda dentro del proyecto. Antes
 * de esto, `resolve(dir, entry)` se salía de la carpeta sin que nadie lo
 * dijera.
 *
 * Referencia: estandar/module-manifest.spec.yaml, core/ipc/module-schema.ts.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, isAbsolute, sep } from "node:path";
import yaml from "js-yaml";
import { validaManifiesto, type Manifest } from "../core/ipc/module-schema.ts";
import { confinaEntrada, type Confinada } from "../core/modulos/rutas.ts";

export interface DictamenModulo {
  id: string;
  modulo: string;
  ok: boolean;
  errores: string[];
  avisos: string[];
  manifest?: Manifest;
}

/** Valida un module.yaml en disco: schema + reglas del índice. */
export function validaModuloFile(
  ruta: string,
  opts: { exigirBenchmarks?: boolean; exigirFirma?: boolean } = {}
): DictamenModulo {
  const dir = dirname(ruta);
  let raw: unknown;
  try {
    raw = yaml.load(readFileSync(ruta, "utf8")) as unknown;
  } catch (e) {
    return {
      id: "<sin id>",
      modulo: ruta,
      ok: false,
      errores: [`el manifiesto no se puede leer: ${(e as Error).message}`],
      avisos: [],
    };
  }
  const res = validaManifiesto(raw);
  const errores = [...res.errores];
  const avisos = [...res.avisos];

  if (res.ok) {
    const m = res.manifest!;
    // entry existe tras el build
    if (!existsSync(resolve(dir, m.entry))) {
      errores.push(`entry '${m.entry}' no existe (¿falta build del módulo?)`);
    }
    // licenses de tipo ESME-CL exigen firma
    if (m.license === "ESME-CL" && !m.signatures) {
      errores.push("ESME-CL exige firma (licencia comunitaria, no anónima)");
    }
    if (opts.exigirBenchmarks && !m.benchmarks) {
      errores.push("la tienda exige benchmarks de la Prueba 0 en el manifiesto");
    }
    if (opts.exigirFirma && !m.signatures) {
      errores.push("el índice firmado exige signatures");
    }
  }
  return {
    id: res.ok
      ? res.manifest!.id
      : raw && typeof raw === "object" && "id" in raw
        ? String((raw as Record<string, unknown>).id)
        : "<sin id>",
    modulo: ruta,
    ok: errores.length === 0,
    errores,
    avisos,
    manifest: res.manifest,
  };
}

/**
 * La entrada de un módulo, dentro de SU carpeta. Siempre.
 *
 * La regla vive en `core/modulos/rutas.ts` (una sola verdad del confine).
 */
export function entradaConfineda(dirModulo: string, entry: string): Confinada {
  return confinaEntrada(dirModulo, entry);
}

/** Lee el manifiesto de una carpeta de módulo y lo dictamina. */
export function leeManifiesto(
  dirModulo: string,
  opts: { exigirBenchmarks?: boolean; exigirFirma?: boolean } = {}
): DictamenModulo {
  return validaModuloFile(resolve(dirModulo, "module.yaml"), opts);
}

/** La ruta de la entrada, si el módulo es válido y su entrada no se escapa. */
export function rutaEntrada(
  dirModulo: string,
  manifest: Manifest
): { ruta: string } | { error: string } {
  const dentro = entradaConfineda(dirModulo, manifest.entry);
  if ("error" in dentro) return dentro;
  if (!existsSync(dentro.ruta)) {
    return { error: `la entrada no está: ${manifest.entry}` };
  }
  return dentro;
}
