/**
 * EL BOT — la mente, desde un mensajero, por la PUERTA.
 *
 * Absorbido de las capturas (los bots de Telegram, Slack, Discord y WhatsApp)
 * y del deseo del creador: que la mente conteste donde la persona está, y que
 * su X sea la lista de deseos de la tienda.
 *
 * Pero un mensajero es una PUERTA, no un dios:
 *
 *   - lo que el bot puede hacer es lo que la persona ha concedido (los
 *     mismos permisos del manifiesto, ni uno más);
 *   - lo que el bot gasta es un presupuesto, como cualquier otro turno;
 *   - y lo que el bot hace queda en la mente, como un turno más (no se
 *     escribe «fuera» y no se pierde: se escribe en la conversación).
 *
 * Eso es lo que separa a un bot de la casa de unScripts suelto en un canal.
 *
 * Referencia: estandar/bot.spec.yaml, core/turnos/turno.ts.
 */
import { CAPABILITIES, type Capability } from "./extension-host/capability.ts";

/** Los canales que la casa conoce (la lista es abierta: se puede añadir uno). */
export const CANALES = ["telegram", "slack", "discord", "whatsapp", "x", "email"] as const;
export type Canal = (typeof CANALES)[number];

/** La receta de un bot. */
export interface RecetaBot {
  id: string;
  nombre: string;
  canal: Canal;
  /** Quién contesta (el agente: su id de receta). */
  agente: string;
  /** Lo que el bot puede hacer: los permisos que la persona concedió. */
  permisos: Capability[];
  /** El presupuesto por mensaje (y por hora, que es lo que de verdad duele). */
  presupuesto: { tokens_por_mensaje: number; tokens_por_hora: number };
  /** Lo que el bot responde (su voz: cómo se presenta). */
  voz: string;
  /** Si el bot puede escribir en la mente (o sólo leer). */
  escribe: boolean;
}

/** El veredicto del juez de bots. */
export interface VeredictoBot {
  ok: boolean;
  /** La receta (completa). */
  bot: RecetaBot | null;
  /** Los errores. */
  errores: string[];
  /** El presupuesto horario que queda, si se sabe. */
  tokens_por_hora: number;
}

/**
 * Juzga la receta de un bot.
 *
 * Lo que no se juzga aquí (y por qué): si el canal tiene sentido para el
 * bot, ni cómo suena su voz. Eso lo decide la persona (y la voz es suyas).
 */
export function validaBot(x: unknown, permisosConcedidos?: Capability[]): VeredictoBot {
  const errores: string[] = [];
  if (typeof x !== "object" || x === null || Array.isArray(x)) {
    return { ok: false, bot: null, errores: ["un bot es un objeto"], tokens_por_hora: 0 };
  }
  const r = x as Record<string, unknown>;

  const id = typeof r.id === "string" ? r.id : "";
  if (!/^esme\.[a-z0-9-]+\.[a-z0-9-]+$/.test(id)) {
    errores.push(`id: «${id}» no es esme.<autor>.<slug>`);
  }
  const nombre = typeof r.nombre === "string" ? r.nombre.trim() ? r.nombre.trim().slice(0, 60) : "" : "";
  if (!nombre) errores.push("nombre: falta");

  const canal = String(r.canal ?? "");
  if (!CANALES.includes(canal as Canal)) {
    errores.push(`canal: «${canal}» no es un canal (valen: ${CANALES.join(", ")})`);
  }
  if (typeof r.agente !== "string" || !r.agente.trim()) {
    errores.push("agente: falta (qué agente contesta)");
  }

  // los permisos: los del manifiesto, ni uno más
  let permisos: Capability[] = [];
  if (!Array.isArray(r.permisos)) {
    errores.push("permisos: tiene que ser una lista");
  } else {
    for (const p of r.permisos) {
      if (!(CAPABILITIES as readonly string[]).includes(String(p))) {
        errores.push(`permisos: «${String(p)}» no es una capacidad de la casa`);
        continue;
      }
      permisos.push(p as Capability);
    }
    // la puerta: lo concedido manda
    if (permisosConcedidos) {
      const deMas = permisos.filter((p) => !permisosConcedidos.includes(p));
      if (deMas.length) {
        errores.push(
          `permisos: pide ${deMas.join(", ")} y la persona no lo ha concedido (la puerta no se lo da)`
        );
      }
    }
  }

  // el presupuesto: un bot sin techo es un agujero
  const p = (r.presupuesto ?? {}) as Record<string, unknown>;
  const porMensaje = Number(p.tokens_por_mensaje);
  const porHora = Number(p.tokens_por_hora);
  if (!Number.isFinite(porMensaje) || porMensaje <= 0) {
    errores.push("presupuesto.tokens_por_mensaje: tiene que ser un número (> 0)");
  }
  if (!Number.isFinite(porHora) || porHora <= 0) {
    errores.push("presupuesto.tokens_por_hora: tiene que ser un número (> 0)");
  }
  if (Number.isFinite(porMensaje) && Number.isFinite(porHora) && porMensaje > porHora) {
    errores.push("presupuesto: un mensaje no puede costar más que una hora entera");
  }

  const voz = typeof r.voz === "string" ? r.voz.trim().slice(0, 500) : "";
  if (!voz) errores.push("voz: falta (cómo se presenta)");

  const escribe = r.escribe === true;
  if (escribe && !permisos.includes("mind:write")) {
    errores.push("escribe: dice que escribe pero no pide mind:write (no puede escribir lo que no tiene)");
  }
  if (!escribe && permisos.includes("mind:write")) {
    // no es un error: puede pedir el permiso y no usarlo (el juez lo avisa)
  }

  const bot: RecetaBot = {
    id,
    nombre,
    canal: (canal as Canal) ?? "x",
    agente: String(r.agente ?? ""),
    permisos,
    presupuesto: {
      tokens_por_mensaje: Number.isFinite(porMensaje) ? Math.floor(porMensaje) : 0,
      tokens_por_hora: Number.isFinite(porHora) ? Math.floor(porHora) : 0,
    },
    voz,
    escribe,
  };

  return {
    ok: errores.length === 0,
    bot,
    errores,
    tokens_por_hora: bot.presupuesto.tokens_por_hora,
  };
}

/**
 * Cuánto queda de la hora de un bot.
 *
 * El presupuesto horario es lo que de verdad duele: un bot que contesta a
 * todo lo que le escriben puede gastarse la noche. Por eso se lleva, y se
 * ve.
 */
export function quedaEnLaHora(
  bot: RecetaBot,
  gastado: number
): { gastado: number; queda: number; agotado: boolean } {
  const gastadoReal = Math.max(0, gastado);
  const queda = Math.max(0, bot.presupuesto.tokens_por_hora - gastadoReal);
  return {
    gastado: gastadoReal,
    queda,
    agotado: queda === 0,
  };
}
