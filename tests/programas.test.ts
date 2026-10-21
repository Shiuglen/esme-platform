/**
 * LA PUERTA DE LOS PROGRAMAS, de punta a punta: del libro al programa real.
 *
 * La cadena que se prueba aquí es la entera, sin atajos:
 *
 *   el LIBRO (lo que la persona dijo que se puede lanzar)
 *     → el RUNTIME (lo lee y se lo pasa al anfitrión)
 *       → el ANFITRIÓN (monta la pieza `proc` de la puerta)
 *         → el HIJO (un programa de verdad, con su salida de verdad)
 *
 * Y lo que se prueba de cada eslabón: que lo que NO está concedido no se
 * lanza, que lo que sí está se lanza, y que el módulo no ve las llaves de la
 * persona ni sale del proyecto.
 *
 * Referencia: core/modulos/programas.ts, core/extension-host/proc.ts, docs/REA.md.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProgramasPermitidos, rutaProgramasDe } from "../core/modulos/programas.ts";
import { modulos } from "../core/modulos/api.ts";
import { leeModulo } from "../tienda/modulos.ts";
import { resolve } from "node:path";

const raizKit = resolve(import.meta.dirname, "..");

/** Una casa de mentira: la carpeta de módulos y el libro al lado. */
const casa = (): { dir: string; libro: ProgramasPermitidos } => {
  const dir = mkdtempSync(join(tmpdir(), "esme-casa-"));
  const modulosDir = join(dir, "modulos");
  const libro = new ProgramasPermitidos(rutaProgramasDe(modulosDir));
  return { dir, libro };
};

/** Un módulo de mentira que usa la puerta de los programas. */
const moduloDelLibro = (dir: string): string => {
  const carpeta = join(dir, "modulo");
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(
    join(carpeta, "modulo.mjs"),
    `export async function prueba() {
       const puerta = globalThis.esme.proc;
       if (!puerta) return { hayPuerta: false };
       try {
         const r = await puerta.ejecutar({ programa: "node", args: ["-e", "process.stdout.write('hola')"] });
         return { hayPuerta: true, codigo: r.codigo, salida: r.stdout };
       } catch (e) {
         return { hayPuerta: true, error: String(e.message) };
       }
     }`,
    "utf8"
  );
  writeFileSync(
    join(carpeta, "module.yaml"),
    `schema_version: 1
id: "esme.prueba.proc"
name: "Proc"
version: "0.1.0"
category: "tool"
description: "Un módulo de prueba que usa la puerta de los programas."
author: "esme@prueba"
license: "MIT"
entry: "modulo.mjs"
runtime: "nodejs"
permissions:
  - proc:spawn
`,
    "utf8"
  );
  return carpeta;
};

