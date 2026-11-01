/**
 * EL PAQUETE EN DISCO — se lee, se escribe y no se sale de su carpeta.
 *
 * La forma la prueba `paquete-manifiesto.test.ts`. Aquí, lo que solo pasa
 * con ficheros de verdad: el manifiesto en YAML, los ficheros que nombra, la
 * huella del árbol y la trampa de siempre, un enlace simbólico que parece un
 * fichero del paquete y lleva a otro sitio.
 *
 * Todo sintético, en carpetas temporales.
 *
 * Referencia: tienda/paquete-disco.ts, core/paquetes/manifiesto.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leePaquete, type PaqueteDatos } from "../core/paquetes/manifiesto.ts";
import { conocidoDeCarpeta, escribePaquete, leePaqueteDeCarpeta } from "../tienda/paquete-disco.ts";
import { arbolSha256 } from "../tienda/empaque.ts";

const carpetas: string[] = [];
const temporal = (): string => {
  const d = mkdtempSync(join(tmpdir(), "esme-paquete-"));
  carpetas.push(d);
  return d;
};
afterEach(() => {
  for (const d of carpetas.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Un paquete con una piel, una tarea y una herramienta de código. */
const conPiel = (extra: Record<string, unknown> = {}): PaqueteDatos => ({
  manifiesto: {
    schema_version: 2,
    id: "esme.prueba.disco",
    version: "1.0.0",
    name: "Disco",
    kind: "package",
    description: "Un paquete de prueba, sintético.",
    author: "Prueba",
    license: "MIT",
    contributes: {
      themes: [{ id: "piel", file: "piel.json" }],
      tasks: [{ id: "t", title: "Una tarea", prompt: "Haz algo útil." }],
    },
    ...extra,
  },
  ficheros: { "piel.json": JSON.stringify({ nombre: "Prueba" }) },
});

describe("escribePaquete y leePaqueteDeCarpeta — ida y vuelta", () => {
  it("lo que se escribe se relee igual", () => {
    const dir = temporal();
    const p = conPiel();
    escribePaquete(p, dir);
    const r = leePaqueteDeCarpeta(dir);
    expect(r.errores).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.version).toBe(2);
    expect(r.id).toBe("esme.prueba.disco");
    expect(r.paquete).toEqual(leePaquete(p.manifiesto).paquete);
  });

  it("escribe ficheros en subcarpetas, de texto y de bytes", () => {
    const dir = temporal();
    const p = conPiel({
      contributes: {
        skills: [{ id: "repasar", path: "skills/repasar" }],
        themes: [{ id: "piel", file: "pieles/piel.json" }],
      },
    });
    p.ficheros = {
      "skills/repasar/SKILL.md": "---\nname: repasar\ndescription: Repasa.\n---\nRepasa.\n",
      "pieles/piel.json": new TextEncoder().encode("{}"),
    };
    escribePaquete(p, dir);
    expect(leePaqueteDeCarpeta(dir).errores).toEqual([]);
  });

  it("no escribe fuera de su carpeta, ni encima del manifiesto", () => {
    const dir = temporal();
    expect(() => escribePaquete({ ...conPiel(), ficheros: { "../fuera.json": "{}" } }, dir)).toThrow("se sale del paquete");
    expect(() => escribePaquete({ ...conPiel(), ficheros: { "/tmp/fuera.json": "{}" } }, dir)).toThrow("se sale del paquete");
    expect(() => escribePaquete({ ...conPiel(), ficheros: { "module.yaml": "x" } }, dir)).toThrow("module.yaml");
  });

  it("no escribe a través de un enlace que se sale", () => {
    const dir = temporal();
    const fuera = temporal();
    symlinkSync(fuera, join(dir, "pieles"));
    const p = { ...conPiel(), ficheros: { "pieles/piel.json": "{}" } };
    expect(() => escribePaquete(p, dir)).toThrow("se sale del paquete");
  });

  it("no escribe a través de un module.yaml que es un enlace, ni de un enlace roto", () => {
    const fuera = temporal();
    writeFileSync(join(fuera, "suyo.yaml"), "de otro\n");
    const dir = temporal();
    symlinkSync(join(fuera, "suyo.yaml"), join(dir, "module.yaml"));
    expect(() => escribePaquete(conPiel(), dir)).toThrow("enlace");
    expect(readFileSync(join(fuera, "suyo.yaml"), "utf8")).toBe("de otro\n");

    const otro = temporal();
    symlinkSync(join(fuera, "nuevo.json"), join(otro, "piel.json")); // roto: lleva a algo que aún no está
    expect(() => escribePaquete(conPiel(), otro)).toThrow("enlace");
    expect(existsSync(join(fuera, "nuevo.json"))).toBe(false);
    expect(existsSync(join(otro, "module.yaml"))).toBe(false); // no escribe nada
  });
});

