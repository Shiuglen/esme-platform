import { describe, expect, it } from "vitest";
import {
  selectMemoriesForPack,
  veredicto,
  UMBRAL_SALIENCIA,
  type Recuerdo,
} from "../core/talamus/context-packager.ts";

const r = (id: string, score: number, tokens: number): Recuerdo => ({
  id,
  texto: id,
  tokens,
  score,
});

describe("Tálamo (el discover del 12-oct: solo semántica pura fallaba tablas)", () => {
  it("el ruido (score bajo) jamás entra al paquete", () => {
    const p = selectMemoriesForPack("¿qué hace el ser con los modos?", [
      r("relevante", 0.7, 100),
      r("ruido", UMBRAL_SALIENCIA - 0.01, 10),
    ], 1000);
    expect(p.seleccionados.map((s) => s.id)).toEqual(["relevante"]);
  });

  it("budget de tokens se respeta sin cortar recuerdos a la mitad", () => {
    const p = selectMemoriesForPack("q", [
      r("a", 0.9, 400),
      r("b", 0.8, 400),
      r("c", 0.7, 400),
    ], 1000);
    expect(p.tokens_gastados).toBeLessThanOrEqual(1000);
    // cabe a y b, d c no cabe completa y no se corta
    expect(p.seleccionados.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("marginal solo entra con presupuesto holgado", () => {
    const p = selectMemoriesForPack("q", [
      r("fuerte", 0.9, 800),
      r("marginal", 0.3, 200),
    ], 1000);
    // marginal rechazado (ya gastada 80%): el Arη δεν prueba
    expect(p.seleccionados.map((s) => s.id)).toEqual(["fuerte"]);
  });

  it("marginal con presupuesto holgado entra", () => {
    const p = selectMemoriesForPack("q", [
      r("fuerte", 0.9, 500),
      r("marginal", 0.3, 200),
    ], 1000);
    expect(p.seleccionados.map((s) => s.id)).toContain("marginal");
  });

  it("veredicto constante por umbral: ruido < 0.25 ≤ marginal < 0.45 ≤ relevante", () => {
    expect(veredicto(r("x", 0.99, 1))).toBe("relevante");
    expect(veredicto(r("x", 0.44, 1))).toBe("marginal");
    expect(veredicto(r("x", 0.1, 1))).toBe("ruido");
  });
});
