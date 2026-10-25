/**
 * EL PAQUETE — module.yaml v2: doce puntos, plantillas y permisos con alcance.
 *
 * Lo que se prueba aquí es la FORMA (sin disco): qué se acepta, qué se
 * rechaza con su motivo y qué se avisa sin rechazar. Y la promesa de la
 * casa: los module.yaml v1 de hoy se siguen leyendo, ahora también como un
 * paquete de una sola contribución.
 *
 * Referencia: core/paquetes/manifiesto.ts, estandar/paquete.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";
import {
  leePaquete,
  nivelDe,
  rutasDe,
  validaPaqueteDatos,
  PUNTOS,
  type ManifiestoV2,
} from "../core/paquetes/manifiesto.ts";

const H = (c: string) => c.repeat(64);

/** Un paquete mínimo que vale; cada prueba le cambia lo suyo. */
const base = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema_version: 2,
  id: "esme.prueba.algo",
  version: "1.0.0",
  name: "Algo",
  kind: "package",
  description: "Un paquete de prueba, sintético.",
  author: "Prueba",
  license: "MIT",
  contributes: { tasks: [{ id: "t", title: "Una tarea", prompt: "Haz algo útil." }] },
  ...extra,
});

/** Los errores de leer un manifiesto, juntos en un texto. */
const errores = (raw: unknown): string => leePaquete(raw).errores.join("\n");
const avisos = (raw: unknown): string => leePaquete(raw).avisos.join("\n");

/** El ejemplo de la doc aprobada, con huellas de verdad. */
const estudiar = {
  schema_version: 2,
  id: "esme.jin.estudiar",
  version: "1.0.0",
  name: "Esme para estudiar",
  kind: "template",
  description: "Una forma de estudiar lista para usar: tutor, repaso diario y tarjetas.",
  author: "jin",
  license: "MIT",
  uses: [
    { id: "esme.casa.piel-estudio", version: "^1.0", sha256: H("a") },
    { id: "esme.ana.tarjetas", version: "^0.4", sha256: H("b") },
  ],
  contributes: {
    agents: [{ id: "tutor", recipe: "agentes/tutor.yaml" }],
    routines: [{ id: "repaso", when: "cada día 20:00", agent: "tutor", task: "Pregúntame diez tarjetas" }],
  },
  settings: { rumbo: "Aprobar el examen de enero", budget_usd_per_day: 0.5 },
  permissions: [{ kind: "net:fetch", hosts: ["ankiweb.net"] }],
  success: { task: "Prepara diez tarjetas del tema 1", check: "schemas/tarjetas.json" },
};

describe("el manifiesto v2 — lo que vale", () => {
  it("el ejemplo de la doc («Esme para estudiar») es una plantilla válida, de nivel 0", () => {
    const r = leePaquete(estudiar);
    expect(r.errores).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.version).toBe(2);
    expect(r.paquete?.kind).toBe("template");
    expect(nivelDe(r.paquete!)).toBe(0);
  });

  it("un paquete mínimo vale sin avisos de forma", () => {
    const r = leePaquete(base());
    expect(r.ok).toBe(true);
    expect(r.avisos).toEqual([]);
  });

  it("keywords: una lista de palabras para buscar (como en plugin.json o en npm)", () => {
    const r = leePaquete(base({ keywords: ["estudio", "repaso"] }));
    expect(r.ok).toBe(true);
    expect(r.avisos).toEqual([]);
    expect(r.paquete?.keywords).toEqual(["estudio", "repaso"]);
    expect(errores(base({ keywords: "estudio" }))).toContain("keywords");
  });

  it("homepage: una URL http(s) donde leer más (como en plugin.json o en npm)", () => {
    expect(leePaquete(base({ homepage: "https://linear.app" })).ok).toBe(true);
    expect(errores(base({ homepage: "linear.app" }))).toContain("homepage");
  });

  it("los doce puntos son los de la doc, con su naturaleza y dónde corren", () => {
    expect(Object.keys(PUNTOS)).toEqual([
      "themes", "skills", "tools", "views", "agents", "teams",
      "tasks", "routines", "channels", "memory", "engines", "commands",
    ]);
    expect(PUNTOS.tools).toMatchObject({ naturaleza: "código", corre: "sesión" });
    expect(PUNTOS.views).toMatchObject({ naturaleza: "código aislado", corre: "ventana" });
    expect(PUNTOS.routines).toMatchObject({ naturaleza: "datos", corre: "siempre" });
    expect(PUNTOS.memory).toMatchObject({ naturaleza: "código", corre: "mente" });
  });
});

