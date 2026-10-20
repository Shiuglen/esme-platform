import { describe, expect, it } from "vitest";
import { medirSkill, urlDeSkillMd } from "../tienda/medir.ts";
import { leerSkillMd } from "../tienda/skill-md.ts";

const texto = (cuerpo: string) => `---
name: frontend-design
description: Interfaces con personalidad propia.
---

${cuerpo}
`;

const buscar = (contenido: string, ok = true, status = 200) => async () => ({
  ok,
  status,
  arrayBuffer: async () => new TextEncoder().encode(contenido).buffer as ArrayBuffer,
});

describe("leer un SKILL.md (el estándar abierto de Agent Skills)", () => {
  it("lee la cabecera y el cuerpo", () => {
    const r = leerSkillMd(texto("Haz esto.\n\nY esto."), "frontend-design");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skill.name).toBe("frontend-design");
      expect(r.skill.description).toContain("personalidad");
      expect(r.skill.cuerpo).toContain("Haz esto");
    }
  });

  it("sin cabecera no se lee", () => {
    const r = leerSkillMd("Hola", "x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("cabecera");
  });

  it("faltan name o description → no se lee", () => {
    expect(leerSkillMd("---\ndescription: hola\n---\n\ncuerpo", "x").ok).toBe(false);
    expect(leerSkillMd("---\nname: x\n---\n\ncuerpo", "x").ok).toBe(false);
  });

  it("el nombre que no cuadra con la carpeta avisa (no tira la skill)", () => {
    const r = leerSkillMd(texto("cuerpo"), "otra-cosa");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avisos.join(" ")).toContain("no coincide");
  });

  it("un cuerpo vacío avisa", () => {
    const r = leerSkillMd("---\nname: x\ndescription: y\n---\n\n   \n", "x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avisos.join(" ")).toContain("vacío");
  });

  it("una descripción en varias líneas (YAML la pliega) se lee entera", () => {
    const md = `---
name: vercel-composition-patterns
description:
  React composition patterns that scale. Use when refactoring components with
  boolean prop proliferation, building flexible component libraries, or
  designing reusable APIs.
license: MIT
---

# React Composition Patterns
`;
    const r = leerSkillMd(md, "composition-patterns");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skill.description).toContain("React composition patterns that scale");
      expect(r.skill.description).toContain("designing reusable APIs");
      expect(r.skill.licencia).toBe("MIT");
    }
  });

  it("un mapa anidado no se cuela como valor", () => {
    const md = `---
name: x
description: y
metadata:
  author: vercel
  version: '1.0.0'
---

cuerpo
`;
    const r = leerSkillMd(md, "x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.skill.description).toBe("y");
  });
});

describe("medir la skill de verdad", () => {
  const fuente = { repo: "anthropics/skills", ruta: "skills/frontend-design", commit: "d".repeat(40) };

  it("la URL es el commit fijado, no la última versión", () => {
    expect(urlDeSkillMd(fuente)).toBe(
      `https://raw.githubusercontent.com/anthropics/skills/${"d".repeat(40)}/skills/frontend-design/SKILL.md`
    );
  });

  it("una ruta con .. no vale", () => {
    expect(() => urlDeSkillMd({ ...fuente, ruta: "../salir" })).toThrow();
  });

  it("mide el fichero: sha256, bytes y tokens", async () => {
    const m = await medirSkill(fuente, { buscar: buscar(texto("Hola.\n")) });
    expect(m.bytes).toBeGreaterThan(0);
    expect(m.tokens).toBe(Math.round(texto("Hola.\n").length / 4));
    expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(m.lectura.ok).toBe(true);
  });

  it("si no hay SKILL.md, la causa es clara", async () => {
    const m = await medirSkill(fuente, { buscar: buscar("", false, 404) });
    expect(m.lectura.ok).toBe(false);
    if (!m.lectura.ok) expect(m.lectura.error).toContain("SKILL.md");
  });
});
