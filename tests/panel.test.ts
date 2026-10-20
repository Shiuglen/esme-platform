import { describe, expect, it } from "vitest";
import { panelDe, render } from "../tienda/panel.ts";

const bueno = {
  modulo: "esme.nucleo.hola-mundo",
  version: "0.1.0",
  casos: 50,
  recall_base: 0.77,
  recall_con: 0.785,
  tokens_base: 1000,
  tokens_con: 950,
  fecha: "2026-10-19",
  semilla: 7,
};
const malo = { ...bueno, recall_con: 0.772, tokens_con: 995 };

describe("panel — el juez de la tienda", () => {
  it("con buen bench entra y con la causa del recall", () => {
    const p = panelDe({
      modulos: [{ id: "esme.nucleo.hola-mundo", version: "0.1.0", bench: bueno }],
    });
    expect(p.filas[0].entra).toBe(true);
    expect(p.filas[0].causa).toContain("+0.015");
  });

  it("con bench flojo queda fuera con razones legibles", () => {
    const p = panelDe({
      modulos: [{ id: "x.modulo.debido", version: "1.0.0", bench: malo }],
    });
    expect(p.filas[0].entra).toBe(false);
    expect(p.filas[0].causa).toContain("no lo avala");
  });

  it("sin bench: las misiones no publican, punto", () => {
    const p = panelDe({ modulos: [{ id: "sin-medir", version: "1.0" }] });
    expect(p.filas[0].entra).toBe(false);
    expect(p.filas[0].causa).toContain("sin bench");
  });

  it("sin firma y sin clave: se declara sin verificar, otra puas también corta", () => {
    const p = panelDe({ modulos: [] }, {});
    expect(p.firmaVerifica).toBe("sin-firma");
  });

  it("el render es lo que el mantenedor publicaría", () => {
    const texto = render(
      panelDe({
        modulos: [
          { id: "esme.nucleo.hola-mundo", version: "0.1.0", bench: bueno },
        ],
      }, {})
    );
    expect(texto).toContain("✓ ENTRA");
    expect(texto).toContain("`esme.nucleo.hola-mundo` @0.1.0");
  });
});
