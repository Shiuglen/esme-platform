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
 * cierto. La forma se comprueba EN LA FRONTERA (en `forma.ts`, que es donde
 * vive zod), y lo que no encaja se dice en vez de adivinarse.
 *
 * Aquí no hay validadores: sólo los TIPOS y la normalización. Quien importa
 * estos tipos no carga zod —la regla de peso del kit—; quien valida, importa
 * `core/rea/forma.ts`.
 *
 * La honestidad es parte de la forma: `limitations`, `unknowns` y `coverage`
 * no son campos opcionales de adorno. Son lo que separa «lo que REA vio» de
 * «lo que REA no pudo ver». Si no se leen, la mente afirma cosas que nadie
 * comprobó.
 *
 * Referencia: docs/REA.md, estandar/rea.spec.yaml, core/rea/forma.ts.
 */

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


/**
 * Las claves que el kit lee de cada elemento del grafo.
 *
 * Para qué. La spec (`estandar/rea.spec.yaml`) declara la forma de un nodo,
 * de una relación y de un desconocido; aquí están las que el kit lee de
 * verdad. La conformidad comprueba que las dos cosas digan lo mismo: si la
 * spec declara una clave que nadie lee, es ruido; si el kit lee una clave
 * que la spec no declara, es un agujero entre dos lenguas.
 */
export const CLAVES_NODO = [
  "kind",
  "node_id",
  "label",
  "properties",
  "identity.module_path",
  "identity.source_range.start.line",
  "evidence.context_id",
] as const;

export const CLAVES_RELACION = [
  "source_node_id",
  "target_node_id",
  "relation",
  "resolution",
] as const;

export const CLAVES_DESCONOCIDO = [
  "node_id",
  "family",
  "reason",
  "detail",
  "relation_kinds",
] as const;

export const CLAVES_CONTEXTO = ["context_id", "confidence", "authority"] as const;

/* ------------------------------------------------------------------ *
 * La normalización. Los nodos, las relaciones y los desconocidos       *
 * llegan «crudos»; aquí se les quita lo que sobra. 33.000 nodos       *
 * pasando por zod cuesta más que el análisis entero.                  *
 * ------------------------------------------------------------------ */

/** El texto de un valor, o null si no es texto. */
export const textoDe = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** El número de un valor, o null si no es un número finito. */
export const numeroDe = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Un valor como objeto plano; lo que no lo es, se lee como vacío. */
export const objetoDe = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Normaliza un nodo del grafo: lo que se usa, en la forma que se usa. */
export function normalizaNodo(
  v: unknown,
  contextos: Map<string, { confianza: string | null; autoridad: string | null }>
): NodoRea | null {
  const o = objetoDe(v);
  const kind = textoDe(o.kind);
  const node_id = textoDe(o.node_id);
  if (!kind || !node_id) return null;
  const identidad = objetoDe(o.identity);
  const rango = objetoDe(identidad.source_range);
  const inicio = objetoDe(rango.start);
  const ctx = contextos.get(textoDe(objetoDe(o.evidence).context_id) ?? "");
  return {
    kind,
    node_id,
    label: textoDe(o.label),
    properties: objetoDe(o.properties),
    modulo: textoDe(identidad.module_path),
    linea: numeroDe(inicio.line),
    confianza: ctx?.confianza ?? null,
    autoridad: ctx?.autoridad ?? null,
  };
}

/** Normaliza una relación: sin origen, destino y verbo no hay relación. */
export function normalizaRelacion(v: unknown): RelacionRea | null {
  const o = objetoDe(v);
  const source_node_id = textoDe(o.source_node_id);
  const target_node_id = textoDe(o.target_node_id);
  const relation = textoDe(o.relation);
  if (!source_node_id || !target_node_id || !relation) return null;
  return { source_node_id, target_node_id, relation, resolution: textoDe(o.resolution) };
}

/** Normaliza un desconocido: sin familia y motivo no se sabe qué se perdió. */
export function normalizaDesconocido(v: unknown): DesconocidoRea | null {
  const o = objetoDe(v);
  const family = textoDe(o.family);
  const reason = textoDe(o.reason);
  if (!family || !reason) return null;
  const kinds = Array.isArray(o.relation_kinds)
    ? o.relation_kinds.filter((k): k is string => typeof k === "string")
    : [];
  return {
    node_id: textoDe(o.node_id) ?? "",
    family,
    reason,
    detail: textoDe(o.detail),
    relation_kinds: kinds,
  };
}

/** Normaliza la cobertura por familia de relaciones. */
export function normalizaCobertura(v: unknown): CoberturaFamilia[] {
  const o = objetoDe(v);
  if (!Array.isArray(o.families)) return [];
  const salida: CoberturaFamilia[] = [];
  for (const f of o.families) {
    const fo = objetoDe(f);
    const family = textoDe(fo.family);
    if (!family) continue;
    salida.push({
      family,
      status: textoDe(fo.status),
      retained_relations: numeroDe(fo.retained_relations) ?? 0,
      omitted_relations: numeroDe(fo.omitted_relations) ?? 0,
    });
  }
  return salida;
}
