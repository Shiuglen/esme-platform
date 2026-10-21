/**
 * LA FORMA DE REA — los validadores, en su fichero.
 *
 * Por qué existe aparte. La regla de peso del kit: zod entra SOLO en los
 * ficheros de contrato (los validadores de forma), nunca en la lógica. Quien
 * importa los TIPOS de una evidencia no debe cargar zod; quien la VALIDA, sí.
 * Por eso los esquemas viven aquí, y `evidencia.ts` y `capacidades.ts` son
 * forma y lógica puras: se pueden importar sin arrastrar el validador.
 *
 * Qué hay aquí. La forma de la Evidencia (el documento que REA entrega) y la
 * forma del Catálogo (lo que REA dice que sabe hacer). Los dos se comprueban
 * en la frontera: lo que no encaja se dice con sus motivos, en vez de
 * adivinarse.
 *
 * Referencia: docs/REA.md, core/rea/evidencia.ts, core/rea/capacidades.ts.
 */
import { z } from "zod";
import {
  normalizaNodo,
  normalizaRelacion,
  normalizaDesconocido,
  normalizaCobertura,
  objetoDe,
  textoDe,
  type LecturaEvidencia,
} from "./evidencia.ts";
import {
  EFECTOS_REA,
  type CatalogoRea,
  type EfectoRea,
  type OperacionRea,
} from "./capacidades.ts";

/* ------------------------------------------------------------------ *
 * LA EVIDENCIA — el documento que REA entrega.                         *
 * ------------------------------------------------------------------ */

const AsuntoSchema = z
  .object({
    name: z.string(),
    format: z.string().optional(),
    digest: z.object({ sha256: z.string().optional() }).passthrough().optional(),
    local_path: z.string().optional(),
    architecture: z.string().nullable().optional(),
  })
  .passthrough();

const ProveedorEvidenciaSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    version: z.string().nullable().optional(),
  })
  .passthrough();

