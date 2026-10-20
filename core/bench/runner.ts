// runner — mide base vs. módulo con la Prueba 0 y arma el bench.json reproducible.
// Regla de oro en código: si el número no mejora, el verdicto es FUERA.
import {
  conScoreDeCaso,
  type Caso,
  type Candidato,
} from "./examen.ts";
import { armaRecuperador } from "./recuperador.ts";
import { validaBench, type BenchModulo } from "../../tienda/bench.ts";

export interface ResultadoExamen {
  recall: number; // promedio de |devueltos ∩ oro| / |oro|
  tokens: number; // promedio de tokens devueltos por caso
}

const tokensLote = Math.ceil;

/** Corre una lista de casos contra un recuperador: recall@k con presupuesto. */
export function corre(
  candidatos: Candidato[],
  casos: Caso[],
  opts: { k?: number; budget?: number } = {}
): ResultadoExamen {
  const k = tokensLote(opts.k ?? 3);
  const budget = opts.budget ?? 400;
  let recallSum = 0;
  let tokensSum = 0;
  for (const c of casos) {
    const conScore = conScoreDeCaso(candidatos, c);
    const ids = armaRecuperador(conScore)(c.pregunta, k, budget);
    const oro = new Set(c.oro);
    const hits = ids.filter((i) => oro.has(i)).length;
    recallSum += oro.size ? hits / oro.size : hits > 0 ? 0 : 1;
    const total = conScore.filter((x) => ids.includes(x.id)).reduce((a, b) => a + b.tokens, 0);
    tokensSum += total;
  }
  const n = casos.length;
  return { recall: recallSum / n, tokens: tokensSum / n };
}

/** El lifted bench.json para la tienda: reproduce el veredicto de la regla. */
export function armaBench(
  m: { modulo: string; version: string; fecha?: string; semilla?: number },
  base: ResultadoExamen,
  con: ResultadoExamen,
  casos: number
): BenchModulo {
  return {
    modulo: m.modulo,
    version: m.version,
    fecha: m.fecha ?? new Date().toISOString().slice(0, 10),
    casos,
    recall_base: base.recall,
    recall_con: con.recall,
    tokens_base: base.tokens,
    tokens_con: con.tokens,
    semilla: m.semilla ?? 0,
  };
}

/** El veredicto: este bench entra por la puerta del índice, o no entra. */
export function veredicto(b: BenchModulo): { entra: boolean; causa: string } {
  const r = validaBench(b);
  return { entra: r.entra, causa: r.causa };
}
