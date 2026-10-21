/**
 * LA MEDIDA DE LOS MÓDULOS — correr el módulo de verdad y mirar los números.
 *
 * Aquí no hay simulaciones: se abre el módulo (el worker real, con la puerta
 * real), se le llama, y se mira lo que hace. De ahí sale el informe que juzga
 * `core/modulos/veredicto.ts`.
 *
 * Las tres medidas:
 *   - **carga**: ¿arranca y contesta?
 *   - **uso**: ¿qué capacidades tocó de verdad? (el host lo sabe: no hay que
 *     adivinarlo, y el módulo no puede despistar porque la puerta no le
 *     deja tocar lo que no pidió)
 *   - **número**: el recall y los tokens de su informe de examen (el que dice
 *     qué se midió y con qué semilla).
 *
 * Referencia: core/modulos/veredicto.ts, core/bench/examen-real.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { abreHost } from "../extension-host/host.ts";
import type { MenteViva } from "../ipc/mind-schema-types.ts";
import type { Manifest } from "../ipc/module-schema.ts";
import type { MedidasModulo, InformeModulo, Sonda } from "../modulos/veredicto.ts";
import { confinaEntrada } from "../modulos/rutas.ts";
import type { EntradaProc } from "../extension-host/proc.ts";

export type { InformeModulo, Sonda } from "../modulos/veredicto.ts";

export interface OpcionesMedida {
  /** La mente que se inyecta (si el módulo la pide). */
  mente?: MenteViva;
  /** La raíz de `fs:project`. */
  proyecto?: string;
  /** Los dominios que `net:fetch` puede tocar. */
  dominios?: string[];
  /**
   * Los programas que `proc:spawn` puede lanzar.
   *
   * Sin esta lista, la puerta de los programas está CERRADA durante la
   * medida: un módulo que lanza programas se mediría con la puerta cerrada,
   * que no es medirlo: es medir que no puede trabajar.
   */
  programas?: EntradaProc[];
  /** Sondas extra (además de las que declara el informe). */
  sondas?: Sonda[];
}

/** Lee el informe de examen de un módulo (bench.json), si lo tiene. */
export function leeInforme(dirModulo: string, manifiesto: Manifest): InformeModulo | null {
  const nombre = manifiesto.benchmarks?.report ?? "bench.json";
  const ruta = resolve(dirModulo, nombre);
  if (!existsSync(ruta)) return null;
  try {
    return JSON.parse(readFileSync(ruta, "utf8")) as InformeModulo;
  } catch {
    return null;
  }
}

/**
 * Mide un módulo instalado: lo abre, lo llama y recoge los números.
 *
 * El manifiesto se lo da quien sabe leerlo (la Tienda: `tienda/modulos.ts`),
 * y la entrada se confina a la carpeta del módulo: un módulo cuya entrada se
 * sale, no se mide (no se ejecuta código que apunta fuera de su casa).
 */
export async function mideModulo(
  dirModulo: string,
  manifiesto: Manifest,
  opts: OpcionesMedida = {}
): Promise<{ manifiesto: Manifest; medidas: MedidasModulo }> {
  const entrada = confinaEntrada(dirModulo, manifiesto.entry);
  if ("error" in entrada) throw new Error(entrada.error);

  const informe = leeInforme(dirModulo, manifiesto);

  const usadas: string[] = [];
  const host = abreHost(entrada.ruta, {
    permisos: manifiesto.permissions,
    concedidas: manifiesto.permissions,
    mente: opts.mente,
    proyecto: opts.proyecto,
    dominios: opts.dominios,
    programas: opts.programas,
    id: manifiesto.id,
    version: manifiesto.version,
  });

  let carga = false;
  let error: string | undefined;
  try {
    await host.listo;
    carga = true;
    // Las sondas: lo que hay que llamar para ejercitar el módulo de verdad.
    // Si una sonda falla, no se calla la carga: cargar es lo que se juzga
    // primero, y las medidas se recogen igual.
    const sondas = [...(informe?.sondas ?? []), ...(opts.sondas ?? [])];
    for (const sonda of sondas) {
      try {
        await host.call(sonda.fn, ...(sonda.args ?? []));
      } catch {
        // una sonda que falla no invalida la carga
      }
    }
  } catch (e) {
    error = String((e as Error)?.message || e);
  } finally {
    usadas.push(...host.usadas());
    await host.cerrar();
  }

  return {
    manifiesto,
    medidas: {
      carga,
      error,
      usadas: [...new Set(usadas)],
      informe: informe ?? null,
    },
  };
}
