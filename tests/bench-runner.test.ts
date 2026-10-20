import { describe, expect, it } from "vitest";
import { candidatosBase, casosBase, candidatosCon, casosCon } from "../core/bench/examen-real.ts";
import { corre, armaBench, veredicto } from "../core/bench/runner.ts";

describe("el examen real (el hallazgo del 12-oct, ahora medible)", () => {
  const base = corre(candidatosBase(), casosBase(), { k: 2, budget: 60 });
  const con = corre(candidatosCon(), casosCon(), { k: 2, budget: 60 });

  it("el troceo viejo (tabla entera) no encuentra nada de tabla por el budget", () => {
    expect(base.recall).toBeLessThan(con.recall);
  });

  it("con filas separadas el recall sube de verdad", () => {
    expect(con.recall - base.recall).toBeGreaterThanOrEqual(0.01);
  });

  it("el bench resultante pasa la puerta de la tienda con causa trazada", () => {
    const b = armaBench({ modulo: "esme.nucleo.troceo-pro", version: "0.1.0" }, base, con, casosBase().length);
    const v = veredicto(b);
    expect(v.entra).toBe(true);
    expect(v.causa.length).toBeGreaterThan(5);
  });

  it("la medición es determinista: dos corridas, mismos números", () => {
    const otra = corre(candidatosBase(), casosBase(), { k: 2, budget: 60 });
    expect(otra.recall).toBe(base.recall);
    expect(otra.tokens).toBe(base.tokens);
  });
});
