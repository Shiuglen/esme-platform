/**
 * LA PUERTA DE LAS SKILLS — una skill de cualquiera, juzgada en local.
 *
 * Lo que se prueba:
 *
 *   1. se miden los HECHOS: ficheros, bytes, licencia, tokens del SKILL.md;
 *   2. la huella del árbol es estable (mismos ficheros → misma huella) y
 *      cambia si cambia un byte;
 *   3. la licencia se reconoce (MIT, Apache…);
 *   4. y el veredicto es el del juez de la tienda, no otro: una skill sin
 *      commit fijado no entra (no se puede probar qué es).
 *
 * Referencia: core/skills/puerta.ts, tienda/skills.ts.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mideLocal, arbolDe, licenciaDe, juzgaLocal } from "../core/skills/puerta.ts";

const skill = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "esme-skill-"));
  writeFileSync(
    join(dir, "SKILL.md"),
    "---\nname: Mi skill\ndescription: Una skill que hace una cosa y la dice bien.\n---\n\n# Mi skill\n\nHaz esto.\n"
  );
  writeFileSync(join(dir, "LICENSE"), "MIT License\n\nPermission is hereby granted, free of charge...\n");
  return dir;
};

describe("la puerta de las skills", () => {
  it("mide los hechos: ficheros, bytes, licencia y tokens", () => {
    const dir = skill();
    try {
      const m = mideLocal(dir);
      expect(m.ficheros).toBe(2);
      expect(m.bytes).toBeGreaterThan(0);
      expect(m.licencia).toBe("MIT");
      expect(m.tokens).toBeGreaterThan(0);
      expect(m.skillMdSha256).toHaveLength(64);
      expect(m.lectura.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("la huella del árbol es estable y cambia si cambia un byte", () => {
    const dir = skill();
    try {
      const a = arbolDe(dir);
      expect(arbolDe(dir)).toBe(a);
      writeFileSync(join(dir, "extra.md"), "un fichero más");
      expect(arbolDe(dir)).not.toBe(a);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("la licencia se reconoce (y si no está, se dice)", () => {
    const dir = skill();
    try {
      expect(licenciaDe(dir)).toBe("MIT");
      rmSync(join(dir, "LICENSE"));
      expect(licenciaDe(dir)).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("el veredicto es el del juez: sin commit fijado, no entra", () => {
    const dir = skill();
    try {
      const v = juzgaLocal(dir, "mi-skill", "Mi skill");
      expect(v.entra).toBe(false);
      expect(v.causa).toMatch(/commit/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("una skill sin SKILL.md no entra (no hay nada que leer)", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-skill-"));
    try {
      const m = mideLocal(dir);
      expect(m.tokens).toBeNull();
      expect(m.lectura.ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
