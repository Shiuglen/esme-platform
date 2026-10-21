/**
 * EL PLAN DE COMPACTACIÓN — lo que se queda fuera, y por qué.
 *
 * El Tálamo recorta: mete los recuerdos que caben y tira el resto. Hasta
 * ahora, en silencio. Y un recorte en silencio es un recorte que nadie puede
 * revisar: la persona ve que el agente «no se acuerda» de algo y no hay modo
 * de saber si fue que no cabía, que era ruido o que el umbral estaba mal.
 *
 * Esto es lo que se aprendió del espejo de openrig (`compact-plan.ts`, con sus
 * `candidateSortScore` y su `thresholdReason`): la compactación es un PLAN —
 * una lista de lo que entra, una lista de lo que no, y el motivo de cada uno.
 *
 * Y el plan no cambia lo que el Tálamo decide (eso lo hace el Tálamo, que es
 * el que sabe): sólo lo explica. Un recorte que no se puede explicar es un
 * recorte que no se puede corregir.
 *
 * Referencia: core/talamus/context-packager.ts, docs/TURNOS.md.
 */
import {
  selectMemoriesForPack,
  type Paquete,
  type Recuerdo,
} from "./context-packager.ts";

/** Por qué un recuerdo se quedó fuera. */
export type MotivoFuera = "ruido" | "marginal" | "no-cabe";

/** Un recuerdo que no entró, y por qué. */
export interface Fuera {
  id: string;
  texto: string;
  tokens: number;
  score: number;
  /** El motivo. */
  motivo: MotivoFuera;
}

/** El plan: lo que entra, lo que no, y por qué. */
export interface PlanEmpaquete {
  /** Los recuerdos que entran. */
  entra: Recuerdo[];
  /** Los que no entran, con su motivo. */
  quedan: Fuera[];
  /** Los tokens de lo que entra. */
  tokens: number;
  /** Los tokens de lo que se queda fuera. */
  tokens_fuera: number;
  /** El porcentaje que se ahorra respecto a meterlo todo (0-100). */
  ahorro_pct: number;
  /** El veredicto por recuerdo (el del Tálamo). */
  veredictos: Paquete["veredictos"];
}

/**
 * El plan de compactación de una pregunta.
 *
 * `budget` es el presupuesto del modo (estándar, ahorrador, equipo).
 */
export function planDeEmpaquete(
  query: string,
  candidatos: Recuerdo[],
  budget: number,
  opts: { umbral?: number; margen?: number; marginales?: boolean } = {}
): PlanEmpaquete {
  // el empaque es el del Tálamo, y ahora además DICE lo que dejó fuera (los
  // motivos los pone el Tálamo, no este fichero: una sola verdad).
  const paquete = selectMemoriesForPack(query, candidatos, budget, { ...opts, detalle: true });
  const motivos = new Map((paquete.fuera ?? []).map((f) => [f.id, f.motivo]));
  const quedan: Fuera[] = [];
  for (const r of candidatos) {
    const motivo = motivos.get(r.id);
    if (!motivo) continue;
    quedan.push({ id: r.id, texto: r.texto, tokens: r.tokens, score: r.score, motivo });
  }

  const tokens = paquete.tokens_gastados;
  const tokensFuera = quedan.reduce((n, f) => n + f.tokens, 0);
  const total = tokens + tokensFuera;
  return {
    entra: paquete.seleccionados,
    quedan,
    tokens,
    tokens_fuera: tokensFuera,
    ahorro_pct: total > 0 ? Math.round((tokensFuera / total) * 1000) / 10 : 0,
    veredictos: paquete.veredictos,
  };
}

/** El plan, resumido en una línea (para el turno y para la consola). */
export function resumenPlan(p: PlanEmpaquete): string {
  const porMotivo = (m: MotivoFuera): number => p.quedan.filter((q) => q.motivo === m).length;
  const partes: string[] = [];
  if (porMotivo("ruido")) partes.push(`${porMotivo("ruido")} ruido`);
  if (porMotivo("marginal")) partes.push(`${porMotivo("marginal")} marginales`);
  if (porMotivo("no-cabe")) partes.push(`${porMotivo("no-cabe")} no cabían`);
  return (
    `entran ${p.entra.length} recuerdos (${p.tokens} tokens)` +
    (partes.length ? `; fuera: ${partes.join(", ")} (${p.tokens_fuera} tokens)` : "; nada fuera")
  );
}
