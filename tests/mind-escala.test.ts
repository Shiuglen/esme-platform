// La mente a escala: el formato tiene que aguantar la mente de verdad
// (la referencia de la Prueba 0 son 2.334 recuerdos) y viajar por diferencias,
// no por peso completo.
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { escribeMind, leeMind, cognicionDe, type RecuerdoPortatil } from "../core/mind/mind-file.ts";
import { escribeMindZip, leeMindZip } from "../core/mind/mind-zip.ts";
import { deltaDe, aplicaDelta } from "../core/mind/delta.ts";

const N = 2334; // la referencia de la Prueba 0

const recuerdos = (n: number, cambiar = 0): RecuerdoPortatil[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${String(i).padStart(5, "0")}`,
    texto: `recuerdo ${i}: la mente es local y se puede borrar${i < cambiar ? " (CAMBIADO)" : ""}`,
    vector: [Number((i % 97) / 97), Number((i % 31) / 31), 0.5],
    fuente: `obsidian/notas/nota-${i % 40}.md`,
    tipo: "nota",
  }));

const destino = () => join(mkdtempSync(join(tmpdir(), "escala-")), "mente");

describe("la mente a escala", () => {
  it("2.334 recuerdos entran, salen y la cognición es la misma", () => {
    const d = destino();
    const mem = recuerdos(N);
    const ex = escribeMind(d, { recuerdos: mem, motor: "EmbeddingGemma-300M int8", recall: 0.77 });
    const im = leeMind(d);
    expect(im.recuerdos).toHaveLength(N);
    expect(cognicionDe(im.recuerdos)).toBe(ex.cognicion);
    expect(im.recuerdos[123].id).toBe(mem[123].id);
  });

  it("en un solo fichero también (la mente viaja entera)", () => {
    const ruta = join(destino(), "mente.mind.zip");
    const z = escribeMindZip(ruta, { recuerdos: recuerdos(N), motor: "EmbeddingGemma-300M int8", recall: 0.77 });
    expect(z.entradas.length).toBeGreaterThan(0);
    const im = leeMindZip(ruta);
    expect(im.recuerdos).toHaveLength(N);
  });

  it("lo que cambia de verdad viaja en el delta, no la mente entera", () => {
    const base = recuerdos(N);
    const nuevos = recuerdos(N, 50); // 50 recuerdos cambiados
    const d = deltaDe(base, nuevos);
    // el delta lleva solo lo que cambió: 50 vivos, nada más
    expect(d.vivos).toHaveLength(50);
    expect(d.añadidos).toHaveLength(0);
    expect(d.eliminados).toHaveLength(0);
    // y pesa una fracción de la mente (el vector es lo que pesa)
    const pesoDelta = JSON.stringify(d).length;
    const pesoMente = JSON.stringify(base).length;
    expect(pesoDelta).toBeLessThan(pesoMente / 5);
  });

  it("aplicar el delta devuelve EXACTAMENTE el estado nuevo", () => {
    const base = recuerdos(500);
    const nuevos = recuerdos(500, 20);
    const d = deltaDe(base, nuevos);
    const r = aplicaDelta(base, d);
    expect(r.violaciones).toEqual([]);
    expect(cognicionDe(r.recuerdos)).toBe(cognicionDe(nuevos));
  });
});
