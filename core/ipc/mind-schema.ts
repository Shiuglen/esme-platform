// El contrato de mente por IPC (ARQUITECTURA §2): recall, remember, intake.
// Schemas con zod: nada cruza la puerta sin forma verificada y permiso declarado.
import { z } from "zod";

export const MindMethods = {
  recall: z.object({
    query: z.string().min(1),
    budget: z.number().int().positive().default(1500),
  }),
  remember: z.object({
    text: z.string().min(1),
    kind: z.enum(["note", "decision", "preference"]).default("note"),
  }),
  intake: z.object({
    source: z.string().min(1),
    content: z.string().min(1),
    tags: z.array(z.string()),
  }),
} as const;

export type MindMethod = keyof typeof MindMethods;

/** Mapa método con capacidad del enum cerrado que exige cada cual. */
export const CAPACIDAD_POR_METODO: Record<MindMethod, string> = {
  recall: "mind:read",
  remember: "mind:write",
  intake: "mind:write",
};

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
}