describe("el manifiesto v2 — lo que se rechaza, con su motivo", () => {
  it("una plantilla con código: una plantilla es solo datos", () => {
    for (const punto of ["tools", "views", "memory"]) {
      const entrada =
        punto === "views"
          ? { id: "v", entry: "vista/index.html" }
          : { id: "c", entry: "dist/index.js", runtime: "nodejs" };
      const e = errores({ ...estudiar, contributes: { [punto]: [entrada] } });
      expect(e, punto).toContain("una plantilla es solo datos");
    }
  });

  it("settings es cosa de las plantillas", () => {
    expect(errores(base({ settings: { rumbo: "x" } }))).toContain("settings es de las plantillas");
  });

  it("los ajustes que la casa conoce tienen su tipo", () => {
    expect(errores({ ...estudiar, settings: { rumbo: 3 } })).toContain("rumbo");
    expect(errores({ ...estudiar, settings: { budget_usd_per_day: -1 } })).toContain("budget_usd_per_day");
  });

  it("un paquete que no aporta nada no es un paquete", () => {
    expect(errores(base({ contributes: {} }))).toContain("no aporta nada");
    expect(errores(base({ contributes: { tasks: [] } }))).toContain("no aporta nada");
  });

  it("dos entradas con el mismo id en un punto", () => {
    const t = { id: "t", title: "T", prompt: "P" };
    expect(errores(base({ contributes: { tasks: [t, t] } }))).toContain("el id «t» está repetido");
  });

  it("hooks: Esme no admite hooks libres", () => {
    expect(errores(base({ contributes: { hooks: [{ id: "h" }] } }))).toContain("Esme no admite hooks libres");
  });

  it("un canal que se ata a una herramienta que no está", () => {
    expect(errores(base({ contributes: { channels: [{ id: "c", tool: "telegram" }] } }))).toContain(
      "la herramienta «telegram» no está en este paquete"
    );
  });

  it("un comando que lanza una tarea que no está", () => {
    expect(errores(base({ contributes: { commands: [{ id: "c", title: "C", task: "nada" }] } }))).toContain(
      "la tarea «nada» no está en este paquete"
    );
  });

  it("un uses sin huella, con un rango que no es rango, o repetido", () => {
    expect(errores({ ...estudiar, uses: [{ id: "esme.a.b", version: "^1.0" }] })).toContain("sha256");
    expect(errores({ ...estudiar, uses: [{ id: "esme.a.b", version: "latest", sha256: H("c") }] })).toContain(
      "rango"
    );
    const u = { id: "esme.a.b", version: "^1.0", sha256: H("c") };
    expect(errores({ ...estudiar, uses: [u, u] })).toContain("«esme.a.b» está dos veces");
  });

  it("una herramienta remota a un host que los permisos no cubren", () => {
    const tools = [{ id: "figma", mcp: { url: "https://mcp.figma.com/mcp" } }];
    expect(errores(base({ contributes: { tools } }))).toContain("se conecta a mcp.figma.com y no lo pide");
    const ok = leePaquete(base({ contributes: { tools }, permissions: [{ kind: "net:fetch", hosts: ["*.figma.com"] }] }));
    expect(ok.errores).toEqual([]);
  });

  it("una herramienta local o un motor que lanzan un programa que no piden", () => {
    const tools = [{ id: "rea", mcp: { command: "npx", args: ["-y", "rea-agents@6.7.0", "mcp"] } }];
    expect(errores(base({ contributes: { tools } }))).toContain("lanza «npx» y no lo pide");
    const engines = [{ id: "copilot", name: "GitHub Copilot", binaries: ["copilot"], args: ["--acp"] }];
    expect(errores(base({ contributes: { engines } }))).toContain("lanza «copilot» y no lo pide");
    expect(
      leePaquete(base({ contributes: { engines }, permissions: [{ kind: "proc:spawn", programs: ["copilot"] }] })).ok
    ).toBe(true);
  });

  it("una ruta que se sale: absoluta, con «..» o con «\\»", () => {
    for (const file of ["/etc/passwd", "../fuera.json", "a/../../b.json", "pieles\\x.json", "C:/x.json"]) {
      expect(errores(base({ contributes: { themes: [{ id: "p", file }] } })), file).toContain("ruta");
    }
  });

  it("un v2 a medio migrar: lo de la v1 arriba del todo no se acepta en silencio", () => {
    for (const clave of ["category", "entry", "runtime", "dependencies", "sideEffects", "engines"]) {
      expect(errores(base({ [clave]: clave === "sideEffects" ? false : "x" })), clave).toContain("es de la v1");
    }
  });

  it("una skill es local (path) o remota (remote), no las dos ni ninguna", () => {
    const remote = { repo: "anthropics/skills", commit: "d".repeat(40), path: "skills/x", sha256: H("e") };
    expect(errores(base({ contributes: { skills: [{ id: "s", path: ".", remote }] } }))).toContain("o path o remote");
    expect(errores(base({ contributes: { skills: [{ id: "s" }] } }))).toContain("o path o remote");
    expect(leePaquete(base({ contributes: { skills: [{ id: "s", remote }] } })).ok).toBe(true);
  });

  it("una herramienta es código del paquete (entry con runtime) o un servidor MCP, no las dos", () => {
    const ambas = { id: "x", entry: "dist/x.js", runtime: "nodejs", mcp: { command: "node" } };
    expect(errores(base({ contributes: { tools: [ambas] } }))).toContain("o entry con runtime, o mcp");
    expect(errores(base({ contributes: { tools: [{ id: "x", entry: "dist/x.js" }] } }))).toContain(
      "o entry con runtime, o mcp"
    );
  });

  it("la cabecera es la de siempre: id esme.<autor>.<slug>, semver, licencia de la lista", () => {
    expect(errores(base({ id: "otra.cosa" }))).toContain("id");
    expect(errores(base({ version: "1.0" }))).toContain("version");
    expect(errores(base({ license: "GPL-3.0" }))).toContain("license");
    expect(errores(base({ kind: "app" }))).toContain("kind");
  });
});

