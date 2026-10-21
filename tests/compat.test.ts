/**
 * EL COMPAT-CHECK — un módulo, motor por motor.
 *
 * Lo que se prueba: que el cruce entre el manifiesto del módulo y la spec de
 * motores dice la verdad. Un módulo que no puede alojar ningún motor tiene
 * que salir con las manos vacías y un motivo; un módulo que declara con qué
 * motores trabaja manda sobre las reglas; y la spec no puede prometer un
 * motor que el código no conoce (ni al revés).
 *
 * Referencia: docs/MOTORES.md, motores/compat.ts, estandar/motor-capability.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { resolve, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as yaml from "js-yaml";
import { cargaMotorCached, MOTORES_CONOCIDOS } from "../motores/laya-adapter.ts";
import { motorDe, estaInstalado } from "../motores/acp-motores.ts";
import {
  compatDe,
  compatMotores,
  motoresQueAlojan,
  motoresDeclaradosQueNoExisten,
} from "../motores/compat.ts";
import { verificaCompat } from "../scripts/estandar/compat-check.ts";

const raiz = resolve(import.meta.dirname, "..");
const rutaSpec = join(raiz, "estandar", "motor-capability.spec.yaml");
const motores = cargaMotorCached(rutaSpec);

const motor = (id: string) => {
  const m = motores.find((x) => x.id === id);
  if (!m) throw new Error(`el motor ${id} no está en la spec`);
  return m;
};

/** Un módulo de juguete, en una carpeta temporal. */
const modulo = (manifiesto: Record<string, unknown>): string => {
  const dir = mkdtempSync(join(tmpdir(), "esme-compat-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  const base = {
    schema_version: 1,
    id: "esme.prueba.compat",
    name: "Compat",
    version: "0.1.0",
    category: "tool",
    description: "Un módulo de juguete para probar la compatibilidad con los motores.",
    author: "esme@prueba",
    license: "MIT",
    entry: "dist/index.js",
    runtime: "nodejs",
    permissions: [],
    decision_criteria: [],
    dependencies: [],
    sideEffects: false,
    benchmarks: { recall_delta: 0.01, report: "bench.json" },
  };
  writeFileSync(join(dir, "module.yaml"), yaml.dump({ ...base, ...manifiesto }));
  return dir;
};

describe("la spec de motores y el código no cuentan cosas distintas", () => {
  it("la spec declara todos los motores que el código conoce (y ni uno más)", () => {
    expect(motores.map((m) => m.id).sort()).toEqual([...MOTORES_CONOCIDOS].sort());
  });

  it("cada motor sabe cómo se habla con él (el adaptador existe)", () => {
    for (const m of motores) {
      const acp = motorDe(m.id);
      expect(acp, `${m.id} sin adaptador`).not.toBeNull();
      expect(acp?.transporte).toBeTruthy();
    }
  });

  it("el shell y el local no son binarios que se busquen (siempre están)", () => {
    expect(estaInstalado("shell")).toBe(true);
    expect(estaInstalado("local")).toBe(true);
  });
});

describe("las reglas de alojo", () => {
  it("el runtime manda: si el motor no lo aloja, no puede", () => {
    const r = compatDe({ runtime: "nodejs", permisos: [] }, motor("local"));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("runtime nodejs");
  });

  it("las herramientas: un módulo que emite eventos necesita un motor que las vea", () => {
    const r = compatDe({ runtime: "python", permisos: ["ipc:emit"] }, motor("local"));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("herramientas");
  });

  it("la red: un módulo que pide net:fetch necesita un motor con red", () => {
    const r = compatDe({ runtime: "python", permisos: ["net:fetch"] }, motor("local"));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("red");
  });

  it("los procesos: un módulo que lanza programas necesita que el motor vea herramientas", () => {
    // `local` no ve herramientas: sus efectos (fuera de la cápsula) no los ve nadie
    const r = compatDe({ runtime: "python", permisos: ["proc:spawn"] }, motor("local"));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("proc:spawn");
    expect(r.motivo).toContain("herramientas");
  });

  it("los procesos: con un motor que ve herramientas, se puede alojar", () => {
    const r = compatDe({ runtime: "nodejs", permisos: ["proc:spawn"] }, motor("opencode"));
    expect(r.ok).toBe(true);
  });

  it("la declaración del módulo manda sobre las reglas", () => {
    const r = compatDe(
      { runtime: "nodejs", permisos: [], engines: ["ollama"] },
      motor("claude-code")
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("no trabaja con claude-code");
  });

  it("un módulo sin declaraciones vale para todo motor que lo pueda alojar", () => {
    const pueden = motoresQueAlojan({ runtime: "nodejs", permisos: [] }, motores);
    expect(pueden).toContain("claude-code");
    expect(pueden).toContain("shell");
    expect(pueden).not.toContain("ollama");
    expect(pueden).not.toContain("local");
  });
});

describe("el compat-check de verdad (manifiesto en disco)", () => {
  it("dice qué motores pueden alojarlo, y por qué los otros no", () => {
    const dir = modulo({ permissions: ["mind:read", "ui:render"] });
    try {
      const r = verificaCompat(dir, { rutaSpec });
      expect(r.ok).toBe(true);
      expect(r.pueden).toContain("claude-code");
      // el local no ve herramientas: y el motivo lo dice
      const local = r.motores.find((m) => m.motor === "local");
      expect(local?.ok).toBe(false);
      expect(local?.motivo).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("un módulo que declara un motor que no existe es un error del módulo", () => {
    const dir = modulo({ engines: ["inventado"] });
    try {
      const r = verificaCompat(dir, { rutaSpec });
      expect(r.ok).toBe(false);
      expect(r.declaradosInexistentes).toEqual(["inventado"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("un módulo que ningún motor puede alojar sale con las manos vacías", () => {
    const dir = modulo({ runtime: "nodejs", engines: ["local"] });
    try {
      const r = verificaCompat(dir, { rutaSpec });
      expect(r.pueden).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("el router sigue funcionando con los motores nuevos", () => {
  it("la cola de preferencia se arma con la spec completa", () => {
    const tabla = compatMotores({ runtime: "nodejs", permisos: [] }, motores);
    expect(tabla.length).toBe(motores.length);
  });
});
