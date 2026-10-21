/**
 * LA ARENA — el documento de una cata a ciegas, y el juez que lo mira.
 *
 * La arena es un DOCUMENTO: la misma tarea, las etiquetas ciegas, las
 * medidas, el compromiso, el veredicto de la persona y (al final) la
 * revelación. Que sea un documento y no una conversación es lo que la hace
 * útil: se puede guardar, firmar, comparar entre casas y archivar.
 *
 * Y el juez que viene aquí es el que la casa se usa para esto:
 *
 *   - **¿está bien escrita?** (validaArena) — la forma, las medidas, las
 *     etiquetas, el veredicto. Si algo no cuadra, se dice cuál y por qué.
 *   - **¿es de fiar?** (juzgaArena) — la integridad: el compromiso verifica
 *     contra la revelación, o la arena está CONTAMINADA. Una arena
 *     contaminada no cuenta para nada.
 *   - **¿sigue siendo ciega?** (fugasCiegas) — que la parte ciega no lleve
 *     motor, ni modelo, ni coste. Es la regla que hace que la elección sea
 *     ciega de verdad, y se puede COMPROBAR, no confiar.
 *
 * El que organiza la carrera no puede leer el documento ciego sin romperla:
 * el motor de cada participante sólo existe en la revelación.
 *
 * Referencia: estandar/arena.spec.yaml, core/arena/ciego.ts, docs/ARENA.md.
 */
import { ALGORITMO_COMPROMISO, compromisoDe, huellaDe, mismaHuella } from "./ciego.ts";

/**
 * Las categorías de una tarea (cerradas: una tarea es de una, y de una sola).
 *
 * Son las que usa el paladar para agrupar: «para pruebas, tu cata dice Qwen»
 * sólo tiene sentido si las pruebas son una categoría.
 */
export const CATEGORIAS_ARENA = [
  "pruebas",
  "docs",
  "codigo",
  "refactor",
  "diseno",
  "investigacion",
  "libre",
] as const;

/** Una categoría de tarea. */
export type CategoriaArena = (typeof CATEGORIAS_ARENA)[number];

/** Las claves de la arena (la forma que declara estandar/arena.spec.yaml). */
export const CLAVES_ARENA = [
  "id",
  "version",
  "emitido",
  "tarea",
  "categoria",
  "participantes",
  "compromiso",
  "veredicto",
  "revelacion",
] as const;

/** Lo que se mide de cada participante. */
export interface MedidasArena {
  /** Los milisegundos que tardó. */
  ms: number;
  /** Los tokens que gastó. */
  tokens: number;
  /** Los ficheros que tocó. */
  cambios: number;
  /** Si.contestó o no. */
  ok: boolean;
}

/** Un participante, en la parte ciega: la etiqueta y las medidas. */
export interface ParticipanteArena {
  /** La etiqueta (A, B, C…): el pseudónimo del participante. */
  etiqueta: string;
  /** Lo medido. */
  medidas: MedidasArena;
}

/** El compromiso: el hash del mapa con su sal. */
export interface CompromisoArena {
  /** El algoritmo del hash. */
  algoritmo: string;
  /** El hash. */
  hash: string;
}

/** El veredicto de la persona: la etiqueta que eligió. */
export interface VeredictoArena {
  /** La etiqueta elegida. */
  elegida: string;
  /** Por qué (si quiso decirlo). */
  nota?: string;
}

/** La ficha de un participante: quién era (o es) el participante. */
export interface FichaArena {
  /** El motor o el módulo. */
  motor: string;
  /** El modelo (si lo hay). */
  modelo?: string;
  /** Lo que costó (si fue de API). */
  coste_usd?: number;
}

/** La revelación: el secreto,Publicado después del veredicto. */
export interface RevelacionArena {
  /** La sal del compromiso. */
  sal: string;
  /** La ficha de cada etiqueta. */
  fichas: Record<string, FichaArena>;
}

/** La arena: el documento completo. */
export interface Arena {
  /** El id estable. */
  id: string;
  /** La versión del documento. */
  version: number;
  /** Cuándo se emitió. */
  emitido: string;
  /** La tarea: la misma para todos. */
  tarea: string;
  /** La categoría de la tarea. */
  categoria: CategoriaArena;
  /** Los participantes, ciegos. */
  participantes: ParticipanteArena[];
  /** El compromiso del mapa. */
  compromiso: CompromisoArena;
  /** El veredicto de la persona (si ya eligió). */
  veredicto?: VeredictoArena;
  /** La revelación (si ya se reveló). */
  revelacion?: RevelacionArena;
}

/** El estado de integridad de una arena. */
export type IntegridadArena = "limpia" | "contaminada" | "sin_revelar";

