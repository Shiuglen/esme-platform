/**
 * LA CATA — la carrera, de verdad, y el documento que deja.
 *
 * Aquí se junta lo que la arena necesita para EXISTIR en el kit (no sólo en la
 * spec): se abre a cada participante en su propia copia, se mide lo que hace,
 * se reparte las etiquetas a ciegas y se escribe el documento ciego con su
 * compromiso.
 *
 * Y una regla que no se negocia: **cada participante trabaja en su copia**.
 * Si dos participantes compartieran la carpeta, el que contestara segundo
 * vería lo que hizo el primero (y la comparación dejaría de medir lo que
 * dice medir). Por eso cada uno tiene su espacio, y por eso los cambios se
 * miden dentro de ese espacio.
 *
 * Lo que el kit puede correr: los MÓDULOS de la casa (por su puerta, con su
 * cápsula), que es lo mismo que mide la casa en `core/turnos/ejecuta.ts`. Los
 * motores de la app (claude, opencode, codex…) los corre la app: la app
 * produce el MISMO documento y el kit lo juzga. Un contrato, dos lenguas.
 *
 * Referencia: core/arena/arena.ts, core/arena/ciego.ts, core/turnos/ejecuta.ts.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ejecutaTurno } from "../turnos/ejecuta.ts";
import type { MenteViva } from "../ipc/mind-schema-types.ts";
import { compromisoDe, reparteCiego, salAleatoria } from "./ciego.ts";
import { huellaDeParteCiega, type Arena, type CategoriaArena, type FichaArena } from "./arena.ts";

/** Un participante de la carrera: quién es y dónde está (si es de la casa). */
export interface ParticipanteCata {
  /** El motor o el módulo: la identidad, que NO se ve hasta revelar. */
  motor: string;
  /** El modelo (si lo hay). */
  modelo?: string;
  /** La carpeta del módulo (sólo los que son módulos de la casa). */
  dir?: string;
  /** La función que se ejercita (si el módulo tiene más de una puerta). */
  fn?: string;
  /** Lo que costó (si fue de API). */
  coste_usd?: number;
}

/** Lo que hay que saber para correr una cata. */
export interface OpcionesCata {
  /** La tarea: la misma para todos. */
  tarea: string;
  /** La categoría de la tarea. */
  categoria: CategoriaArena;
  /** Los participantes (al menos dos). */
  participantes: readonly ParticipanteCata[];
  /** La raíz donde se crean las copias aisladas. */
  raiz?: string;
  /** La mente que se le monta (si no, una de juguete). */
  mente?: MenteViva;
  /** La sal del compromiso (si no, se genera una). */
  sal?: string;
  /** El id de la arena. */
  id?: string;
  /** El reloj (para las pruebas). */
  ahora?: () => number;
}

/** Lo que deja una cata. */
export interface ResultadoCata {
  /** El documento ciego (sin veredicto ni revelación). */
  arena: Arena;
  /** La huella de la parte ciega: lo que se entrega ANTES de revelar. */
  huella: string;
  /** La sal (la guarda el organizador hasta la revelación). */
  sal: string;
  /** El secreto: etiqueta → ficha (no se escribe en el documento ciego). */
  fichas: Record<string, FichaArena>;
  /** Lo que pasó con cada participante (incluido lo que falló). */
  incidencias: string[];
}

/**
 * Corre una cata: mide a los participantes, reparte las etiquetas a ciegas y
 * escribe el documento ciego con su compromiso.
 *
 * El compromiso se calcula ANTES de medir (que es lo que ata el mapa a la
 * carrera): el reparto no depende de las medidas, así que el orden de las
 * operaciones es el mismo para todos.
 */
