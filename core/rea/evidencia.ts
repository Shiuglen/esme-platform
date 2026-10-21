/**
 * LA EVIDENCIA DE REA — la forma con nombre, verificada.
 *
 * Qué es esto. REA (el motor de ingeniería inversa que el kit usa como sensor)
 * devuelve un documento JSON —la «Evidencia»— que dice qué ha visto de un
 * programa: sus módulos, sus funciones, sus canales, sus endpoints, sus
 * procesos hijos… y, tan importante como eso, lo que NO ha podido ver.
 *
 * Por qué un contrato y no un `any`. Un análisis real de una app de Electron
 * pesa 58 MB y trae 33.436 nodos, 25.173 relaciones y 10.061 desconocidos. Sin
 * forma verificada, ese documento entra en la mente y nadie sabe qué de él es
 * cierto. Aquí la forma se comprueba EN LA FRONTERA con zod, y lo que no
 * encaja se dice en vez de adivinarse.
 *
 * La honestidad es parte de la forma: `limitations`, `unknowns` y `coverage`
 * no son campos opcionales de adorno. Son lo que separa «lo que REA vio» de
 * «lo que REA no pudo ver». Si no se leen, la mente afirma cosas que nadie
 * comprobó.
 *
 * Referencia: docs/REA.md, estandar/rea.spec.yaml.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * La forma (zod). El sobre se valida entero; los nodos, a mano:      *
 * 33.000 nodos pasando por zod cuesta más que el análisis.          *
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

const ProveedorSchema = z
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
    provider: ProveedorSchema,
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
 * Los tipos que usa el resto del kit.                                 *
 * ------------------------------------------------------------------ */

/** Un nodo del grafo semántico de REA (lo que se ve de un programa). */
export interface NodoRea {
  kind: string;
  node_id: string;
  label: string | null;
  properties: Record<string, unknown>;
  /** El fichero y la línea, si el nodo sabe de dónde viene. */
  modulo: string | null;
  linea: number | null;
  /** El contexto de evidencia: la confianza con que se observó. */
  confianza: string | null;
  autoridad: string | null;
}

/** Una relación entre dos nodos (candidata, no ejecutada). */
export interface RelacionRea {
  source_node_id: string;
  target_node_id: string;
  relation: string;
  resolution: string | null;
}

/** Lo que REA NO pudo resolver. Es información, no basura. */
export interface DesconocidoRea {
  node_id: string;
  family: string;
  reason: string;
  detail: string | null;
  relation_kinds: string[];
}

/** La cobertura por familia de relaciones. */
export interface CoberturaFamilia {
  family: string;
  status: string | null;
  retained_relations: number;
  omitted_relations: number;
}

/** La evidencia, ya verificada y normalizada. */
export interface EvidenciaRea {
  evidence_id: string | null;
  subject: {
    name: string;
    format: string | null;
    sha256: string | null;
    local_path: string | null;
    architecture: string | null;
  };
  provider: { id: string; name: string | null; version: string | null };
  operation: string | null;
  confidence: string | null;
  authority: string | null;
  limitations: string[];
  summary: Record<string, unknown>;
  statistics: Record<string, unknown>;
  nodes: NodoRea[];
  relations: RelacionRea[];
  unknowns: DesconocidoRea[];
  coverage: {
    status: string | null;
    truncated: boolean;
    omitted_nodes: number;
    omitted_relations: number;
    families: CoberturaFamilia[];
  };
}

/** El veredicto de la lectura: o la evidencia, o por qué no hay evidencia. */
export type LecturaEvidencia =
  | { ok: true; evidencia: EvidenciaRea }
  | { ok: false; errores: string[] };

/* ------------------------------------------------------------------ *
 * Lectura.                                                             *
 * ------------------------------------------------------------------ */

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Normaliza un nodo del grafo: lo que se usa, en la forma que se usa. */
function normalizaNodo(v: unknown, contextos: Map<string, { confianza: string | null; autoridad: string | null }>): NodoRea | null {
  const o = objeto(v);
  const kind = str(o.kind);
  const node_id = str(o.node_id);
  if (!kind || !node_id) return null;
  const identidad = objeto(o.identity);
  const rango = objeto(identidad.source_range);
  const inicio = objeto(rango.start);
  const ctx = contextos.get(str(objeto(o.evidence).context_id) ?? "");
  return {
    kind,
    node_id,
    label: str(o.label),
    properties: objeto(o.properties),
    modulo: str(identidad.module_path),
    linea: num(inicio.line),
    confianza: ctx?.confianza ?? null,
    autoridad: ctx?.autoridad ?? null,
  };
}

function normalizaRelacion(v: unknown): RelacionRea | null {
  const o = objeto(v);
  const source_node_id = str(o.source_node_id);
  const target_node_id = str(o.target_node_id);
  const relation = str(o.relation);
  if (!source_node_id || !target_node_id || !relation) return null;
  return { source_node_id, target_node_id, relation, resolution: str(o.resolution) };
}

function normalizaDesconocido(v: unknown): DesconocidoRea | null {
  const o = objeto(v);
  const family = str(o.family);
  const reason = str(o.reason);
  if (!family || !reason) return null;
  const kinds = Array.isArray(o.relation_kinds) ? o.relation_kinds.filter((k): k is string => typeof k === "string") : [];
  return {
    node_id: str(o.node_id) ?? "",
    family,
    reason,
    detail: str(o.detail),
    relation_kinds: kinds,
  };
}

function normalizaCobertura(v: unknown): CoberturaFamilia[] {
  const o = objeto(v);
  if (!Array.isArray(o.families)) return [];
  const salida: CoberturaFamilia[] = [];
  for (const f of o.families) {
    const fo = objeto(f);
    const family = str(fo.family);
    if (!family) continue;
    salida.push({
      family,
      status: str(fo.status),
      retained_relations: num(fo.retained_relations) ?? 0,
      omitted_relations: num(fo.omitted_relations) ?? 0,
    });
  }
  return salida;
}

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
  const nr = d.normalized_result ?? {};
  const grafo = nr.semantic_graph ?? { nodes: [], relations: [], unknowns: [], evidence_contexts: [] };

  const contextos = new Map<string, { confianza: string | null; autoridad: string | null }>();
  for (const c of grafo.evidence_contexts) {
    const co = objeto(c);
    const id = str(co.context_id);
    if (!id) continue;
    contextos.set(id, { confianza: str(co.confidence), autoridad: str(co.authority) });
  }

  const nodos: NodoRea[] = [];
  for (const n of grafo.nodes) {
    const norm = normalizaNodo(n, contextos);
    if (norm) nodos.push(norm);
  }

  const relaciones: RelacionRea[] = [];
  for (const r of grafo.relations) {
    const norm = normalizaRelacion(r);
    if (norm) relaciones.push(norm);
  }

  const desconocidos: DesconocidoRea[] = [];
  for (const u of grafo.unknowns) {
    const norm = normalizaDesconocido(u);
    if (norm) desconocidos.push(norm);
  }

  const cov = grafo.coverage ?? {};

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
      summary: nr.summary ?? {},
      statistics: nr.statistics ?? {},
      nodes: nodos,
      relations: relaciones,
      unknowns: desconocidos,
      coverage: {
        status: cov.status ?? null,
        truncated: cov.truncated ?? false,
        omitted_nodes: cov.omitted_nodes ?? 0,
        omitted_relations: cov.omitted_relations ?? 0,
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
