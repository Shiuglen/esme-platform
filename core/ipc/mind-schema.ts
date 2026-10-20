// El contrato de mente por IPC (ARQUITECTURA §2): recall, remember, intake,
// rumbo. Schemas con zod: nada cruza la puerta sin forma verificada y permiso
// declarado.
//
// Los TIPOS viven en mind-schema-types.ts (sin zod): quien solo quiere el
// contrato (la app, un módulo) no carga el validador. Aquí están los
// validadores y el contrato completo.
import { z } from "zod";
import type { Rumbo } from "../mind/rumbo.ts";

export type {
  RecuerdoClad,
  MenteViva,
  MindMethod,
  Rumbo,
} from "./mind-schema-types.ts";
export { CAPACIDAD_POR_METODO } from "./mind-schema-types.ts";

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
  // el para qué de la mente: se LEE desde un módulo. Escribirlo es cosa de
  // la persona, no de un módulo: por eso no hay método de escritura aquí.
  rumbo: z.object({}),
} as const;

/** El tipo del contrato, derivado de los validadores (la fuente de verdad). */
export type MindMethodsShape = typeof MindMethods;
