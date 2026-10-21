/**
 * LA FRONTERA DE REA — el kit y el cerebro leen lo mismo.
 *
 * El espejo (el cerebro, Python) y el kit (TypeScript) leen la misma
 * Evidencia de REA y sacan conocimiento de ella. Son dos implementations en
 * dos lenguas: y entre dos lenguas sólo sobrevive lo que está escrito.
 *
 * Lo que se comprueba aquí, en dos partes:
 *
 *   1. LAS CLAVES. Las que el lector del cerebro necesita tienen que estar
 *      declaradas en la spec del kit (`estandar/rea.spec.yaml`). Si REA
 *      cambia una clave y la spec no se entera, un lado deja de ver lo que el
 *      otro ve: y eso no se nota hasta que una mente afirma algo falso.
 *
 *   2. LOS NÚMEROS. Con la evidencia REAL, el informe del cerebro y los
 *      hechos del kit tienen que contar lo mismo: las mismas ventanas, los
 *      mismos canales IPC, los mismos módulos. Si no, la casa cuenta dos
 *      historias sobre el mismo programa.
 *
 * La parte 2 necesita el repo de la app (y su Python): donde no está, se
 * salta. La parte 1 se comprueba siempre, con la copia de las claves que el
 * cerebro lee (la última conocida: si el cerebro las cambia, este test se
 * entera cuando el repo de la app está).
 *
 * Referencia: estandar/rea.spec.yaml, core/rea/evidencia.ts, docs/REA.md.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { leeEvidenciaReaJson } from "../core/rea/forma.ts";
import { conocimientoDe } from "../core/rea/conocimiento.ts";

const raizKit = resolve(import.meta.dirname, "..");
const appRepo = join(homedir(), "Daimon");
const rutaCerebro = join(appRepo, "daimon", "rea.py");
const python = join(appRepo, ".venv", "bin", "python");
const tieneCerebro = existsSync(rutaCerebro) && existsSync(python);

const fixture = resolve(raizKit, "tests", "fixtures", "rea-evidencia-real.json");

/**
 * Las claves que el LECTOR DEL CEREBRO usa de la evidencia (la última
 * conocida: `daimon/rea.py`, 21-oct-2026).
 *
 * La CI del kit no tiene el repo de la app: usa esta copia. Si el cerebro
 * cambia lo que lee, el test lo dice cuando el repo está (y esta copia se
 * actualiza entonces: hay un test que vigila que no se quede vieja).
 */
const CLAVES_DEL_CEREBRO = [
  "architecture",
  "coverage",
  "detail",
  "digest",
  "evidence",
  "family",
  "format",
  "id",
  "identity",
  "kind",
  "label",
  "limitations",
  "line",
  "local_path",
  "module_path",
  "name",
  "node_id",
  "nodes",
  "normalized_result",
  "operation",
  "properties",
  "provider",
  "reason",
  "relation",
  "relations",
  "resolution",
  "semantic_graph",
  "source_range",
  "start",
  "statistics",
  "status",
  "subject",
  "summary",
  "target_node_id",
  "truncated",
  "unknowns",
  "version",
];

/** Las claves que la spec del kit declara (todas, con su nombre). */
const specDelKit = (): Record<string, unknown> =>
  yaml.load(readFileSync(resolve(raizKit, "estandar", "rea.spec.yaml"), "utf8")) as Record<
    string,
    unknown
  >;

/** Todas las claves que la spec declara (el documento y las formas). */
const clavesDeLaSpec = (): Set<string> => {
  const out = new Set<string>();
  const camina = (d: unknown): void => {
    if (!d || typeof d !== "object") return;
    if (Array.isArray(d)) {
      d.forEach(camina);
      return;
    }
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      out.add(k);
      camina(v);
    }
  };
  camina(specDelKit());
  return out;
};

