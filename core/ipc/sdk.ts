/**
 * La superficie que ve un módulo dentro de su worker: la puerta hacia la mente.
 *
 * El módulo NO habla con la mente: habla con el HOST, y el host decide
 * (permiso declarado, forma verificada con zod, y la mente nunca sale del
 * proceso principal). Por eso esto no es una referencia a la mente: es una
 * llamada que cruza la puerta y vuelve con la respuesta (o con el fallo).
 *
 * Para los módulos del kit:
 *
 *   import { mente } from "esme-platform/sdk";
 *   const r = await mente().rumbo();   // para qué trabaja esta mente
 *
 * Referencia: docs/ARQUITECTURA.md §2 (IPC tipado), core/extension-host/host.ts.
 */
import type { Rumbo } from "../mind/rumbo.ts";

/** El recuerdo que vuelve por la puerta (forma ligera para el cable). */
export interface RecuerdoDelModulo {
  id: string;
  texto: string;
  tokens?: number;
}

export interface MenteDelModulo {
  recall(args: { query: string; budget?: number }): Promise<RecuerdoDelModulo[]>;
  remember(args: { text: string; kind?: "note" | "decision" | "preference" }): Promise<{ id: string }>;
  intake(args: { source: string; content: string; tags: string[] }): Promise<{ id: string }>;
  /** Para qué trabaja la mente: los pilares y los objetivos. */
  rumbo(): Promise<Rumbo>;
}

declare global {
  // La puerta la pone el host al arrancar el worker del módulo.
  // eslint-disable-next-line no-var
  var mente: MenteDelModulo | undefined;
}

/**
 * La mente del módulo, si el host le dio puerta. Si no la hay, dice por qué:
 * un módulo que no tiene a quién preguntar no finge que preguntó.
 */
export function mente(): MenteDelModulo {
  const m = globalThis.mente;
  if (!m) throw new Error("este módulo no tiene puerta a la mente (el host no le dio ninguna)");
  return m;
}
