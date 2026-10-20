import { describe, expect, it } from "vitest";
import { estadoPeticion, permisosEfectivosPreflight } from "../core/extension-host/permissions.ts";

describe("extension host — deny-all por defecto (ARQUITECTURA §2)", () => {
  it("capacidad declarada → requiere consentimiento del humano", () => {
    expect(estadoPeticion(["mind:read"], "mind:read")).toBe("pendiente-consentimiento");
  });

  it("capacidad no declarada → jamás irreversible denegado", () => {
    expect(estadoPeticion(["mind:read"], "net:fetch")).toBe("denegado");
  });

  it("capacidad fuera del enum cerrado → denegada siempre", () => {
    expect(estadoPeticion(["mind:read", "net:fetch"], "system:root")).toBe("denegado");
  });

  it("sin declaración no elvido nada → deny all de entrada", () => {
    expect(estadoPeticion([], "ui:render")).toBe("denegado");
  });

  it("preflight de uso: detecta memoriales ilegales antes de ejecutar", () => {
    const r = permisosEfectivosPreflight(
      { permissions: ["mind:read"] },
      ["mind:read", "net:fetch"]
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.ilegales).toEqual(["net:fetch"]);
  });

  it("uso legítimo aprobado", () => {
    expect(
      permisosEfectivosPreflight(
        { permissions: ["mind:read", "mind:write"] },
        ["mind:write"]
      ).ok
    ).toBe(true);
  });
});
