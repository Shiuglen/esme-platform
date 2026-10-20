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

// — módulos herramienta: no prometen recordar mejor, prometen FUNCIONAR —
// Un módulo tool no compite por recall: su prueba es el ciclo de extremo a
// extremo (recall → inject) corriendo entero, con el coste medido. El tope
// existe para que "funciona" no siga significando "inyecta 5000 tokens".
export interface BenchCiclo {
  modulo: string;
  version: string;
  fecha: string;
  casos: number; // escenarios del ciclo probados ≥ 3
  ciclo_ok: boolean;
  tokens_ciclo: number; // media de tokens que el módulo inyecta por ciclo
}

const MIN_CASOS_CICLO = 3;
const MAX_TOKENS_CICLO = 500;

export function validaCiclo(b: BenchCiclo): VeredictoEntrada {
  if (!b.ciclo_ok)
    return { entra: false, causa: `el ciclo falló en el examen (${b.casos} escenarios)` };
  if (b.casos < MIN_CASOS_CICLO)
    return { causa: `solo ${b.casos} escenarios: mínimo ${MIN_CASOS_CICLO}`, entra: false };
  if (b.tokens_ciclo > MAX_TOKENS_CICLO)
    return {
      causa: `el ciclo funciona pero inyecta ${Math.round(b.tokens_ciclo)} tokens (tope ${MAX_TOKENS_CICLO})`,
      entra: false,
    };
  return {
    causa: `el ciclo funciona: ${b.casos} escenarios, ${Math.round(b.tokens_ciclo)} tokens por ciclo`,
    entra: true,
  };
}

/** Regla de oro también aquí: dos corridas del mismo bench de ciclo, mismos números. */
export function cicloEstable(b: BenchCiclo, otro: BenchCiclo): boolean {
  return (
    b.modulo === otro.modulo &&
    b.version === otro.version &&
    b.tokens_ciclo === otro.tokens_ciclo &&
    b.ciclo_ok === otro.ciclo_ok
  );
}
