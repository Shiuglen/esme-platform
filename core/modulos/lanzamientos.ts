/**
 * EL REGISTRO DE LOS LANZAMIENTOS — qué programas se han lanzado en esta casa.
 *
 * Qué es. Un fichero JSONL, una línea por lanzamiento: el programa, sus
 * argumentos, el módulo que lo pidió, el código de salida y cuánto tardó.
 *
 * Por qué en un fichero. Porque el rastro tiene que sobrevivir al proceso:
 * la pregunta «¿qué ha lanzado esta casa hoy?» se hace mañana, no mientras
 * el worker está vivo. Es el mismo motivo por el que el router escribe
 * `laya.jsonl`: una decisión que no queda escrita no se puede revisar.
 *
 * Por qué no se guardan las salidas. Un programa puede devolver 200 MB (la
 * evidencia de REA de una app entera). El rastro dice QUÉ se lanzó y CÓMO
 * acabó; el contenido se queda donde está (o no se queda). Un registro que
 * se traga la casa es un registro que nadie va a abrir.
 *
 * Y lo que no se guarda: el módulo se guarda por su id (no su nombre), y los
 * argumentos se guardan tal cual los pidió el módulo (sin secretos: el
 * programa es local y la casa es la persona).
 *
 * Referencia: core/extension-host/proc.ts, core/modulos/doctor.ts.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { RastroProc } from "../extension-host/proc.ts";

/** Un lanzamiento, con el módulo que lo pidió. */
export type Lanzamiento = RastroProc & {
  /** El módulo que pidió el lanzamiento (su id). */
  modulo: string;
  /** Cuándo (epoch ms). */
  en: number;
};

/**
 * Anota un lanzamiento en el registro (una línea).
 *
 * Un registro que no se puede escribir no es un motivo para que el lanzamiento
 * falle: el programa ya se lanzó. Se dice el motivo y se sigue.
 */
export function registraLanzamiento(ruta: string, lanzamiento: Lanzamiento): boolean {
  try {
    mkdirSync(dirname(ruta), { recursive: true });
    appendFileSync(ruta, `${JSON.stringify(lanzamiento)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Los últimos lanzamientos del registro (del más nuevo al más viejo).
 *
 * Una línea rota no tira el registro entero: se salta y se sigue. Un registro
 * con una línea mala sigue siendo un registro.
 */
export function leeLanzamientos(ruta: string, limite = 20): Lanzamiento[] {
  if (!existsSync(ruta)) return [];
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    return [];
  }
  const salida: Lanzamiento[] = [];
  for (const linea of texto.split("\n")) {
    if (!linea.trim()) continue;
    try {
      const l = JSON.parse(linea) as Lanzamiento;
      if (typeof l.programa === "string" && typeof l.modulo === "string") salida.push(l);
    } catch {
      // una línea rota: se salta (el resto del registro vale)
    }
  }
  return salida.slice(-limite).reverse();
}
