import { describe, expect, it } from "vitest";
import { ciclo, resumen, MODULO_ID } from "../src/index.ts";

describe("módulo de referencia (el oro de la tienda)", () => {
  it("declara su id en el manifiesto", () => {
    expect(MODULO_ID).toBe("esme.nucleo.hola-mundo");
  });

  it("sin puerta, el ciclo lo dice (no finge que consultó)", async () => {
    const r = await ciclo("¿qué se decidió sobre el Taller?");
    expect(r.id).toBe(MODULO_ID);
    expect(r.recuerdos).toBe(0);
    expect(r.escribio).toBe(false);
    expect(r.respuesta).toContain("no hay puerta");
  });

  it("el resumen es pura (los datos cruzan el worker)", () => {
    expect(resumen(["a", "b"]).total).toBe(2);
    expect(resumen([]).primera).toBeNull();
  });
});
