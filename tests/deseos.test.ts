/**
 * LOS DESEOS — la lista de deseos de la tienda.
 *
 * Lo que se prueba:
 *
 *   1. un deseo sin origen no entra (un deseo viene de algo que guardaste);
 *   2. el estado es cerrado;
 *   3. un deseo «hecho» dice con qué módulo, y ese módulo tiene que estar en
 *      la tienda (si no, miente);
 *   4. un deseo hecho no se borra (se queda, con su módulo);
 *   5. y la demanda (lo que pide la gente) sale de la lista, agrupada.
 *
 * Referencia: core/tienda/deseos.ts, estandar/deseo.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { juzgaDeseo, juzgaDeseos, demanda, ESTADOS_DESEO } from "../core/tienda/deseos.ts";

const deseo = (parcial: Record<string, unknown> = {}) => ({
  id: "d1",
  url: "https://x.com/alguien/status/123",
  autor: "@alguien",
  texto: "Quiero un panel que muestre la memoria de cada agente.",
  etiquetas: ["puntos", "memoria"],
  estado: "nuevo",
  ts: 1_700_000_000_000,
  ...parcial,
});

describe("los deseos", () => {
  it("un deseo con origen, texto y estado entra", () => {
    const v = juzgaDeseo(deseo());
    expect(v.errores).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("un deseo sin origen no entra (un deseo viene de algo que guardaste)", () => {
    const v = juzgaDeseo(deseo({ url: "no soy un enlace" }));
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("viene de algo");
  });

  it("el estado es cerrado", () => {
    const v = juzgaDeseo(deseo({ estado: "chispas" }));
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("no es un estado");
    expect(ESTADOS_DESEO).toEqual(["nuevo", "en_curso", "hecho", "descartado"]);
  });

  it("un deseo «hecho» dice con qué módulo, y ese módulo tiene que estar en la tienda", () => {
    const sinModulo = juzgaDeseo(deseo({ estado: "hecho" }));
    expect(sinModulo.ok).toBe(false);
    expect(sinModulo.errores.join(" ")).toContain("con qué módulo");

    const conModuloFalso = juzgaDeseo(
      deseo({ estado: "hecho", modulo: "esme.inventado.nada" }),
      ["esme.nucleo.hola-mundo"]
    );
    expect(conModuloFalso.ok).toBe(false);
    expect(conModuloFalso.errores.join(" ")).toContain("no está en la tienda");

    const conModuloBueno = juzgaDeseo(
      deseo({ estado: "hecho", modulo: "esme.nucleo.hola-mundo" }),
      ["esme.nucleo.hola-mundo"]
    );
    expect(conModuloBueno.ok).toBe(true);
  });

  it("un deseo hecho no se borra: se queda, con su módulo", () => {
    const v = juzgaDeseos([deseo({ estado: "hecho", modulo: "esme.nucleo.hola-mundo" })], [
      "esme.nucleo.hola-mundo",
    ]);
    expect(v.deseos).toHaveLength(1);
    expect(v.deseos[0].estado).toBe("hecho");
    expect(v.deseos[0].modulo).toBe("esme.nucleo.hola-mundo");
  });

  it("la lista se juzga entera (un id repetido es un error)", () => {
    const v = juzgaDeseos([deseo(), deseo()]);
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("repetido");
  });

  it("la demanda dice qué hay que construir", () => {
    const v = juzgaDeseos([
      deseo({ id: "d1", etiquetas: ["puntos"] }),
      deseo({ id: "d2", etiquetas: ["puntos"] }),
      deseo({ id: "d3", etiquetas: ["memoria"] }),
      deseo({ id: "d4", estado: "hecho", modulo: "esme.nucleo.hola-mundo", etiquetas: ["puntos"] }),
    ]);
    const pide = demanda(v.deseos);
    expect(pide.puntos).toBe(2); // el hecho ya no se pide
    expect(pide.memoria).toBe(1);
  });

  it("una línea rota no tira la lista entera", () => {
    const v = juzgaDeseos([deseo(), { roto: true }, deseo({ id: "d2" })]);
    expect(v.deseos.length).toBe(2);
    expect(v.ok).toBe(false);
  });
});
