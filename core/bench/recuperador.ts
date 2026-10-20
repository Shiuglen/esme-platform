// recuperador — la función que la Prueba 0 cronometra: query → ids (k, budget).
// Usa el Tálamo real (context-packager): ruido fuera, budget sin cortar.
import { selectMemoriesForPack } from "../talamus/context-packager.ts";

export interface CandidatoConId {
  id: string;
  texto: string;
  score: number;
  tokens: number;
}

export type Recuperador = (q: string, k: number, budget: number) => string[];

/** Arma un recuperador fijo sobre una lista de candidatos puntuados. */
export function armaRecuperador(candidatos: CandidatoConId[]): Recuperador {
  return (q: string, k: number, budget: number) => {
    const pack = selectMemoriesForPack(
      q,
      candidatos.map((c) => ({ id: c.id, texto: c.texto, score: c.score, tokens: c.tokens })),
      budget
    );
    return pack.seleccionados.slice(0, k).map((s) => s.id);
  };
}
