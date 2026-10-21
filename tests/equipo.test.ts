/**
 * EL EQUIPO — varios agentes, un presupuesto.
 *
 * Lo que se prueba:
 *
 *   1. un equipo sin arquitecto no entra (nadie decide);
 *   2. con dos arquitectos tampoco (sólo uno decide);
 *   3. las partes no pueden sumar más que el cap del equipo;
 *   4. los roles son cerrados (un rol inventado no se mide);
 *   5. y el reparto por defecto deja al arquitecto con la mitad y reparte el
 *      resto entre los trabajadores (un reparto escrito evita la pregunta de
 *      siempre: «¿y ahora quién usa el contexto?»).
 *
 * Referencia: core/equipo.ts, estandar/equipo.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { validaEquipo, repartoPorDefecto, ROLES } from "../core/equipo.ts";

const equipoBase = () => ({
  id: "esme.prueba.equipo",
  nombre: "Equipo de prueba",
  modo: "estandar",
  cap: { tokens: 40000, segundos: 900 },
  miembros: [
    {
      rol: "arquitecto",
      motor: "opencode",
      encargo: "decide y reparte",
      presupuesto: { tokens: 20000, segundos: 450 },
    },
    {
      rol: "trabajador",
      motor: "opencode",
      encargo: "construye",
      presupuesto: { tokens: 10000, segundos: 225 },
    },
    {
      rol: "trabajador",
      motor: "claude-code",
      encargo: "prueba",
      presupuesto: { tokens: 10000, segundos: 225 },
    },
  ],
});

describe("el equipo", () => {
  it("un equipo con un arquitecto y su presupuesto entra", () => {
    const v = validaEquipo(equipoBase());
    expect(v.errores).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.total_tokens).toBe(40000);
    expect(v.reparto).toHaveLength(3);
  });

  it("sin arquitecto no entra (nadie decide)", () => {
    const e = equipoBase();
    e.miembros = e.miembros.filter((m) => m.rol !== "arquitecto");
    const v = validaEquipo(e);
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("arquitecto");
  });

  it("con dos arquitectos tampoco (sólo uno decide)", () => {
    const e = equipoBase();
    e.miembros[1].rol = "arquitecto";
    const v = validaEquipo(e);
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("sólo uno decide");
  });

  it("las partes no pueden sumar más que el cap", () => {
    const e = equipoBase();
    e.miembros[0].presupuesto.tokens = 39000;
    const v = validaEquipo(e);
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("cap");
  });

  it("los roles son cerrados (un rol inventado no se mide)", () => {
    const e = equipoBase();
    (e.miembros[1] as unknown as { rol: string }).rol = "mago";
    const v = validaEquipo(e);
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("no es un rol");
    expect(ROLES).toEqual(["arquitecto", "trabajador", "critico"]);
  });

  it("cada miembro dice qué hace (un encargo vacío no es un miembro)", () => {
    const e = equipoBase();
    e.miembros[1].encargo = "";
    const v = validaEquipo(e);
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("encargo");
  });

  it("el reparto por defecto: el arquitecto con la mitad, el resto a partes iguales", () => {
    const miembros = [
      { rol: "arquitecto" as const, motor: "opencode", encargo: "decide", presupuesto: { tokens: 0, segundos: 0 } },
      { rol: "trabajador" as const, motor: "opencode", encargo: "hace", presupuesto: { tokens: 0, segundos: 0 } },
      { rol: "trabajador" as const, motor: "opencode", encargo: "hace", presupuesto: { tokens: 0, segundos: 0 } },
    ];
    const repartido = repartoPorDefecto(miembros, { tokens: 40000, segundos: 900 });
    expect(repartido[0].presupuesto.tokens).toBe(20000);
    expect(repartido[1].presupuesto.tokens).toBe(10000);
    expect(repartido[2].presupuesto.tokens).toBe(10000);
    expect(repartido.reduce((n, m) => n + m.presupuesto.tokens, 0)).toBe(40000);
  });

  it("un equipo sin miembros no entra", () => {
    const e = equipoBase();
    e.miembros = [];
    const v = validaEquipo(e);
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("no tiene a nadie");
  });
});
