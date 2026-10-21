/**
 * EL CATÁLOGO DE CAPACIDADES DE REA — lo que la máquina puede hacer, con lo
 * que cuesta.
 *
 * Qué es esto. REA declara, operación por operación, qué efectos tiene:
 * si lanza procesos, si toca el disco, si sale a la red, si muestra una
 * ventana. Eso no es un detalle: es la permiso que hay que pedir antes de
 * dejar que un módulo use la operación.
 *
 * Por qué vive en el kit. El kit tiene una lista cerrada de capacidades
 * (`mind:read`, `fs:project`, `net:fetch`…). El catálogo de REA es la
 * traducción: cada efecto de REA dice qué capacidad del kit hay que tener
 * concedido para poder usarlo. Así, un módulo que quiera analizar una app no
 * pide «REA»: pide `proc:spawn` + `fs:project`, y la casa sabe por qué.
 *
 * La regla que no se rompe: una operación que no esté en el catálogo no se
 * concede. Y una operación sin efectos declarados no se presume inocua: se
 * trata como la que peor efecto declara.
 *
 * Referencia: docs/REA.md, core/extension-host/capability.ts.
 */
import { z } from "zod";
import type { Capability } from "../extension-host/capability.ts";

/** Los efectos que REA declara. Cerrados: si aparece otro, se dice. */
export const EFECTOS_REA = [
  "launches_process",
  "may_write_filesystem",
  "may_access_network",
  "may_show_ui",
] as const;

export type EfectoRea = (typeof EFECTOS_REA)[number];

/** Un grupo de operaciones con sus efectos y su disponibilidad. */
export interface OperacionRea {
  /** El nombre de la operación (la que dice `rea --llms`). */
  operacion: string;
  /** El proveedor que la sirve. */
  proveedor: string;
  /** Los efectos que declara. */
  efectos: EfectoRea[];
  /** Si está disponible en esta máquina. */
  disponible: boolean;
  /** Por qué no está disponible (si no lo está). */
  razon: string | null;
  /** Las limitaciones que declara (de la operación y del proveedor). */
  limitaciones: string[];
}

export interface CatalogoRea {
  /** Si REA dice que está abierto (listo para recibir trabajo). */
  abierto: boolean;
  /** Las operaciones, aplanadas. */
  operaciones: OperacionRea[];
  /** Las limitaciones compartidas por los proveedores. */
  limitaciones: string[];
}

/* ------------------------------------------------------------------ *
 * La forma.                                                           *
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

const ProveedorSchema = z
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
    capabilities: z.array(ProveedorSchema).default([]),
  })
  .passthrough();

/* ------------------------------------------------------------------ *
 * El mapa: de efecto de REA a capacidad del kit.                      *
 * ------------------------------------------------------------------ */

export interface MapaEfecto {
  /** El efecto de REA. */
  efecto: EfectoRea;
  /** La capacidad del kit que lo exige (null si ningún efecto lo exige). */
  capacidad: Capability | null;
  /** Cómo se concede. */
  modo: "exigible" | "condicionada";
  /** La condición, si la hay. */
  condicion: string | null;
  /** Lo que hace, en castellano. */
  descripcion: string;
}

export const MAPA_EFECTOS: readonly MapaEfecto[] = [
  {
    efecto: "launches_process",
    capacidad: "proc:spawn",
    modo: "exigible",
    condicion: null,
    descripcion: "lanza otros programas: el hijo hereda el disco y el entorno del anfitrión",
  },
  {
    efecto: "may_write_filesystem",
    capacidad: "fs:project",
    modo: "exigible",
    condicion: null,
    descripcion: "escribe ficheros: la evidencia, los artefactos extraídos, las capturas",
  },
  {
    efecto: "may_access_network",
    capacidad: "net:fetch",
    modo: "condicionada",
    condicion: "net:fetch con los dominios de la operación en la lista de la persona",
    descripcion: "sale a la red: sin dominios concedidos, la operación no se concede",
  },
  {
    efecto: "may_show_ui",
    capacidad: "ui:render",
    modo: "condicionada",
    condicion: "ui:render y una ventana que pueda mostrar el resultado",
    descripcion: "muestra una ventana: capturas de pantalla y escenarios visibles",
  },
] as const;