describe("el libro de los programas", () => {
  it("empieza vacío: la puerta cerrada hasta que la persona habla", () => {
    const { libro } = casa();
    expect(libro.lista()).toEqual([]);
    expect(libro.permite("rea")).toBeNull();
  });

  it("la persona concede un programa (con su descripción) y queda en el libro", () => {
    const { libro } = casa();
    const r = libro.agrega({ nombre: "rea", descripcion: "el motor de ingeniería inversa" });
    expect(r.ok).toBe(true);
    expect(libro.permite("rea")?.descripcion).toBe("el motor de ingeniería inversa");
  });

  it("un programa sin descripción no se concede (hay que ver qué se concede)", () => {
    const { libro } = casa();
    const r = libro.agrega({ nombre: "rea", descripcion: "  " });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("descripción");
    expect(libro.lista()).toEqual([]);
  });

  it("un nombre que es una ruta no se concede (el nombre es un nombre)", () => {
    const { libro } = casa();
    const r = libro.agrega({ nombre: "/usr/bin/rea", descripcion: "REA" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("nombre de ejecutable");
  });

  it("el libro sobrevive a cerrar y abrir (está en el disco)", () => {
    const { dir, libro } = casa();
    libro.agrega({ nombre: "rea", descripcion: "REA", ruta: "/usr/local/bin/rea" });
    const otro = new ProgramasPermitidos(rutaProgramasDe(join(dir, "modulos")));
    expect(otro.lista()).toHaveLength(1);
    expect(otro.permite("rea")?.ruta).toBe("/usr/local/bin/rea");
  });

  it("y revocar lo quita", () => {
    const { libro } = casa();
    libro.agrega({ nombre: "rea", descripcion: "REA" });
    expect(libro.quita("rea")).toBe(true);
    expect(libro.quita("rea")).toBe(false);
    expect(libro.lista()).toEqual([]);
  });

  it("un libro roto no abre la puerta (y no se pisa)", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-roto-"));
    const ruta = join(dir, "programas.json");
    writeFileSync(ruta, "{ esto no es json", "utf8");
    const libro = new ProgramasPermitidos(ruta);
    expect(libro.lista()).toEqual([]);
    // y el fichero roto sigue ahí: nadie lo ha pisado en silencio
    expect(libro.permite("rea")).toBeNull();
  });
});

describe("la puerta, de punta a punta (libro → runtime → anfitrión → hijo)", () => {
  it("sin programa en el libro, la puerta no lanza nada (y lo dice)", async () => {
    const { dir, libro } = casa();
    expect(libro.lista()).toEqual([]);
    const carpeta = moduloDelLibro(dir);
    const leido = leeModulo(carpeta);
    expect(leido.ok).toBe(true);

    const runtime = modulos({
      rutaPermisos: join(dir, "consentimientos.json"),
      proyecto: dir,
      programas: libro.lista(),
    });
    runtime.registro.registra(leido.modulo!);
    runtime.concede("esme.prueba.proc", ["proc:spawn"]);
    await runtime.activa("esme.prueba.proc");

    const r = (await runtime.llama("esme.prueba.proc", "prueba")) as {
      hayPuerta: boolean;
      error?: string;
    };
    expect(r.hayPuerta).toBe(true);
    expect(r.error).toContain("programa no permitido");
    await runtime.cierra();
  });

  it("con el programa en el libro, el hijo se lanza y su salida vuelve", async () => {
    const { dir, libro } = casa();
    libro.agrega({ nombre: "node", descripcion: "node, para probar" });
    const carpeta = moduloDelLibro(dir);
    const leido = leeModulo(carpeta);
    expect(leido.ok).toBe(true);

    const runtime = modulos({
      rutaPermisos: join(dir, "consentimientos.json"),
      proyecto: dir,
      programas: libro.lista(),
    });
    runtime.registro.registra(leido.modulo!);
    runtime.concede("esme.prueba.proc", ["proc:spawn"]);
    await runtime.activa("esme.prueba.proc");

    const r = (await runtime.llama("esme.prueba.proc", "prueba")) as {
      hayPuerta: boolean;
      codigo?: number | null;
      salida?: string;
    };
    expect(r.hayPuerta).toBe(true);
    expect(r.codigo).toBe(0);
    expect(r.salida).toBe("hola");
    await runtime.cierra();
  });

  it("el permiso del módulo y el programa del libro son dos decisiones distintas", async () => {
    const { dir, libro } = casa();
    // el programa está en el libro, pero el permiso NO está concedido
    libro.agrega({ nombre: "node", descripcion: "node, para probar" });
    const carpeta = moduloDelLibro(dir);
    const leido = leeModulo(carpeta);
    const runtime = modulos({
      rutaPermisos: join(dir, "consentimientos.json"),
      proyecto: dir,
      programas: libro.lista(),
    });
    runtime.registro.registra(leido.modulo!);
    // sin conceder: la puerta ni siquiera existe
    await runtime.activa("esme.prueba.proc");
    const r = (await runtime.llama("esme.prueba.proc", "prueba")) as { hayPuerta: boolean };
    expect(r.hayPuerta).toBe(false);
    await runtime.cierra();
  });
});

describe("el módulo de ejemplo del kit sigue funcionando", () => {
  it("ejemplo-puerta se lee y se puede activar (nada se rompió)", () => {
    const leido = leeModulo(resolve(raizKit, "modulos", "ejemplo-puerta"));
    expect(leido.ok).toBe(true);
  });
});

describe("la herramienta de REA no esquiva la puerta", () => {
  it("sin REA en el libro, la herramienta se niega (y dice cómo abrirla)", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-rea-"));
    const libroVacio = join(dir, "programas.json");
    writeFileSync(libroVacio, JSON.stringify({ version: 1, programas: [] }), "utf8");

    const tsx = join(raizKit, "node_modules", ".bin", "tsx");
    const r = spawnSync(tsx, [join(raizKit, "scripts", "rea.ts"), "catalogo"], {
      env: { ...process.env, ESME_PROGRAMAS: libroVacio },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no está en el libro de los programas");
    // y dice exactamente cómo se abre
    expect(r.stderr).toContain("npm run programas -- concede rea");
  });
});
