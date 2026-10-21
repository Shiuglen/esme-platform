/**
 * LA RAÍZ DEL PAQUETE — la casa sabe dónde está, y lo sabe en los dos layouts.
 *
 * Qué comprueba, y por qué importa:
 *
 *   1. la raíz se busca por el NOMBRE del paquete, no por la cuenta de
 *      niveles: el mismo código, en el repo o compilado a `dist/`, llega a la
 *      misma casa;
 *   2. lo que cuelga de la raíz (los contratos, la raíz de confianza) se
 *      encuentra de verdad desde el código COMPILADO — que es como se
 *      publica el kit;
 *   3. y si no hay kit, se dice: una raíz inventada es un fallo silencioso.
 *
 * Referencia: core/paquete.ts, tienda/raiz.ts, core/tienda/deseos.ts.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NOMBRE_PAQUETE, raizDelPaquete, raizDelPaqueteSiExiste, rutaDelPaquete } from "../core/paquete.ts";

const raizKit = resolve(import.meta.dirname, "..");

describe("la raíz del paquete", () => {
  it("la casa se encuentra por su nombre, no por la cuenta de niveles", () => {
    // el repo: core/paquete.ts está a un nivel de la raíz
    expect(raizDelPaquete(join(raizKit, "core"))).toBe(raizKit);
    // y más abajo también (que es lo que pasa al compilar)
    expect(raizDelPaquete(join(raizKit, "core", "tienda"))).toBe(raizKit);
    expect(raizDelPaquete(join(raizKit, "dist", "core", "tienda"))).toBe(raizKit);
  });

  it("sin kit, la respuesta es que no hay (y no una ruta inventada)", () => {
    const fuera = mkdtempSync(join(tmpdir(), "esme-sin-kit-"));
    try {
      expect(raizDelPaqueteSiExiste(fuera)).toBeNull();
      // y la versión que lanza dice POR QUÉ
      expect(() => raizDelPaquete(fuera)).toThrow(/esme-platform/);
    } finally {
      rmSync(fuera, { recursive: true, force: true });
    }
  });

  it("un package.json que no es el nuestro no engancha la búsqueda", () => {
    const otro = mkdtempSync(join(tmpdir(), "esme-otro-kit-"));
    try {
      // un package.json con otro nombre: se sigue subiendo hasta encontrar el nuestro
      writeFileSync(join(otro, "package.json"), JSON.stringify({ name: "otro-cosa" }));
      expect(raizDelPaqueteSiExiste(otro)).toBeNull();
      // y uno con NUESTRO nombre engancha (así se comporta el paquete instalado)
      writeFileSync(join(otro, "package.json"), JSON.stringify({ name: NOMBRE_PAQUETE }));
      expect(raizDelPaquete(otro)).toBe(otro);
    } finally {
      rmSync(otro, { recursive: true, force: true });
    }
  });

  it("una ruta dentro del kit se compone desde la raíz", () => {
    expect(rutaDelPaquete("estandar", "piel.spec.yaml")).toBe(
      join(raizKit, "estandar", "piel.spec.yaml")
    );
  });
});

// --- LA PRUEBA QUE IMPORTABA: el kit PUBLICADO ---
//
// El bug que motivó este fichero: el kit se publica compilado a `dist/`, y
// las rutas que buscaban la raíz contando niveles llegaban a `dist/`. El
// paquete publicado, instalado de verdad, no encontraba ni su raíz de
// confianza ni sus contratos — y no installaba nada en silencio.
//
// Esta prueba compila el kit y pregunta al CÓDIGO COMPILADO, que es
// exactamente lo que viaja en el tarball.

describe("el kit compilado (que es el que se publica) encuentra su casa", () => {
  it("desde dist/ encuentra la raíz de confianza y los contratos", () => {
    const dist = join(raizKit, "dist");
    // si no está compilado, se compila: la prueba no puede depender del orden
    if (!existsSync(join(dist, "core", "paquete.js"))) {
      execFileSync("npm", ["run", "build"], { cwd: raizKit, stdio: ["ignore", "pipe", "pipe"] });
    }
    expect(existsSync(join(dist, "core", "paquete.js"))).toBe(true);

    const salida = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { leeRaiz } from ${JSON.stringify(join(dist, "tienda", "raiz.js"))};
         import { existeContrato } from ${JSON.stringify(join(dist, "core", "tienda", "deseos.js"))};
         console.log(JSON.stringify({ raiz: !!leeRaiz(), piel: existeContrato("piel") }));`,
      ],
      { cwd: raizKit, encoding: "utf8" }
    );
    const r = JSON.parse(salida.trim()) as { raiz: boolean; piel: boolean };
    expect(r.raiz, "el kit compilado no encuentra su raíz de confianza").toBe(true);
    expect(r.piel, "el kit compilado no encuentra sus contratos").toBe(true);
  });
});
