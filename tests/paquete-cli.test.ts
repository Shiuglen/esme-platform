/**
 * LA ORDEN `npm run paquete` — qué aporta un paquete, qué pide y dónde
 * corre; de dónde se importa; y el candado de una plantilla, que solo se
 * escribe con el sí de la persona (`--aceptar`).
 *
 * Lo que se importa son las fixtures sintéticas de `tests/fixtures/importar/`;
 * lo que se resuelve, paquetes de datos escritos aquí mismo, en carpetas
 * temporales.
 *
 * Referencia: scripts/paquete.ts, docs/PAQUETES.md.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "../scripts/paquete.ts";
import { conocidoDeCarpeta, escribePaquete, leePaqueteDeCarpeta } from "../tienda/paquete-disco.ts";
import { leeLock } from "../core/paquetes/lock.ts";

const HOLA = join(import.meta.dirname, "..", "modulos", "ejemplo-hola-mundo");
const FIX = join(import.meta.dirname, "fixtures", "importar");

const carpetas: string[] = [];
const temporal = (): string => {
  const d = mkdtempSync(join(tmpdir(), "esme-cli-"));
  carpetas.push(d);
  return d;
};
afterEach(() => {
  for (const d of carpetas.splice(0)) rmSync(d, { recursive: true, force: true });
});

const texto = (s: { lineas: string[] }): string => s.lineas.join("\n");

describe("paquete <carpeta> — qué aporta, qué pide y dónde corre", () => {
  it("hola-mundo: una herramienta que corre en la sesión, pide mind:read y va en el nivel 2", () => {
    const s = cli([HOLA]);
    expect(s.code).toBe(0);
    expect(s.lineas.some((l) => l.includes("tools") && l.includes("sesión"))).toBe(true);
    expect(s.lineas.some((l) => l.includes("mind:read"))).toBe(true);
    expect(s.lineas.some((l) => l.includes("nivel 2"))).toBe(true);
  });

  it("si su código aún no está construido, lo dice como aviso, no como error", () => {
    const d = join(temporal(), "hola");
    mkdirSync(d);
    cpSync(join(HOLA, "module.yaml"), join(d, "module.yaml"));
    const s = cli([d]);
    expect(s.code).toBe(0);
    expect(texto(s)).toMatch(/dist\/index\.js.*constru/);
  });

  it("un manifiesto que no vale da code 1 y dice por qué", () => {
    const d = temporal();
    writeFileSync(join(d, "module.yaml"), "schema_version: 2\nid: esme.prueba.roto\n");
    const s = cli([d]);
    expect(s.code).toBe(1);
    expect(texto(s)).toMatch(/no vale/i);
    expect(texto(s)).toContain("version");
  });
});

describe("paquete importar — de otros, a una carpeta que vale", () => {
  it("un plugin de Claude Code con --salida: escribe un paquete que leePaqueteDeCarpeta da por bueno", () => {
    const salida = join(temporal(), "estudio");
    const s = cli(["importar", "claude", join(FIX, "plugin-claude"), "--salida", salida]);
    expect(s.code).toBe(0);
    const d = leePaqueteDeCarpeta(salida);
    expect(d.errores).toEqual([]);
    expect(d.ok).toBe(true);
    expect(texto(s)).toContain("hooks"); // lo que se descarta se dice
  });

  it("sin --salida no escribe nada y dice cómo escribirlo (y --autor llega al importador)", () => {
    const s = cli(["importar", "skill", join(FIX, "skill-suelta"), "--autor", "Ana Prueba"]);
    expect(s.code).toBe(0);
    expect(texto(s)).toContain("esme.ana-prueba.skill-suelta");
    expect(texto(s)).toContain("--salida");
  });

  it("no escribe encima de una carpeta con ficheros: entrarían en su huella", () => {
    const salida = temporal();
    writeFileSync(join(salida, "viejo.txt"), "de antes");
    const s = cli(["importar", "claude", join(FIX, "plugin-claude"), "--salida", salida]);
    expect(s.code).toBe(1);
    expect(existsSync(join(salida, "module.yaml"))).toBe(false);
  });

  it("si el original no se puede importar, code 1 y sus errores", () => {
    const s = cli(["importar", "skill", temporal()]);
    expect(s.code).toBe(1);
    expect(texto(s)).toContain("SKILL.md");
  });

  it("un server.json del registro MCP", () => {
    const salida = join(temporal(), "mcp");
    const s = cli(["importar", "mcp", join(FIX, "server.json"), "--salida", salida]);
    expect(s.code).toBe(0);
    expect(leePaqueteDeCarpeta(salida).ok).toBe(true);
  });

  it("un marketplace: cada plugin local en su carpeta (por su id), y los remotos, pendientes", () => {
    const salida = temporal();
    const s = cli(["importar", "marketplace", join(FIX, "marketplace.json"), "--salida", salida]);
    expect(s.code).toBe(0);
    const escritas = readdirSync(salida);
    expect(escritas).toHaveLength(1);
    expect(leePaqueteDeCarpeta(join(salida, escritas[0])).ok).toBe(true);
    expect(texto(s)).toContain("remoto");
  });
});

describe("paquete resolver — el candado solo se escribe con tu sí", () => {
  const cabecera = (id: string) => ({
    schema_version: 2,
    id,
    version: "1.0.0",
    name: id,
    description: "Un paquete de prueba, sintético.",
    author: "Prueba",
    license: "MIT",
  });

  /** Un paquete de datos en disco y una plantilla que lo usa, fijado por la huella de su árbol. */
  const montaje = () => {
    const raiz = temporal();
    const en = join(raiz, "paquetes");
    escribePaquete(
      {
        manifiesto: {
          ...cabecera("esme.prueba.notas"),
          kind: "package",
          contributes: { tasks: [{ id: "repasa", title: "Repasa", prompt: "Repasa mis notas." }] },
          permissions: [{ kind: "net:fetch", hosts: ["api.example.com"] }],
        },
        ficheros: {},
      },
      join(en, "notas")
    );
    const notas = conocidoDeCarpeta(join(en, "notas"));
    if (!("sha256" in notas)) throw new Error(notas.errores.join("; "));
    const plantilla = join(raiz, "estudio");
    escribePaquete(
      {
        manifiesto: {
          ...cabecera("esme.prueba.estudio"),
          kind: "template",
          uses: [{ id: "esme.prueba.notas", version: "^1", sha256: notas.sha256 }],
          contributes: {},
        },
        ficheros: {},
      },
      plantilla
    );
    return { en, plantilla, lock: `${plantilla}.lock.json` };
  };

  it("sin --aceptar no escribe el candado y dice que pide tu permiso, y qué pide", () => {
    const m = montaje();
    const s = cli(["resolver", m.plantilla, "--en", m.en]);
    expect(s.code).toBe(0);
    expect(texto(s)).toContain("pide tu permiso");
    expect(texto(s)).toContain("api.example.com");
    expect(texto(s)).toContain("nivel 0"); // y hasta qué nivel de aislamiento hace falta
    expect(existsSync(m.lock)).toBe(false);
  });

  it("con --aceptar lo escribe (al lado de la plantilla, fuera de su huella), y luego ya no hay nada que pedir", () => {
    const m = montaje();
    const s = cli(["resolver", m.plantilla, "--en", m.en, "--aceptar"]);
    expect(s.code).toBe(0);
    expect(leeLock(m.lock)?.paquetes.map((p) => p.id)).toEqual(["esme.prueba.notas"]);
    const otra = cli(["resolver", m.plantilla, "--en", m.en]);
    expect(otra.code).toBe(0);
    expect(texto(otra)).not.toContain("pide tu permiso");
  });

  it("--lock elige dónde va el candado", () => {
    const m = montaje();
    const ruta = join(temporal(), "mi.lock.json");
    expect(cli(["resolver", m.plantilla, "--en", m.en, "--lock", ruta, "--aceptar"]).code).toBe(0);
    expect(leeLock(ruta)).not.toBeNull();
    expect(existsSync(m.lock)).toBe(false);
  });

  it("si no resuelve, code 1 y no escribe nada aunque digas --aceptar", () => {
    const m = montaje();
    rmSync(join(m.en, "notas"), { recursive: true });
    const s = cli(["resolver", m.plantilla, "--en", m.en, "--aceptar"]);
    expect(s.code).toBe(1);
    expect(texto(s)).toContain("esme.prueba.notas");
    expect(existsSync(m.lock)).toBe(false);
  });
});

describe("paquete — el uso", () => {
  it("un verbo desconocido da code 2 y el uso", () => {
    const s = cli(["volar"]);
    expect(s.code).toBe(2);
    expect(texto(s)).toContain("uso");
    expect(texto(s)).toContain("resolver");
  });

  it("sin nada, lo mismo", () => {
    expect(cli([]).code).toBe(2);
  });

  it("una opción que no existe no se ignora: code 2", () => {
    const s = cli(["importar", "claude", join(FIX, "plugin-claude"), "--forzar"]);
    expect(s.code).toBe(2);
    expect(texto(s)).toContain("--forzar");
  });
});
