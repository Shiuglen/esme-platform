import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importaVault } from "../core/mind/importers/obsidian.ts";

// El examen re__(*): notas reales. Un secreto UNA vez, y la empresa Testa.
const crea = (withTweaks?: (d: string) => void) => {
  const d = mkdtempSync(join(tmpdir(), "vault-"));
  mkdirSync(join(d, "notas"));
  mkdirSync(join(d, "work"));
  writeFileSync(
    join(d, "notas", "idea.md"),
    "## Invariantes\nLa mente es local y el servidor nunca piensa.\n"
  );
  writeFileSync(
    join(d, "notas", "credenciales.md"),
    "## Claves\nEl token es sk-proj-qrstuvwxyzabcdefghij123456 y solo vive aquí.\n"
  );
  writeFileSync(
    join(d, "work", "empresa.md"),
    "## Meeting\nEl plan secreto de la empresa empieza por aquí.\n"
  );
  writeFileSync(join(d, "README.md"), "# Bienvenido\nEl índice del vault.\n");
  withTweaks?.(d);
  return d;
};

describe("importador de Vault (la absorción con escudo antes que el troceo)", () => {
  it("importa los ficheros legales troceados por apartados", () => {
    const d = crea();
    const r = importaVault(d, { vaultNombre: "obs" });
    expect(r.ficheros.sort()).toEqual(["README.md", "notas/credenciales.md", "notas/idea.md"]);
    expect(r.trozos.some((t) => t.texto.includes("La mente es local"))).toBe(true);
    rmSync(d, { recursive: true, force: true });
  });

  it("work/** queda EXCLUIDO: el plan de la empresa ni siquiera se trocea", () => {
    const d = crea();
    const r = importaVault(d);
    expect(r.excluidos).toContain("work/empresa.md");
    expect(r.trozos.some((t) => t.texto.includes("plan secreto"))).toBe(false);
    rmSync(d, { recursive: true, force: true });
  });

  it("el secreto se redacta ANTES de trocear: ningún trozo lo contiene", () => {
    const d = crea();
    const r = importaVault(d);
    expect(r.secretosRedactados).toBeGreaterThanOrEqual(1);
    const todoElTexto = r.trozos.map((t) => t.texto).join(" ");
    expect(todoElTexto).not.toContain("sk-proj-qrstuvwxyz");
    expect(todoElTexto).toContain("[SECRET:openai-sk]");
    rmSync(d, { recursive: true, force: true });
  });

  it("el exclusion del usuario se SUMA a la mínima, nunca la sustituye", () => {
    const d = crea((t) =>
      writeFileSync(join(t, "notas", "idea.md"), "nota sensata\n")
    );
    const r = importaVault(d, { exclusiones: ["notas/**"] });
    expect(r.excluidos).toContain("notas/idea.md");
    expect(r.excluidos).toContain("work/empresa.md"); // la mínima sigue viva
    rmSync(d, { recursive: true, force: true });
  });
});
