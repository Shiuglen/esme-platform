// La Prueba 0 real: el mecanismo que la hace posible (el número lo pone el
// banco elegido por el humano; aquí se comprueba la mecánica).
import { describe, expect, it } from "vitest";
import { oroEnContexto } from "../core/bench/banco.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

describe("el oro en lo que respondió la mente", () => {
  it("lo encuentra aunque la mente lo reformatee un poco", () => {
    expect(
      oroEnContexto(
        "La mente es local: el recall corre en el proceso del cerebro.",
        "[doc · 2026-10-12] La mente es local: el recall corre en el proceso del cerebro.\n---\n otra cosa"
      )
    ).toBe(true);
  });

  it("no lo encuentra si la mente respondió otra cosa", () => {
    expect(
      oroEnContexto(
        "La mente es local: el recall corre en el proceso del cerebro.",
        "[note · 2026-10-12] el Taller guarda los cambios en su rama"
      )
    ).toBe(false);
  });

  it("los acentos no estorban (el cerebro puede escribirlos distinto)", () => {
    expect(oroEnContexto("El añadir es más caro", "[doc] el anadir es mas caro")).toBe(true);
  });

  it("el oro vacío no acierta nunca", () => {
    expect(oroEnContexto("", "cualquier cosa")).toBe(false);
  });
});

describe("la mente que se mide", () => {
  it("la casa de la mente es la de la app (o la que diga el entorno)", () => {
    const casa = process.env.DAIMON_HOME
      ? process.env.DAIMON_HOME
      : join(homedir(), "Daimon", "data", "mente_v2");
    expect(casa.length).toBeGreaterThan(0);
    // si esta máquina tiene la mente, el sitio es el de verdad
    if (existsSync(join(casa, "mem.db"))) expect(casa).toContain("mente_v2");
  });
});
