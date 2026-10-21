/**
 * EL CONTRATO DEL MÓDULO — la forma de un `module.yaml`, sin validadores de
 * ficheros y sin YAML: solo la forma.
 *
 * Por qué vive en `core/ipc/` y no en `modulos/`: este es un CONTRATO, como el
 * de la mente (`mind-schema.ts`). Quien instala un módulo —el kit, la app,
 * un agente— valida la misma forma, y si hay dos validadores hay dos
 * verdades. Quien SÍ tiene el fichero en disco (la Tienda, la CLI) lo lee con
 * `tienda/modulo-manifiesto.ts` y usa esta forma para dictaminarlo.
 *
 * Regla de peso: el núcleo no arrastra dependencias en tiempo de ejecución.
 * zod entra aquí porque esto es un validador, no lógica.
 *
 * Referencia: estandar/module-manifest.spec.yaml, docs/ARQUITECTURA.md §3.
 */
import { z } from "zod";
import { CAPABILITIES } from "../extension-host/capability.ts";

export const CATEGORIES = [
  "tool",
  "agent",
  "theme",
  "memory",
  "integration",
  "thinking",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const RUNTIMES = ["nodejs", "wasm", "python"] as const;

/** Schema del module.yaml v1 (especificación en estandar/module-manifest.spec.yaml). */
export const ManifestSchema = z
  .object({
    schema_version: z.literal(1),
    id: z
      .string()
      .regex(/^esme\.[a-z0-9-]+\.[a-z0-9-]+$/, "id debe ser esme.<autor>.<slug>"),
    name: z.string().min(1),
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "version semver estricto"),
    category: z.enum(CATEGORIES),
    description: z.string().min(10, "description demasiado corta"),
    author: z.string().min(3),
    license: z.enum(["MIT", "Apache-2.0", "ESME-CL"]),
    entry: z.string().min(1),
    runtime: z.enum(RUNTIMES),
    permissions: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length),
    decision_criteria: z
      .array(
        z.object({
          when: z.string().min(2),
          weight: z.number().min(0).max(1),
          tags: z.array(z.string()),
        })
      )
      .default([]),
    dependencies: z.array(z.string()).default([]),
    sideEffects: z.boolean().default(false),
    /**
     * Los motores con los que este módulo trabaja (opcional).
     *
     * Si no se declara nada, el módulo vale para cualquier motor que pueda
     * alojarlo (y eso lo decide el compat-check, motor por motor). Si se
     * declara, la declaración MANDA: el módulo dice con quién habla.
     */
    engines: z.array(z.string()).optional(),
    benchmarks: z
      .object({
        recall_delta: z.number().min(0),
        report: z.string().default("bench.json"),
      })
      .optional(),
    signatures: z
      .object({
        minisign: z.string().optional(),
        ed25519: z.string().optional(), // firma del artefacto (node:crypto, cero dependencias)
        signed_by: z.string(),
        signed_at: z.string(),
      })
      .superRefine((s, ctx) => {
        if (!s.minisign && !s.ed25519)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "signatures: pone minisign o ed25519 (uno, no ninguno)",
          });
      })
      .optional(),
  })
  .passthrough() // tolerancia: campos extra se notifican, no se rechazan
  .superRefine((m, ctx) => {
    // Regla dura de ARQUITECTURA §3: pedir net: sin net:fetch declarado → rechazo.
    const pideRedOculta = m.permissions.filter(
      (p) => p.startsWith("net:") && p !== "net:fetch"
    );
    if (pideRedOculta.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `capacidades net: no existentes fuera del enum cerrado (${pideRedOculta.join(", ")}); solo se declara net:fetch`,
        path: ["permissions"],
      });
    }
    // Y lo mismo con los procesos: pedir proc: sin proc:spawn declarado → rechazo.
    // Una capacidad que abre la puerta a lanzar programas no se pide con otro
    // nombre (el enum la encierra; esta regla lo dice en voz alta).
    const pideProcesoOculto = m.permissions.filter(
      (p) => p.startsWith("proc:") && p !== "proc:spawn"
    );
    if (pideProcesoOculto.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `capacidades proc: no existentes fuera del enum cerrado (${pideProcesoOculto.join(", ")}); solo se declara proc:spawn`,
        path: ["permissions"],
      });
    }
  });

export type Manifest = z.infer<typeof ManifestSchema>;

export function validaManifiesto(raw: unknown): {
  ok: boolean;
  manifest?: Manifest;
  errores: string[];
  avisos: string[];
} {
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errores: parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      ),
      avisos: [],
    };
  }
  const avisos: string[] = [];
  if (!parsed.data.benchmarks)
    avisos.push("sin benchmarks: la Prueba 0 es obligatoria para publicar");
  if (!parsed.data.signatures)
    avisos.push("sin firma (ed25519): el artefacto no puede verificarse");
  return { ok: true, manifest: parsed.data, errores: [], avisos };
}
