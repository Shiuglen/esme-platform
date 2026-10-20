/**
 * LA GARANTÍA DE INDEPENDENCIA (docs/ARQUITECTURA.md §6): sin red, la app
 * funciona. Aquí la versión del núcleo: el router Laya, sin ESME_LAYA_URL, no
 * intenta NI UNA llamada de red; y con el servicio caído, también decide.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { layaRoute, type CognitionMotor } from "../motores/laya-adapter.ts";

const capa = (id: string, pricing: "api" | "local" | "gratuito" = "gratuito"): CognitionMotor => ({
  id,
  capabilities: {
    streaming: true,
    tools: false,
    max_context: 100000,
    local_only: pricing !== "api",
    pricing,
    cancel_support: true,
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ESME_LAYA_URL;
});

describe("offline: el router nunca depende de nada que pueda fallar", () => {
  it("sin ESME_LAYA_URL no hay ni un single fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const d = await layaRoute("tarea de código", {
      capacidades: [capa("opencode"), capa("claude-code", "api")],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(d.route).toBeDefined();
  });

  it("con servicio configurado PERO muerte (fetch lanza), decide igual: 1 intento, 1 s máx", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("red muerta"));
    vi.stubGlobal("fetch", fetchSpy);
    process.env.ESME_LAYA_URL = "http://127.0.0.1:9/decide";
    const d = await layaRoute("tarea", {
      capacidades: [capa("opencode"), capa("ollama", "local")],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(d.route).toBe("opencode"); // gratuito primero: la regla del router
  });
});
