/**
 * El ciclo completo del módulo de referencia: registra un método de mente y
 * lo demuestra. Contrato: docs/ARQUITECTURA.md §2 (MessagePort tipado).
 */
export const MODULO_ID = "esme.nucleo.hola-mundo";

export interface CicloNormal {
  id: string;
  saludo: string;
  recuerdos: { id: string }[];
}

/** El ciclo mínimo que la tienda pide: recall + saludo con lo recordado. */
export function ciclo(
  recallFn: (q: string) => { id: string }[]
): CicloNormal {
  const recuerdos = recallFn("saludo");
  return { id: MODULO_ID, saludo: "hola", recuerdos };
}

/** Función pura y serializable: los datos cruzan el límite del worker. */
export function resumen(recuerdas: string[]): {
  id: string;
  total: number;
  primera: string | null;
} {
  return {
    id: MODULO_ID,
    total: recuerdas.length,
    primera: recuerdas[0] ?? null,
  };
}
