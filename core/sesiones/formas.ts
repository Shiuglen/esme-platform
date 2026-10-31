/**
 * LAS TRES FORMAS DE UNA SESIÓN — los mismos eventos, escritos de las tres maneras en que puede estar.
 *
 *   - como la escribe hoy el Taller: formato 1, un evento por línea y sin sobre;
 *   - con sobre, como la escribe el Escritor (core/sesiones/fichero.ts): un
 *     `dueno` al principio, y los trozos de texto juntos hasta el siguiente latido;
 *   - compactada: otro registro, con los trozos juntos del todo.
 *
 * Las tres se reproducen igual (tests/sesion-escala.test.ts), y con ellas se
 * mide lo que cuesta abrir cada una (`npm run sesion -- medir`): que la prueba
 * y la medida escriban lo mismo es lo que hace que hablen de lo mismo.
 *
 * Referencia: estandar/sesion.spec.yaml (reglas), core/sesiones/compactar.ts.
 */
import { compactar, juntarPorLatido } from "./compactar.ts";
import { CADENA_VACIA, leer, sellar, type Evento } from "./registro.ts";

/** Como la escribe hoy el Taller: formato 1, un evento por línea. */
export function comoTaller(eventos: readonly Evento[]): string {
  return eventos.map((e) => `${JSON.stringify(e)}\n`).join("");
}

/** Con sobre, como la escribe el Escritor: un `dueno` de `de`, y los trozos juntos hasta el siguiente latido. */
export function conSobre(eventos: readonly Evento[], o: { de: string; sesion: string }): string {
  let c = CADENA_VACIA;
  const lineas: string[] = [];
  for (const e of [{ tipo: "dueno", sesion: o.sesion } as Evento, ...juntarPorLatido(eventos)]) {
    const r = sellar(c, e, o.de);
    lineas.push(`${r.linea}\n`);
    c = r.cadena;
  }
  return lineas.join("");
}

/** Las tres formas de unos eventos. */
export function formasDe(eventos: readonly Evento[], o: { de: string; sesion: string }): { taller: string; juntado: string; compactado: string } {
  const juntado = conSobre(eventos, o);
  return { taller: comoTaller(eventos), juntado, compactado: compactar(leer(juntado)).texto };
}