const GrafoSchema = z
  .object({
    nodes: z.array(z.unknown()).default([]),
    relations: z.array(z.unknown()).default([]),
    unknowns: z.array(z.unknown()).default([]),
    evidence_contexts: z.array(z.unknown()).default([]),
    coverage: z
      .object({
        status: z.string().optional(),
        truncated: z.boolean().optional(),
        omitted_nodes: z.number().optional(),
        omitted_relations: z.number().optional(),
        families: z.array(z.unknown()).default([]),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const EvidenciaSchema = z
  .object({
    evidence_id: z.string().optional(),
    subject: AsuntoSchema,
    provider: ProveedorEvidenciaSchema,
    operation: z.string().optional(),
    confidence: z.string().optional(),
    authority: z.string().optional(),
    limitations: z.array(z.string()).default([]),
    normalized_result: z
      .object({
        summary: z.record(z.string(), z.unknown()).default({}),
        statistics: z.record(z.string(), z.unknown()).default({}),
        semantic_graph: GrafoSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/* ------------------------------------------------------------------ *
 * EL CATÁLOGO — lo que REA dice que sabe hacer.                        *
 * ------------------------------------------------------------------ */

const EfectoSchema = z.string();

const GrupoSchema = z
  .object({
    operations: z.array(z.string()).default([]),
    effects: z.array(EfectoSchema).default([]),
    limitations: z.array(z.string()).default([]),
    available: z.boolean().default(false),
    reason: z.string().nullable().optional(),
    availability_code: z.string().nullable().optional(),
  })
  .passthrough();

const ProveedorCatalogoSchema = z
  .object({
    provider: z
      .object({
        id: z.string(),
        name: z.string().optional(),
        version: z.string().nullable().optional(),
      })
      .passthrough(),
    shared_limitations: z.array(z.string()).default([]),
    groups: z.array(GrupoSchema).default([]),
  })
  .passthrough();

const CatalogoSchema = z
  .object({
    open: z.boolean().default(false),
    cleanup_pending: z.boolean().optional(),
    capabilities: z.array(ProveedorCatalogoSchema).default([]),
  })
  .passthrough();

/**
 * Las claves de la forma de la Evidencia, con su camino (`subject.name`).
 *
 * Para qué. Para que la spec y el validador no se separen: la spec dice qué
 * claves tiene el documento, y el validador las comprueba. Si uno de los dos
 * cambia sin el otro, la casa tiene dos verdades — y entre dos lenguas sólo
 * sobrevive lo que está escrito.
 */
export function clavesDeLaEvidencia(): string[] {
  return clavesDe(ZodObject(EvidenciaSchema), "");
}

/** Las claves de un objeto de zod, con su camino. */
function clavesDe(schema: unknown, prefijo: string): string[] {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  if (!shape) return [];
  const salida: string[] = [];
  for (const [k, v] of Object.entries(shape)) {
    const camino = prefijo ? `${prefijo}.${k}` : k;
    salida.push(camino);
    // los opcionales envuelven el tipo: se baja al interior
    const def = (v as { def?: { innerType?: unknown } }).def;
    const interior = (def?.innerType as { shape?: unknown }) ?? (v as { shape?: unknown });
    salida.push(...clavesDe(interior, camino));
  }
  return salida;
}

/** El objeto de zod de un schema (los wrappers se desenvuelven). */
function ZodObject(schema: unknown): unknown {
  const def = (schema as { def?: { innerType?: unknown } }).def;
  return (def?.innerType as { shape?: unknown }) ?? schema;
}

/* ------------------------------------------------------------------ *
 * La lectura.                                                          *
 * ------------------------------------------------------------------ */

/**
 * Lee la Evidencia de REA y la verifica.
 *
 * Si la forma no encaja, lo dice con sus motivos: un `ok: false` con la lista
 * de errores es más útil que una evidencia a medias que parece entera.
 */
export function leeEvidenciaRea(raw: unknown): LecturaEvidencia {
  const parsed = EvidenciaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errores: parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      ),
    };
  }
  const d = parsed.data;
  // `normalized_result` es opcional: su ausencia es un dato (el análisis no
  // devolvió resumen), no un fallo. Por eso no se rellena con `{}` —eso
  // mentiría sobre la forma— sino que se lee con optional chaining.
  const nr = d.normalized_result;
  const grafo = nr?.semantic_graph ?? { nodes: [], relations: [], unknowns: [], evidence_contexts: [] };

  const contextos = new Map<string, { confianza: string | null; autoridad: string | null }>();
  for (const c of grafo.evidence_contexts) {
    const co = objetoDe(c);
    const id = textoDe(co.context_id);
    if (!id) continue;
    contextos.set(id, { confianza: textoDe(co.confidence), autoridad: textoDe(co.authority) });
  }

  const nodos = [];
  for (const n of grafo.nodes) {
    const norm = normalizaNodo(n, contextos);
    if (norm) nodos.push(norm);
  }

  const relaciones = [];
  for (const r of grafo.relations) {
    const norm = normalizaRelacion(r);
    if (norm) relaciones.push(norm);
  }

  const desconocidos = [];
  for (const u of grafo.unknowns) {
    const norm = normalizaDesconocido(u);
    if (norm) desconocidos.push(norm);
  }

  const cov = grafo.coverage;

  return {
    ok: true,
    evidencia: {
      evidence_id: d.evidence_id ?? null,
      subject: {
        name: d.subject.name,
        format: d.subject.format ?? null,
        sha256: d.subject.digest?.sha256 ?? null,
        local_path: d.subject.local_path ?? null,
        architecture: d.subject.architecture ?? null,
      },
      provider: {
        id: d.provider.id,
        name: d.provider.name ?? null,
        version: d.provider.version ?? null,
      },
      operation: d.operation ?? null,
      confidence: d.confidence ?? null,
      authority: d.authority ?? null,
      limitations: d.limitations,
      summary: nr?.summary ?? {},
      statistics: nr?.statistics ?? {},
      nodes: nodos,
      relations: relaciones,
      unknowns: desconocidos,
      coverage: {
        status: cov?.status ?? null,
        truncated: cov?.truncated ?? false,
        omitted_nodes: cov?.omitted_nodes ?? 0,
        omitted_relations: cov?.omitted_relations ?? 0,
        families: normalizaCobertura(cov),
      },
    },
  };
}

/** Lee la Evidencia desde un JSON en texto. */
export function leeEvidenciaReaJson(texto: string): LecturaEvidencia {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch (e) {
    return { ok: false, errores: [`el JSON no se puede leer: ${String((e as Error)?.message || e)}`] };
  }
  return leeEvidenciaRea(crudo);
}

/** Lee el catálogo de REA (`rea capabilities --format json`). */
export function leeCatalogoRea(
  raw: unknown
): { ok: true; catalogo: CatalogoRea } | { ok: false; errores: string[] } {
  const parsed = CatalogoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errores: parsed.error.issues.map((i) =>
        i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
      ),
    };
  }
  const operaciones: OperacionRea[] = [];
  for (const prov of parsed.data.capabilities) {
    const compartidas = prov.shared_limitations ?? [];
    for (const g of prov.groups) {
      const limitaciones = [...compartidas, ...(g.limitations ?? [])];
      for (const op of g.operations) {
        const declarados = g.effects ?? [];
        operaciones.push({
          operacion: op,
          proveedor: prov.provider.id,
          efectos: declarados.filter((e): e is EfectoRea =>
            (EFECTOS_REA as readonly string[]).includes(e)
          ),
          efectos_desconocidos: declarados.filter(
            (e) => !(EFECTOS_REA as readonly string[]).includes(e)
          ),
          disponible: g.available === true,
          razon: g.reason ?? null,
          limitaciones,
        });
      }
    }
  }
  return {
    ok: true,
    catalogo: {
      abierto: parsed.data.open === true,
      operaciones,
      limitaciones: [...new Set(parsed.data.capabilities.flatMap((p) => p.shared_limitations ?? []))],
    },
  };
}
