/**
 * DESEMPAQUETAR — lo que viene de fuera no puede escribir fuera.
 *
 * El paquete de un módulo es un fichero tar que alguien de otra casa ha
 * escrito. Desempaquetarlo es el momento peligroso: un nombre con `..` o un
 * enlace simbólico que apunte fuera convertiría «instalar un módulo» en
 * «escribir en tu disco». Estas pruebas son el confine.
 *
 * Referencia: tienda/untar.ts, tienda/tar.ts.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tarDeterminista, type EntradaTar } from "../tienda/tar.ts";
import { desempaceta, rutaConfinada } from "../tienda/untar.ts";

const casa = (): string => mkdtempSync(join(tmpdir(), "esme-untar-"));

/** ¿Se pueden crear enlaces simbólicos aquí? (en Windows, a veces no). */
const puedeEnlace = ((): boolean => {
  try {
    const d = mkdtempSync(join(tmpdir(), "esme-enlace-"));
    symlinkSync("real.txt", join(d, "atajo"));
    rmSync(d, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
})();

describe("el confine de las rutas", () => {
  it("dentro vale; fuera no", () => {
    const destino = join(tmpdir(), "casa");
    expect(rutaConfinada(destino, "./src/index.ts")).toBe(join(destino, "src", "index.ts"));
    expect(rutaConfinada(destino, "../fuera")).toBeNull();
    expect(rutaConfinada(destino, "/etc/passwd")).toBeNull();
    expect(rutaConfinada(destino, "a/../../b")).toBeNull();
    expect(rutaConfinada(destino, "C:\\windows")).toBeNull();
  });
});

describe("el tar y su vuelta", () => {
  it("una ruta larga sobrevive (no se trunca el nombre)", () => {
    const dir = casa();
    try {
      const destino = join(dir, "fuera");
      mkdirSync(destino, { recursive: true });
      const largo = `./carpeta/${"muy-larga/".repeat(12)}fichero.txt`;
      const entradas: EntradaTar[] = [
        { nombre: "./", modo: 0o755, esDir: true },
        { nombre: largo, modo: 0o644, contenido: Buffer.from("hola") },
      ];
      const salida = desempaceta(tarDeterminista(entradas), destino);
      const escrito = join(destino, largo.replace(/^\.\//, ""));
      expect(existsSync(escrito)).toBe(true);
      expect(readFileSync(escrito, "utf8")).toBe("hola");
      expect(salida.ficheros).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("un paquete que quiere escribir fuera se rechaza (y no escribe nada)", () => {
    const dir = casa();
    try {
      const destino = join(dir, "dentro");
      const entradas: EntradaTar[] = [
        { nombre: "./", modo: 0o755, esDir: true },
        { nombre: "../fuera.txt", modo: 0o644, contenido: Buffer.from("colado") },
      ];
      expect(() => desempaceta(tarDeterminista(entradas), destino)).toThrow(/fuera de la carpeta/);
      expect(existsSync(join(dir, "fuera.txt"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("una ruta absoluta se rechaza", () => {
    const dir = casa();
    try {
      const destino = join(dir, "dentro");
      const entradas: EntradaTar[] = [
        { nombre: "/etc/passwd", modo: 0o644, contenido: Buffer.from("x") },
      ];
      expect(() => desempaceta(tarDeterminista(entradas), destino)).toThrow(/fuera de la carpeta/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!puedeEnlace)("un enlace simbólico que apunta fuera se rechaza", () => {
    const dir = casa();
    try {
      const destino = join(dir, "dentro");
      const entradas: EntradaTar[] = [
        { nombre: "./", modo: 0o755, esDir: true },
        { nombre: "./atajo", modo: 0o777, enlace: "../../etc/passwd" },
      ];
      expect(() => desempaceta(tarDeterminista(entradas), destino)).toThrow(/enlace/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!puedeEnlace)("un enlace dentro de la carpeta sí se escribe", () => {
    const dir = casa();
    try {
      const destino = join(dir, "dentro");
      const entradas: EntradaTar[] = [
        { nombre: "./", modo: 0o755, esDir: true },
        { nombre: "./real.txt", modo: 0o644, contenido: Buffer.from("contenido") },
        { nombre: "./atajo", modo: 0o777, enlace: "./real.txt" },
      ];
      const salida = desempaceta(tarDeterminista(entradas), destino);
      expect(salida.enlaces).toEqual(["./atajo"]);
      expect(existsSync(join(destino, "atajo"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("el contenido sale byte a byte (lo que se firmó es lo que se instala)", () => {
    const dir = casa();
    try {
      const destino = join(dir, "dentro");
      const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 0, 255]);
      const entradas: EntradaTar[] = [
        { nombre: "./", modo: 0o755, esDir: true },
        { nombre: "./binario", modo: 0o644, contenido: bytes },
      ];
      desempaceta(tarDeterminista(entradas), destino);
      expect(readFileSync(join(destino, "binario")).equals(bytes)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
