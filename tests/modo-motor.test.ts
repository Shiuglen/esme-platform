/**
 * EL MODO SEGÚN EL MOTOR — el presupuesto lo pone quien va a responder.
 *
 * Lo que se prueba:
 *
 *   1. un motor local con ventana pequeña va en ahorrador (su presupuesto es
 *      el de la casa, no el de una ventana de 200K);
 *   2. uno local con ventana grande, o de API, va en estándar;
 *   3. y cuando el contexto es de un equipo, va en equipo;
 *   4. y el modo dice POR QUÉ (una regla sin motivo es una casualidad).
 *
 * Referencia: core/talamus/modo-motor.ts.
 */
import { describe, expect, it } from "vitest";
import { modoParaMotor, modosDeLosMotores, VENTANA_ESTANDAR } from "../core/talamus/modo-motor.ts";
import { cargaMotorCached } from "../motores/laya-adapter.ts";
import { join } from "node:path";

const raiz = join(import.meta.dirname, "..");
const motores = cargaMotorCached(join(raiz, "estandar", "motor-capability.spec.yaml"));

const motor = (id: string) => {
  const m = motores.find((x) => x.id === id);
  if (!m) throw new Error(`el motor ${id} no está`);
  return m;
};

describe("el modo según el motor", () => {
  it("un motor local con ventana pequeña va en ahorrador", () => {
    expect(modoParaMotor(motor("local"))).toBe("ahorrador");
  });

  it("uno local con ventana grande, o de API, va en estándar", () => {
    // el local de la spec tiene 32K (pequeña): el ahorrador
    expect(motor("local").capabilities.max_context).toBeLessThan(VENTANA_ESTANDAR);
    expect(modoParaMotor(motor("opencode"))).toBe("estandar");
    expect(modoParaMotor(motor("claude-code"))).toBe("estandar");
  });

  it("cuando el contexto es del equipo, va en equipo", () => {
    expect(modoParaMotor(motor("opencode"), { compartido: true })).toBe("equipo");
    expect(modoParaMotor(motor("local"), { compartido: true })).toBe("equipo");
  });

  it("cada modo dice POR QUÉ", () => {
    const tabla = modosDeLosMotores(motores);
    expect(tabla.length).toBe(motores.length);
    for (const fila of tabla) {
      expect(fila.porque.length).toBeGreaterThan(5);
      expect(["ahorrador", "estandar", "equipo"]).toContain(fila.modo);
    }
    // los locales con ventana pequeña van en ahorrador (el shell no tiene
    // ventana: tampoco gasta contexto, pero la regla es la misma)
    expect(tabla.filter((f) => f.modo === "ahorrador").map((f) => f.motor).sort()).toEqual([
      "local",
      "ollama",
      "shell",
    ]);
  });
});
