/**
 * EL CASO DE REA EN EL BANCO — la mente con ojos, medida.
 *
 * Qué se comprueba: que una evidencia real produce un caso de banco con un
 * oro que se puede ENCONTRAR (un caso con un oro de 6.000 caracteres no
 * mide nada: nunca se encuentra), que el documento lleva lo que se vio Y lo
 * que no se vio, y que el caso es honesto: su oro es mecánico (lo que el
 * análisis produjo), no una suposición.
 *
 * Referencia: core/rea/banco.ts, core/bench/banco.ts, docs/PRUEBA-0.md.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { leeEvidenciaReaJson } from "../core/rea/forma.ts";
import { casoDeEvidencia, oroDeEvidencia } from "../core/rea/banco.ts";
import { casosDelBanco, type BancoReal } from "../core/bench/banco.ts";

const texto = readFileSync(
  resolve(import.meta.dirname, "fixtures", "rea-evidencia-real.json"),
  "utf8"
);

const evidencia = (): ReturnType<typeof leeEvidenciaReaJson> => leeEvidenciaReaJson(texto);

describe("el caso de REA en el banco", () => {
  it("la pregunta se puede responder: el oro es un hecho, y cabe en un contexto", () => {
    const l = evidencia();
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    const { pregunta, oro } = oroDeEvidencia(l.evidencia);
    expect(pregunta).toContain("default_app.asar");
    // el oro tiene que caber en un contexto pequeño (unos 60 tokens): si no,
    // el caso no se puede encontrar nunca y no mide nada
    expect(oro.length).toBeGreaterThan(10);
    expect(oro.length).toBeLessThan(400);
  });

  it("el oro es un hecho del análisis (no una invención)", () => {
    const l = evidencia();
    if (!l.ok) throw new Error("la evidencia real debería encajar");
    const { caso } = casoDeEvidencia(l.evidencia);
    expect(caso.oro).toContain("main.js");
    expect(caso.oro).toContain("función(es) con nombre");
  });

  it("el documento lleva lo que se vio Y lo que no se vio", () => {
    const l = evidencia();
    if (!l.ok) throw new Error("la evidencia real debería encajar");
    const { documento } = casoDeEvidencia(l.evidencia);
    // lo que se vio
    expect(documento.texto).toContain("default_app.asar");
    expect(documento.texto).toContain("main.js");
    // lo que NO se vio (las limitaciones y los desconocidos son hechos)
    expect(documento.texto).toContain("NO afirma");
    expect(documento.texto).toContain("no es ausencia");
  });

  it("el caso es honesto: el oro es mecánico y no hay que elegirlo", () => {
    const l = evidencia();
    if (!l.ok) throw new Error("la evidencia real debería encajar");
    const { caso } = casoDeEvidencia(l.evidencia);
    expect(caso.validado).toBe(true);
    expect(caso.origen).toContain("rea:");
    expect(caso.evidencia).toContain("nodos");
  });

  it("y el caso SE RESUELVE en el banco (si no, el banco no lo cuenta)", () => {
    const l = evidencia();
    if (!l.ok) throw new Error("la evidencia real debería encajar");
    const { documento, caso } = casoDeEvidencia(l.evidencia);
    const banco: BancoReal = {
      version: 1,
      creado: new Date().toISOString(),
      documentos: [documento],
      casos: [caso],
    };
    // el caso tiene que tener un oro resoluble en el mundo (troceado y entero)
    expect(casosDelBanco(banco, "con").length).toBe(1);
    expect(casosDelBanco(banco, "base").length).toBe(1);
  });
});
