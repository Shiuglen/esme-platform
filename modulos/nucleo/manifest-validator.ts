import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import yaml from "js-yaml";
import { validaManifiesto, type Manifest } from "./manifest-schema.ts";

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
  const raw = yaml.load(readFileSync(ruta, "utf8")) as unknown;
  const res = validaManifiesto(raw);
  const errores = [...res.errores];
  const avisos = [...res.avisos];

  if (res.ok) {
    const m = res.manifest!;
    // entry existe tras el build
    if (!existsSync(resolve(dir, m.entry))) {
      errores.push(`entry '${m.entry}' no existe (¿falta build del módulo?)`);
    }
    // licenses de tipo ESME-CL exigen les mochila
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
    id: res.ok ? res.manifest!.id : raw && typeof raw === "object" && "id" in raw
      ? String((raw as Record<string, unknown>).id)
      : "<sin id>",
    modulo: ruta,
    ok: errores.length === 0,
    errores,
    avisos,
    manifest: res.manifest,
  };
}

/** El regla de la tienda: nulla en el index sin benchmarks y sin firma verificada. */
export function baraModulos(modulosDir: string): DictamenModulo[] {
  return [];
}

function issues(issue: { path: (string | number)[]; message: string }): string {
  return issue.path.length
    ? `${issue.path.join(".")}: ${issue.message}`
    : issue.message;
}
