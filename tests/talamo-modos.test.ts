/**
 * LOS MODOS DEL CONTEXTO — tres presupuestos, un solo empaque.
 *
 * Lo que se prueba:
 *
 *   1. el modo estándar es EXACTAMENTE el empaque de la casa (mismos
 *      parámetros) — si no, la comparación de los modos no sería una
 *      comparación;
 *   2. el ahorrador no deja pasar ni un marginal (sólo lo relevante);
 *   3. el ahorrador nunca cuesta MÁS que el estándar (un ahorro medido al
 *      revés no es un ahorro);
 *   4. el equipo puede traer más que el estándar;
 *   5. y el ahorro se calcula, no se escribe: sale de los dos paquetes.
 *
 * Referencia: core/talamus/modos.ts, core/talamus/context-packager.ts.
 */
import { describe, expect, it } from "vitest";
import { comparaModos, empaquetaEn, MODOS, type ModoContexto } from "../core/talamus/modos.ts";
import { selectMemoriesForPack, type Recuerdo } from "../core/talamus/context-packager.ts";

/** Los recuerdos de una pregunta, con puntajes de verdad. */
const recuerdos = (): Recuerdo[] => [
  { id: "r1", texto: "la red neuronal está hecha con ONNX", tokens: 80, score: 0.9 },
  { id: "r2", texto: "la regla de oro: si el número no mejora", tokens: 60, score: 0.4 },
  { id: "r3", texto: "una nota que no tiene que ver", tokens: 40, score: 0.3 },
  { id: "r4", texto: "el Tálamo reemplaza los ficheros md", tokens: 70, score: 0.8 },
  { id: "r5", texto: "ruido puro", tokens: 30, score: 0.05 },
];

const q = "estado de la red neuronal";

describe("los modos del contexto", () => {
  it("el modo estándar es el empaque de la casa, con sus mismos parámetros", () => {
    const c = recuerdos();
    const porModo = empaquetaEn(q, c, "estandar");
    const porCasa = selectMemoriesForPack(q, c, MODOS.estandar.budget);
    expect(porModo.tokens_gastados).toBe(porCasa.tokens_gastados);
    expect(porModo.seleccionados.map((s) => s.id)).toEqual(
      porCasa.seleccionados.map((s) => s.id)
    );
  });

  it("el ahorrador no deja pasar ni un marginal", () => {
    const c = recuerdos();
    const p = empaquetaEn(q, c, "ahorrador");
    for (const s of p.seleccionados) expect(s.score).toBeGreaterThanOrEqual(0.45);
    expect(p.seleccionados.some((s) => s.id === "r2")).toBe(false); // el marginal
  });

  it("el ahorrador nunca cuesta más que el estándar", () => {
    const r = comparaModos(q, recuerdos());
    expect(r.ahorrador.tokens_gastados).toBeLessThanOrEqual(r.estandar.tokens_gastados);
    expect(r.ahorro_pct).toBeGreaterThanOrEqual(0);
  });

  it("el equipo puede traer más que el estándar", () => {
    const r = comparaModos(q, recuerdos());
    expect(r.equipo.tokens_gastados).toBeGreaterThanOrEqual(r.estandar.tokens_gastados);
  });

  it("el ahorro se calcula (sale de los dos paquetes, no de un número escrito)", () => {
    const c = recuerdos();
    const r = comparaModos(q, c);
    const esperado =
      ((r.estandar.tokens_gastados - r.ahorrador.tokens_gastados) /
        Math.max(r.estandar.tokens_gastados, 1)) *
      100;
    expect(r.ahorro_pct).toBeCloseTo(Math.round(esperado * 10) / 10, 1);
    expect(r.tokens_ahorrados).toBe(
      Math.max(0, r.estandar.tokens_gastados - r.ahorrador.tokens_gastados)
    );
  });

  it("el ruido no entra en ningún modo (ni en el equipo)", () => {
    for (const modo of Object.keys(MODOS) as ModoContexto[]) {
      const p = empaquetaEn(q, recuerdos(), modo);
      expect(p.seleccionados.some((s) => s.id === "r5"), `${modo} dejó entrar ruido`).toBe(false);
    }
  });

  it("un recuerdo no se corta por la mitad (si no cabe, se busca el siguiente)", () => {
    const c: Recuerdo[] = [
      { id: "a", texto: "uno", tokens: 90, score: 0.9 },
      { id: "b", texto: "dos", tokens: 90, score: 0.8 },
    ];
    const p = empaquetaEn(q, c, "ahorrador"); // presupuesto 150: sólo cabe uno
    expect(p.seleccionados.length).toBe(1);
    expect(p.tokens_gastados).toBe(90);
  });
});
