// La regla de oro, EJECUTABLE: si el número no mejora, no entra.
//
// La Prueba 0 (docs/PRUEBA-0.md) no es un documento: es esta puerta. El
// benchmark de cada módulo vive commiteado (modulos/*/bench.json) y aquí se
// mide DE NUEVO contra esa base. Si la memoria pierde aciertos, o el ciclo
// gasta más tokens, el test se cae y el cambio no entra.
//
// La base es el archivo commiteado: no un número escrito a mano que alguien
// pueda maquillar sin querer.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  candidatosBase,
  candidatosCon,
  casosBase,
  casosCon,
} from "../core/bench/examen-real.ts";
import { corre, armaBench, veredicto } from "../core/bench/runner.ts";

const raiz = resolve(import.meta.dirname, "..");
const base = (modulo: string) =>
  JSON.parse(readFileSync(resolve(raiz, "modulos", modulo, "bench.json"), "utf8")) as {
    recall_base: number;
    recall_con: number;
    tokens_base: number;
    tokens_con: number;
    casos: number;
  };

describe("la puerta de la Prueba 0 (el número no puede empeorar)", () => {
  it("el módulo de memoria sigue aciertando lo que la base no acertaba", () => {
    const b = corre(candidatosBase(), casosBase(), { k: 2, budget: 60 });
    const c = corre(candidatosCon(), casosCon(), { k: 2, budget: 60 });
    const bench = armaBench(
      { modulo: "esme.nucleo.troceo-pro", version: "0.1.0" },
      b,
      c,
      casosBase().length
    );
    const v = veredicto(bench);
    expect(v.entra, `el módulo ya no mejora: ${v.causa}`).toBe(true);
    expect(c.recall).toBeGreaterThan(b.recall);
  });

  it("NO ha perdido aciertos respecto a la base commiteada", () => {
    const committed = base("ejemplo-troceo-pro");
    const c = corre(candidatosCon(), casosCon(), { k: 2, budget: 60 });
    expect(
      c.recall,
      `recall ${c.recall} < el commiteado ${committed.recall_con}: el número empeoró`
    ).toBeGreaterThanOrEqual(committed.recall_con);
  });

  it("NO gasta más tokens que la base commiteada (+10% de margen)", () => {
    const committed = base("ejemplo-troceo-pro");
    const c = corre(candidatosCon(), casosCon(), { k: 2, budget: 60 });
    const tope = committed.tokens_con * 1.1;
    expect(
      c.tokens,
      `tokens ${c.tokens} > el tope ${tope.toFixed(1)} (base ${committed.tokens_con}): el número empeoró`
    ).toBeLessThanOrEqual(tope);
  });

  it("el ciclo del módulo de herramienta sigue funcionando", async () => {
    const { ciclo } = await import("../modulos/ejemplo-hola-mundo/src/index.ts");
    // sin puerta (en proceso no la hay): el ciclo no explota y lo dice
    const r = await ciclo("¿qué se decidió sobre el Taller?");
    expect(r.recuerdos).toEqual(0);
    expect(r.respuesta).toContain("no hay puerta");
  });

  it("la base commiteada es la de verdad (números, no Theater)", () => {
    const committed = base("ejemplo-troceo-pro");
    expect(committed.casos).toBeGreaterThan(0);
    expect(committed.recall_con).toBeGreaterThan(committed.recall_base);
    expect(committed.tokens_con).toBeGreaterThan(0);
  });
});
