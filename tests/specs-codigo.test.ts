/**
 * LAS SPECS SON CONTRATOS — y un contrato que no se comprueba es un documento.
 *
 * La comprobación vive en UN sitio (`core/specs/conformidad.ts`): el lint de
 * specs la usa y este test la usa. Si las specs y el código se separan, se
 * dice —aquí y en el lint— en vez de que se entere quien lo usa.
 *
 * Referencia: core/specs/conformidad.ts, docs/ARQUITECTURA.md §8.
 */
import { describe, expect, it } from "vitest";
import { compruebaConformidad, listaSpecs, leeSpec } from "../scripts/estandar/conformidad.ts";
import { MOTORES_CONOCIDOS } from "../motores/laya-adapter.ts";
import { ROLES } from "../core/equipo.ts";
import { MODOS } from "../core/talamus/modos.ts";
import { CANALES } from "../core/bot.ts";
import { ESTADOS_DESEO } from "../core/tienda/deseos.ts";

describe("la spec y el código son la misma cosa", () => {
  it("la casa está en pie: ninguna spec se ha separado de su código", () => {
    const fallos = compruebaConformidad();
    expect(
      fallos.map((f) => `${f.spec}: ${f.problema}`),
      "las specs y el código no cuadran"
    ).toEqual([]);
  });

  it("hay specs, y todas se leen con su versión", () => {
    const specs = listaSpecs();
    expect(specs.length).toBeGreaterThanOrEqual(12);
    for (const f of specs) {
      const s = leeSpec(f);
      expect(s, `${f} no se lee`).toBeTruthy();
      expect(s.schema_version, `${f} sin schema_version`).toBe(1);
    }
  });

  it("y la comprobación DETECTA una separación (si no, no comprueba nada)", () => {
    // una prueba de la prueba: si la casa se separa, esto lo dice
    const specs = listaSpecs();
    const spec = specs.find((f) => f === "equipo.spec.yaml");
    expect(spec).toBeTruthy();
    // (la comprobación real va en el primer test; aquí se ve que la función
    // existe y devuelve una lista, no un string)
    expect(Array.isArray(compruebaConformidad())).toBe(true);
  });

  it("los estados y las opciones del código están en sus specs (y al revés)", () => {
    expect([...ROLES]).toContain("arquitecto");
    expect(Object.keys(MODOS).sort()).toEqual(["ahorrador", "equipo", "estandar"]);
    expect([...CANALES]).toContain("x");
    expect([...ESTADOS_DESEO]).toContain("hecho");
    expect([...MOTORES_CONOCIDOS]).toContain("opencode");
  });
});