export async function ejecutaCata(opts: OpcionesCata): Promise<ResultadoCata> {
  const ahora = opts.ahora ?? (() => Date.now());
  const sal = opts.sal ?? salAleatoria();
  const incidencias: string[] = [];

  if (opts.participantes.length < 2) {
    throw new Error("una cata necesita al menos dos participantes");
  }
  const motores = opts.participantes.map((p) => p.motor);
  const mapa = reparteCiego(motores, sal);

  const raiz = opts.raiz ?? mkdtempSync(join(tmpdir(), "esme-arena-"));
  const copias: string[] = [];
  const medidasPorEtiqueta: Record<string, { ms: number; tokens: number; cambios: number; ok: boolean }> = {};

  try {
    for (const participante of opts.participantes) {
      const etiqueta = etiquetaDe(mapa, participante.motor);
      if (!participante.dir) {
        incidencias.push(
          `«${participante.motor}» no corrió: en el kit sólo corren los participantes que son módulos de la casa`
        );
        medidasPorEtiqueta[etiqueta] = { ms: 0, tokens: 0, cambios: 0, ok: false };
        continue;
      }

      // cada participante en su propia copia: si compartieran, la comparación
      // mediría el estado del rival y no su trabajo
      const espacio = join(raiz, etiqueta);
      copias.push(espacio);
      const inicio = ahora();
      try {
        const r = await ejecutaTurno({
          dirModulo: participante.dir,
          consulta: opts.tarea,
          espacio,
          ...(participante.fn ? { fn: participante.fn } : {}),
          ...(opts.mente ? { mente: opts.mente } : {}),
        });
        const ms = Math.max(0, ahora() - inicio);
        if (r.error) incidencias.push(`«${participante.motor}» (${etiqueta}): ${r.error}`);
        medidasPorEtiqueta[etiqueta] = {
          ms,
          tokens: r.turno.tokens.total,
          cambios: r.cambios.ficheros.length,
          ok: !r.error,
        };
      } catch (e) {
        // un participante que revienta no tumba la carrera: se dice y sigue
        incidencias.push(
          `«${participante.motor}» (${etiqueta}): ${String((e as Error)?.message || e)}`
        );
        medidasPorEtiqueta[etiqueta] = {
          ms: Math.max(0, ahora() - inicio),
          tokens: 0,
          cambios: 0,
          ok: false,
        };
      }
    }

    // el documento ciego: las etiquetas en orden, y nada que las delate
    const participantes = Object.keys(medidasPorEtiqueta)
      .sort()
      .map((etiqueta) => ({ etiqueta, medidas: medidasPorEtiqueta[etiqueta] }));

    const arena: Arena = {
      id: opts.id ?? `arena-${sal.slice(0, 8)}`,
      version: 1,
      emitido: new Date(ahora()).toISOString(),
      tarea: opts.tarea,
      categoria: opts.categoria,
      participantes,
      compromiso: { algoritmo: "sha256", hash: compromisoDe(mapa, sal) },
    };

    const fichas: Record<string, FichaArena> = {};
    for (const [etiqueta, motor] of Object.entries(mapa)) {
      const participante = opts.participantes.find((p) => p.motor === motor);
      fichas[etiqueta] = {
        motor,
        ...(participante?.modelo ? { modelo: participante.modelo } : {}),
        ...(participante?.coste_usd !== undefined ? { coste_usd: participante.coste_usd } : {}),
      };
    }

    return {
      arena,
      huella: huellaDeParteCiega({
        id: arena.id,
        version: arena.version,
        emitido: arena.emitido,
        tarea: arena.tarea,
        categoria: arena.categoria,
        participantes: arena.participantes,
        compromiso: arena.compromiso,
      }),
      sal,
      fichas,
      incidencias,
    };
  } finally {
    // las copias son de la carrera: se limpian (si el organizador no pidió
    // que se guarden, que es lo normal)
    for (const copia of copias) {
      rmSync(copia, { recursive: true, force: true });
    }
    if (!opts.raiz) rmSync(raiz, { recursive: true, force: true });
  }
}

/** La etiqueta de un participante (según el reparto a ciegas). */
function etiquetaDe(mapa: Record<string, string>, motor: string): string {
  for (const [etiqueta, quien] of Object.entries(mapa)) {
    if (quien === motor) return etiqueta;
  }
  return "?";
}

/**
 * La revelación: el documento ciego, con el veredicto y el secreto.
 *
 * La firma decide cuándo se publica la sal: antes, la cata no está cerrada.
 */
export function revelaCata(
  ciega: Arena,
  opts: { sal: string; fichas: Record<string, FichaArena>; elegida: string; nota?: string }
): Arena {
  return {
    ...ciega,
    veredicto: { elegida: opts.elegida, ...(opts.nota ? { nota: opts.nota } : {}) },
    revelacion: { sal: opts.sal, fichas: opts.fichas },
  };
}
