import { describe, expect, it } from "vitest";
import { deltaDe, aplicaDelta } from "../core/mind/delta.ts";
import { cognicionDe, type RecuerdoPortatil } from "../core/mind/mind-file.ts";

const r = (id: string, texto: string): RecuerdoPortatil => ({ id, texto, vector: [id.length] });

describe("crs-delta — la mente viaja por diferencias", () => {
  const base = [r("a", "uno"), r("b", "dos"), r("c", "tres")];
  const nueva = [r("a", "uno"), r("b", "dosCLUSION"), r("d", "cuatro")];

  it("detecta añadidos, eliminados y vivos", () => {
    const d = deltaDe(base, nueva);
    expect(d.añadidos.map((x) => x.id)).toEqual(["d"]);
    expect(d.eliminados).toEqual(["c"]);
    expect(d.vivos.map((x) => x.id)).toEqual(["b"]);
  });

  it("aplicar el delta reconstruye el estado y su cognición cuadra", () => {
    const d = deltaDe(base, nueva);
    const { recuerdos, violaciones } = aplicaDelta(base, d);
    expect(violaciones).toEqual([]);
    expect(cognicionDe(recuerdos)).toBe(d.actual_cognicion);
  });

  it("aplicar contra una base que no es la del delta → SE NIEGA", () => {
    const d = deltaDe(base, nueva);
    const otraBase = [...base, r("z", "tinta")];
    const { violaciones } = aplicaDelta(otraBase, d);
    expect(violaciones.join()).toContain("otra cognición");
  });

  it("un delta_one mal armado (añadidos ya presentes) se niega sin tocar la base", () => {
    const d = deltaDe(base, nueva);
    const dFalso = { ...d, añadidos: [...d.añadidos, r("a", "corrupto")] };
    const { recuerdos, violaciones } = aplicaDelta(base, dFalso);
    expect(violaciones.join()).toContain("ya presentes");
    expect(recuerdos).toBe(base); // ni un byte tocado
  });

  it("sin cambios → delta vacío y aplicar es neutro", () => {
    const d = deltaDe(base, [...base]);
    expect(d.añadidos).toHaveLength(0);
    expect(d.eliminados).toHaveLength(0);
    expect(d.vivos).toHaveLength(0);
    const { recuerdos, violaciones } = aplicaDelta(base, d);
    expect(violaciones).toEqual([]);
    expect(cognicionDe(recuerdos)).toBe(d.actual_cognicion);
  });
});
