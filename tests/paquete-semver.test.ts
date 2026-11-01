/**
 * LOS RANGOS DE VERSIÓN — lo justo para que una plantilla diga «la 1, la que sea».
 *
 * Una plantilla fija cada paquete por su huella, y el rango dice qué
 * versiones habría aceptado: sirve para ver que la huella fijada es de una
 * versión que el autor quería. Nada de prereleases ni de `||`: lo raro no
 * entra hasta que haga falta.
 *
 * Referencia: core/paquetes/semver.ts, estandar/paquete.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { cumple, esRango } from "../core/paquetes/semver.ts";

describe("cumple — ¿esta versión entra en el rango?", () => {
  const casos: Array<[string, string, boolean]> = [
    ["1.4.2", "^1.0", true],
    ["2.0.0", "^1.0", false],
    ["0.4.9", "^0.4", true],
    ["0.5.0", "^0.4", false],
    ["0.0.3", "^0.0.3", true],
    ["0.0.4", "^0.0.3", false],
    ["1.2.9", "~1.2.3", true],
    ["1.2.2", "~1.2.3", false],
    ["1.3.0", "~1.2.3", false],
    ["1.2.7", "1.2", true],
    ["1.3.0", "1.2", false],
    ["1.9.9", "1", true],
    ["2.0.0", "1", false],
    ["3.0.0", ">=1.2", true],
    ["1.1.9", ">=1.2", false],
    ["9.9.9", "*", true],
    ["1.2.3", "1.2.3", true],
    ["1.2.4", "1.2.3", false],
    ["1.2.3", "=1.2.3", true],
    ["1.2.3", "^1.2.3", true],
    ["1.2.2", "^1.2.3", false],
    ["0.2.5", "^0.2.3", true],
    ["0.3.0", "^0.2.3", false],
    ["0.9.0", "^0", true],
    ["1.0.0", "^0", false],
  ];
  for (const [version, rango, esperado] of casos) {
    it(`${version} ${esperado ? "cumple" : "no cumple"} «${rango}»`, () => {
      expect(cumple(version, rango)).toBe(esperado);
    });
  }

  it("una versión que no es semver estricto no cumple nada", () => {
    expect(cumple("1.2", "*")).toBe(false);
    expect(cumple("v1.2.3", "^1.0")).toBe(false);
  });

  it("un rango que no es rango no lo cumple nadie", () => {
    expect(cumple("1.0.0", "^")).toBe(false);
  });
});

describe("esRango — lo que se puede escribir en un uses", () => {
  it("vale lo que la spec nombra", () => {
    for (const r of ["*", "1", "1.2", "1.2.3", "=1.2.3", "^1", "^1.2", "^0.4", "~1.2.3", ">=1.2"]) {
      expect(esRango(r), r).toBe(true);
    }
  });

  it("y nada más", () => {
    for (const r of ["^", "", "1.x.y", ">1", "<2", "1 || 2", "^1.0.0-beta", "latest", " ^1.0"]) {
      expect(esRango(r), r).toBe(false);
    }
  });
});
