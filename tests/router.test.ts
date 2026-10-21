/**
 * EL ROUTER QUE APRENDE — las decisiones de la persona mandan.
 *
 * Lo que se prueba:
 *
 *   1. lo aprendido va por delante de lo supuesto (si hay veredicto, va el
 *      motor de la persona);
 *   2. sin veredicto, el router sigue decidiendo (la tabla es su memoria, no
 *      su sustituto);
 *   3. la concordancia se mide (de las decisiones con veredicto, cuántas
 *      ratificaste);
 *   4. y el registro se lee aunque tenga una línea rota (un registro entero no
 *      se tira por una línea).
 *
 * Referencia: core/router/aprende.ts, docs/LAYA.md.
 */
import { describe, expect, it } from "vitest";
import {
  aprendeDe,
  eligeConAprendido,
  firmaDe,
  leeRegistro,
  type DecisionRuta,
} from "../core/router/aprende.ts";
import { compromisoDe } from "../core/arena/ciego.ts";

const d = (parcial: Partial<DecisionRuta>): DecisionRuta => ({
  ts: 1,
  tarea: "arregla el fallo de la puerta",
  ruta: "opencode",
  confianza: 0.7,
  ...parcial,
});

describe("el router que aprende", () => {
  it("la firma de una tarea no depende de las mayúsculas ni de los acentos", () => {
    expect(firmaDe("Arregla el fallo de la PUERTA")).toBe(firmaDe("arregla el fallo de la puerta"));
    expect(firmaDe("")).toBe("");
  });

  it("lo aprendido va por delante de lo supuesto", () => {
    const registro = [
      d({ tarea: "arregla el fallo de la puerta", veredicto: "corregido", ruta_correcta: "claude-code" }),
    ];
    const a = aprendeDe(registro);
    const eleccion = eligeConAprendido("arregla el fallo de la puerta", a, () => "opencode");
    expect(eleccion.ruta).toBe("claude-code");
    expect(eleccion.de).toBe("persona");
  });

  it("sin veredicto, el router sigue decidiendo (la tabla no lo sustituye)", () => {
    const a = aprendeDe([d({ tarea: "otra cosa", veredicto: "aprobado" })]);
    const eleccion = eligeConAprendido("tarea sin veredicto", a, () => "shell");
    expect(eleccion.ruta).toBe("shell");
    expect(eleccion.de).toBe("router");
  });

  it("un «aprobado» ratifica lo que el router ya dijo", () => {
    const a = aprendeDe([d({ veredicto: "aprobado" })]);
    const eleccion = eligeConAprendido("arregla el fallo de la puerta", a, () => "shell");
    expect(eleccion.ruta).toBe("opencode");
    expect(eleccion.de).toBe("persona");
  });

  it("la concordancia se mide (lo que ratificaste de lo que eligió)", () => {
    const a = aprendeDe([
      d({ tarea: "t1", veredicto: "aprobado" }),
      d({ tarea: "t2", veredicto: "aprobado" }),
      d({ tarea: "t3", veredicto: "corregido", ruta_correcta: "codex" }),
      d({ tarea: "t4" }), // sin veredicto: no cuenta
    ]);
    expect(a.decisiones).toBe(4);
    expect(a.veredictos).toBe(3);
    expect(a.correcciones).toBe(1);
    expect(a.concordancia).toBeCloseTo(2 / 3, 3);
  });

  it("un registro con una línea rota no se tira entero", () => {
    const texto = [
      JSON.stringify(d({ tarea: "uno", veredicto: "aprobado" })),
      "{ esto no es json",
      JSON.stringify(d({ tarea: "dos", veredicto: "aprobado" })),
    ].join("\n");
    const registro = leeRegistro(texto);
    expect(registro.length).toBe(2);
  });

  it("sin veredictos, la concordancia es 1 (no hay nada que discordar)", () => {
    const a = aprendeDe([d({})]);
    expect(a.concordancia).toBe(1);
    expect(Object.keys(a.tabla)).toHaveLength(0);
  });

  it("con catas, el router aprende también el paladar (y sólo si hay catas de sobra)", () => {
    const cata = (id: string) => {
      const sal = "sal-de-prueba";
      const mapa = { A: "qwen", B: "claude-code" };
      return {
        id,
        version: 1,
        emitido: "2026-10-21T00:00:00.000Z",
        tarea: "arregla las pruebas",
        categoria: "pruebas" as const,
        participantes: [
          { etiqueta: "A", medidas: { ms: 10, tokens: 20, cambios: 1, ok: true } },
          { etiqueta: "B", medidas: { ms: 20, tokens: 30, cambios: 0, ok: true } },
        ],
        compromiso: { algoritmo: "sha256", hash: compromisoDe(mapa, sal) },
        veredicto: { elegida: "A" },
        revelacion: { sal, fichas: { A: { motor: "qwen" }, B: { motor: "claude-code" } } },
      };
    };

    // con dos catas no hay paladar: una impresión no es un paladar
    const dos = aprendeDe([], { arenas: [cata("a1"), cata("a2")] });
    expect(dos.paladar).toBeUndefined();

    // con tres, el paladar propone, y el router lo usa para esa categoría
    const tres = aprendeDe([], { arenas: [cata("a1"), cata("a2"), cata("a3")] });
    expect(tres.paladar?.pruebas?.motor).toBe("qwen");
    expect(tres.paladar?.pruebas?.catas).toBe(3);
    const eleccion = eligeConAprendido("arregla las pruebas", tres, () => "laya", "pruebas");
    expect(eleccion).toEqual({ ruta: "qwen", de: "paladar" });
  });
});
