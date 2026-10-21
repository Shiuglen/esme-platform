/**
 * LA COMPATIBILIDAD — un módulo, motor por motor.
 *
 * La pregunta que responde: «¿qué motores pueden alojar este módulo?».
 *
 * La pregunta NO es «qué módulos sabe usar este motor» (el módulo vive en la
 * casa de la persona, en el extension host; el motor es otro cerebro). Por eso
 * las reglas son de ALOJAMIENTO:
 *
 *   1. **runtime**: el motor tiene que poder alojar el runtime del módulo.
 *      Un módulo `nodejs` no lo aloja un motor que sólo habla `wasm`.
 *   2. **herramientas**: un módulo que emite eventos o pinta vistas necesita un
 *      motor que vea herramientas.
 *   3. **red**: un módulo que pide `net:fetch` necesita un motor con red.
 *   4. **procesos**: un módulo que pide `proc:spawn` también necesita que el
 *      motor vea herramientas: sus efectos quedan fuera de la cápsula, y si
 *      nadie los ve, el módulo trabaja a ciegas.
 *   5. **declaración**: si el módulo declara con qué motores trabaja
 *      (`engines:`), esa declaración manda sobre las cuatro reglas anteriores.
 *
 * Cada regla dice POR QUÉ, no sólo que no. Un "no" sin motivo es una puerta
 * cerrada sin llave; quien llega de fuera tiene que poder arreglarlo.
 *
 * Referencia: docs/MOTORES.md, estandar/motor-capability.spec.yaml,
 * core/ipc/module-schema.ts.
 */
import type { CognitionMotor } from "./laya-adapter.ts";

/** Lo que el módulo necesita del motor (lo que su manifiesto declara). */
export interface RequisitoModulo {
  /** El runtime del módulo (`nodejs`, `wasm`, `python`). */
  runtime: string;
  /** Los permisos que pide. */
  permisos: string[];
  /** Los motores con los que dice trabajar (si lo dice). */
  engines?: string[];
}

/** El veredicto para un motor. */
export interface Compatibilidad {
  /** El motor. */
  motor: string;
  /** ¿Puede alojarlo? */
  ok: boolean;
  /** Por qué sí o por qué no. */
  motivo: string;
  /** ¿Está el motor instalado en esta máquina? (no significa que funcione) */
  instalado: boolean;
}

/** Los permisos que necesitan un motor con herramientas. */
export const PERMISOS_CON_HERRAMIENTAS = ["ipc:emit", "ui:render"];

/** El permiso que necesita un motor con red. */
export const PERMISO_CON_RED = "net:fetch";

/**
 * El permiso que necesita un motor que vea lo que el módulo hizo en la casa.
 *
 * Por qué éste con herramientas. Un módulo con `proc:spawn` lanza programas en
 * la máquina de la persona: sus efectos quedan FUERA de la cápsula. Si el motor
 * que lo aloja no ve herramientas, lo que el módulo hizo no lo ve nadie: el
 * módulo trabaja a ciegas y su resultado no llega a la mente. Es el mismo
 * motivo por el que `ipc:emit` necesita herramientas, aplicado al efecto más
 * peligroso de los tres.
 */
export const PERMISO_CON_PROCESOS = "proc:spawn";

/**
 * ¿Puede este motor alojar este módulo?
 *
 * El orden de las reglas es el orden de la importancia: si el runtime no está,
 * no hay nada que hablar (y decirlo primero evita un motivo engañoso).
 */
export function compatDe(
  requisito: RequisitoModulo,
  motor: CognitionMotor,
  instalado = false
): Compatibilidad {
  const c = motor.capabilities;

  // 5. la declaración del módulo manda: si dice con qué motores trabaja,
  //    fuera los demás.
  if (requisito.engines && requisito.engines.length > 0) {
    if (!requisito.engines.includes(motor.id)) {
      return {
        motor: motor.id,
        ok: false,
        motivo: `el módulo declara que no trabaja con ${motor.id} (trabaja con: ${requisito.engines.join(", ")})`,
        instalado,
      };
    }
  }

  // 1. el runtime
  const runtimes = c.runtimes ?? [];
  if (!runtimes.includes(requisito.runtime)) {
    return {
      motor: motor.id,
      ok: false,
      motivo: runtimes.length
        ? `${motor.id} no aloja runtime ${requisito.runtime} (aloja: ${runtimes.join(", ")})`
        : `${motor.id} no aloja ningún módulo (runtime ${requisito.runtime})`,
      instalado,
    };
  }

  // 2. las herramientas
  const pideHerramientas = requisito.permisos.some((p) => PERMISOS_CON_HERRAMIENTAS.includes(p));
  if (pideHerramientas && !c.tools) {
    return {
      motor: motor.id,
      ok: false,
      motivo: `${motor.id} no ve herramientas y el módulo pide ${requisito.permisos
        .filter((p) => PERMISOS_CON_HERRAMIENTAS.includes(p))
        .join(", ")}`,
      instalado,
    };
  }

  // 3. la red
  if (requisito.permisos.includes(PERMISO_CON_RED) && !c.net) {
    return {
      motor: motor.id,
      ok: false,
      motivo: `${motor.id} no llega a la red y el módulo pide ${PERMISO_CON_RED}`,
      instalado,
    };
  }

  // 4. los procesos: un módulo que lanza programas hace efectos en la casa;
  //    si el motor no ve herramientas, lo que el módulo hizo no lo ve nadie.
  if (requisito.permisos.includes(PERMISO_CON_PROCESOS) && !c.tools) {
    return {
      motor: motor.id,
      ok: false,
      motivo:
        `${motor.id} no ve herramientas y el módulo pide ${PERMISO_CON_PROCESOS}: ` +
        `lo que el módulo lance en la máquina no lo vería nadie`,
      instalado,
    };
  }

  return {
    motor: motor.id,
    ok: true,
    motivo: `puede alojarlo (runtime ${requisito.runtime})`,
    instalado,
  };
}

/** La compatibilidad con TODOS los motores, en el orden que se le dio. */
export function compatMotores(
  requisito: RequisitoModulo,
  motores: CognitionMotor[],
  instaladoDe: (id: string) => boolean = () => false
): Compatibilidad[] {
  return motores.map((m) => compatDe(requisito, m, instaladoDe(m.id)));
}

/** Los motores que SÍ pueden alojarlo (los que se pueda elegir). */
export function motoresQueAlojan(
  requisito: RequisitoModulo,
  motores: CognitionMotor[],
  instaladoDe: (id: string) => boolean = () => false
): string[] {
  return compatMotores(requisito, motores, instaladoDe)
    .filter((c) => c.ok)
    .map((c) => c.motor);
}

/**
 * Los motores que el módulo declara y NO EXISTEN en la spec.
 *
 * Es un error del módulo, no del motor: un módulo que dice «soy de ollama» y
 * la spec no tiene ollama se ha equivocado de casa.
 */
export function motoresDeclaradosQueNoExisten(
  requisito: RequisitoModulo,
  motores: CognitionMotor[]
): string[] {
  const ids = new Set(motores.map((m) => m.id));
  return (requisito.engines ?? []).filter((e) => !ids.has(e));
}
