/**
 * LA ESCALA — la tarea más larga de hoy, entera.
 *
 * Lo que se prueba, con una tarea sintética del tamaño que dice la spec
 * (`reglas.eventos_referencia`: 110.484 eventos, la más larga del Taller):
 *
 *   1. que se lee, se verifica y se reproduce igual en las tres formas en que
 *      puede estar escrita: como la escribe hoy el Taller (formato 1, un trozo
 *      por línea), con sobre juntando por latido (como la escribe el
 *      Escritor) y compactada. Las tres dan la misma traza y el mismo estado;
 *   2. cuánto pesa cada una: juntar al escribir la deja en menos de una sexta
 *      parte de las líneas, y compactar en menos aún;
 *   3. que reproducir es lineal: diez veces más eventos cuestan unas diez
 *      veces más, no cien. Es una proporción, y no depende de la máquina.
 *
 * Los milisegundos de la regla 10 (menos de 200) dependen de la máquina: los
 * mide `npm run sesion -- medir`, en la de quien lo corre.
 *
 * Referencia: estandar/sesion.spec.yaml (reglas), core/sesiones/compactar.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import * as yaml from "js-yaml";
import { comoTaller, conSobre, formasDe } from "../core/sesiones/formas.ts";
import { estadoDe, type Estado } from "../core/sesiones/reductor.ts";
import { leer, type Evento } from "../core/sesiones/registro.ts";
import { tallerSintetico } from "../core/sesiones/sintetico.ts";
import { trazaDe } from "../core/sesiones/traza.ts";

const spec = yaml.load(readFileSync(new URL("../estandar/sesion.spec.yaml", import.meta.url), "utf8")) as {
  reglas: { eventos_referencia: number };
};
const N = spec.reglas.eventos_referencia;

/** Quién la escribe y de qué sesión es, en las formas con sobre. */
const SOBRE = { de: "pc", sesion: "escala" };

/** El estado sin los números de evento ni el formato (lo único que cambia de una forma a otra). */
function sinPosiciones(s: Estado) {
  return {
    ...s,
    formato: undefined,
    sesion: undefined,
    epoca: undefined,
    dueno: undefined,
    eventos: undefined,
    turnos: s.turnos.map((t) => ({ ...t, desde: undefined, hasta: undefined })),
  };
}

/** Lo que cuesta abrir una sesión: leerla, verificarla y reproducir su estado y su traza (la mediana de unas vueltas, ya en marcha). */
function reproducir(texto: string, vueltas = 5): number {
  const ms: number[] = [];
  for (let i = 0; i <= vueltas; i++) {
    const a = performance.now();
    const l = leer(texto);
    estadoDe(l);
    trazaDe(l);
    if (i > 0) ms.push(performance.now() - a); // la primera vuelta solo calienta
  }
  return ms.sort((x, y) => x - y)[ms.length >> 1];
}

describe(`la tarea más larga de hoy (${N} eventos)`, () => {
  const eventos = tallerSintetico({ semilla: 1, eventos: N }) as Evento[];
  // las mismas tres formas que mide `npm run sesion -- medir`
  const { taller: v1, juntado, compactado } = formasDe(eventos, SOBRE);

  it("se lee igual en sus tres formas: la misma traza y el mismo estado", () => {
    const [l1, l2, l3] = [leer(v1), leer(juntado), leer(compactado)];
    expect([l1.valida, l2.valida, l3.valida]).toEqual([true, true, true]);
    expect([l1.formato, l2.formato, l3.formato]).toEqual([1, 2, 2]);
    expect(l1.eventos).toHaveLength(N);
    const traza = trazaDe(l1);
    expect(traza.turnos.length).toBeGreaterThan(100);
    expect(trazaDe(l2)).toEqual(traza);
    expect(trazaDe(l3)).toEqual(traza);
    const estado = sinPosiciones(estadoDe(l1));
    expect(sinPosiciones(estadoDe(l2))).toEqual(estado);
    expect(sinPosiciones(estadoDe(l3))).toEqual(estado);
  });

  it("juntar al escribir la deja en menos de una sexta parte de las líneas, y compactar en menos aún", () => {
    const lineas = (t: string) => leer(t).lineas.length;
    expect(lineas(juntado)).toBeLessThan(N / 6);
    expect(lineas(compactado)).toBeLessThan(lineas(juntado));
    expect(Buffer.byteLength(compactado)).toBeLessThan(Buffer.byteLength(juntado));
    expect(Buffer.byteLength(juntado)).toBeLessThan(Buffer.byteLength(v1));
  });

  it("reproducir es lineal: diez veces más eventos cuestan unas diez veces más, no cien", () => {
    const decimo = tallerSintetico({ semilla: 1, eventos: Math.round(N / 10) }) as Evento[];
    for (const [nombre, entero, poco] of [
      ["formato 1", v1, comoTaller(decimo)],
      ["con sobre", juntado, conSobre(decimo, SOBRE)],
    ] as const) {
      const proporcion = reproducir(entero) / reproducir(poco);
      expect(proporcion, `${nombre}: ${proporcion.toFixed(1)} veces`).toBeLessThan(25);
    }
  }, 60_000);
});