describe("leePaqueteDeCarpeta — lo que el manifiesto promete, el disco lo tiene", () => {
  it("falta un fichero que el manifiesto nombra: error con su ruta", () => {
    const dir = temporal();
    escribePaquete({ ...conPiel(), ficheros: {} }, dir);
    const r = leePaqueteDeCarpeta(dir);
    expect(r.ok).toBe(false);
    expect(r.errores.join("\n")).toContain("«piel.json»");
  });

  it("el código sin construir es un error, salvo si aún no se exige", () => {
    const dir = temporal();
    const p = conPiel({
      contributes: {
        themes: [{ id: "piel", file: "piel.json" }],
        tools: [{ id: "x", entry: "dist/x.js", runtime: "nodejs" }],
      },
    });
    escribePaquete(p, dir);
    expect(leePaqueteDeCarpeta(dir).errores.join("\n")).toContain("¿falta construirlo?");
    expect(leePaqueteDeCarpeta(dir, { exigirEntrada: false }).errores).toEqual([]);
  });

  it("sin exigir el código, el que ya está tampoco puede salirse del paquete", () => {
    const dir = temporal();
    const fuera = temporal();
    writeFileSync(join(fuera, "x.js"), "export {};");
    const p = conPiel({
      contributes: {
        themes: [{ id: "piel", file: "piel.json" }],
        tools: [{ id: "x", entry: "dist/x.js", runtime: "nodejs" }],
      },
    });
    escribePaquete({ ...p, ficheros: { ...p.ficheros, "dist/.keep": "" } }, dir);
    symlinkSync(join(fuera, "x.js"), join(dir, "dist", "x.js"));
    const r = leePaqueteDeCarpeta(dir, { exigirEntrada: false });
    expect(r.ok).toBe(false);
    expect(r.errores.join("\n")).toContain("tools.x: «dist/x.js» se sale del paquete");
  });

  it("una skill o un agente con hooks (o lo que da permisos) en su cabecera no vale, aunque el manifiesto esté bien", () => {
    const dir = temporal();
    const p = conPiel({
      contributes: {
        skills: [{ id: "a", path: "skills/a" }],
        agents: [{ id: "g", recipe: "agents/g.md", format: "claude-md" }],
      },
    });
    p.ficheros = {
      "skills/a/SKILL.md": '---\nname: a\ndescription: Una skill.\n"hooks":\n  Stop: [{command: x}]\n---\nHola.\n',
      "agents/g.md": "---\nname: g\ndescription: Un agente.\npermissionMode: bypassPermissions\n---\nHola.\n",
    };
    escribePaquete(p, dir);
    const r = leePaqueteDeCarpeta(dir);
    expect(r.ok).toBe(false);
    expect(r.errores).toEqual([
      expect.stringContaining("skills.a: su SKILL.md lleva «hooks»"),
      expect.stringContaining("agents.g: «agents/g.md» lleva «permissionMode»"),
    ]);
  });

  it("una ruta que es una carpeta no es un fichero", () => {
    const dir = temporal();
    escribePaquete({ ...conPiel(), ficheros: {} }, dir);
    mkdirSync(join(dir, "piel.json"));
    expect(leePaqueteDeCarpeta(dir).errores.join("\n")).toContain("no es un fichero");
  });

  it("un piel.json que es un enlace a un fichero de fuera: se sale del paquete", () => {
    const dir = temporal();
    const fuera = temporal();
    writeFileSync(join(fuera, "secreto.json"), JSON.stringify({ nombre: "de otro" }));
    escribePaquete({ ...conPiel(), ficheros: {} }, dir);
    symlinkSync(join(fuera, "secreto.json"), join(dir, "piel.json"));
    const r = leePaqueteDeCarpeta(dir);
    expect(r.ok).toBe(false);
    expect(r.errores.join("\n")).toContain("themes.piel: «piel.json» se sale del paquete");
  });

  it("una carpeta del camino que es un enlace a fuera: también se sale", () => {
    const dir = temporal();
    const fuera = temporal();
    writeFileSync(join(fuera, "piel.json"), "{}");
    const p = conPiel({ contributes: { themes: [{ id: "piel", file: "pieles/piel.json" }] } });
    escribePaquete({ ...p, ficheros: {} }, dir);
    symlinkSync(fuera, join(dir, "pieles"));
    expect(leePaqueteDeCarpeta(dir).errores.join("\n")).toContain("«pieles/piel.json» se sale del paquete");
  });

  it("un enlace que el manifiesto no nombra pero se sale, o no lleva a nada: también se dice", () => {
    const dir = temporal();
    const fuera = temporal();
    escribePaquete(conPiel(), dir);
    symlinkSync(fuera, join(dir, "atajo"));
    symlinkSync(join(dir, "no-existe"), join(dir, "roto"));
    const e = leePaqueteDeCarpeta(dir).errores.join("\n");
    expect(e).toContain("el enlace «atajo» se sale del paquete");
    expect(e).toContain("el enlace «roto» no lleva a ningún sitio");
  });

  it("un enlace dentro del paquete vale", () => {
    const dir = temporal();
    escribePaquete({ ...conPiel(), ficheros: { "pieles/base.json": "{}" } }, dir);
    symlinkSync(join(dir, "pieles", "base.json"), join(dir, "piel.json"));
    expect(leePaqueteDeCarpeta(dir).errores).toEqual([]);
  });

  it("un module.yaml que es un enlace a fuera no se lee", () => {
    const dir = temporal();
    const fuera = temporal();
    escribePaquete(conPiel(), fuera);
    writeFileSync(join(dir, "piel.json"), "{}");
    symlinkSync(join(fuera, "module.yaml"), join(dir, "module.yaml"));
    const r = leePaqueteDeCarpeta(dir);
    expect(r.ok).toBe(false);
    expect(r.errores.join("\n")).toContain("module.yaml");
    expect(r.errores.join("\n")).toContain("se sale del paquete");
  });

  it("un YAML roto: no se puede leer, y no se lanza", () => {
    const dir = temporal();
    writeFileSync(join(dir, "module.yaml"), "schema_version: 2\nid: [esto no cierra\n");
    const r = leePaqueteDeCarpeta(dir);
    expect(r.ok).toBe(false);
    expect(r.errores.join("\n")).toContain("no se puede leer");
  });

  it("sin module.yaml, o sin carpeta: dicho, sin lanzar", () => {
    expect(leePaqueteDeCarpeta(temporal()).errores.join("\n")).toContain("no hay module.yaml");
    expect(leePaqueteDeCarpeta(join(tmpdir(), "esme-no-existe-nunca")).ok).toBe(false);
  });

  it("un manifiesto inválido da su id y sus errores", () => {
    const dir = temporal();
    escribePaquete(conPiel({ kind: "app" }), dir);
    const r = leePaqueteDeCarpeta(dir);
    expect(r.ok).toBe(false);
    expect(r.id).toBe("esme.prueba.disco");
    expect(r.errores.join("\n")).toContain("kind");
  });

  it("las reglas del índice, como en la v1: ESME-CL pide firma, la tienda pide benchmarks", () => {
    const dir = temporal();
    escribePaquete(conPiel({ license: "ESME-CL" }), dir);
    expect(leePaqueteDeCarpeta(dir).errores.join("\n")).toContain("ESME-CL exige firma");
    const otro = temporal();
    escribePaquete(conPiel(), otro);
    expect(leePaqueteDeCarpeta(otro, { exigirBenchmarks: true }).errores.join("\n")).toContain("benchmarks");
  });
});