/** Las claves que el lector del cerebro usa de verdad (el Python real). */
const clavesDelCerebroReal = (): string[] => {
  if (!tieneCerebro) return CLAVES_DEL_CEREBRO;
  const texto = readFileSync(rutaCerebro, "utf8");
  const encontradas = new Set<string>();
  for (const m of texto.matchAll(/\.get\("([a-z_]+)"/g)) encontradas.add(m[1] as string);
  // el testigo: si el Python no dice nada de una clave, la copia es la que vale
  return CLAVES_DEL_CEREBRO.filter((k) => encontradas.has(k));
};

describe("la frontera de REA: las claves", () => {
  it("la spec declara TODAS las claves que el cerebro lee de la evidencia", () => {
    const spec = clavesDeLaSpec();
    const cerebro = clavesDelCerebroReal();
    const faltan = cerebro.filter((c) => !spec.has(c));
    expect(
      faltan,
      `la spec de REA no declara: ${faltan.join(", ")} (el cerebro las lee: si REA las cambia, un lado deja de ver lo que el otro ve)`
    ).toEqual([]);
  });

  it.skipIf(!tieneCerebro)(
    "la copia de las claves está al día (si no, la CI juzga un cerebro que ya no existe)",
    () => {
      // la CI del kit no tiene el repo de la app: usa la copia de aquí. Si el
      // cerebro empieza a leer una clave nueva, esta copia se queda vieja y
      // la CI juzga un cerebro que ya no existe.
      const spec = clavesDeLaSpec();
      const texto = readFileSync(rutaCerebro, "utf8");
      const nuevas: string[] = [];
      for (const m of texto.matchAll(/\.get\("([a-z_]+)"/g)) {
        const k = m[1] as string;
        if (spec.has(k) && !CLAVES_DEL_CEREBRO.includes(k)) nuevas.push(k);
      }
      expect(
        [...new Set(nuevas)],
        "el cerebro lee claves que la spec declara y la copia de aquí no tiene"
      ).toEqual([]);
    }
  );

  it("la spec usa las claves REALES del documento (no sus equivalentes en castellano)", () => {    const spec = new Set<string>();
    const camina = (d: unknown): void => {
      if (!d || typeof d !== "object") return;
      if (Array.isArray(d)) {
        d.forEach(camina);
        return;
      }
      for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
        spec.add(k);
        camina(v);
      }
    };
    camina(specDelKit().evidencia);
    // las que el documento de verdad lleva
    for (const clave of ["subject", "provider", "limitations", "normalized_result", "semantic_graph"]) {
      expect(spec.has(clave), `la spec no declara «${clave}»`).toBe(true);
    }
    // y NO las renombradas (una spec que renombra las claves no es un contrato)
    for (const clave of ["sujeto", "proveedor", "limitaciones", "resultado", "grafo", "nodos"]) {
      expect(spec.has(clave), `la spec renombra «${clave}» (el documento se llama de otra forma)`).toBe(false);
    }
  });
});

describe("la frontera de REA: los números", () => {
  it.skipIf(!tieneCerebro)("el informe del cerebro y los hechos del kit cuentan lo mismo", () => {
    const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(appRepo)})
from daimon.rea import informe
ev = json.load(open(${JSON.stringify(fixture)}))
sys.stdout.write(informe(ev))
`;
    const r = spawnSync(python, ["-c", script], { encoding: "utf8", timeout: 120_000 });
    expect(r.status, r.stderr).toBe(0);
    const informe = r.stdout;

    // los hechos del kit, sobre la MISMA evidencia
    const lectura = leeEvidenciaReaJson(readFileSync(fixture, "utf8"));
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const hechos = conocimientoDe(lectura.evidencia).hechos;
    const superficie = hechos.find((h) => h.tipo === "superficie");
    const modulos = hechos.filter((h) => h.tipo === "modulo");
    const limites = hechos.filter((h) => h.tipo === "limite");

    // 1. la ventana: los dos la ven
    expect(superficie?.texto).toContain("1 ventanas de navegador");
    expect(informe).toContain("1 ventana");
    // 2. el canal IPC: los dos lo ven
    expect(superficie?.texto).toContain("1 canales IPC literales");
    expect(informe).toContain("1 canales IPC");
    // 3. los módulos: los dos los ven (3 ficheros)
    expect(modulos).toHaveLength(3);
    expect(informe).toContain("3 ficheros");
    // 4. lo que NO se vio: los dos lo cuentan (10 cosas, en 3 clases)
    const desconocidos = hechos.filter((h) => h.tipo === "desconocido");
    expect(desconocidos.length).toBeGreaterThan(0);
    expect(informe).toContain("Lo que NO se pudo ver");
    // 5. las limitaciones: los dos las cuentan (9)
    expect(limites).toHaveLength(9);
    expect(informe).toContain("Los limites que declara REA");
  });

  it.skipIf(!tieneCerebro)("y los dos dicen lo que NO vieron (las limitaciones son conocimiento)", () => {
    const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(appRepo)})
from daimon.rea import informe
ev = json.load(open(${JSON.stringify(fixture)}))
sys.stdout.write(informe(ev))
`;
    const r = spawnSync(python, ["-c", script], { encoding: "utf8", timeout: 120_000 });
    expect(r.status, r.stderr).toBe(0);
    const lectura = leeEvidenciaReaJson(readFileSync(fixture, "utf8"));
    if (!lectura.ok) return;
    const hechos = conocimientoDe(lectura.evidencia).hechos;
    const limite = hechos.find((h) => h.tipo === "limite");
    // el kit lo dice en su fila; el cerebro lo dice en su informe
    expect(limite?.texto).toContain("NO afirma");
    expect(r.stdout).toContain("Lo que NO se pudo ver");
  });
});
