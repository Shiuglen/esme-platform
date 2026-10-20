// La mente absorbe de más: una nota suelta, un árbol que no es de Obsidian y
// un volcado de otra herramienta. El pipeline es el mismo en los tres.
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importaVault } from "../core/mind/importers/obsidian.ts";
import { importaMarkdown } from "../core/mind/importers/markdown.ts";
import { importaJson } from "../core/mind/importers/json.ts";

const dir = () => mkdtempSync(join(tmpdir(), "imp-"));

describe("absorber markdown", () => {
  it("una nota suelta entra troceada", () => {
    const d = dir();
    const f = join(d, "nota.md");
    writeFileSync(f, "# Título\n\nUn párrafo con la idea.\n\n## Otro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
    const r = importaMarkdown(f);
    expect(r.ficheros).toEqual(["nota.md"]);
    expect(r.trozos.length).toBeGreaterThan(1);
    expect(r.trozos.some((t) => t.tipo === "fila-tabla")).toBe(true);
    expect(r.trozos[0].fuente.startsWith("markdown/")).toBe(true);
  });

  it("el secreto se redacta antes de que exista el trozo", () => {
    const d = dir();
    const f = join(d, "nota.md");
    writeFileSync(f, "mi llave ghp_axbcdefghijklmnopqrstuvwxyz1234567890AB aquí");
    const r = importaMarkdown(f);
    expect(r.secretosRedactados).toBe(1);
    expect(r.trozos.every((t) => !t.texto.includes("ghp_axbc"))).toBe(true);
  });

  it("lo excluido no se lee (ni se cuenta)", () => {
    const d = dir();
    mkdirSync(join(d, "work"));
    writeFileSync(join(d, "work", "empresa.md"), "Plan de la empresa Q2027");
    writeFileSync(join(d, "mía.md"), "Esto sí entra");
    // la exclusión es RELATIVA a la raíz que se absorbe: "work/**" excluye
    // work/..., no un fichero suelto que se llame empresa.md
    const r = importaMarkdown(d, { vaultNombre: "markdown" });
    expect(r.excluidos).toEqual(["work/empresa.md"]);
    expect(r.trozos).toHaveLength(1);
    expect(r.trozos[0].fuente).toContain("markdown/mía.md");
  });
});

describe("absorber json", () => {
  it("un volcado entra como recuerdos", () => {
    const d = dir();
    const f = join(d, "dump.json");
    writeFileSync(f, JSON.stringify([
      { id: "a", texto: "La mente es local", fuente: "otro-tool/nota" },
      { text: "El servidor nunca piensa", source: "otro-tool/otra" },
    ]));
    const r = importaJson(f);
    expect(r.trozos.length).toBe(2);
    expect(r.trozos[0].fuente).toBe("otro-tool/nota#inicio");
    expect(r.trozos[1].fuente).toBe("otro-tool/otra#inicio");
  });

  it("acepta el envoltorio {recuerdos: [...]}", () => {
    const d = dir();
    const f = join(d, "dump.json");
    writeFileSync(f, JSON.stringify({ recuerdos: [{ texto: "Dentro del envoltorio" }] }));
    const r = importaJson(f);
    expect(r.trozos).toHaveLength(1);
    expect(r.trozos[0].texto).toContain("Dentro del envoltorio");
  });

  it("el secreto de un volcado no entra en claro", () => {
    const d = dir();
    const f = join(d, "dump.json");
    writeFileSync(f, JSON.stringify([{ texto: "mi secreto ghp_axbcdefghijklmnopqrstuvwxyz1234567890AB" }]));
    const r = importaJson(f);
    expect(r.secretosRedactados).toBe(1);
    expect(r.trozos[0].texto).toContain("[SECRET:github-ghp]");
  });

  it("una fuente excluida no entra (excluir es del pipeline, no del formato)", () => {
    const d = dir();
    const f = join(d, "dump.json");
    writeFileSync(f, JSON.stringify([
      { texto: "esto no debe entrar", fuente: "company/secreto.md" },
      { texto: "esto sí", fuente: "notas/mia.md" },
    ]));
    const r = importaJson(f);
    expect(r.excluidos).toEqual(["company/secreto.md"]);
    expect(r.trozos).toHaveLength(1);
    expect(r.trozos[0].fuente).toBe("notas/mia.md#inicio");
  });

  it("un json que no es una lista de recuerdos no rompe nada", () => {
    const d = dir();
    const f = join(d, "dump.json");
    writeFileSync(f, JSON.stringify({ lo_que_sea: 1 }));
    expect(importaJson(f).trozos).toHaveLength(0);
  });
});

describe("el vault sigue siendo el vault", () => {
  it("obsidian no ha cambiado (mismo nombre de almacén, mismas garantías)", () => {
    const d = dir();
    writeFileSync(join(d, "nota.md"), "# Idea\n\nLa mente es local");
    const r = importaVault(d);
    expect(r.vault).toBe("vault");
    expect(r.trozos[0].fuente.startsWith("vault/")).toBe(true);
  });
});
