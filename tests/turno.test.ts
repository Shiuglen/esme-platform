/**
 * EL TURNO — la conversación como dato, y la limpieza medida.
 *
 * Lo que se prueba:
 *
 *   1. el turno cuadra: el total es la suma de las partes (si no, se dice);
 *   2. «los pasos se pliegan, el chat queda limpio» es un NÚMERO: la
 *      limpieza es la parte de la respuesta sobre lo que se lee;
 *   3. y hay listón: un turno cuyo peso está en los pasos se ensució, y se
 *      dice;
 *   4. lo que cambió va con el turno (y si no cambió nada, eso también es
 *      información: la lista va vacía, no inventada);
 *   5. el presupuesto se respeta o se dice que no.
 *
 * Referencia: core/turnos/turno.ts, estandar/turno.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import {
  armaTurno,
  limpiezaDelTurno,
  limpiezaDeLaSesion,
  pesoDeLaActividad,
  turnoLimpio,
  erroresTurno,
  resumenTurno,
  tokensDe,
  LIMPIEZA_MINIMA,
  type Turno,
} from "../core/turnos/turno.ts";

/** Un turno normal: respuesta corta, tres pasos. */
const turnoNormal = (): Turno =>
  armaTurno({
    id: "t1",
    motor: "opencode",
    modo: "estandar",
    pregunta: "¿qué se decidió sobre el Taller?",
    respuesta: "Se decidió que el Taller usa worktrees y un checkpoint por turno.",
    actividad: [
      { paso: "leer el CLAUDE.md", estado: "ok" },
      { paso: "mirar el commit", estado: "ok", detalle: "f1b69f3" },
      { paso: "escribir la nota", estado: "ok" },
    ],
    cambios: [{ ruta: "docs/NOTAS.md", anadidos: 4, borrados: 0 }],
    tokens_contexto: 3200,
    coste_usd: 0.12,
    presupuesto: { tokens: 200000, segundos: 900 },
  });

describe("el turno", () => {
  it("el total es la suma de las partes (si no, se dice)", () => {
    const t = turnoNormal();
    expect(t.tokens.total).toBe(
      t.tokens.contexto + t.tokens.respuesta + t.tokens.actividad
    );
    expect(erroresTurno(t)).toEqual([]);
  });

  it("un turno mal escrito se dice (no se corrige en silencio)", () => {
    const t = turnoNormal();
    const roto: Turno = { ...t, tokens: { ...t.tokens, total: 1 } };
    expect(erroresTurno(roto).join(" ")).toContain("no es la suma");
  });

  it("la limpieza es la parte de la respuesta sobre lo que se lee", () => {
    const t = turnoNormal();
    const l = limpiezaDelTurno(t);
    expect(l).toBeGreaterThan(0);
    expect(l).toBeLessThanOrEqual(1);
    // la respuesta pesa más que los pasos: el chat está limpio
    expect(turnoLimpio(t)).toBe(true);
  });

  it("un turno que enseña el proceso y olvida la respuesta se ensució", () => {
    // la respuesta dice «hecho» y hubo doce pasos: el chat está de proceso
    const pesado = armaTurno({
      id: "t2",
      motor: "opencode",
      modo: "estandar",
      pregunta: "hazlo",
      respuesta: "hecho.",
      actividad: Array.from({ length: 12 }, (_, i) => ({
        paso: `paso ${i}`,
        estado: "ok" as const,
        detalle: "x".repeat(400),
      })),
    });
    expect(limpiezaDelTurno(pesado)).toBeLessThan(LIMPIEZA_MINIMA);
    expect(turnoLimpio(pesado)).toBe(false);
  });

  it("plegar es lo que mantiene el chat limpio (los detalles no se leen)", () => {
    const conDetalles = armaTurno({
      id: "t5",
      motor: "opencode",
      modo: "estandar",
      pregunta: "explícame",
      respuesta: "La respuesta que la persona lee, con su largo.",
      actividad: [{ paso: "leer", estado: "ok", detalle: "y".repeat(4000) }],
    });
    // el detalle no se lee (va plegado): el chat sigue limpio
    expect(turnoLimpio(conDetalles)).toBe(true);
    // pero el trabajo de verdad se puede ver aparte
    expect(pesoDeLaActividad(conDetalles)).toBeGreaterThan(1);
  });

  it("la limpieza de la sesión es la de la conversación, no la de un turno", () => {
    const respuestaLarga = armaTurno({
      id: "s1",
      motor: "opencode",
      modo: "estandar",
      pregunta: "q",
      respuesta: "Una respuesta de verdad, con su contenido y su longitud.",
      actividad: [{ paso: "leer", estado: "ok" }],
    });
    expect(limpiezaDeLaSesion([respuestaLarga, respuestaLarga])).toBeGreaterThan(
      LIMPIEZA_MINIMA
    );
  });

  it("lo que cambió va con el turno (y si no cambió nada, la lista va vacía)", () => {
    const t = turnoNormal();
    expect(t.cambios).toHaveLength(1);
    const sinCambios = armaTurno({
      id: "t3",
      motor: "opencode",
      modo: "ahorrador",
      pregunta: "explícame",
      respuesta: "Claro.",
    });
    expect(sinCambios.cambios).toEqual([]);
  });

  it("el presupuesto se respeta o se dice que no", () => {
    const t = turnoNormal();
    const justo: Turno = { ...t, presupuesto: { tokens: 10, segundos: 900 } };
    expect(erroresTurno(justo).join(" ")).toContain("presupuesto");
  });

  it("el coste va escrito si lo hubo (y no se inventa si no)", () => {
    expect(turnoNormal().coste_usd).toBe(0.12);
    const sinCoste = armaTurno({
      id: "t4",
      motor: "local",
      modo: "ahorrador",
      pregunta: "hola",
      respuesta: "hola",
    });
    expect(sinCoste.coste_usd).toBeUndefined();
  });

  it("el resumen lo dice todo en una línea", () => {
    const r = resumenTurno(turnoNormal());
    expect(r).toContain("opencode");
    expect(r).toContain("limpieza");
    expect(r).toContain("1 ficheros");
  });

  it("los tokens se cuentan como la casa (4 caracteres)", () => {
    expect(tokensDe("12345678")).toBe(2);
    expect(tokensDe("")).toBe(0);
  });
});
