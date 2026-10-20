// bench.json — el veredicto de la Prueba 0 para un módulo.
// Regla de entrada a la tienda (docs/PRUEBA-0.md): mejor el recall en ≥ +0,01
// o baja los tokens en ≥ 10%, medido. Nada de números soltaos: el manifiesto
// declara `benchmarks.report: "bench.json"` y esto valida su contenido.
export interface BenchModulo {
  modulo: string; // id del manifiesto
  version: string;
  fecha: string;
  casos: number;
  recall_base: number;
  recall_con: number;
  tokens_base: number;
  tokens_con: number;
  semilla: number; // reproducibilidad: misma semilla, mismo número
}

export type VeredictoEntrada =
  | { entra: true; causa: string }
  | { entra: false; causa: string };

/** El mínimo revivable: +0,01 recall O −10% tokens en el mismo examen. */
const MIN_RECALL_DELTA = 0.01;
const MIN_TOKENS_MEJORA = 0.10;

export function validaBench(b: BenchModulo): VeredictoEntrada {
  const recallDelta = b.recall_con - b.recall_base;
  const tokensMejora = (b.tokens_base - b.tokens_con) / Math.max(b.tokens_base, 1);
  if (b.casos < 10)
    return { entra: false, causa: `solo ${b.casos} casos: mínimo 10 para un veredicto` };
  if (recallDelta >= MIN_RECALL_DELTA)
    return { entra: true, causa: `recordar mejor: +${recallDelta.toFixed(3)} recall` };
  if (tokensMejora >= MIN_TOKENS_MEJORA)
    return { entra: true, causa: `gastar menos: −${(tokensMejora * 100).toFixed(1)}% tokens` };
  return {
    entra: false,
    causa: `no mejora lo mínimo (guardó +${recallDelta.toFixed(3)}, tokens −${(tokensMejora * 100).toFixed(1)}%)`,
  };
}

/** Regla de oro aplicada a la propia regla: el delta debe ser REPRODUCIBLE. */
export function estable(b: BenchModulo, otro: BenchModulo): boolean {
  return (
    b.modulo === otro.modulo &&
    b.version === otro.version &&
    Math.abs(b.recall_base - otro.recall_base) < 0.005 && // ruido, no manipulación
    Math.abs(b.recall_con - otro.recall_con) < 0.005
  );
}
