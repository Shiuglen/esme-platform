import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { escribeMind, leeMind, type MenteAExportar } from "../core/mind/mind-file.ts";

const mind = (over: Partial<MenteAExportar> = {}): MenteAExportar => ({
  recuerdos: [
    { id: "r1", texto: "La mente es local", vector: [0.1, 0.2], fuente: "obsidian/notas/idea.md" },
    { id: "r2", texto: "mi secreto ghp_axbcdefghijklmnopqrstuvwxyz1234567890AB", vector: [0.3, 0.4] },
    { id: "r3", texto: "Plan de la empresa Q2027", vector: [0.5, 0.6], fuente: "work/empresa.md" },
  ],
  motor: "EmbeddingGemma-300M int8",
  recall: 0.77,
  vault: "obs",
  ...over,
});
const destino = () => join(mkdtempSync(join(tmpdir(), "mind-x-")), "mente");

describe("la mente portátil bidireccional", () => {
  it("exporta e importa con ida y vuelta fiel de lo legal", () => {
    const d = destino();
    const ex = escribeMind(d, mind());
    expect(ex.excluidos).toEqual(["work/empresa.md"]);
    const im = leeMind(d);
    expect(im.recuerdos.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    const r1 = im.recuerdos.find((r) => r.id === "r1")!;
    expect(r1.texto).toBe("La mente es local");
    expect(r1.vector).toEqual([0.1, 0.2]);
  });

  it("el secreto viaja redactado y NUNCA en claro en el paquete", () => {
    const d = destino();
    escribeMind(d, mind());
    const r2 = leeMind(d).recuerdos.find((r) => r.id === "r2")!;
    expect(r2.texto).not.toContain("ghp_axbc");
    expect(r2.texto).toContain("[SECRET:github-ghp]");
  });

  it("la exclusión mínima viaja FIA (no puede faltar en el paquete)", () => {
    const d = destino();
    escribeMind(d, mind());
    expect(leeMind(d).exclusions).toContain("work/**");
  });

  it("adulterar un texto rompe la cognición y la importación se NIEGA", () => {
    const d = destino();
    escribeMind(d, mind());
    // manipulación silenciosa: cambiamos un vector a mano y cocinamos el sig viejo
    const { readFileSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
    const ruta = join(d, "embeddings", "vectors.jsonl");
    const manchado = readFileSync(ruta, "utf8").replace("0.1,0.2", "0.9,0.9");
    writeFileSync(ruta, manchado);
    expect(() => leeMind(d)).toThrow(/ALTERADA/);
  });

  it("dos exportaciones del mismo estado → misma cognición (estabilidad semántica)", () => {
    const a = escribeMind(destino(), mind());
    const b = escribeMind(destino(), mind());
    expect(a.cognicion).toBe(b.cognicion);
  });

  it("exportar nada extra excluding: el usuario suma, nunca quita", () => {
    const d = destino();
    const ex = escribeMind(d, mind({ exclusionesExtra: ["obsidian/**"] }));
    expect(ex.excluidos).toContain("obsidian/notas/idea.md");
    expect(ex.excluidos).toContain("work/empresa.md"); // la mínima sigue viva
  });
});
