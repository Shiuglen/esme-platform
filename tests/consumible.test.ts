// El kit se puede consumir: su superficie pública está escrita y no arrastra
// lo que no debe (zod, la red, el estado global).
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")) as {
  exports: Record<string, string | { types: string; import: string }>;
  files: string[];
  license: string;
  scripts: Record<string, string>;
  prepublishOnly?: string;
  dependencies?: Record<string, string>;
  main?: string;
  types?: string;
};

/** El destino de una exportación: el fichero (o el patrón) que se sirve. */
const destinoDe = (v: string | { types: string; import: string }): string =>
  typeof v === "string" ? v : v.import;

/** `dist/core/x.js` → `core/x.ts`: el mismo fichero, antes de compilar. */
const enFuente = (destino: string): string =>
  destino
    .replace(/^\.\/dist\//, "./")
    .replace(/\.js$/, ".ts")
    .replace(/\.d\.ts$/, ".ts");

const ficheros = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? ficheros(p) : n.endsWith(".ts") ? [p] : [];
  });

describe("el kit se puede consumir", () => {
  it("declara qué se puede importar (y nada fuera del MIT)", () => {
    expect(Object.keys(pkg.exports).length).toBeGreaterThan(0);
    // lo exportado es el núcleo MIT: nada de app, marca ni servicios
    for (const clave of Object.keys(pkg.exports))
      expect(
        clave === "." || clave.startsWith("./"),
        `${clave} no es núcleo MIT`
      ).toBe(true);
    for (const clave of Object.keys(pkg.exports)) {
      if (clave === "." || clave === "./package.json") continue; // raíz y metadatos
      expect(clave, `${clave} no es núcleo MIT`).toMatch(
        /^\.\/(sdk|core|tienda|motores|estandar|modulos)\b/
      );
    }
  });

  it("cada ruta exportada existe de verdad", () => {
    for (const [clave, bruto] of Object.entries(pkg.exports)) {
      const destino = destinoDe(bruto);
      if (destino.includes("*")) {
        // los patrones: basta con que la carpeta exista
        const carpeta = enFuente(destino.slice(0, destino.indexOf("*")));
        expect(statSync(join(raiz, carpeta)).isDirectory(), `${clave} → ${carpeta}`).toBe(true);
      } else {
        const patron = enFuente(destino);
        expect(() => statSync(join(raiz, patron)), `${clave} → ${patron}`).not.toThrow();
      }
    }
  });

  it("lo que se sirve es lo compilado (y el compilado sale de lo que hay)", () => {
    // el paquete sirve dist/…: los tipos y el js de cada ruta
    for (const [clave, bruto] of Object.entries(pkg.exports)) {
      if (typeof bruto === "string") continue; // estandar/* son datos, no código
      expect(bruto.types, `${clave} sin tipos`).toMatch(/^\.\/dist\/.+\.d\.ts$/);
      expect(bruto.import, `${clave} sin js`).toMatch(/^\.\/dist\/.+\.js$/);
    }
    // y hay un build que produce eso
    expect(pkg.scripts.build).toBeTruthy();
    const build = JSON.parse(
      readFileSync(join(raiz, "tsconfig.build.json"), "utf8")
    ) as { compilerOptions: { outDir: string; rootDir: string } };
    expect(build.compilerOptions.outDir.replace(/^\.\//, "")).toBe("dist");
    expect(pkg.files).toContain("dist");
    expect(pkg.main).toMatch(/^\.\/dist\//);
    expect(pkg.types).toMatch(/^\.\/dist\//);
  });

  it("las dependencias son las justas (y ninguna es secreta)", () => {
    // lo único ajeno al núcleo es zod (los contratos) y js-yaml (la Tienda).
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(["js-yaml", "zod"]);
  });

  it("los tipos del contrato NO arrastran zod (quien importa los tipos no carga el validador)", () => {
    const texto = readFileSync(join(raiz, "core", "ipc", "mind-schema-types.ts"), "utf8");
    expect(texto).not.toMatch(/from\s+["']zod["']/);
    expect(texto).not.toMatch(/\bz\.(object|string|enum)\b/);
    // y el de validadores sí lo trae (aquí vive zod, y solo aquí)
    expect(readFileSync(join(raiz, "core", "ipc", "mind-schema.ts"), "utf8")).toMatch(/from\s+["']zod["']/);
  });

  it("los tipos que exporta el kit son los mismos que usa el host", async () => {
    const tipos = await import("../core/ipc/mind-schema-types.ts");
    const conValidadores = await import("../core/ipc/mind-schema.ts");
    expect(conValidadores.CAPACIDAD_POR_METODO).toEqual(tipos.CAPACIDAD_POR_METODO);
    expect(Object.keys(tipos.CAPACIDAD_POR_METODO).sort()).toEqual([
      "intake",
      "recall",
      "remember",
      "rumbo",
    ]);
  });

  it("el único paquete ajeno del núcleo es zod, y solo en el fichero de los validadores", () => {
    // quien importa los TIPOS no carga zod (ver el test de mind-schema-types):
    // el validador vive en su fichero, y ese es el único que lo usa
    const ajenos = new Map<string, string[]>();
    for (const f of ficheros(join(raiz, "core"))) {
      const texto = readFileSync(f, "utf8");
      const importa = texto.match(/^import .*from\s+["']([^"']+)["']/gm) ?? [];
      for (const linea of importa) {
        const mod = /["']([^"']+)["']/.exec(linea)?.[1] ?? "";
        if (mod.startsWith(".") || mod.startsWith("node:")) continue;
        ajenos.set(mod, [...(ajenos.get(mod) ?? []), f.replace(raiz + "/", "")]);
      }
    }
    // La regla: el núcleo no arrastra dependencias en tiempo de ejecución.
    // zod entra SOLO en los ficheros de contrato (los validadores de forma),
    // nunca en la lógica. Si aparece zod en otra parte, el kit ya no se
    // consume sin arrastrarlo.
    // `core/rea/forma.ts` es el validador de REA: los TIPOS de la evidencia
    // (`core/rea/evidencia.ts`) se importan sin cargar zod.
    expect([...ajenos.keys()]).toEqual(["zod"]);
    expect(ajenos.get("zod")).toEqual([
      "core/ipc/mind-schema.ts",
      "core/ipc/module-schema.ts",
      "core/rea/forma.ts",
    ]);
  });

  it("publicar pasa por la puerta: lint + tests + spec-lint", () => {
    expect(pkg.scripts.prepublishOnly).toContain("lint");
    expect(pkg.scripts.prepublishOnly).toContain("test");
    expect(pkg.scripts.prepublishOnly).toContain("spec:lint");
  });

  it("la licencia que dice el paquete es la del repo", () => {
    expect(pkg.license).toBe("MIT");
    expect(readFileSync(join(raiz, "LICENSE"), "utf8")).toContain("MIT License");
  });
});
