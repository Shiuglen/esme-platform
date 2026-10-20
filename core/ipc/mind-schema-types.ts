/**
 * Los TIPOS del contrato de mente, sin validadores.
 *
 * Por qué existe aparte de `mind-schema.ts`: los validadores (zod) son runtime,
 * y un consumidor puede estar en otra versión de zod (la app usa v4; aquí v3).
 * Los tipos no arrastran nada: quien los importa no carga zod.
 *
 * Referencia: docs/ARQUITECTURA.md §2 (IPC tipado), core/ipc/mind-schema.ts.
 */
import type { Rumbo } from "../mind/rumbo.ts";

export type { Rumbo };

/** El recuerdo que devuelve la mente (forma ligera para el cable). */
export interface RecuerdoClad {
  id: string;
  texto: string;
  tokens?: number;
}

/** La mente que el host ejecuta cuando un módulo pide (Tálamo real o stub). */
export interface MenteViva {
  recall: (q: string, budget?: number) => Promise<RecuerdoClad[]>;
  remember?: (text: string, kind?: string) => Promise<{ id: string }>;
  intake?: (source: string, content: string, tags: string[]) => Promise<{ id: string }>;
  /** Para qué trabaja la mente: pilares y objetivos. */
  rumbo?: () => Promise<Rumbo>;
}

/** Los métodos de mente, por nombre (el contrato, no los validadores). */
export type MindMethod = "recall" | "remember" | "intake" | "rumbo";

/** Mapa método con capacidad del enum cerrado que exige cada cual. */
export const CAPACIDAD_POR_METODO: Record<MindMethod, string> = {
  recall: "mind:read",
  remember: "mind:write",
  intake: "mind:write",
  rumbo: "mind:read",
};
