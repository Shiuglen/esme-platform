/**
 * Adaptador Laya — el System One del núcleo.
 * Referencia: docs/LAYA.md y docs/ARQUITECTURA.md §5.
 *
 * Decide el ROUTE (a qué motor va la tarea) sin gastar un token de modelo grande.
 * El orden del router es la regla del proyecto: primero lo gratis, y aprende
 * de lo aprobado. Laya NO ejecuta, NO aprende y NO diseña.
 */
import * as yaml from "js-yaml";
import { readFileSync } from "node:fs";

/**
 * Los motores que la casa conoce.
 *
 * La lista ES el tipo: una sola verdad. Si el tipo y la spec se contaran por
 * separado, algún día dirían cosas distintas (y ya lo hicieron: la spec
 * declaraba tres motores y el código prometía siete).
 */
export const MOTORES_CONOCIDOS = [
  "claude-code",
  "opencode",
  "codex",
  "gemini",
  "shell",
  "ollama",
  "local",
] as const;

export type Motor = (typeof MOTORES_CONOCIDOS)[number];

export interface LayaDecision {
  route: Motor;
  confidence: number;        // 0–1
  reasoning: string;         // trazabilidad obligatoria
  fallback?: LayaDecision;   // obligatoria si confidence < UMBRAL_CONFIDENCE
}

export const UMBRAL_CONFIDENCE = 0.6;

export interface CognitionMotor {
  id: string;
  capabilities: {
    streaming: boolean;
    tools: boolean;
    max_context: number;
    local_only: boolean;
    pricing: "api" | "local" | "gratuito";
    cancel_support: boolean;
    /** Qué runtime puede alojar este motor (`nodejs`, `wasm`, `python`). */
    runtimes: string[];
    /** Si el motor llega a la red. */
    net: boolean;
    /** Si el motor puede conectarse a la memoria de la casa por MCP. */
    mcp: boolean;
    /** Qué pasa cuando no queda hueco: a la COLA (nunca a la nube). */
    desbordamiento: string;
  };
  /** El fichero que sabe cómo se habla con este motor. */
  adapter: string | null;
  /** De dónde sale lo que este motor declara. */
  source?: string;
  /** Cuándo se miró esa fuente. */
  verificado_en?: string;
}

/** Construye la cola de preferencia: primero gratuito y local, luego api barato. */
export function ordenPreferencia(capacidades: CognitionMotor[]): Motor[] {
  const puntos = (m: CognitionMotor) =>
    (m.capabilities.pricing === "gratuito" ? 2 : m.capabilities.pricing === "local" ? 1 : 0) +
    (m.capabilities.local_only ? 0.5 : 0);
  return [...capacidades].sort((a, z) => puntos(z) - puntos(a)).map((m) => m.id) as Motor[];
}

interface RespLaya {
  decision?: { route?: string; confidence?: number; reasoning?: string };
  error?: string;
}

/**
 * layaRoute: intenta el servicio Laya local (ESME_LAYA_URL) y si no existe
 * o responde bajo confianza → usa el router por capacidades con la cadena de
 * fallback construida según la regla «primero lo gratis».
 */
export async function layaRoute(
  task: string,
  ctx: { capacidades: CognitionMotor[]; authorEntrada?: string }
): Promise<LayaDecision> {
  const cola = ordenPreferencia(ctx.capacidades);
  const local: LayaDecision = {
    route: cola[0] ?? "local",
    confidence: cola.length > 1 ? 0.55 : 0.75,
    reasoning: `sin laya: primero-lo-que-es-gratis (${cola.join(" → ")})`,
  };

  let servicioOK = false;
  let decision: LayaDecision | undefined;
  const url = process.env.ESME_LAYA_URL;
  if (url) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: { task, ...ctx },
          questions: {
            route: {
              type: "choice",
              instructions: "qué motor debe responder esta tarea",
              criteria: Object.fromEntries(cola.map((c) => [c, c])),
            },
          },
        }),
        signal: AbortSignal.timeout(1000), // 1 s y se rinde: Laya nunca frena al usuario
      });
      const j = (await r.json()) as unknown;
      if (validarResp((j as RespLaya).decision, cola)) {
        const d = (j as RespLaya)!.decision!;
        servicioOK = true;
        decision = {
          route: d.route as Motor,
          confidence: d.confidence!,
          reasoning: d.reasoning || "laya local",
          fallback: local,
        };
      }
    } catch {
      /* servicio caído: la regla es que el routing nunca depende de nada que pueda fallar */
    }
  }

  if (servicioOK && decision) {
    if (decision.confidence < UMBRAL_CONFIDENCE) return decision.fallback || local;
    return decision;
  }
  return local;
}

function validarResp(
  d: RespLaya["decision"] | undefined,
  cola: Motor[]
): d is NonNullable<RespLaya["decision"]> {
  return (
    !!d &&
    typeof d.route === "string" &&
    cola.includes(d.route as Motor) &&
    typeof d.confidence === "number"
  );
}

/**
 * Cargo las capacidades desde estandar/motor-capability.spec.yaml.
 *
 * Los motores se cargan TODOS (yaml.loadAll): un solo motor no es el caso.
 * Lo que la spec declara y el código no sabe (el `adapter`, la `source`, la
 * fecha en que se verificó) también viene: sin eso, la spec y el código
 * acabarían contando cosas distintas.
 */
export function cargaMotorCached(ruta: string): CognitionMotor[] {
  const doc = yaml.loadAll(readFileSync(ruta, "utf8")) as Record<string, any>[];
  return doc
    .filter((d) => d && d.id && d.capabilities)
    .map((d) => ({
      id: String(d.id),
      capabilities: {
        streaming: !!d.capabilities.streaming,
        tools: !!d.capabilities.tools,
        max_context: Number(d.capabilities.max_context) || 0,
        local_only: !!d.capabilities.local_only,
        pricing: d.capabilities.pricing,
        cancel_support: !!d.capabilities.cancel_support,
        runtimes: Array.isArray(d.capabilities.runtimes) ? d.capabilities.runtimes.map(String) : [],
        net: !!d.capabilities.net,
        mcp: !!d.capabilities.mcp,
        desbordamiento: String(d.capabilities.desbordamiento ?? "cola"),
      },
      adapter: d.adapter ? String(d.adapter) : null,
      source: d.source ? String(d.source) : undefined,
      verificado_en: d.verificado_en ? String(d.verificado_en) : undefined,
    }));
}
