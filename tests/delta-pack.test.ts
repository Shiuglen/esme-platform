import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { escribeMind, leeMind, type RecuerdoPortatil } from "../core/mind/mind-file.ts";
import { escribeDelta, actualizaMind } from "../core/mind/delta-pack.ts";

const tmp = mkdtempSync(join(tmpdir(), "dp-"));
const mindDir = (n: string) => join(tmp, n);


const r = (id: string, texto: string, q = 1): RecuerdoPortatil => ({ id, texto, vector: [q] });

const base = [r("a", "uno"), r("b", "dos"), r("c", "tres")];
const nueva = [r("a", "uno"), r("b", "dos-VIVO"), r("d", "cuatro")];

describe("delta-pack — la mente se actualiza sin re-embedding completo", () => {
  it("flujo completo: base .mind + delta → .mind nueva idéntica al estado nuevo", () => {
    const baseDir = mindDir("base1");
    escribeMind(baseDir, { recuerdos: base, motor: "EmbeddingGemma-300M int8", recall: 0.77 });
    const deltaRuta = join(tmp, "delta1.json");
    escribeDelta(baseDir, nueva, deltaRuta);
    const destino = join(tmp, "mente-1");
    const { ruta, violaciones } = actualizaMind(baseDir, deltaRuta, destino);
    expect(violaciones).toEqual([]);
    expect(ruta).toBeTruthy();
    const { recuerdos } = leeMind(destino);
    expect(recuerdos.map((x) => x.id).sort()).toEqual(["a", "b", "d"]);
    expect(recuerdos.find((x) => x.id === "b")!.texto).toBe("dos-VIVO");
  });

  it("la base del delta manda: un delta de otra mente se NIEGA entero", () => {
    const baseDir = mindDir("base2");
    escribeMind(baseDir, { recuerdos: base, motor: "m", recall: 0.5 });
    const otraCosa = [r("a", "uno"), r("b", "dos"), r("d", "cuatro")];
    const otraDir = mindDir("base-ajena");
    escribeMind(otraDir, { recuerdos: otraCosa, motor: "m", recall: 0.5 });
    escribeDelta(otraDir, nueva, join(tmp, "delta-ajeno.json"));
    const { violaciones } = actualizaMind(
      baseDir,
      join(tmp, "delta-ajeno.json"),
      mindDir("mente-2")
    );
    expect(violaciones.join()).toContain("otra cognición");
  });

  it("un delta adulterado (cognición mentirosa) no produce mente", () => {
    const baseDir = mindDir("base3");
    escribeMind(baseDir, { recuerdos: base, motor: "m", recall: 0.5 });
    const deltaRuta = join(tmp, "delta3.json");
    escribeDelta(baseDir, nueva, deltaRuta);
    const d = JSON.parse(readFileSync(deltaRuta, "utf8"));
    d.actual_cognicion = "mentira-quiere-pasar";
    writeFileSync(deltaRuta, JSON.stringify(d));
    const { ruta, violaciones } = actualizaMind(baseDir, deltaRuta, mindDir("mente-3"));
    expect(ruta).toBeNull();
    expect(violaciones.join()).toContain("no cuadra");
  });

  it("actualizar NUNCA muta la base: tras el flujo la base sigue verificando igual", () => {
    const baseDir = mindDir("base4");
    escribeMind(baseDir, { recuerdos: base, motor: "m", recall: 0.5 });
    const antes = leeMind(baseDir).recuerdos;
    const deltaRuta = join(tmp, "delta4.json");
    escribeDelta(baseDir, nueva, deltaRuta);
    actualizaMind(baseDir, deltaRuta, mindDir("mente-4"));
    expect(leeMind(baseDir).recuerdos).toEqual(antes);
  });
});
