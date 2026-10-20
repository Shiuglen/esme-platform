import { describe, expect, it } from "vitest";
import { ciclo, MODULO_ID } from "../src/index.ts";

describe("módulo de referencia (el oro de la tienda)", () => {
  it("declara su id en el manifiesto", () => {
    expect(MODULO_ID).toBe("esme.nucleo.hola-mundo");
  });

  it("el ciclo recall → saludo devuelve lo recordado", () => {
    const r = ciclo((q) => [{ id: "m1" }, { id: "m2" }]);
    expect(r.recuerdos).toHaveLength(2);
    expect(r.id).toBe(MODULO_ID);
  });

  it("con la mente vacía, el ciclo no explota", () => {
    expect(ciclo(() => []).recuerdos).toEqual([]);
  });
});
