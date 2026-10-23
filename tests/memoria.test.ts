/**
 * LA MEDIDA DE LA MEMORIA — un módulo de memoria cualquiera, el mismo examen.
 *
 * Lo que se prueba aquí:
 *
 *   1. la medida genérica reproduce EXACTAMENTE los números de la casa
 *      (base 0,25 → con 1,00): si no, no es el mismo examen;
 *   2. el oro es el TEXTO de la respuesta, no su id: por eso un módulo ajeno
 *      (que trocea con sus propios ids) puede medirse;
 *   3. un módulo que no trocea no entra (no hay número → no hay veredicto);
 *   4. y la puerta de entrada abre para la memoria: un módulo de memoria
 *      creado por el constructor se juzga y entra.
 *
 * Referencia: core/bench/memoria.ts, docs/ENTRADA.md.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  examenMemoria,
  recallPorTexto,
  candidatosBaseMemoria,
  candidatosConMemoria,
  mideMemoriaModulo,
  llevaOro,
} from "../core/bench/memoria.ts";
import { trocea } from "../core/mind/troceo.ts";
import { creaModulo } from "../tienda/crea.ts";
import { verificaModulo } from "../tienda/verifica.ts";

const raizKit = join(import.meta.dirname, "..");

describe("el examen de la memoria", () => {
  it("la medida genérica reproduce los números de la casa", () => {
    const examen = examenMemoria();
    expect(examen.casos.length).toBe(12);
    const base = candidatosBaseMemoria(examen, (f, t) => trocea(f, t));
    const con = candidatosConMemoria(trocea("doc", examen.doc));
    const rb = recallPorTexto(base, examen.casos);
    const rc = recallPorTexto(con, examen.casos);
    // los números de la casa (modulos/ejemplo-troceo-pro/bench.json)
    expect(rb.recall).toBeCloseTo(0.25, 3);
    expect(rc.recall).toBeCloseTo(1, 3);
    expect(rb.tokens).toBeCloseTo(22.666, 2);
    expect(rc.tokens).toBeCloseTo(37.083, 2);
  });

  it("el oro es el texto de la respuesta (por eso vale para un módulo ajeno)", () => {
    const examen = examenMemoria();
    for (const caso of examen.casos) {
      expect(caso.oro.length).toBeGreaterThan(0);
    }
  });

  it("un trozo acierta si lleva dentro la respuesta", () => {
    expect(llevaOro("| Red neuronal | hecha | ONNX |", "| Red neuronal | hecha | ONNX |")).toBe(true);
    expect(llevaOro("una tabla\nentera\ncon todo", "| Red neuronal | hecha | ONNX |")).toBe(false);
  });
});

describe("la puerta se abre para la memoria", () => {
  it("un módulo de memoria creado por el constructor se mide y entra", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "esme-memoria-")), "mi-memoria");
    try {
      await creaModulo(
        { id: "esme.prueba.mi-memoria", nombre: "Mi memoria", categoria: "memory", dir },
        raizKit
      );
      const r = await verificaModulo(dir);
      expect(r.veredicto?.entra).toBe(true);
      expect(r.veredicto?.medidas.forma).toBe("memoria");
      expect(r.veredicto?.medidas.recallBase).toBeCloseTo(0.25, 3);
      expect(r.veredicto?.medidas.recallCon).toBeCloseTo(1, 3);
      // el informe escrito lleva los números MEDIDOS
      const bench = JSON.parse(
        await import("node:fs").then((fs) => fs.readFileSync(join(dir, "bench.json"), "utf8"))
      ) as { casos: number; recall_base: number; recall_con: number };
      expect(bench.casos).toBe(12);
      expect(bench.recall_con).toBeCloseTo(1, 3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("un módulo que no trocea no entra (sin número no hay veredicto)", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "esme-memoria-")), "mudo");
    try {
      await creaModulo(
        { id: "esme.prueba.mudo", nombre: "Mudo", categoria: "memory", dir },
        raizKit
      );
      // se le quita la función de troceo: no puede medirse
      writeFileSync(join(dir, "src", "index.ts"), "export const MODULO_ID = 'esme.prueba.mudo';\n");
      const m = await mideMemoriaModulo(dir, {
        schema_version: 1,
        id: "esme.prueba.mudo",
        name: "Mudo",
        version: "0.1.0",
        category: "memory",
        description: "Un módulo de memoria que no sabe trocear nada de nada.",
        author: "esme@prueba",
        license: "MIT",
        entry: "dist/index.js",
        runtime: "nodejs",
        permissions: [],
        decision_criteria: [],
        dependencies: [],
        sideEffects: false,
        benchmarks: { recall_delta: 0.01, report: "bench.json" },
      });
      expect(m.error).toBeTruthy();
      expect(m.informe.casos).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
