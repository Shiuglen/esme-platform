/**
 * LA PIEL — el juez de la identidad.
 *
 * Tres cosas se comprueban aquí:
 *
 *   1. la piel de la casa (Tinta y Luz) es válida y se lee;
 *   2. una piel con una opción inventada no entra (la lista es cerrada: una
 *      piel no «aproxima»);
 *   3. una piel que no se lee no entra (WCAG AA, de día y de noche) — porque
 *      una piel que nadie lee no es una piel, es un adorno roto.
 *
 * Y lo que las une: el módulo de categoría `theme` tiene que traer su piel.
 *
 * Referencia: estandar/piel.spec.yaml, tienda/piel.ts,
 * app/src/renderer/tinta/piel.ts (la casa).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cargaSpecPiel, validaPiel, contraste, pielBase } from "../tienda/piel.ts";
import { juzgaPiel, juzgaPielDeModulo } from "../tienda/piel.ts";

const spec = cargaSpecPiel(join(import.meta.dirname, "..", "estandar", "piel.spec.yaml"));

describe("la piel de la casa", () => {
  it("es válida (Tinta y Luz se viste)", () => {
    const r = validaPiel(spec.base, spec);
    expect(r.errores).toEqual([]);
  });

  it("se lee de día y de noche", () => {
    const base = pielBase(spec);
    const noche = base.color.tipo === "libre" ? base.color.noche : null;
    const dia = base.color.tipo === "libre" ? base.color.dia : null;
    expect(noche && dia).toBeTruthy();
    expect(contraste(noche!.texto, noche!.fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(dia!.texto, dia!.fondo)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("el juez de las pieles", () => {
  it("una piel con una opción inventada no entra", () => {
    const r = validaPiel({ movimiento: "salvaje" }, spec);
    expect(r.errores.length).toBeGreaterThan(0);
    expect(r.errores.join(" ")).toContain("movimiento");
  });

  it("una pieza que no es un hueco no entra", () => {
    const r = validaPiel({ piezas: { inventado: "x" } }, spec);
    expect(r.errores.join(" ")).toContain("no es un hueco");
  });

  it("una variante que no existe no entra", () => {
    const r = validaPiel({ piezas: { superficie: "cristal" } }, spec);
    expect(r.errores.join(" ")).toContain("no es una variante");
  });

  it("una piel que no se lee no entra (WCAG AA, de día y de noche)", () => {
    const r = validaPiel(
      {
        color: {
          tipo: "libre",
          noche: { fondo: "#000000", superficie: "#000000", texto: "#111111", acento: "#4fe3c1" },
          dia: { fondo: "#ffffff", superficie: "#ffffff", texto: "#141821", acento: "#08705e" },
        },
      },
      spec
    );
    expect(r.ok).toBe(false);
    expect(r.errores.join(" ")).toContain("no se lee");
  });

  it("una piel con un color que no es color no entra", () => {
    const r = validaPiel(
      {
        color: {
          tipo: "libre",
          noche: { fondo: "azul", superficie: "#0d1424", texto: "#ece6d8", acento: "#4fe3c1" },
          dia: { fondo: "#eeebe3", superficie: "#fbfaf6", texto: "#141821", acento: "#08705e" },
        },
      },
      spec
    );
    expect(r.errores.join(" ")).toContain("no es un color");
  });

  it("lo que falta se hereda de la base (una piel puede ser sólo un color)", () => {
    const r = validaPiel(
      {
        color: {
          tipo: "libre",
          noche: { fondo: "#0c0a07", superficie: "#16120c", texto: "#f6efe2", acento: "#e8c26e" },
          dia: { fondo: "#fbf6ec", superficie: "#fffdf8", texto: "#1f1a12", acento: "#7d5d17" },
        },
      },
      spec
    );
    expect(r.errores).toEqual([]);
    expect(r.piel.letra.titulos).toBe(pielBase(spec).letra.titulos);
    expect(r.piel.piezas.superficie).toBe(pielBase(spec).piezas.superficie);
  });

  it("una letra que no es de Esme no entra", () => {
    const r = validaPiel({ letra: { titulos: "comic-sans" } }, spec);
    expect(r.errores.join(" ")).toContain("no es una letra de Esme");
  });

  it("el veredicto de la línea de comandos es el mismo que el de la función", () => {
    expect(juzgaPiel(spec.base).ok).toBe(true);
    expect(juzgaPiel({ movimiento: "salvaje" }).ok).toBe(false);
  });
});

describe("el módulo de tema", () => {
  const casa = (): string => mkdtempSync(join(tmpdir(), "esme-piel-"));

  it("un tema sin piel no entra (la piel es un documento, no una promesa)", () => {
    const dir = casa();
    try {
      const r = juzgaPielDeModulo(dir, "theme");
      expect(r.ok).toBe(false);
      expect(r.errores.join(" ")).toContain("piel.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("un tema con una piel válida entra", () => {
    const dir = casa();
    try {
      writeFileSync(join(dir, "piel.json"), JSON.stringify(spec.base));
      const r = juzgaPielDeModulo(dir, "theme");
      expect(r.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("un módulo que no es de tema no tiene que traer piel", () => {
    const dir = casa();
    try {
      expect(juzgaPielDeModulo(dir, "tool").ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
