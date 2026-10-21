/**
 * ACTUALIZAR — la tienda publica una versión nueva, y el módulo instalado se
 * queda viejo.
 *
 * Qué hace este módulo del kit:
 *
 *   1. **el plan**: qué módulos tienen una versión nueva en la tienda (y
 *      cuáles son los que ya están al día);
 *   2. **el diff**: qué cambia de verdad entre la versión instalada y la
 *      nueva — con el diff de Myers (core/turnos/cambios.ts), ficheros y
 *      líneas, no un «cambió algo»;
 *   3. **la decisión**: actualizar es un acto de la persona. El plan se ve
 *      primero; si se aplica, la firma se verifica igual que al instalar (una
 *      versión nueva no es más creíble por ser nueva).
 *
 * Y una regla que se respeta: **los permisos no se tocan**. Al actualizar, los
 * que la persona concedió siguen concedidos (el libro es por módulo, no por
 * versión), y los que no había concedido siguen sin conceder. Actualizar no
 * es consentir.
 *
 * Referencia: tienda/cliente.ts (instalarRemoto), core/turnos/cambios.ts.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { compara, instantanea, type ResultadoCambios } from "../turnos/cambios.ts";
import { desempaceta } from "../../tienda/untar.ts";

/** Un módulo instalado (lo mínimo para planear). */
export interface Instalado {
  id: string;
  version: string;
  /** La carpeta donde vive (para medir el diff). */
  dir: string;
}

/** Una versión en la tienda. */
export interface EnLaTienda {
  id: string;
  version: string;
  /** El tarball (para medir el diff contra lo instalado). */
  rutaTar?: string;
}

/** Un módulo con versión nueva. */
export interface Actualizacion {
  id: string;
  /** La versión que tienes. */
  de: string;
  /** La versión que hay. */
  a: string;
  /** Qué cambia (si se pudo medir). */
  cambios: ResultadoCambios | null;
}

/** El plan: qué se puede actualizar. */
export interface PlanActualizacion {
  /** Las actualizaciones pendientes. */
  actualizaciones: Actualizacion[];
  /** Los que ya están al día. */
  alDia: string[];
}

/**
 * Compara dos versiones (semver, con lo que hay).
 *
 * Lo simple es lo que basta: «0.2.0» es más nueva que «0.1.9». Lo raro
 * (prereleases) lo decide la casa de las versiones.
 */
export function esMasNueva(actualmente: string, disponible: string): boolean {
  return comparaVersiones(disponible, actualmente) > 0;
}

/**
 * Compara dos versiones semver (`a.b.c`, estricto: el manifiesto no acepta
 * otra cosa).
 *
 * Devuelve >0 si la primera es más nueva, 0 si son la misma y <0 si la
 * primera es más vieja.
 */
export function comparaVersiones(a: string, b: string): number {
  const partes = (v: string): number[] =>
    v
      .split(".")
      .map((p) => Number.parseInt(p, 10))
      .map((n) => (Number.isFinite(n) ? n : 0));
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * El plan de actualización: qué está viejo y qué cambia en ello.
 *
 * `midirCambios` se puede apagar (si no hay tarballs a mano, el plan se hace
 * igual, sin el diff).
 */
export function planDeActualizacion(
  instalados: Instalado[],
  tienda: EnLaTienda[],
  opts: { medirCambios?: (inst: Instalado, nueva: EnLaTienda) => ResultadoCambios | null } = {}
): PlanActualizacion {
  const actualizaciones: Actualizacion[] = [];
  const alDia: string[] = [];

  for (const inst of instalados) {
    const nueva = tienda.find((t) => t.id === inst.id);
    if (!nueva) {
      alDia.push(`${inst.id} (ya no está en la tienda)`);
      continue;
    }
    if (!esMasNueva(inst.version, nueva.version)) {
      alDia.push(`${inst.id} v${inst.version}`);
      continue;
    }
    let cambios: ResultadoCambios | null = null;
    if (opts.medirCambios) {
      try {
        cambios = opts.medirCambios(inst, nueva);
      } catch {
        cambios = null;
      }
    }
    actualizaciones.push({ id: inst.id, de: inst.version, a: nueva.version, cambios });
  }

  return { actualizaciones, alDia };
}

/**
 * Mide el diff entre lo instalado y el tarball nuevo.
 *
 * El tarball se abre en una carpeta de trabajo y se compara con la carpeta
 * instalada: el diff sale de los mismos números que el diff de un turno (el
 * mismo Myers, el mismo confín), así que «qué cambia al actualizar» y «qué
 * cambió en un turno» se hablan igual.
 */
export function mideCambioContraTarball(
  instalado: Instalado,
  rutaTar: string
): ResultadoCambios {
  const trabajo = mkdtempSync(join(tmpdir(), "esme-actualiza-"));
  try {
    desempaceta(gunzipSync(readFileSync(rutaTar)), trabajo);
    const antes = instantanea(instalado.dir);
    const despues = instantanea(trabajo);
    return compara(antes, despues);
  } finally {
    rmSync(trabajo, { recursive: true, force: true });
  }
}
