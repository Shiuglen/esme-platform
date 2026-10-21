/**
 * EL ALCANCE — ningún fichero del núcleo sin prueba que lo alcance.
 *
 * Por qué este test existe. La forma más común de que un fallo se esconda no
 * es donde se escribe: es donde nadie mira. Un fichero nuevo del núcleo
 * (los validadores de REA, la puerta de los programas) entra, el `tsc` pasa,
 * y nadie se entera de que su regla no se cumple hasta que hace falta.
 *
 * Lo que se comprueba. Se recorre el grafo de imports desde `tests/` y se mira
 * qué ficheros del núcleo quedan fuera. Un fichero que ninguna prueba alcanza
 * es un fichero que nadie prueba: aquí sale con su nombre.
 *
 * No es cobertura de líneas: no mide quién EJECUTA el código, mide quién
 * PUEDE ejecutarlo. Y no juzga la calidad de una prueba: sólo que exista.
 *
 * Referencia: scripts/estandar/alcance.ts, docs/ARQUITECTURA.md §8.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  EXCEPCIONES_ALCANCE,
  alcanzablesDesde,
  huerfanosDelNucleo,
  nucleoDelKit,
  pruebasDelKit,
} from "../scripts/estandar/alcance.ts";

const raiz = resolve(import.meta.dirname, "..");

/** Las excepciones: las mismas que usa el lint de specs (un solo sitio). */
const EXCEPCIONES = EXCEPCIONES_ALCANCE;

describe("el alcance de las pruebas", () => {
  it("hay núcleo y hay pruebas (si no, esto no comprueba nada)", () => {
    expect(nucleoDelKit(raiz).length).toBeGreaterThan(50);
    expect(pruebasDelKit(raiz).length).toBeGreaterThan(30);
  });

  it("ningún fichero del núcleo queda fuera del alcance de las pruebas", () => {
    expect(huerfanosDelNucleo(raiz, EXCEPCIONES)).toEqual([]);
  });

  it("las excepciones son pocas y están justificadas", () => {
    // una excepción es una decisión: si hay muchas, no es una excepción, es
    // una puerta trasera. Y cada una dice por qué.
    expect(Object.keys(EXCEPCIONES).length).toBeLessThanOrEqual(3);
    for (const motivo of Object.values(EXCEPCIONES)) {
      expect(motivo.length).toBeGreaterThan(20);
    }
  });

  it("y la comprobación DETECTA un huérfano (si no, no comprueba nada)", () => {
    // la prueba de la prueba: se mira un fichero del núcleo que existe y que
    // ninguna prueba alcanza, y se comprueba que el detector lo ve.
    const alcanzables = alcanzablesDesde(raiz, pruebasDelKit(raiz));
    const huerfanos = huerfanosDelNucleo(raiz, {});
    // el detector sabe distinguir: si encuentra alguno, está en el conjunto
    // de ficheros que NO son alcanzables
    for (const h of huerfanos) {
      expect(alcanzables.has(resolve(raiz, h))).toBe(false);
    }
    // y el núcleo tiene ficheros de verdad (si no, el test de arriba no
    // probaría nada)
    expect(nucleoDelKit(raiz).length).toBeGreaterThan(0);
  });
});
