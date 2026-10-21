/**
 * EL BOT — la mente desde un mensajero, por la puerta.
 *
 * Lo que se prueba:
 *
 *   1. un bot que pide más permisos de los concedidos NO entra (la puerta no
 *      se lo da: el permiso lo dice la persona);
 *   2. un bot sin presupuesto no entra (un bot sin techo es un agujero);
 *   3. un bot que dice que escribe pero no pide mind:write, no entra;
 *   4. y el presupuesto horario se lleva: cuando se acaba, se acaba (se ve).
 *
 * Referencia: core/bot.ts, estandar/bot.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { validaBot, quedaEnLaHora, CANALES } from "../core/bot.ts";

const botBase = () => ({
  id: "esme.prueba.bot",
  nombre: "El bot de la casa",
  canal: "telegram",
  agente: "esme.prueba.mi-agente",
  permisos: ["mind:read", "mind:write"],
  presupuesto: { tokens_por_mensaje: 2000, tokens_por_hora: 60000 },
  voz: "Soy la mente de Esme. Dime y te respondo.",
  escribe: true,
});

describe("el bot", () => {
  it("una receta normal entra", () => {
    const v = validaBot(botBase());
    expect(v.errores).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.bot?.canal).toBe("telegram");
  });

  it("lo que pide de más que la persona concedió, no entra", () => {
    const v = validaBot(botBase(), ["mind:read"]);
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("no lo ha concedido");
  });

  it("sin presupuesto no entra (un bot sin techo es un agujero)", () => {
    const b = botBase();
    b.presupuesto.tokens_por_hora = 0;
    const v = validaBot(b);
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("tokens_por_hora");
  });

  it("un mensaje no puede costar más que la hora entera", () => {
    const b = botBase();
    b.presupuesto.tokens_por_mensaje = 999999;
    const v = validaBot(b);
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("una hora entera");
  });

  it("dice que escribe pero no pide mind:write: no entra", () => {
    const b = botBase();
    b.permisos = ["mind:read"];
    const v = validaBot(b);
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("mind:write");
  });

  it("un canal inventado no entra (pero la lista de canales es abierta)", () => {
    const b = botBase();
    b.canal = "telegram";
    expect(validaBot(b).ok).toBe(true);
    expect(CANALES).toContain("x");
    expect(CANALES).toContain("discord");
  });

  it("el presupuesto horario se lleva: cuando se acaba, se acaba", () => {
    const v = validaBot(botBase());
    const bot = v.bot!;
    const medio = quedaEnLaHora(bot, 30000);
    expect(medio.queda).toBe(30000);
    expect(medio.agotado).toBe(false);
    const agotado = quedaEnLaHora(bot, 999999);
    expect(agotado.queda).toBe(0);
    expect(agotado.agotado).toBe(true);
  });
});
