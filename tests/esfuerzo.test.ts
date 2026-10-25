/**
 * EL ESFUERZO DE LOS MODELOS — la tabla manda, el código pregunta.
 *
 * Lo que se prueba:
 *
 *   1. la tabla se lee del documento (yaml separado por ---; los que
 *      llevan `motor:` son fichas);
 *   2. el resolver devuelve el parámetro que el motor ya entiende;
 *   3. HONESTO: el modo que la tabla no declara → params null (sin medios
 *      inventados), y el motor sin parámetro → nada;
 *   4. la MENTE manda: su documento encima gana (mezcla pieza por pieza);
 *   5. la reserva "*" del motor habla por los modelos que no se nombraron;
 *   6. normal con valor null = no se manda NADA (el punto de fábrica);
 *   7. el contrato está escrito.
 *
 * Referencia: core/esfuerzo.ts, estandar/esfuerzo.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cargaEsfuerzo } from "../motores/esfuerzo-doc.ts";
import { esfuerzoDe, modosDe, MODOS } from "../core/esfuerzo.ts";

const raiz = join(import.meta.dirname, "..");
const spec = join(raiz, "estandar", "esfuerzo.spec.yaml");

describe("la tabla", () => {
  it("se lee del documento (las fichas son los que llevan motor:)", () => {
    const tabla = cargaEsfuerzo(spec);
    expect(tabla.entradas.length).toBeGreaterThanOrEqual(5);
    // y la reserva de opencode está
    const opencode = tabla.entradas.find((e) => e.motor === "opencode");
    expect(opencode?.parametro).toBe("reasoning_effort");
  });

  it("los tres modos de la casa son tres", () => {
    expect(MODOS).toEqual(["apretado", "normal", "profundo"]);
  });
});

describe("el resolver", () => {
  it("trae el PARÁMETRO que el motor ya entiende (de la tabla, no adivinado)", () => {
    const tabla = cargaEsfuerzo(spec);
    const r = esfuerzoDe(tabla.entradas, "codex", "gpt-5.2-nose", "profundo");
    // gpt-5.2-nose no se nombró: habla la reserva "*" de codex
    expect(r.sabe).toBe(true);
    expect(r.params).toEqual({ reasoning_effort: "high" });
    expect(r.valor).toBe("high");
  });

  it("quien se nombró, gana sobre la reserva (delModelo primero)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "esfuerzo-"));
    const tabla = join(tmp, "tabla.yaml");
    writeFileSync(tabla, [
      "regla: sí",
      "---",
      'motor: "opencode"',
      'modelo: "miprueba"',
      "parametro: thinking",
      "valores:",
      "  profundo: {type: enabled}",
      "---",
      'motor: "opencode"',
      'modelo: "*"',
      "parametro: reasoning_effort",
      "valores:",
      "  profundo: high",
    ].join("\n"));
    try {
      const t = cargaEsfuerzo(tabla);
      const conNombre = esfuerzoDe(t.entradas, "opencode", "miprueba", "profundo");
      expect(conNombre.params).toEqual({ thinking: { type: "enabled" } });
      const sinNombre = esfuerzoDe(t.entradas, "opencode", "otro", "profundo");
      expect(sinNombre.params).toEqual({ reasoning_effort: "high" });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("HONESTO: el modo que no está en la tabla → NADA (sin medios inventados)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "esfuerzo-"));
    const tabla = join(tmp, "tabla.yaml");
    writeFileSync(tabla, [
      "regla: sí",
      "---",
      'motor: "opencode"',
      'modelo: "medio"',
      'parametro: "reasoning_effort"',
      "valores:",
      "  profundo: high",
    ].join("\n"));
    try {
      const t = cargaEsfuerzo(tabla);
      const r = esfuerzoDe(t.entradas, "opencode", "medio", "apretado");
      expect(r.sabe).toBe(false);
      expect(r.params).toBeNull();
      // y la reserva me ordena también: sin ficha, nada
      const sinTabla = esfuerzoDe(t.entradas, "desconocido", "x", "profundo");
      expect(sinTabla.sabe).toBe(false);
      expect(sinTabla.params).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("el motor que no habla de esfuerzo: no se le manda NADA (sin disimulo)", () => {
    const tabla = cargaEsfuerzo(spec);
    const r = esfuerzoDe(tabla.entradas, "local", "qwen3.5-9b", "profundo");
    expect(r.sabe).toBe(false);
    expect(r.parametro).toBeNull();
    expect(r.params).toBeNull();
  });

  it("normal con valor null = el punto de fábrica (sabe true, manda nada)", () => {
    const tabla = cargaEsfuerzo(spec);
    const r = esfuerzoDe(tabla.entradas, "gemini", "gemini-2.5-x", "normal");
    expect(r.sabe).toBe(true);
    expect(r.params).toBeNull();
    expect(r.valor).toBeNull();
  });
});

describe("mente manda", () => {
  it("tu documento ENCIIMA gana, pieza por pieza (mezcla suave)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "esfuerzo-"));
    const encima = join(tmp, "encima.yaml");
    writeFileSync(encima, [
      'motor: "codex"',
      'modelo: "*"',
      "valores:",
      "  apretado: minimal",
    ].join("\n"));
    try {
      const t = cargaEsfuerzo(spec, encima);
      const r = esfuerzoDe(t.entradas, "codex", "gpt-5.2-nose", "apretado");
      // la pieza de la mente: minimal
      expect(r.params).toEqual({ reasoning_effort: "minimal" });
      expect(r.de).toBe("mente");
      // y el valor de profundo quedó de la casa: la mezcla suave es de
      // VALORES (la ficha tocada es de la mente, y el `high` que ella no
      // dijo no se lo piensa nadie)
      const otro = esfuerzoDe(t.entradas, "codex", "gpt-5.2-nose", "profundo");
      expect(otro.params).toEqual({ reasoning_effort: "high" });
      expect(otro.de).toBe("mente");
      // y una ficha AL NO VIDA de la mente también entra
      const sabidos = modosDe(t.entradas, "ollama", "nose");
      expect(sabidos.modos).toEqual(["apretado", "normal", "profundo"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("una ficha que la mente trae NUEVA entra sin que la casa la pise", () => {
    const tmp = mkdtempSync(join(tmpdir(), "esfuerzo-"));
    const encima = join(tmp, "encima.yaml");
    writeFileSync(encima, [
      'motor: "opencode"',
      'modelo: "nuevo-max"',
      'parametro: "budget_tokens"',
      "valores:",
      "  profundo: 64000",
    ].join("\n"));
    try {
      const t = cargaEsfuerzo(spec, encima);
      const r = esfuerzoDe(t.entradas, "opencode", "nuevo-max", "profundo");
      // la ficha nombrada primero: no pcd el "*" de la reserva
      expect(r.params).toEqual({ budget_tokens: 64000 });
      expect(r.de).toBe("mente");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("el contrato está escrito", () => {
  it("la spec declara la forma y las reglas (documento, mente_manda, honesto)", () => {
    const texto = readFileSync(spec, "utf8");
    for (const campo of ["motor:", "modelo:", "parametro:", "valores:", "fuente:", "verificado:"]) {
      expect(texto, `la spec no declara ${campo}`).toContain(campo);
    }
    expect(texto).toContain("documento: true");
    expect(texto).toContain("mente_manda: true");
    expect(texto).toContain("honesto: true");
  });
});
