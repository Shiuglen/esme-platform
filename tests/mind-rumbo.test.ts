// El rumbo viaja con la mente: si un .mind lo lleva, tiene que valer.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validaMindDir } from "../core/mind/portable-format.ts";
import { EXCLUSION_MINIMA } from "../core/mind/redaction.ts";

const base = () => {
  const d = mkdtempSync(join(tmpdir(), "mind-"));
  mkdirSync(join(d, "embeddings"));
  mkdirSync(join(d, "crs-delta"));
  writeFileSync(join(d, "metadata.json"), JSON.stringify({ schema_version: 1, created_at: 1, motor: "x", recall: 1, counts: {} }));
  writeFileSync(join(d, "cognition.sig"), "firma");
  writeFileSync(join(d, "exclusion-list.json"), JSON.stringify(EXCLUSION_MINIMA));
  return d;
};

describe("el rumbo en una mente portable", () => {
  it("una mente sin rumbo sigue siendo una mente válida", () => {
    expect(validaMindDir(base()).ok).toBe(true);
  });

  it("si el rumbo está, tiene que valer", () => {
    const d = base();
    writeFileSync(join(d, "rumbo.json"), JSON.stringify({ version: 1, pilares: [{ id: "p1", texto: "Esme de otro mundo", creado: 1 }], objetivos: [{ id: "o1", texto: "La tienda firmada", estado: "activo", creado: 2, cerrado: null, pilar: "p1" }] }));
    expect(validaMindDir(d).ok).toBe(true);
  });

  it("un rumbo con un objetivo sin estado raro no vale", () => {
    const d = base();
    writeFileSync(join(d, "rumbo.json"), JSON.stringify({ pilares: [], objetivos: [{ id: "o1", texto: "X", estado: "inventado" }] }));
    const r = validaMindDir(d);
    expect(r.ok).toBe(false);
    expect(r.errores.join(" ")).toContain("estado raro");
  });

  it("un rumbo que no es JSON no vale", () => {
    const d = base();
    writeFileSync(join(d, "rumbo.json"), "{ roto");
    expect(validaMindDir(d).ok).toBe(false);
  });
});
