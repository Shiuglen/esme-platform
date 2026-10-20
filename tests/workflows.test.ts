// Los workflows del CI son código: si no son YAML válido, GitHub no los corre
// (y lo dice con un rojo, no con un aviso). Este test los mira antes de que
// se suban.
//
// Ya pasó: el workflow de release llevaba desde el principio un `run:` con un
// ": " dentro sin comillas, así que el fichero entero no era YAML válido. La
// CI del kit se ejecutaba igual (otro workflow) y nadie se enteró hasta que el
// repo se hizo público y cada push dejó un rojo.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";

const raiz = resolve(import.meta.dirname, "..");
const dir = join(raiz, ".github", "workflows");

const workflows = (): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .filter((f) => statSync(join(dir, f)).isFile());

describe("los workflows del CI", () => {
  it("hay workflows (y el repo tiene CI)", () => {
    expect(workflows().length).toBeGreaterThan(0);
  });

  it("cada uno es YAML válido (uno roto no se corre: se queda muerto en silencio)", () => {
    const rotos: string[] = [];
    for (const f of workflows()) {
      try {
        yaml.load(readFileSync(join(dir, f), "utf8"));
      } catch (e) {
        rotos.push(`${f}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    expect(rotos, rotos.join("\n")).toEqual([]);
  });

  it("cada uno tiene jobs con steps (un workflow sin pasos no hace nada)", () => {
    const vacios: string[] = [];
    for (const f of workflows()) {
      const d = yaml.load(readFileSync(join(dir, f), "utf8")) as {
        jobs?: Record<string, { steps?: unknown[] }>;
      };
      const jobs = Object.values(d?.jobs ?? {});
      if (!jobs.length) {
        vacios.push(`${f}: sin jobs`);
        continue;
      }
      for (const [nombre, job] of Object.entries(d.jobs ?? {})) {
        if (!Array.isArray(job.steps) || !job.steps.length)
          vacios.push(`${f}: el job «${nombre}» no tiene pasos`);
      }
    }
    expect(vacios, vacios.join("\n")).toEqual([]);
  });

  it("la CI corre la puerta: lint, tests, spec-lint y el build del paquete", () => {
    const d = yaml.load(
      readFileSync(join(dir, "ci.yml"), "utf8")
    ) as { jobs?: Record<string, { steps?: Array<{ run?: string; name?: string }> }> };
    const texto = JSON.stringify(d.jobs ?? {});
    expect(texto).toContain("npm run lint");
    expect(texto).toContain("npm test");
    expect(texto).toContain("npm run spec:lint");
    expect(texto).toContain("npm run build");
  });
});
