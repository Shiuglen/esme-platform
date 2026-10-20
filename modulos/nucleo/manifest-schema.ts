import { z } from "zod";
import { CAPABILITIES, type Capability } from "../../core/extension-host/capability.ts";

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

const freeAtLeastOne = (arr: (string | number)[]) => arr.length > 0;

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
    benchmarks: z
      .object({
        recall_delta: z.number().min(0),
        report: z.string().default("bench.json"),
      })
      .optional(),
    signatures: z
      .object({
        minisign: z.string(),
        signed_by: z.string(),
        signed_at: z.string(),
      })
      .optional(),
  })
  .passthrough() // tolerancia: campos extra se notifican, no se rechazan
  .superRefine((m, ctx) => {
    // Regla dura de ARQUITECTURA §3: pedir net: sin net:fetch declarado → rechazo.
    const pideRedOculta = m.permissions.filter((p) =>
      p.startsWith("net:") && p !== "net:fetch"
    );
    if (pideRedOculta.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `capacidades net: no existentes fuera del enum cerrado (${pideRedOculta.join(", ")}); solo se declara net:fetch`,
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
    avisos.push("sin firma minisign: no entra al índice firmado");
  return { ok: true, manifest: parsed.data, errores: [], avisos };
}
