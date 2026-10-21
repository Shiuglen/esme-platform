/**
 * EL PAQUETE, INSTALADO — el kit se consume de verdad.
 *
 * Qué comprueba. El test de consumibilidad mira que las rutas exportadas
 * EXISTAN (y que zod no se arrastre al núcleo). Eso no es consumir el kit: es
 * mirar el índice. Consumir es otra cosa: es desempaquetar el tarball,
 * ponerlo en `node_modules` y **importarlo**, como lo haría la app.
 *
 * Por qué importa. La app importa el kit por rutas profundas
 * (`esme-platform/core/rea/forma`). Si el patrón de exports no cubre un
 * camino anidado, el error sale en la app —y en la app no hay tests de este
 * repo—. Aquí se prueba con el tarball real, sin red y sin instalar nada
 * (el tarball se abre y sus dependencias se enlazan).
 *
 * Referencia: tests/consumible.test.ts, package.json, docs/ARQUITECTURA.md.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const raizKit = resolve(import.meta.dirname, "..");

/** Desempaqueta el kit en un node_modules de mentira y devuelve la carpeta. */
function kitInstalado(): string {
  const trabajo = mkdtempSync(join(tmpdir(), "esme-paquete-"));
  const destino = join(trabajo, "node_modules", "esme-platform");
  mkdirSync(destino, { recursive: true });

  // 1. el tarball, tal cual lo publicaría npm
  execFileSync("npm", ["pack", "--pack-destination", trabajo], {
    cwd: raizKit,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // el nombre del tarball lleva la versión (que cambia: por eso se lee del
  // package.json y no se escribe aquí)
  const pkg = JSON.parse(readFileSync(join(raizKit, "package.json"), "utf8")) as {
    name: string;
    version: string;
  };
  const tgz = join(trabajo, `${pkg.name}-${pkg.version}.tgz`);
  expect(existsSync(tgz), "npm pack no hizo el tarball").toBe(true);

  // 2. se abre (un .tgz es un tar)
  execFileSync("tar", ["-xzf", tgz, "-C", destino, "--strip-components=1"], {
    encoding: "utf8",
  });

  // 3. sus dependencias, enlazadas (sin red: el kit no se instala de verdad)
  for (const dep of ["zod", "js-yaml"]) {
    const origen = join(raizKit, "node_modules", dep);
    if (!existsSync(origen)) continue;
    symlinkSync(origen, join(trabajo, "node_modules", dep));
  }

  return trabajo;
}

/** Importa algo del kit instalado, desde el node_modules de mentira. */
function importa(ruta: string): string {
  const trabajo = kitInstalado();
  try {
    const script = `import(${JSON.stringify(ruta)}).then((m) => { console.log(Object.keys(m).sort().join(",")); })`;
    const salida = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: trabajo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return salida.trim();
  } finally {
    rmSync(trabajo, { recursive: true, force: true });
  }
}

describe("el kit, instalado, se puede usar", () => {
  it(
    "el sdk (la puerta que ve un módulo)",
    () => {
      const claves = importa("esme-platform/sdk");
      expect(claves).toContain("mente");
      expect(claves).toContain("esme");
    },
    120_000
  );

  it(
    "el contrato de la evidencia de REA (una ruta profunda)",
    () => {
      const claves = importa("esme-platform/core/rea/forma");
      expect(claves).toContain("leeEvidenciaRea");
      expect(claves).toContain("leeEvidenciaReaJson");
      expect(claves).toContain("leeCatalogoRea");
    },
    120_000
  );

  it(
    "el libro de los programas (la puerta de los programas)",
    () => {
      const claves = importa("esme-platform/core/modulos/programas");
      expect(claves).toContain("ProgramasPermitidos");
      expect(claves).toContain("rutaProgramasDe");
    },
    120_000
  );

  it(
    "la puerta de los programas (el módulo que lanza)",
    () => {
      const claves = importa("esme-platform/core/extension-host/proc");
      expect(claves).toContain("ejecutaPrograma");
      expect(claves).toContain("MAX_BYTES_TECHO");
    },
    120_000
  );

  it(
    "y la tienda (el índice firmado)",
    () => {
      const claves = importa("esme-platform/tienda/rotacion");
      expect(claves.length).toBeGreaterThan(0);
    },
    120_000
  );
});