describe("el manifiesto v2 — lo que se avisa, sin rechazar", () => {
  it("una clave desconocida, arriba o dentro de una entrada", () => {
    expect(avisos(base({ foo: 1 }))).toContain("clave desconocida «foo»");
    const tasks = [{ id: "t", title: "T", prompt: "P", bar: true }];
    expect(avisos(base({ contributes: { tasks } }))).toContain("contributes.tasks.t: clave desconocida «bar»");
  });

  it("un punto que esta versión no conoce se ignora (y se dice)", () => {
    const r = leePaquete(base({ contributes: { tasks: [{ id: "t", title: "T", prompt: "P" }], widgets: [{ id: "w" }] } }));
    expect(r.ok).toBe(true);
    expect(r.avisos.join("\n")).toContain("el punto «widgets» no lo conoce esta versión");
  });

  it("net:fetch con «*» es toda la red, aunque venga con alcance", () => {
    expect(avisos(base({ permissions: [{ kind: "net:fetch", hosts: ["*"] }] }))).toContain("toda la red");
  });
});

describe("la v1 sigue valiendo — y se lee como un paquete de una contribución", () => {
  const dirModulos = join(import.meta.dirname, "..", "modulos");
  const modulos = readdirSync(dirModulos).filter((d) => existsSync(join(dirModulos, d, "module.yaml")));

  it("hay módulos v1 que leer", () => {
    expect(modulos.length).toBeGreaterThanOrEqual(4);
  });

  for (const d of modulos) {
    it(`${d}: v1 válido, una contribución, los mismos permisos, nivel 2`, () => {
      const raw = yaml.load(readFileSync(join(dirModulos, d, "module.yaml"), "utf8")) as Record<string, unknown>;
      const r = leePaquete(raw);
      expect(r.errores).toEqual([]);
      expect(r.version).toBe(1);
      const p = r.paquete!;
      expect(p.id).toBe(raw.id);
      expect(p.kind).toBe("package");
      const puntos = Object.entries(p.contributes).filter(([, v]) => Array.isArray(v) && v.length);
      expect(puntos.length).toBe(1);
      const [punto, entradas] = puntos[0] as [string, Array<Record<string, unknown>>];
      expect(punto).toBe(raw.category === "memory" ? "memory" : "tools");
      expect(entradas[0]).toMatchObject({ entry: raw.entry, runtime: raw.runtime });
      expect(p.permissions).toEqual(raw.permissions);
      expect(nivelDe(p)).toBe(2);
    });
  }

  it("un v1 roto sigue siendo un error de v1 (no se cuela como v2)", () => {
    const r = leePaquete({ schema_version: 1, id: "esme.x.y" });
    expect(r.ok).toBe(false);
    expect(r.version).toBe(1);
  });

  it("sin schema_version no hay manifiesto", () => {
    expect(leePaquete({ id: "esme.x.y" }).errores.join("\n")).toContain("schema_version");
    expect(leePaquete(null).ok).toBe(false);
  });
});

