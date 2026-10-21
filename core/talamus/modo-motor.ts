/**
 * EL MODO SEGÚN EL MOTOR — el presupuesto de contexto lo pone el motor.
 *
 * El modo de contexto (estándar / ahorrador / equipo) no se elige al azar: lo
 * elige la ventana del motor que va a responder. Un modelo local de 32K no
 * puede gastar como uno de nube de 200K, y una GUI con 200K de contexto que
 * lo gasta todo en un turno deja sin margen para el siguiente.
 *
 * La regla (del espejo de PandaCode, donde el Saver es un modo y no un
 * adorno):
 *
 *   - el motor es LOCAL y su ventana es pequeña → **ahorrador**: se guarda lo
 *     que importa y se dice lo que se quedó fuera (core/talamus/plan.ts);
 *   - el motor es LOCAL pero su ventana es grande → **estándar**;
 *   - el motor es de API (nube) → **estándar**;
 *   - y cuando varios motores comparten una ventana (un equipo), **equipo**:
 *     el contexto es de todos.
 *
 * Referencia: core/talamus/modos.ts, estandar/motor-capability.spec.yaml.
 */
import type { CognitionMotor } from "../../motores/laya-adapter.ts";
import { MODOS, type ModoContexto } from "../talamus/modos.ts";

/** La ventana a partir de la cual un motor local ya va sobrado. */
export const VENTANA_ESTANDAR = 64_000;

/**
 * El modo de contexto que le toca a un motor.
 *
 * `compartido` es para cuando el contexto es de un equipo (varios motores
 * sobre la misma ventana).
 */
export function modoParaMotor(motor: CognitionMotor, opts: { compartido?: boolean } = {}): ModoContexto {
  if (opts.compartido) return "equipo";
  if (motor.capabilities.local_only && motor.capabilities.max_context < VENTANA_ESTANDAR) {
    return "ahorrador";
  }
  return "estandar";
}

/** El modo para cada motor del catálogo (para verlos de un vistazo). */
export function modosDeLosMotores(
  motores: CognitionMotor[],
  opts: { compartido?: boolean } = {}
): Array<{ motor: string; modo: ModoContexto; ventana: number; porque: string }> {
  return motores.map((m) => {
    const modo = modoParaMotor(m, opts);
    const porque =
      modo === "ahorrador"
        ? `local y ventana pequeña (${m.capabilities.max_context} < ${VENTANA_ESTANDAR}): se guarda lo que importa`
        : modo === "equipo"
          ? "el contexto es del equipo"
          : m.capabilities.local_only
            ? `local pero con sitio (${m.capabilities.max_context})`
            : "de API: hay sitio de sobra";
    return { motor: m.id, modo, ventana: m.capabilities.max_context, porque };
  });
}

/** El presupuesto que el modo implica (para decírselo a quien pregunta). */
export function presupuestoDe(modo: ModoContexto): number {
  return MODOS[modo].budget;
}