/** Lo que el juez dice de una arena. */
export interface JuicioArena {
  /** Si el documento está bien escrito y es de fiar. */
  ok: boolean;
  /** Lo que está mal (vacío = nada). */
  errores: string[];
  /** La integridad de la cata. */
  integridad: IntegridadArena;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** ¿Es un número que se puede medir (ni NaN, ni negativo, ni infinito)? */
function esNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * Valida el documento de una arena.
 *
 * No juzga la honestidad (eso es juzgaArena): sólo la forma. Cada problema
 * se dice con su frase, para que quien lo escribió sepa qué arreglar.
 */
export function validaArena(doc: unknown): { ok: boolean; errores: string[] } {
  const errores: string[] = [];
  if (!doc || typeof doc !== "object") {
    return { ok: false, errores: ["la arena no es un documento"] };
  }
  const a = doc as Partial<Arena>;

  if (typeof a.id !== "string" || !a.id.trim()) errores.push("falta el id");
  if (!esNumero(a.version) || a.version < 1) errores.push("falta la versión (un número ≥ 1)");
  if (typeof a.emitido !== "string" || !a.emitido.trim()) errores.push("falta la fecha");
  if (typeof a.tarea !== "string" || !a.tarea.trim()) errores.push("falta la tarea");
  if (
    typeof a.categoria !== "string" ||
    !(CATEGORIAS_ARENA as readonly string[]).includes(a.categoria)
  ) {
    errores.push(`la categoría «${String(a.categoria)}» no es de las cerradas`);
  }

  if (!Array.isArray(a.participantes) || a.participantes.length < 2) {
    errores.push("una carrera necesita al menos dos participantes");
  } else {
    const vistas = new Set<string>();
    for (const p of a.participantes) {
      if (!p || typeof p !== "object") {
        errores.push("un participante no es un participante");
        continue;
      }
      const etiqueta = (p as ParticipanteArena).etiqueta;
      if (typeof etiqueta !== "string" || !etiqueta.trim()) {
        errores.push("un participante no tiene etiqueta");
      } else if (vistas.has(etiqueta)) {
        errores.push(`la etiqueta «${etiqueta}» está repetida`);
      } else {
        vistas.add(etiqueta);
      }
      const m = (p as ParticipanteArena).medidas;
      if (!m || typeof m !== "object") {
        errores.push(`«${String(etiqueta)}» no tiene medidas`);
        continue;
      }
      if (!esNumero(m.ms)) errores.push(`«${String(etiqueta)}» no midió los ms`);
      if (!esNumero(m.tokens)) errores.push(`«${String(etiqueta)}» no midió los tokens`);
      if (!esNumero(m.cambios)) errores.push(`«${String(etiqueta)}» no midió los cambios`);
      if (typeof m.ok !== "boolean") errores.push(`«${String(etiqueta)}» no dice si contestó`);
    }
  }

  const c = a.compromiso;
  if (!c || typeof c !== "object") {
    errores.push("falta el compromiso (el mapa atado a una sal)");
  } else {
    if (c.algoritmo !== ALGORITMO_COMPROMISO) {
      errores.push(`el compromiso usa «${String(c.algoritmo)}» y el código sólo ${ALGORITMO_COMPROMISO}`);
    }
    if (typeof c.hash !== "string" || !HEX64.test(c.hash)) {
      errores.push("el hash del compromiso no es un sha256 en hexadecimal");
    }
  }

  if (a.veredicto !== undefined) {
    const v = a.veredicto;
    if (!v || typeof v !== "object" || typeof v.elegida !== "string" || !v.elegida.trim()) {
      errores.push("el veredicto no dice qué etiqueta se eligió");
    } else if (Array.isArray(a.participantes)) {
      const etiquetas = a.participantes.map((p) => (p as ParticipanteArena)?.etiqueta);
      if (!etiquetas.includes(v.elegida)) {
        errores.push(`el veredicto eligió «${v.elegida}», que no es ninguna etiqueta`);
      }
    }
  }

  if (a.revelacion !== undefined) {
    const r = a.revelacion;
    if (!r || typeof r !== "object") {
      errores.push("la revelación no es una revelación");
    } else {
      if (typeof r.sal !== "string" || !r.sal.trim()) errores.push("la revelación no trae la sal");
      if (!r.fichas || typeof r.fichas !== "object" || Array.isArray(r.fichas)) {
        errores.push("la revelación no trae las fichas");
      } else {
        for (const [etiqueta, ficha] of Object.entries(r.fichas)) {
          if (!ficha || typeof ficha !== "object" || typeof (ficha as FichaArena).motor !== "string") {
            errores.push(`la ficha de «${etiqueta}» no dice qué motor era`);
          }
        }
      }
    }
  }

  return { ok: errores.length === 0, errores };
}

/**
 * LAS FUGAS: lo que se ha colado en la parte ciega.
 *
 * La cata es ciega si el documento ciego no lleva ni motor, ni modelo, ni
 * coste. No es una cuestión de confianza: se mira el documento y se dice.
 */
export function fugasCiegas(doc: Arena): string[] {
  const fugas: string[] = [];
  for (const p of doc.participantes ?? []) {
    const crudo = p as unknown as Record<string, unknown>;
    for (const prohibido of ["motor", "modelo", "coste_usd"]) {
      if (crudo[prohibido] !== undefined) {
        fugas.push(`«${p.etiqueta}» lleva «${prohibido}» en la parte ciega`);
      }
    }
    const medidas = (crudo.medidas ?? {}) as Record<string, unknown>;
    if (medidas.coste_usd !== undefined) {
      fugas.push(`«${p.etiqueta}» lleva el coste en las medidas`);
    }
  }
  return fugas;
}

/** El mapa secreto (etiqueta → motor) según la revelación. */
export function mapaDe(doc: Arena): Record<string, string> {
  const fichas = doc.revelacion?.fichas ?? {};
  const mapa: Record<string, string> = {};
  for (const [etiqueta, ficha] of Object.entries(fichas)) {
    if (ficha && typeof ficha.motor === "string") mapa[etiqueta] = ficha.motor;
  }
  return mapa;
}

/**
 * El juez de la arena: la forma Y la integridad.
 *
 * La integridad se mira con el compromiso: se rehace el hash del mapa
 * revelado con la sal y se compara con el hash publicado. Si no cuadra, el
 * mapa se cambió después de la carrera: la arena está CONTAMINADA.
 */
export function juzgaArena(doc: unknown): JuicioArena {
  const valida = validaArena(doc);
  const errores = [...valida.errores];
  if (!valida.ok) return { ok: false, errores, integridad: "sin_revelar" };

  const a = doc as Arena;
  const fugas = fugasCiegas(a);
  if (fugas.length) errores.push(...fugas);

  if (!a.revelacion) {
    // aún no se ha revelado: la cata está a medias, pero no está rota
    return { ok: errores.length === 0, errores, integridad: "sin_revelar" };
  }

  const mapa = mapaDe(a);
  const etiquetas = a.participantes.map((p) => p.etiqueta);
  for (const etiqueta of etiquetas) {
    if (!mapa[etiqueta]) errores.push(`la revelación no dice quién era «${etiqueta}»`);
  }

  const esperado = compromisoDe(mapa, a.revelacion.sal);
  if (!mismaHuella(esperado, a.compromiso.hash)) {
    errores.push(
      "el compromiso no verifica: el mapa se cambió después de la carrera (arena contaminada)"
    );
    return { ok: false, errores, integridad: "contaminada" };
  }

  return { ok: errores.length === 0, errores, integridad: "limpia" };
}

/** Lo que la persona ve antes de revelar: etiquetas y medidas, y nada más. */
export interface VistaCiega {
  /** La tarea. */
  tarea: string;
  /** La categoría. */
  categoria: string;
  /** Los participantes, en orden de etiqueta. */
  participantes: Array<{ etiqueta: string; medidas: MedidasArena }>;
  /** El compromiso (el hash publicado). */
  compromiso: CompromisoArena;
  /** La huella de la parte ciega: lo que hay que entregar antes de revelar. */
  huella: string;
}

/**
 * La vista ciega: lo que se enseña a elegir.
 *
 * Orden: por etiqueta (A, B, C…), nunca por orden de llegada (que podría
 * delatar el precio). Y sin motor, sin modelo y sin coste.
 */
export function vistaCiega(doc: Arena): VistaCiega {
  const participantes = [...doc.participantes]
    .sort((x, y) => x.etiqueta.localeCompare(y.etiqueta))
    .map((p) => ({ etiqueta: p.etiqueta, medidas: { ...p.medidas } }));
  const ciega = {
    id: doc.id,
    version: doc.version,
    emitido: doc.emitido,
    tarea: doc.tarea,
    categoria: doc.categoria,
    participantes,
    compromiso: doc.compromiso,
  };
  return { ...ciega, huella: huellaDeParteCiega(ciega) };
}

/**
 * La huella de la parte ciega: el hash de lo que se ve (sin el veredicto ni
 * la revelación). Es lo que se entrega ANTES de revelar.
 */
export function huellaDeParteCiega(ciega: unknown): string {
  return huellaDe(ciega);
}