describe("nivelDe — dónde tiene que correr lo que trae", () => {
  const conTool = (tool: Record<string, unknown>, permissions: unknown[] = []): ManifiestoV2 => {
    const r = leePaquete(base({ contributes: { tools: [{ id: "x", ...tool }] }, permissions }));
    expect(r.errores).toEqual([]);
    return r.paquete!;
  };

  it("datos 0, WASM 1, cápsula 2, caja del sistema 3", () => {
    expect(nivelDe(leePaquete(base()).paquete!)).toBe(0);
    expect(nivelDe(conTool({ entry: "dist/x.wasm", runtime: "wasm" }))).toBe(1);
    expect(nivelDe(conTool({ entry: "dist/x.js", runtime: "nodejs" }))).toBe(2);
    expect(nivelDe(conTool({ entry: "x.py", runtime: "python" }))).toBe(3);
    expect(nivelDe(conTool({ mcp: { command: "npx" } }, [{ kind: "proc:spawn", programs: ["npx"] }]))).toBe(3);
    expect(nivelDe(conTool({ mcp: { url: "https://a.com/mcp" } }, [{ kind: "net:fetch", hosts: ["a.com"] }]))).toBe(0);
  });

  it("un motor con binarios o un agente de línea de comandos lanzan un proceso: caja del sistema", () => {
    const engines = [{ id: "copilot", name: "GitHub Copilot", binaries: ["copilot"] }];
    const conMotor = leePaquete(base({ contributes: { engines }, permissions: [{ kind: "proc:spawn", programs: ["copilot"] }] }));
    expect(nivelDe(conMotor.paquete!)).toBe(3);
    const informativo = leePaquete(base({ contributes: { engines: [{ id: "x", name: "X", install: "npx x --acp" }] } }));
    expect(nivelDe(informativo.paquete!)).toBe(0);
    const agentes = [{ id: "oc", recipe: "agente.json", format: "comando" }];
    expect(nivelDe(leePaquete(base({ contributes: { agents: agentes } })).paquete!)).toBe(3);
    expect(nivelDe(leePaquete(base({ contributes: { agents: [{ id: "t", recipe: "t.yaml" }] } })).paquete!)).toBe(0);
  });

  it("una vista corre en su cápsula; una skill con scripts, en la caja del sistema", () => {
    expect(nivelDe(leePaquete(base({ contributes: { views: [{ id: "v", entry: "v/index.html" }] } })).paquete!)).toBe(2);
    const remote = { repo: "a/b", commit: "d".repeat(40), path: "s", sha256: H("e") };
    const conScripts = leePaquete(base({ contributes: { skills: [{ id: "s", remote, scripts: true }] } })).paquete!;
    expect(nivelDe(conScripts)).toBe(3);
  });
});

describe("rutasDe y validaPaqueteDatos — lo que el paquete dice que trae, lo trae", () => {
  it("rutasDe nombra cada fichero: una skill local apunta a su SKILL.md", () => {
    const p = leePaquete(
      base({
        contributes: {
          themes: [{ id: "p", file: "piel.json" }],
          skills: [{ id: "s", path: "." }, { id: "t", path: "skills/t" }],
        },
      })
    ).paquete!;
    expect(rutasDe(p).map((r) => r.ruta)).toEqual(["piel.json", "SKILL.md", "skills/t/SKILL.md"]);
  });

  it("un fichero que el manifiesto nombra y no está: error con su ruta", () => {
    const r = validaPaqueteDatos({
      manifiesto: base({ contributes: { themes: [{ id: "p", file: "piel.json" }] } }),
      ficheros: {},
    });
    expect(r.ok).toBe(false);
    expect(r.errores.join("\n")).toContain("«piel.json»");
  });

  it("un agente de formato comando lanza su binario: tiene que pedirlo", () => {
    const manifiesto = base({ contributes: { agents: [{ id: "oc", recipe: "agente.json", format: "comando" }] } });
    const ficheros = { "agente.json": JSON.stringify({ comando: 'opencode -p "{tarea}"' }) };
    expect(validaPaqueteDatos({ manifiesto, ficheros }).errores.join("\n")).toContain("lanza «opencode» y no lo pide");
    const conPermiso = { ...manifiesto, permissions: [{ kind: "proc:spawn", programs: ["opencode"] }] };
    expect(validaPaqueteDatos({ manifiesto: conPermiso, ficheros }).errores).toEqual([]);
  });

  it("un agente de formato comando sin comando legible: error", () => {
    const manifiesto = base({
      contributes: { agents: [{ id: "oc", recipe: "agente.json", format: "comando" }] },
      permissions: ["proc:spawn"],
    });
    expect(validaPaqueteDatos({ manifiesto, ficheros: { "agente.json": "{}" } }).errores.join("\n")).toContain(
      "comando"
    );
  });
});
