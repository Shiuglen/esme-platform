/**
 * LOS CAMBIOS DE UN TURNO — lo que tocó, de verdad.
 *
 * Lo que se prueba:
 *
 *   1. la instantánea es por CONTENIDO: tocar un byte cambia el hash;
 *   2. los exclusos no se miran (node_modules, dist, .git…);
 *   3. el diff de líneas cuenta bien ( Myers: añadir, quitar y no tocar);
 *   4. un diff demasiado grande NO se inventa: el número sale NULL y el
 *      resultado va truncado (un «0» falso sería una mentira);
 *   5. un binario no tiene líneas que contar (y se marca);
 *   6. y si la instantánea de antes no era completa, no se puede afirmar
 *      nada: el resultado va truncado.
 *
 * Referencia: core/turnos/cambios.ts (la idea viene de la ingeniería inversa
 * de PandaCode: `src-tauri/src/turn_changes.rs`).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  instantanea,
  compara,
  diffLineas,
  esBinario,
  mide,
  TOPE_EDICIONES,
} from "../core/turnos/cambios.ts";

const arbol = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "esme-cambios-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.ts"), "uno\ndos\ntres\n");
  writeFileSync(join(dir, "b.txt"), "otro\n");
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "ruido.js"), "no se mira\n");
  return dir;
};

describe("los cambios de un turno", () => {
  it("la instantánea es por contenido: tocar un byte cambia el hash", () => {
    const dir = arbol();
    try {
      const antes = instantanea(dir);
      expect(antes.entradas.has("src/a.ts")).toBe(true);
      writeFileSync(join(dir, "src", "a.ts"), "uno\ndos\ntres\nCUATRO\n");
      const despues = instantanea(dir);
      expect(antes.entradas.get("src/a.ts")!.hash).not.toBe(
        despues.entradas.get("src/a.ts")!.hash
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("los exclusos no se miran (node_modules no es parte de tu turno)", () => {
    const dir = arbol();
    try {
      const snap = instantanea(dir);
      expect(snap.entradas.has("node_modules/ruido.js")).toBe(false);
      expect(snap.entradas.size).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("el diff cuenta las líneas: añade, quita y no toca", () => {
    expect(diffLineas(["a", "b"], ["a", "b"])).toEqual({ anadidos: 0, borrados: 0 });
    expect(diffLineas(["a", "b"], ["a", "b", "c"])).toEqual({ anadidos: 1, borrados: 0 });
    expect(diffLineas(["a", "b", "c"], ["a", "c"])).toEqual({ anadidos: 0, borrados: 1 });
    expect(diffLineas([], ["a"])).toEqual({ anadidos: 1, borrados: 0 });
    expect(diffLineas(["a"], [])).toEqual({ anadidos: 0, borrados: 1 });
  });

  it("un diff demasiado grande NO se inventa: el número sale null y truncado", () => {
    const antes = Array.from({ length: 400 }, (_, i) => `l${i}`);
    const despues = Array.from({ length: 400 }, (_, i) => `otro${i}`);
    const d = diffLineas(antes, despues);
    expect(d).toBeNull();

    const dir = arbol();
    try {
      writeFileSync(join(dir, "src", "a.ts"), antes.join("\n"));
      const antesSnap = instantanea(dir);
      writeFileSync(join(dir, "src", "a.ts"), despues.join("\n"));
      const despuesSnap = instantanea(dir);
      const r = compara(antesSnap, despuesSnap);
      const f = r.ficheros.find((x) => x.ruta === "src/a.ts")!;
      expect(f.anadidos).toBeNull();
      expect(f.borrados).toBeNull();
      expect(f.truncado).toBe(true);
      expect(r.truncado).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("un binario no tiene líneas que contar (y se marca)", () => {
    const dir = arbol();
    try {
      writeFileSync(join(dir, "bin.dat"), Buffer.from([0, 1, 2, 0, 3]));
      const antes = instantanea(dir);
      writeFileSync(join(dir, "bin.dat"), Buffer.from([0, 1, 2, 0, 9]));
      const despues = instantanea(dir);
      const r = compara(antes, despues);
      const f = r.ficheros.find((x) => x.ruta === "bin.dat")!;
      expect(f.binario).toBe(true);
      expect(f.anadidos).toBeNull();
      expect(esBinario(Buffer.from([1, 2, 3]))).toBe(false);
      expect(esBinario(Buffer.from([1, 0, 3]))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lo que se compara es lo que pasó: añadidos, borrados y modificados", () => {
    const dir = arbol();
    try {
      const antes = instantanea(dir);
      writeFileSync(join(dir, "src", "a.ts"), "uno\ndos\ntres\nCUATRO\n");
      writeFileSync(join(dir, "nuevo.txt"), "nuevo\n");
      rmSync(join(dir, "b.txt"));
      const despues = instantanea(dir);
      const r = compara(antes, despues);
      const porRuta = Object.fromEntries(r.ficheros.map((f) => [f.ruta, f]));
      expect(porRuta["src/a.ts"].estado).toBe("modificado");
      expect(porRuta["src/a.ts"].anadidos).toBe(1);
      expect(porRuta["nuevo.txt"].estado).toBe("anadido");
      expect(porRuta["nuevo.txt"].anadidos).toBe(2); // el fichero entero
      expect(porRuta["b.txt"].estado).toBe("borrado");
      expect(porRuta["b.txt"].borrados).toBe(2); // se iba entero
      expect(r.anadidos).toBe(3); // 1 del modificado + 2 del nuevo
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("si la instantánea de antes no era completa, no se puede afirmar nada", () => {
    const dir = arbol();
    try {
      const antes = instantanea(dir);
      antes.completa = false; // como si el escaneo se hubiera quedado corto
      const despues = instantanea(dir);
      const r = compara(antes, despues);
      expect(r.truncado).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("el tope de ediciones está acotado (un diff infinito no cuelga la casa)", () => {
    expect(TOPE_EDICIONES).toBeLessThanOrEqual(1024);
    const grande = Array.from({ length: 3000 }, (_, i) => `x${i}`);
    expect(diffLineas(grande, grande.map((l) => l + "!"))).toBeNull();
  });

  it("la medida de un fichero da su hash, su tamaño y si es binario", () => {
    const m = mide(Buffer.from("hola"));
    expect(m.bytes).toBe(4);
    expect(m.hash).toHaveLength(64);
    expect(m.binario).toBe(false);
  });
});
