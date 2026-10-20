import { describe, expect, it } from "vitest";
import { MODULO_ID, troceaConFilas, filasDe } from "../src/index.ts";
import { DOC } from "../../../core/bench/examen-real.ts";

describe("esme.nucleo.troceo-pro", () => {
  it("declara su id conforme al manifiesto", () => {
    expect(MODULO_ID).toBe("esme.nucleo.troceo-pro");
  });

  it("trocea un documento y entrega las filas de la tabla separadas", () => {
    const trozos = troceaConFilas("doc", DOC);
    const filas = filasDe(trozos);
    // cabecera de tabla + 5 filas de datos
    expect(filas.length).toBeGreaterThanOrEqual(5);
    expect(filas.some((f) => f.texto.includes("Red neuronal"))).toBe(true);
  });

  it("cada fila de datos cabe en un presupuesto de contexto pequeño", () => {
    const filas = filasDe(troceaConFilas("doc", DOC)).filter(
      (f) => !f.texto.startsWith("| Área")
    );
    for (const f of filas) expect(Math.ceil(f.texto.length / 4)).toBeLessThan(60);
  });
});