describe("conocidoDeCarpeta — el paquete con su huella", () => {
  it("la huella es la del árbol, y un byte cambia la huella", () => {
    const dir = temporal();
    escribePaquete(conPiel(), dir);
    const c = conocidoDeCarpeta(dir);
    expect("sha256" in c).toBe(true);
    if (!("sha256" in c)) return;
    expect(c.sha256).toBe(arbolSha256(dir));
    expect(c.manifiesto.id).toBe("esme.prueba.disco");
    writeFileSync(join(dir, "piel.json"), JSON.stringify({ nombre: "Prueba." }));
    const d = conocidoDeCarpeta(dir);
    expect("sha256" in d && d.sha256).not.toBe(c.sha256);
  });

  it("un paquete que no vale da su dictamen, no una huella", () => {
    const dir = temporal();
    escribePaquete({ ...conPiel(), ficheros: {} }, dir);
    const c = conocidoDeCarpeta(dir);
    expect("sha256" in c).toBe(false);
    expect("errores" in c && c.errores.join("\n")).toContain("«piel.json»");
  });

  it("un árbol que no se puede medir (un enlace a una carpeta) da dictamen, no lanza", () => {
    const dir = temporal();
    escribePaquete({ ...conPiel(), ficheros: { "piel.json": "{}", "pieles/base.json": "{}" } }, dir);
    symlinkSync(join(dir, "pieles"), join(dir, "atajo"));
    let c: ReturnType<typeof conocidoDeCarpeta> | undefined;
    expect(() => (c = conocidoDeCarpeta(dir))).not.toThrow();
    expect(c && "errores" in c && c.errores.join("\n")).toContain("huella");
  });

  it("borrar el fichero que falta y volverlo a poner devuelve la misma huella", () => {
    const dir = temporal();
    escribePaquete(conPiel(), dir);
    const a = conocidoDeCarpeta(dir);
    unlinkSync(join(dir, "piel.json"));
    writeFileSync(join(dir, "piel.json"), JSON.stringify({ nombre: "Prueba" }));
    const b = conocidoDeCarpeta(dir);
    expect("sha256" in a && "sha256" in b && a.sha256 === b.sha256).toBe(true);
  });
});