/** El mapa de un efecto (null si REA declara un efecto que el kit no conoce). */
export function mapaDe(efecto: string): MapaEfecto | null {
  return MAPA_EFECTOS.find((m) => m.efecto === efecto) ?? null;
}

/* ------------------------------------------------------------------ *
 * Lectura y resumen.                                                  *
 * ------------------------------------------------------------------ */

/** Lee el catálogo de REA (`rea capabilities --format json`). */
export function leeCatalogoRea(raw: unknown): { ok: true; catalogo: CatalogoRea } | { ok: false; errores: string[] } {
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
        operaciones.push({
          operacion: op,
          proveedor: prov.provider.id,
          efectos: (g.effects ?? []).filter((e): e is EfectoRea =>
            (EFECTOS_REA as readonly string[]).includes(e)
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

/** Lo que exige una operación: capacidades, condiciones y efectos desconocidos. */
export type Exigencia =
  | { ok: true; capacidades: Capability[]; condiciones: string[]; desconocidos: string[] }
  | { ok: false; error: string };

/**
 * Qué capacidades del kit exige una operación de REA.
 *
 * Regla: la operación exige lo que declaran sus efectos. Un efecto desconocido
 * (una versión nueva de REA con un efecto que el kit no conoce) NO se presume
 * inocuo: se cuenta como el que peor se comporta.
 */
export function capacidadesExigidas(cat: CatalogoRea, operacion: string): Exigencia {
  const op = cat.operaciones.find((o) => o.operacion === operacion);
  if (!op) {
    return { ok: false, error: `operación desconocida en el catálogo de REA: ${operacion}` };
  }
  const capacidades = new Set<Capability>();
  const condiciones: string[] = [];
  const desconocidos: string[] = [];
  for (const e of op.efectos) {
    const m = mapaDe(e);
    if (!m) {
      desconocidos.push(e);
      continue;
    }
    if (m.capacidad) capacidades.add(m.capacidad);
    if (m.condicion) condiciones.push(m.condicion);
  }
  return { ok: true, capacidades: [...capacidades], condiciones, desconocidos };
}

/** ¿Se puede usar esta operación con lo que hay concedido? */
export function operaciónPermitida(
  cat: CatalogoRea,
  operacion: string,
  concedidas: readonly string[]
): { ok: boolean; faltan: string[]; condiciones: string[]; desconocidos: string[]; error: string | null } {
  const req = capacidadesExigidas(cat, operacion);
  if (!req.ok) {
    return { ok: false, faltan: [], condiciones: [], desconocidos: [], error: req.error };
  }
  const faltan = req.capacidades.filter((c) => !concedidas.includes(c));
  return {
    ok: faltan.length === 0,
    faltan,
    condiciones: req.condiciones,
    desconocidos: req.desconocidos,
    error: null,
  };
}

/** El catálogo, resumido en una frase para la mente. */
export function resumenCatalogo(cat: CatalogoRea): string {
  const disponibles = cat.operaciones.filter((o) => o.disponible).length;
  const conRed = cat.operaciones.filter((o) => o.efectos.includes("may_access_network")).length;
  const conProceso = cat.operaciones.filter((o) => o.efectos.includes("launches_process")).length;
  return (
    `Catálogo de REA: ${cat.operaciones.length} operaciones declaradas, ${disponibles} disponibles en esta máquina` +
    (conProceso > 0 ? `, ${conProceso} lanzan procesos` : "") +
    (conRed > 0 ? `, ${conRed} pueden salir a la red` : "") +
    `. ${cat.limitaciones.length > 0 ? `Limitaciones declaradas: ${cat.limitaciones.length}.` : ""}`
  ).trim();
}
