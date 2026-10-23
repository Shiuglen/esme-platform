/**
 * EL AGENTE — la receta, juzgada.
 *
 * Lo que se prueba:
 *
 *   1. la receta de la casa (opencode + memoria + techo) es válida;
 *   2. un motor que NO existe no entra (y el que lo publica se entera aquí);
 *   3. un motor que no habla MCP no puede prometer la memoria;
 *   4. un agente sin presupuesto (o sin techo) no entra: es un agujero de
 *      tokens;
 *   5. y la puerta abre: un módulo de agente creado por el constructor trae
 *      su receta y la pasa.
 *
 * Referencia: estandar/agente.spec.yaml, tienda/agente.ts.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validaAgente, recetaBase } from "../tienda/agente.ts";
import { juzgaAgente, juzgaAgenteDeModulo, motoresDe } from "../tienda/agente.ts";
import { creaModulo } from "../tienda/crea.ts";
import { verificaModulo } from "../tienda/verifica.ts";

const raizKit = join(import.meta.dirname, "..");
const motores = motoresDe();

describe("la receta del agente", () => {
  it("la de la casa es válida", () => {
    const r = validaAgente(recetaBase("esme.prueba.agente", "Agente"), motores);
    expect(r.errores).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.agente?.motor).toBe("opencode");
  });

  it("un motor que no existe no entra", () => {
    const r = validaAgente({ ...recetaBase("esme.prueba.a", "A"), motor: "inventado" }, motores);
    expect(r.ok).toBe(false);
    expect(r.errores.join(" ")).toContain("no está en la spec de motores");
  });

  it("un motor que no habla MCP no puede prometer la memoria", () => {
    const r = validaAgente(
      { ...recetaBase("esme.prueba.b", "B"), motor: "shell", memoria: true },
      motores
    );
    expect(r.ok).toBe(false);
    expect(r.errores.join(" ")).toContain("no habla MCP");
  });

  it("sin presupuesto (o con techo cero) no entra: es un agujero de tokens", () => {
    const sinTecho = validaAgente(
      { ...recetaBase("esme.prueba.c", "C"), presupuesto: { tokens: 0, segundos: 0 } },
      motores
    );
    expect(sinTecho.ok).toBe(false);
    expect(sinTecho.errores.join(" ")).toContain("presupuesto");
  });

  it("sin encargo no entra (un agente sin encargo no sabe qué hacer)", () => {
    const r = validaAgente({ ...recetaBase("esme.prueba.d", "D"), encargo: "" }, motores);
    expect(r.ok).toBe(false);
    expect(r.errores.join(" ")).toContain("encargo");
  });

  it("el id tiene que ser esme.<autor>.<slug>", () => {
    const r = validaAgente({ ...recetaBase("agente-sin-autor", "E") }, motores);
    expect(r.ok).toBe(false);
    expect(r.errores.join(" ")).toContain("esme.<autor>.<slug>");
  });
});

describe("la puerta abre para los agentes", () => {
  it("un módulo de agente creado por el constructor trae su receta y la pasa", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "esme-agente-")), "mi-agente");
    try {
      await creaModulo(
        { id: "esme.prueba.mi-agente", nombre: "Mi agente", categoria: "agent", dir },
        raizKit
      );
      const receta = juzgaAgenteDeModulo(dir, "agent");
      expect(receta.ok).toBe(true);
      expect(receta.agente?.motor).toBe("opencode");
      // y el verificador entero acepta el módulo
      const r = await verificaModulo(dir);
      expect(r.veredicto?.entra).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("un módulo de agente sin receta no entra", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-agente-"));
    try {
      const r = juzgaAgenteDeModulo(dir, "agent");
      expect(r.ok).toBe(false);
      expect(r.errores.join(" ")).toContain("agente.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("un módulo que no es de agente no necesita receta", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-agente-"));
    try {
      expect(juzgaAgenteDeModulo(dir, "tool").ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
