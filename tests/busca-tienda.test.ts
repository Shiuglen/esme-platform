/**
 * BUSCAR EN LA TIENDA — lo que hay, y lo que mejora de verdad.
 *
 * Lo que se prueba:
 *
 *   1. sin texto, la lista sale ORDENADA por lo que cada módulo ha
 *      demostrado (el que más recall mejora, primero; los de herramienta, por
 *      los tokens que gastan) — el orden sale de los números, no de una
 *      opinión;
 *   2. con texto, salen los que coinciden y se dice por qué;
 *   3. y lo que NO entra (firma_ok: false) se puede filtrar.
 *
 * Referencia: tienda/busca.ts.
 */
import { describe, expect, it } from "vitest";
import { buscaEnTienda, renderBusqueda, type IndiceTienda } from "../tienda/busca.ts";

const indice: IndiceTienda = {
  modulos: [
    {
      id: "esme.nucleo.hola-mundo",
      version: "0.1.0",
      category: "tool",
      descripcion: "Saluda al usuario y demuestra el ciclo recall-inject de la mente.",
      etiquetas: ["saludo", "memoria"],
      bench_ciclo: { casos: 3, ciclo_ok: true, tokens_ciclo: 30 },
      firma_ok: true,
    },
    {
      id: "esme.nucleo.troceo-pro",
      version: "0.1.0",
      category: "memory",
      descripcion: "El troceo por filas de tabla: la tabla entera no cabe en el presupuesto.",
      etiquetas: ["troceo", "tabla", "memoria"],
      bench: { recall_base: 0.25, recall_con: 1, tokens_base: 22.7, tokens_con: 37.1, casos: 12 },
      firma_ok: true,
    },
    {
      id: "esme.malo",
      version: "0.1.0",
      category: "tool",
      bench_ciclo: { casos: 3, ciclo_ok: false, tokens_ciclo: 900 },
      firma_ok: false,
    },
  ],
};

describe("buscar en la tienda", () => {
  it("sin texto, sale ordenado por lo que mejora de verdad", () => {
    const lista = buscaEnTienda(indice);
    expect(lista[0].id).toBe("esme.nucleo.troceo-pro");
    expect(lista[0].mejora).toBeCloseTo(0.75, 3);
    expect(lista[0].porque).toContain("0.750");
  });

  it("los de herramienta se ordenan por los tokens que gastan", () => {
    const lista = buscaEnTienda(indice);
    const herramientas = lista.filter((r) => r.tokens_ciclo !== null);
    expect(herramientas[0].tokens_ciclo).toBeLessThanOrEqual(herramientas[1].tokens_ciclo ?? Infinity);
  });

  it("con texto, salen los que coinciden (y se dice por qué)", () => {
    // «memoria» está en las etiquetas de los dos que la usan
    const lista = buscaEnTienda(indice, "memoria");
    expect(lista.length).toBe(2);
    for (const r of lista) expect(r.porque).toContain("coincide");
    // y lo que NO coincide, no sale
    expect(lista.find((r) => r.id === "esme.malo")).toBeUndefined();
  });

  it("lo que no entró, no sale (si se pide sólo lo que entró)", () => {
    const lista = buscaEnTienda(indice, "", { soloEntran: true });
    expect(lista.find((r) => r.id === "esme.malo")).toBeUndefined();
  });

  it("el texto que se ve lo dice todo", () => {
    const texto = renderBusqueda(buscaEnTienda(indice));
    expect(texto).toContain("esme.nucleo.troceo-pro");
    expect(texto).toContain("recall");
  });

  it("una tienda vacía no rompe nada", () => {
    expect(buscaEnTienda({})).toEqual([]);
    expect(renderBusqueda([])).toBe("nada coincide");
  });
});
