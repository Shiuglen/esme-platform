import { describe, expect, it } from "vitest";
import { validaBench, estable, type BenchModulo } from "../tienda/bench.ts";

const b = (over: Partial<BenchModulo> = {}): BenchModulo => ({
  modulo: "esme.nucleo.hola-mundo",
  version: "0.1.0",
  fecha: "2026-10-19",
  casos: 50,
  recall_base: 0.77,
  recall_con: 0.79,
  tokens_base: 1000,
  tokens_con: 900,
  semilla: 7,
  ...over,
});

describe("bench.json — la puerta de la Prueba 0", () => {
  it("mejora el recall ≥ +0,01 → entra con causa trazada", () => {
    const r = validaBench(b({ recall_con: 0.781 }));
    expect(r.entra).toBe(true);
    if (r.entra) expect(r.causa).toContain("+0.011");
  });

  it("gasta ≥ 10% menos tokens → entra", () => {
    expect(validaBench(b({ recall_con: 0.77, tokens_con: 890 })).entra).toBe(true);
  });

  it("no llega al mínimo → NO entra y dice por qué", () => {
    const r = validaBench(b({ recall_con: 0.775, tokens_con: 950 }));
    expect(r.entra).toBe(false);
    expect(r.causa).toContain("no mejora lo mínimo");
  });

  it("menos de 10 casos no es veredicto: es ruido", () => {
    expect(validaBench(b({ casos: 5 })).entra).toBe(false);
  });

  it("la regla de oro se aplica a sí misma: dos medidas casi iguales son estables", () => {
    expect(estable(b(), b())).toBe(true);
    expect(estable(b(), b({ recall_con: 0.85 }))).toBe(false);
  });

  it("expect de rechazo explícito para no colar un bench vacío", () => {
    const vacio: BenchModulo = b({ casos: 0 });
    expect(validaBench(vacio).entra).toBe(false);
  });
});
