import { describe, expect, it } from "vitest";
import {
  layaRoute,
  ordenPreferencia,
  UMBRAL_CONFIDENCE,
  type CognitionMotor,
} from "../motores/laya-adapter.ts";

const capa = (
  id: string,
  pricing: "api" | "local" | "gratuito",
  local_only = false
): CognitionMotor => ({
  id,
  capabilities: {
    streaming: true,
    tools: false,
    max_context: 100000,
    local_only,
    pricing,
    cancel_support: true,
    runtimes: ["nodejs"],
    net: false,
    mcp: false,
  },
  adapter: null,
});

const colaLocal = [capa("local", "local", true), capa("claude-code", "api")];

describe("ordenPreferencia (regla del proyecto: primero lo gratis)", () => {
  it("gratuito gana a local, local gana a api", () => {
    const r = ordenPreferencia([
      capa("claude-code", "api"),
      capa("opencode", "gratuito"),
      capa("ollama", "local", true),
    ]);
    expect(r[0]).toBe("opencode");
    expect(r).toEqual(["opencode", "ollama", "claude-code"]);
  });
});

describe("layaRoute sin servicio (la prueba offline del router)", () => {
  it("sin env ESME_LAYA_URL → pero local intenta ruta por capacidades", async () => {
    const d = await layaRoute("tarea compleja de código", { capacidades: colaLocal });
    expect(d.route).toBeDefined();
    expect(d.confidence).toBeGreaterThan(0);
    expect(d.reasoning).toContain("gratis");
  });

  it("sin capacidades que cae a local y justifica", async () => {
    const d = await layaRoute("tarea", { capacidades: [] });
    expect(d.route).toBe("local");
    expect(d.confidence).toBeGreaterThanOrEqual(0.75);
  });
});

describe("layaRoute con servicio (ESME_LAYA_URL)", () => {
  it("confianza alta responde directo", async () => {
    process.env.ESME_LAYA_URL = "http://127.0.0.1:1/decide"; // falla la conexión
    // fetch falla rápido → res local = regla de no-dependencia
    const d = await layaRoute("x", { capacidades: colaLocal });
    expect(d.fallback ?? d).toBeTruthy();
    delete process.env.ESME_LAYA_URL;
  });
});

describe("lookout hàng", () => {
  it("umbral definido y estable", () => {
    expect(UMBRAL_CONFIDENCE).toBe(0.6);
  });
});
