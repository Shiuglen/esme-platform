/**
 * LA MEDIDA GENÉRICA — un módulo cualquiera, el mismo examen.
 *
 * Los módulos de la casa tienen su propia forma de examen (la del banco, la del
 * ciclo, la del recuerdo). Un módulo de TERCEROS no la tiene: nadie conoce sus
 * números, y sin números no hay veredicto (core/modulos/veredicto.ts echa el
 * que no trae informe, y con razón: un número inventado no es una medida).
 *
 * Aquí está el examen que TODOS los módulos de puerta comparten:
 *
 *   1. el módulo arranca en su worker de verdad (la cápsula y la puerta);
 *   2. se le hacen tres consultas;
 *   3. se mira si contesta y cuántos tokens cuesta cada respuesta.
 *
 * La convención es una sola: el módulo exporta `ciclo(consulta)` y devuelve lo
 * que sabe de ella. Quien no la siga no se mide, y el juez lo dice — en vez de
 * inventarse un número o approving lo que no se ha visto.
 *
 * Por qué aquí y no en `scripts/`: porque la medida es de la CASA, no de una
 * herramienta. El que verifica (scripts/verificar-modulo.ts), el que juzga y
 * el que escribe la CI tienen que mirar lo mismo, o hay dos verdades.
 *
 * Referencia: core/modulos/veredicto.ts, core/bench/modulos.ts, docs/ENTRADA.md.
 */
import { abreHost } from "../extension-host/host.ts";
import type { EntradaProc } from "../extension-host/proc.ts";
import type { MenteViva } from "../ipc/mind-schema-types.ts";
import type { Manifest } from "../ipc/module-schema.ts";
import type { InformeModulo } from "../modulos/veredicto.ts";
import { confinaEntrada } from "../modulos/rutas.ts";

/** La función que un módulo ofrece para ser medido. */
export const FN_CICLO = "ciclo";

/**
 * Las consultas del examen: tres, el mínimo que el juez pide (MIN_CASOS_CICLO).
 * Son preguntas de la casa, no del módulo: el mismo examen para todos.
 */
export const CONSULTAS_CICLO = [
  "¿qué se decidió sobre el Taller?",
  "¿qué sabe la mente del taller?",
  "¿qué se dijo de la ventana?",
];

/** La cuenta de tokens de la casa: cuatro caracteres por token. */
export const CARACTERES_POR_TOKEN = 4;

export interface OpcionesCiclo {
  /** La función exportada que se ejercita (por defecto, `ciclo`). */
  fn?: string;
  /** Las consultas del examen. */
  consultas?: string[];
  /** La mente que se le monta (si no, se le pone una de juguete). */
  mente?: MenteViva;
  /** La raíz de `fs:project`. */
  proyecto?: string;
  /** Los dominios que `net:fetch` puede tocar. */
  dominios?: string[];
  /**
   * Los programas que `proc:spawn` puede lanzar (los del libro de la casa).
   *
   * Sin esta lista la puerta de los programas está cerrada durante la
   * medida: un módulo que lanza programas se mediría sin poder trabajar.
   */
  programas?: EntradaProc[];
}

export interface MedidaCiclo {
  /** El informe: lo que el juez lee (misma forma que el bench.json). */
  informe: InformeModulo;
  /** Las capacidades que el módulo TOCÓ de verdad. */
  usadas: string[];
  /** Por qué falló, si falló. */
  error?: string;
}

/**
 * La mente de juguete: la puerta necesita alguien al otro lado. Recuerda una
 * cosa por consulta y anota lo que le escriben (para poder mirar si el módulo
 * de verdad escribió o solo dijo que escribió).
 */
export function menteDePrueba(): { mente: MenteViva; escritos: string[] } {
  const escritos: string[] = [];
  return {
    mente: {
      recall: async (query: string) => [{ id: "r1", texto: `recuerdo de ${query}` }],
      remember: async (text: string) => {
        escritos.push(text);
        return { id: `m${escritos.length}` };
      },
    },
    escritos,
  };
}

/** Los tokens que cuesta una respuesta. */
export function tokensDe(carga: unknown): number {
  return Math.ceil(JSON.stringify(carga ?? null).length / CARACTERES_POR_TOKEN);
}

/** El informe, con la forma que el juez y el bench.json comparten. */
export function informeDe(
  manifiesto: Manifest,
  casos: number,
  cicloOk: boolean,
  tokensCiclo: number
): InformeModulo {
  return {
    modulo: manifiesto.id,
    version: manifiesto.version,
    fecha: new Date().toISOString().slice(0, 10),
    casos,
    ciclo_ok: cicloOk,
    tokens_ciclo: tokensCiclo,
  };
}

/**
 * Mide un módulo por el ciclo de la puerta: lo abre de verdad, le hace las
 * consultas y mira lo que contesta.
 *
 * No simula nada: si el módulo no carga, no contesta o revienta, el informe
 * lo dice y el juez lo echa. Es la misma puerta que usa la persona cuando
 * instala el módulo, así que el número que sale es el número de la casa.
 */
export async function mideCicloModulo(
  dirModulo: string,
  manifiesto: Manifest,
  opts: OpcionesCiclo = {}
): Promise<MedidaCiclo> {
  const fn = opts.fn ?? FN_CICLO;
  const consultas = opts.consultas ?? CONSULTAS_CICLO;
  const entrada = confinaEntrada(dirModulo, manifiesto.entry);
  if ("error" in entrada) {
    return {
      informe: informeDe(manifiesto, consultas.length, false, 0),
      usadas: [],
      error: entrada.error,
    };
  }

  const { mente } = opts.mente ? { mente: opts.mente } : menteDePrueba();
  const host = abreHost(entrada.ruta, {
    permisos: manifiesto.permissions,
    concedidas: manifiesto.permissions,
    mente,
    proyecto: opts.proyecto,
    dominios: opts.dominios,
    programas: opts.programas,
    id: manifiesto.id,
    version: manifiesto.version,
  });

  let cicloOk = true;
  let tokens = 0;
  let error: string | undefined;
  for (const consulta of consultas) {
    try {
      const r = await host.call(fn, consulta);
      if (r === undefined || r === null) {
        cicloOk = false;
        error = error ?? `«${fn}» no contestó a: ${consulta}`;
        continue;
      }
      tokens += tokensDe(r);
    } catch (e) {
      cicloOk = false;
      error = error ?? String((e as Error)?.message || e);
    }
  }

  const usadas = host.usadas();
  await host.cerrar();

  return {
    informe: {
      ...informeDe(manifiesto, consultas.length, cicloOk, tokens / consultas.length),
      // la sonda: lo que la Tienda vuelve a ejecutar cuando instala el módulo.
      sondas: [{ fn, args: [consultas[0]] }],
      // por qué falló, si falló: sin esto, quien escribe el módulo no sabe
      // qué arreglar (el juez sólo puede decir «el ciclo falló»).
      ...(error ? { error } : {}),
    },
    usadas,
    error,
  };
}
