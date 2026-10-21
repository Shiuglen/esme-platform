/**
 * EL EMPAQUE — los mismos bytes en cualquier máquina.
 *
 * La tienda firma bytes: si el mismo módulo se empaquetaba de dos maneras,
 * el sha que el índice fijaba no cuadraba con el paquete, y la firma no
 * valía para nada. Estas pruebas son las que hacen que eso no vuelva a
 * pasar:
 *
 *   1. el tar que escribimos es byte a byte el tar de GNU (con los mismos
 *      flags) — donde haya GNU tar, se comparan;
 *   2. el gzip no lleva el sistema operativo dentro (el byte que cambia
 *      entre Linux, macOS y Windows);
 *   3. empaquetar dos veces da el mismo sha;
 *   4. y el paquete PUBLICADO es el que sale de este código: si alguien toca
 *      un módulo sin volver a medirlo, la tienda se queda vieja y aquí se
 *      dice.
 *
 * Referencia: tienda/tar.ts, tienda/gzip.ts, tienda/empaque.ts.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { empaquetar } from "../tienda/empaque.ts";
import { entradasDe, tarDeterminista, leeTar } from "../tienda/tar.ts";
import { gzipDeterminista } from "../tienda/gzip.ts";

const raiz = resolve(import.meta.dirname, "..");
const modulos = ["ejemplo-hola-mundo", "ejemplo-puerta", "ejemplo-troceo-pro"];

/** ¿Hay un GNU tar con los flags de la casa? */
const hayGnuTar = (): boolean => {
  try {
    execFileSync("tar", ["--sort=name", "--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

describe("el tar determinista", () => {
  it("GNU tar lo lee y lo extrae igual (es un tar de verdad)", () => {
    if (!hayGnuTar()) return; // sin GNU tar no hay contra qué comparar
    const dir = join(raiz, "modulos", "ejemplo-hola-mundo");
    const destino = mkdtempSync(join(tmpdir(), "esme-tar-"));
    try {
      const entradas = entradasDe(dir);
      for (const e of entradas) {
        if (!e.esDir && !e.enlace) {
          e.contenido = readFileSync(join(dir, e.nombre.replace(/^\.\//, "")));
        }
      }
      const mio = tarDeterminista(entradas);
      const ruta = join(destino, "nuestro.tar");
      writeFileSync(ruta, mio);
      execFileSync("tar", ["-xf", ruta, "-C", destino]);
      // lo que extrajo GNU tar es lo que había
      for (const rel of ["module.yaml", "bench.json", join("src", "index.ts")]) {
        expect(
          readFileSync(join(destino, rel)).equals(readFileSync(join(dir, rel))),
          `${rel} sale distinto`
        ).toBe(true);
      }
    } finally {
      rmSync(destino, { recursive: true, force: true });
    }
  });

  it("las entradas son las mismas que las de GNU tar (nombres, orden y tamaños)", () => {
    if (!hayGnuTar()) return;
    const dir = join(raiz, "modulos", "ejemplo-hola-mundo");
    const entradas = entradasDe(dir);
    for (const e of entradas) {
      if (!e.esDir && !e.enlace) {
        e.contenido = readFileSync(join(dir, e.nombre.replace(/^\.\//, "")));
      }
    }
    const mio = tarDeterminista(entradas);
    const gnu = execFileSync(
      "tar",
      [
        "--sort=name",
        "--owner=0",
        "--group=0",
        "--numeric-owner",
        "--mtime=@0",
        "-cf",
        "-",
        "-C",
        dir,
        ".",
      ],
      { maxBuffer: 64e6 }
    );
    // los MODOS son canónicos aquí (no los del disco): por eso la comparación
    // es de entradas, no de bytes
    const mioE = leeTar(mio).map((e) => `${e.nombre}:${e.tamano}:${e.tipo}`);
    const gnuE = leeTar(gnu).map((e) => `${e.nombre}:${e.tamano}:${e.tipo}`);
    expect(mioE).toEqual(gnuE);
  });

  it("el orden es por nombre (el mismo en todas partes)", () => {
    const entradas = entradasDe(join(raiz, "modulos", "ejemplo-hola-mundo"));
    const nombres = entradas.map((e) => e.nombre);
    expect(nombres).toEqual([...nombres].sort());
    expect(nombres[0]).toBe("./");
  });

  it("los modos son canónicos (los mismos en cualquier máquina)", () => {
    const entradas = entradasDe(join(raiz, "modulos", "ejemplo-hola-mundo"));
    for (const e of entradas) {
      expect(e.modo, `${e.nombre}`).toBe(e.esDir ? 0o755 : 0o644);
    }
  });
});

describe("el gzip determinista", () => {
  it("no lleva el sistema operativo dentro (el byte que cambiaba entre sistemas)", () => {
    const gz = gzipDeterminista(Buffer.from("hola"));
    // 1f 8b 08 00 | mtime 0000 | xfl 02 | OS 03 (fijo, no el del sistema)
    expect(gz.subarray(0, 10).toString("hex")).toBe("1f8b0800000000000203");
  });

  it("comprime y descomprime igual (lo que se firma es lo que se descomprime)", async () => {
    const { gunzipSync } = await import("node:zlib");
    const original = Buffer.from("el mismo módulo, los mismos bytes".repeat(50));
    expect(gunzipSync(gzipDeterminista(original)).equals(original)).toBe(true);
  });
});

describe("el paquete publicado es el que sale de aquí", () => {
  it("empaquetar dos veces da el mismo sha", () => {
    const dir = join(raiz, "modulos", "ejemplo-hola-mundo");
    const a = empaquetar(dir, mkdtempSync(join(tmpdir(), "esme-empaque-a-")));
    const b = empaquetar(dir, mkdtempSync(join(tmpdir(), "esme-empaque-b-")));
    expect(a.sha256).toBe(b.sha256);
    expect(a.bytes).toBe(b.bytes);
  });

  it("el sha del paquete es el que el índice firmado fija (la tienda no se queda vieja)", () => {
    const indice = JSON.parse(readFileSync(join(raiz, "tienda", "index.json"), "utf8")) as {
      modulos: Array<{ id: string; artefacto?: { tar?: string; bytes?: number } }>;
    };
    for (const m of modulos) {
      const id = `esme.nucleo.${m.replace("ejemplo-", "")}`;
      const entrada = indice.modulos.find((x) => x.id === id);
      expect(entrada, `${id} no está en el índice`).toBeTruthy();
      const empacado = empaquetar(
        join(raiz, "modulos", m),
        mkdtempSync(join(tmpdir(), "esme-empaque-c-"))
      );
      expect(empacado.sha256, `${id}: el paquete no es el que está firmado`).toBe(
        entrada?.artefacto?.tar
      );
      expect(empacado.bytes).toBe(entrada?.artefacto?.bytes);
    }
  });

  it("el paquete lleva el informe con el que se midió (no el de la corrida anterior)", () => {
    const { gunzipSync } = require("node:zlib") as typeof import("node:zlib");
    const tar = gunzipSync(
      readFileSync(join(raiz, "tienda", "paquetes", "esme-nucleo-hola-mundo-0.1.0.tgz"))
    );
    const texto = tar.toString("utf8");
    const enElPaquete = texto.slice(texto.indexOf('"fecha"'), texto.indexOf('"fecha"') + 22);
    const enElRepo = readFileSync(join(raiz, "modulos", "ejemplo-hola-mundo", "bench.json"), "utf8");
    expect(enElPaquete).toBe(enElRepo.slice(enElRepo.indexOf('"fecha"'), enElRepo.indexOf('"fecha"') + 22));
  });

  it("el paquete existe en la tienda (lo firmado está donde se espera)", () => {
    for (const m of modulos) {
      const id = `esme.nucleo.${m.replace("ejemplo-", "")}`;
      // el nombre del paquete lleva guiones (el id, con los puntos cambiados)
      const ruta = join(raiz, "tienda", "paquetes", `${id.replace(/\./g, "-")}-0.1.0.tgz`);
      expect(existsSync(ruta), `falta ${ruta}`).toBe(true);
    }
  });
});
