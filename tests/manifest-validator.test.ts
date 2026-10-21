import { describe, expect, it } from "vitest";
import { validaManifiesto } from "../modulos/nucleo/manifest-schema.ts";
import * as yaml from "js-yaml";
import { readFileSync } from "node:fs";

/** El ejemplo vivo será esterno legal: lo cargamos y lo validamos. */
const EJEMPLO = yaml.load(
  readFileSync(new URL("../modulos/ejemplo-hola-mundo/module.yaml", import.meta.url), "utf8")
) as unknown;

const modifica = (over: Record<string, unknown>) => ({
  ...(EJEMPLO as Record<string, unknown>),
  ...over,
});

describe("manifiesto de módulo (esme.nucleo.hola-mundo como oro)", () => {
  it("ejemplo válido", () => {
    const r = validaManifiesto(EJEMPLO);
    expect(r.ok).toBe(true);
    expect(r.errores).toEqual([]);
    expect(r.manifest?.id).toBe("esme.nucleo.hola-mundo");
    expect(r.manifest?.decision_criteria?.[0].tags.includes("saludo")).toBe(true);
  });

  it("sin benchmarks → lanza requerido con aviso de la Prueba 0", () => {
    const { benchmarks: _drop, ...rest } = modifica({}) as any;
    const r = validaManifiesto(rest);
    expect(r.ok).toBe(true);
    expect(r.avisos).toContainEqual(expect.stringContaining("Prueba 0"));
  });

  it("id mal formado → rechazo explícito", () => {
    const r = validaManifiesto(modifica({ id: "hola-mundo" }));
    expect(r.ok).toBe(false);
    expect(r.errores.some((e) => e.includes("esme.<autor>.<slug>"))).toBe(true);
  });

  it("version no semver → rechazo", () => {
    const r = validaManifiesto(modifica({ version: "1.0" }));
    expect(r.ok).toBe(false);
    expect(r.errores.some((e) => e.includes("semver"))).toBe(true);
  });

  it("capacidad inexistente fuera del enum cerrado → rechazo", () => {
    const r = validaManifiesto(
      modifica({ permissions: ["mind:read", "system:root"] })
    );
    expect(r.ok).toBe(false);
  });

  it("capacidad de procesos fuera del enum cerrado → rechazo (como las de red)", () => {
    // pedir `proc:exec` hoping to slip past `proc:spawn` no cuela
    const r = validaManifiesto(modifica({ permissions: ["mind:read", "proc:exec"] }));
    expect(r.ok).toBe(false);
  });

  it("`proc:spawn` sí es una capacidad válida (la séptima pieza de la puerta)", () => {
    const r = validaManifiesto(modifica({ permissions: ["proc:spawn"] }));
    expect(r.ok).toBe(true);
  });

  it("sin firma → pasa con aviso de la Prueba 0 (verificable o no entra)", () => {
    const { signatures: _drop, ...rest } = modifica({}) as Record<string, unknown>;
    const r = validaManifiesto(rest);
    expect(r.ok).toBe(true);
    expect(r.avisos).toContainEqual(expect.stringContaining("sin firma (ed25519)"));
  });

  it("copies the índice sin ownership — descripción corta no nos contrata", () => {
    const r = validaManifiesto(modifica({ description: "hi" }));
    expect(r.ok).toBe(false);
    expect(r.errores.some((e) => e.includes("description"))).toBe(true);
  });
});
