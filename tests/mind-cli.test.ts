import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "../scripts/mind-cli.ts";
import type { RecuerdoPortatil } from "../core/mind/mind-file.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "cli-"));

const creaVault = (d: string) => {
  mkdirSync(join(d, "notas"));
  mkdirSync(join(d, "work"));
  writeFileSync(join(d, "notas", "a.md"), "## Núcleo\nEl Tálamo arma el paquete.\n");
  writeFileSync(join(d, "work", "b.md"), "Secreto de empresa.\n");
};

describe("mind-cli — los cuatro verbos", () => {
  it("absorber: trozos, excluidos y secretos contados", () => {
    const d = tmp();
    creaVault(d);
    const s = cli(["absorber", d, join(d, "absorbido.json")]);
    expect(s.code).toBe(0);
    const j = JSON.parse(readFileSync(join(d, "absorbido.json"), "utf8"));
    expect(j.trozos.some((t: { texto: string }) => t.texto.includes("Tálamo"))).toBe(true);
    expect(j.excluidos.length).toBeGreaterThanOrEqual(1);
  });

  it("exportar: sin vectores se NIEGA; con vectores nace el .mind", () => {
    const d = tmp();
    const sinVec = join(d, "sin.json");
    writeFileSync(sinVec, JSON.stringify({ recuerdos: [{ id: "x", texto: "s", vector: null }], motor: "la-lente", recall: 0 }));
    expect(cli(["exportar", sinVec, join(d, "m1")]).code).toBe(1);

    const rec: RecuerdoPortatil[] = [
      { id: "1", texto: "la mente es local", vector: [0.1, 0.2] },
    ];
    const conVec = join(d, "con.json");
    writeFileSync(conVec, JSON.stringify({ recuerdos: rec, motor: "EmbeddingGemma-300M int8", recall: 0.77 }));
    const s = cli(["exportar", conVec, join(d, "m2")]);
    expect(s.code).toBe(0);
    expect(s.out).toContain("cognición");
  });

  it("importar: ida y vuelta vía CLI, fiel", () => {
    const d = tmp();
    const rec: RecuerdoPortatil[] = [{ id: "1", texto: "hola", vector: [1] }];
    const conVec = join(d, "con.json");
    writeFileSync(conVec, JSON.stringify({ recuerdos: rec, motor: "m", recall: 0.5 }));
    expect(cli(["exportar", conVec, join(d, "m2")]).code).toBe(0);
    expect(cli(["importar", join(d, "m2"), join(d, "deVuelta.json")]).code).toBe(0);
    const vuelta = JSON.parse(readFileSync(join(d, "deVuelta.json"), "utf8")) as RecuerdoPortatil[];
    // fiel en los tres campos del contrato (la forma puede añadir nulos canónicos)
    expect(vuelta.map((r) => ({ id: r.id, texto: r.texto, vector: r.vector }))).toEqual(rec);
  });

  it("info: lee metadatos sin extraer nada", () => {
    const d = tmp();
    const rec: RecuerdoPortatil[] = [{ id: "1", texto: "hola", vector: [1] }];
    const conVec = join(d, "con.json");
    writeFileSync(conVec, JSON.stringify({ recuerdos: rec, motor: "EmbeddingGemma-300M int8", recall: 0.77 }));
    cli(["exportar", conVec, join(d, "m2")]);
    const s = cli(["info", join(d, "m2")]);
    expect(s.out).toContain("EmbeddingGemma-300M int8");
    expect(s.code).toBe(0);
  });

  it("verbo desconocido → error con uso", () => {
    const s = cli(["pepe"]);
    expect(s.code).toBe(1);
    expect(s.out).toContain("uso");
  });
});
