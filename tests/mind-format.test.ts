import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validaMindDir } from "../core/mind/portable-format.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "mind-"));

const creaMind = (tweaks?: (dir: string) => void) => {
  const d = tmp();
  mkdirSync(join(d, "embeddings"));
  mkdirSync(join(d, "crs-delta"));
  writeFileSync(join(d, "metadata.json"), JSON.stringify({
    schema_version: 1,
    created_at: "2026-10-19T00:00:00Z",
    motor: "EmbeddingGemma-300M int8",
    recall: 0.77,
    counts: { recuerdos: 2334 },
  }));
  writeFileSync(join(d, "cognition.sig"), "sig");
  writeFileSync(
    join(d, "exclusion-list.json"),
    JSON.stringify(["work/**", "company/**", ".env*", "*.pem", "*.key", "*.env"])
  );
  tweaks?.(d);
  return d;
};

describe("estructura .mind (la mente portable)", () => {
  it("una mente bien estructurada vale", () => {
    expect(validaMindDir(creaMind()).ok).toBe(true);
  });

  it("quitar una exclusión mínima está PROHIBIDO (puede añadirse, nunca quitarse)", () => {
    const d = creaMind((dir) =>
      writeFileSync(
        join(dir, "exclusion-list.json"),
        JSON.stringify(["work/**", "company/**", ".env*", "*.pem"]) // sin *.key
      )
    );
    const r = validaMindDir(d);
    expect(r.ok).toBe(false);
    expect(r.errores.join()).toContain("*.key");
  });

  it("sin cognition.sig no se exporta", () => {
    const d = tmp();
    mkdirSync(join(d, "embeddings"));
    writeFileSync(join(d, "metadata.json"), "{}");
    writeFileSync(join(d, "exclusion-list.json"), "[]");
    const r = validaMindDir(d);
    expect(r.errores.join()).toContain("cognition.sig");
  });

  it("los metadatos necesitan los 5 islas (schema, fecha, motor, recall, counts)", () => {
    const d = creaMind((dir) =>
      rmSync(join(dir, "metadata.json"))
    );
    const r = validaMindDir(d);
    expect(r.errores.join()).toContain("metadata.json");
  });
});
