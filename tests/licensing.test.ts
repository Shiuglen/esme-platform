// La frontera de la licencia: escrita, y comprobable.
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  assertNivel,
  licenciasPresentes,
  licenciaDelRepo,
  nivelDe,
  RUTAS_COMUNITARIAS,
  RUTAS_MIT,
} from "../core/licensing.ts";

const raiz = resolve(import.meta.dirname, "..");

describe("la frontera de la licencia", () => {
  it("el núcleo es MIT y lo que lleva la identidad no lo es", () => {
    expect(nivelDe("core/mind/mind-file.ts")).toBe("mit");
    expect(nivelDe("motores/laya-adapter.ts")).toBe("mit");
    expect(nivelDe("estandar/mind-format.spec.yaml")).toBe("mit");
    expect(nivelDe("modulos/nucleo/manifest-validator.ts")).toBe("mit");
    expect(nivelDe("apps/desktop/src/main/mente/cliente.ts")).toBe("comunitaria");
    expect(nivelDe("marca/tinta-y-luz.css")).toBe("comunitaria");
    expect(nivelDe("otro/repo/cualquiera.ts")).toBe("propia");
  });

  it("la lista de rutas MIT y la de comunitarias no se solapan", () => {
    for (const m of RUTAS_MIT)
      for (const c of RUTAS_COMUNITARIAS) expect(m.startsWith(c)).toBe(false);
  });

  it("una ruta que no es del núcleo no entra por la puerta de atrás", () => {
    expect(assertNivel("core/licensing.ts").ok).toBe(true);
    const fuera = assertNivel("apps/desktop/src/ventana.tsx");
    expect(fuera.ok).toBe(false);
    expect(fuera.razon).toContain("comunitaria");
  });

  it("el repo trae las dos licencias (el open core es una promesa con papeles)", () => {
    const l = licenciasPresentes(raiz);
    expect(l.mit).toBe(true);
    expect(l.comunitaria).toBe(true);
  });

  it("el LICENSE del repo es el MIT (no se presume: se lee)", () => {
    expect(licenciaDelRepo(raiz)).toBe("MIT");
  });
});
