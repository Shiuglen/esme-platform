/**
 * esme.nucleo.hola-mundo — el módulo de referencia: el ciclo, de verdad.
 *
 * Es el ejemplo que se copia y el que enseña la CONVENCIÓN de la casa:
 * un módulo exporta `ciclo(consulta)` y devuelve lo que sabe de ella.
 * Así se puede MEDIR sin que nadie escriba un banco a mano
 * (core/bench/ciclo.ts) y el juez tiene un número con el que dictaminar.
 *
 * Y habla por la PUERTA, no con la mente: `globalThis.esme` es lo único que
 * existe dentro de su worker (la cápsula cierra `fetch`, `node:fs` y
 * `process.env`). Si la persona no le ha concedido `mind:read`, la puerta no
 * se monta, y este módulo lo dice en vez de fingir que consultó.
 *
 * Referencia: docs/MODULOS.md, docs/ENTRADA.md, core/bench/ciclo.ts.
 */
export const MODULO_ID = "esme.nucleo.hola-mundo";

/** Lo que devuelve el ciclo. */
export interface CicloNormal {
  id: string;
  /** La respuesta (lo que ve la persona). */
  respuesta: string;
  /** Cuántos recuerdos trajo la mente. */
  recuerdos: number;
  /** Si el módulo pudo escribir en la mente. */
  escribio: boolean;
}

/** El ciclo completo: preguntar a la mente y contestar. */
export async function ciclo(consulta: string): Promise<CicloNormal> {
  const puerta = globalThis.esme;
  if (!puerta?.mente) {
    // sin puerta no hay mente: se dice, no se disimula
    return {
      id: MODULO_ID,
      respuesta: `no hay puerta a la mente (la consulta era: ${consulta})`,
      recuerdos: 0,
      escribio: false,
    };
  }
  const r = await puerta.mente.recall({ query: consulta, budget: 400 });
  const recuerdos = Array.isArray(r) ? r.length : 0;
  const respuesta = (Array.isArray(r) ? r[0]?.texto : undefined) ?? "la mente no recuerda nada de eso";
  await puerta.mente.remember({
    text: `${MODULO_ID} consultó: ${consulta}`,
    kind: "note",
  });
  return { id: MODULO_ID, respuesta, recuerdos, escribio: true };
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
