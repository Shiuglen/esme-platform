// Las specs son contratos: tienen que poder leerse con una máquina, y la
// spec y el código no pueden separarse sin que se caiga un test.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import {
  CATEGORIES,
  RUNTIMES,
  validaManifiesto,
} from "../modulos/nucleo/manifest-schema.ts";
import { CAPABILITIES } from "../core/extension-host/capability.ts";
import { cargaMotorCached } from "../motores/laya-adapter.ts";
import {
  juzgaModulo,
  TOPE_COSTE_POR_PUNTO,
  MIN_CASOS_CICLO,
  MAX_TOKENS_CICLO,
} from "../core/modulos/veredicto.ts";

const raiz = resolve(import.meta.dirname, "..");
const dirSpecs = resolve(raiz, "estandar");
const specs = readdirSync(dirSpecs).filter((f) => f.endsWith(".spec.yaml"));

const rutaSpec = resolve(dirSpecs, "module-manifest.spec.yaml");
const textoSpec = (): string => readFileSync(rutaSpec, "utf8");

/** El enum que la spec declara en el comentario de una clave. */
const enumDeLaSpec = (clave: string): string[] | null => {
  const linea = textoSpec()
    .split("\n")
    .find((l) => l.trimStart().startsWith(`${clave}:`));
  if (!linea) return null;
  const comentario = linea.slice(linea.indexOf("#") + 1).trim();
  if (!comentario) return null;
  return comentario
    .split("|")
    .map((s) => s.trim().split(" ")[0].replace(/[()]/g, ""))
    .filter(Boolean);
};

/** El ejemplo de la spec, con los huecos rellenados. */
const ejemploRelleno = (): Record<string, unknown> => {
  const datos = yaml.load(textoSpec()) as Record<string, unknown>;
  return { ...datos, id: "esme.ejemplo.mi-modulo", entry: "dist/index.js" };
};

describe("las specs son contratos (y se pueden leer)", () => {
  it("hay specs en estandar/", () => {
    expect(specs.length).toBeGreaterThanOrEqual(3);
  });

  it("TODAS las specs son YAML válido (una spec que no parsea no se puede cumplir)", () => {
    for (const f of specs) {
      const texto = readFileSync(resolve(dirSpecs, f), "utf8");
      let documentos: unknown[] = [];
      expect(() => {
        documentos = yaml.loadAll(texto);
      }, `${f} no es YAML válido`).not.toThrow();
      expect(documentos.length, `${f} parsea a nada`).toBeGreaterThan(0);
      for (const d of documentos) expect(d, `${f} tiene un documento vacío`).toBeTruthy();
    }
  });

  it("toda spec (y cada documento de una) declara su versión de schema", () => {
    for (const f of specs) {
      const documentos = yaml.loadAll(readFileSync(resolve(dirSpecs, f), "utf8")) as Record<
        string,
        unknown
      >[];
      for (const d of documentos)
        expect(d.schema_version, `${f} sin schema_version`).toBeDefined();
    }
  });

  it("la spec de motores carga de verdad (el adaptador la lee)", () => {
    const motores = cargaMotorCached(resolve(dirSpecs, "motor-capability.spec.yaml"));
    expect(motores.map((m) => m.id).sort()).toEqual(["claude-code", "local", "opencode"]);
    const local = motores.find((m) => m.id === "local");
    expect(local?.capabilities.local_only).toBe(true);
    expect(local?.capabilities.pricing).toBe("local");
  });
});

describe("la spec del manifiesto y el validador", () => {
  it("el ejemplo de la spec es un módulo VÁLIDO (los huecos rellenados)", () => {
    const r = validaManifiesto(ejemploRelleno());
    expect(r.errores).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("las categorías de la spec son las del código", () => {
    expect(enumDeLaSpec("category")).toEqual([...CATEGORIES]);
  });

  it("los runtimes de la spec son los del código", () => {
    expect(enumDeLaSpec("runtime")).toEqual([...RUNTIMES]);
  });

  it("las licencias de la spec son las del código", () => {
    expect(enumDeLaSpec("license")).toEqual(["MIT", "Apache-2.0", "ESME-CL"]);
  });

  it("las capacidades de la spec son las del código", () => {
    expect(enumDeLaSpec("permissions")).toEqual([...CAPABILITIES]);
  });

  it("la spec declara la versión de schema que el código valida", () => {
    const datos = yaml.load(textoSpec()) as Record<string, unknown>;
    expect(datos.schema_version).toBe(1);
  });
});

describe("la spec del veredicto de los módulos y el juez dicen lo mismo", () => {
  const rutaVeredicto = resolve(dirSpecs, "module-veredicto.spec.yaml");
  const textoVeredicto = (): string => readFileSync(rutaVeredicto, "utf8");

  const manifiesto = {
    schema_version: 1 as const,
    id: "esme.prueba.módulo",
    name: "Prueba",
    version: "0.1.0",
    category: "tool" as const,
    description: "un módulo de mentira para comparar la spec con el juez",
    author: "esme@bench",
    license: "MIT" as const,
    entry: "dist/index.js",
    runtime: "nodejs" as const,
    permissions: ["mind:read" as const],
    decision_criteria: [],
    dependencies: [],
    sideEffects: false,
    benchmarks: { recall_delta: 0.01, report: "bench.json" },
  };

  it("el orden de las medidas es el que dice la spec (las claves son el contrato)", () => {
    const spec = yaml.load(textoVeredicto()) as {
      cuerpo_firmado: { modulos: Array<{ medidas: { orden: string[] } }> };
    };
    const veredicto = juzgaModulo(manifiesto, {
      carga: true,
      usadas: ["mind:read"],
      informe: { casos: 5, ciclo_ok: true, tokens_ciclo: 40 },
    });
    expect(veredicto.medidas.orden).toEqual(spec.cuerpo_firmado.modulos[0].medidas.orden);
  });

  it("los topes del juez están escritos en la spec", () => {
    const texto = textoVeredicto();
    expect(texto).toContain(String(TOPE_COSTE_POR_PUNTO));
    expect(texto).toContain(String(MIN_CASOS_CICLO));
    expect(texto).toContain(String(MAX_TOKENS_CICLO));
  });

  it("la spec declara las reglas que el juez cumple", () => {
    const spec = yaml.load(textoVeredicto()) as { veredicto: { reglas: string[] } };
    const reglas = spec.veredicto.reglas.join(" ");
    expect(reglas).toContain("no carga");
    expect(reglas).toContain("no declaró");
    expect(reglas).toContain("informe de examen");
  });
});
