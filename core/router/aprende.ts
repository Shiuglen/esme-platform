/**
 * EL ROUTER QUE APRENDE — las decisiones de la persona mandan.
 *
 * Laya (el System One del núcleo) elige motor sin gastar un token de modelo
 * grande: es rápido, gratis y local. Pero la persona puede estar en
 * desacuerdo, y cuando lo está, **tiene razón**: es su máquina, su trabajo y
 * su tiempo.
 *
 * Aquí está la memoria de ese aprendizaje:
 *
 *   - cada vez que el router elige un motor, se REGISTRA (la tarea, la ruta,
 *     la confianza y el razonamiento);
 *   - cuando la persona aprueba o corrige esa decisión, se anota su VEREDICTO;
 *   - y de esos veredictos se APRENDE una tabla: «este tipo de tarea va a este
 *     motor».
 *
 * La regla (es lo que hace que valga): **lo aprendido manda sobre lo supuesto**
 * (si hay veredicto, va el motor del veredicto), pero **el router sigue
 * decidiendo cuando no hay nada aprendido** (Laya no se queda mudo: la tabla
 * no es el router, es su memoria).
 *
 * Y el número que lo vigila: la CONCORDANCIA con las decisiones de la
 * persona (docs/LAYA.md habla de ~0,7 como objetivo). Si baja, Laya ha
 * empeorado y hay que mirarlo.
 *
 * Referencia: estandar/router.spec.yaml, docs/LAYA.md, motores/laya-adapter.ts.
 */
import { createHash } from "node:crypto";

/** Lo que la persona dijo de una decisión. */
export type VeredictoRuta = "aprobado" | "corregido" | "rechazado";

/** Las claves de la decisión (la forma que declara estandar/router.spec.yaml). */
export const CLAVES_DECISION = [
  "ts",
  "tarea",
  "ruta",
  "confianza",
  "razonamiento",
  "veredicto",
  "ruta_correcta",
] as const;

/** Una decisión del router, registrada. */
export interface DecisionRuta {
  /** Cuándo (epoch ms). */
  ts: number;
  /** La tarea (el texto que el router juzgó). */
  tarea: string;
  /** El motor que eligió. */
  ruta: string;
  /** La confianza (0-1). */
  confianza: number;
  /** El razonamiento (trazabilidad obligatoria). */
  razonamiento?: string;
  /** Lo que dijo la persona (si dijo algo). */
  veredicto?: VeredictoRuta;
  /** Si lo corrigió, el motor que quería de verdad. */
  ruta_correcta?: string;
}

/** Lo que se aprende de los veredictos. */
export interface Aprendido {
  /** La tabla: la firma de la tarea → el motor que la persona eligió. */
  tabla: Record<string, string>;
  /** Las decisiones registradas. */
  decisiones: number;
  /** Las decisiones con veredicto. */
  veredictos: number;
  /** Las que la persona corrigió (o rechazó). */
  correcciones: number;
  /** Cuántas veces el router acertó con lo aprendido (0-1). */
  concordancia: number;
  /**
   * EL PALADAR: lo que la cata a ciegas enseñó, por categoría.
   *
   * Es una memoria más burda que la tabla (no sabe de una tarea concreta,
   * sino de una categoría: «para pruebas, tu cata dice Qwen»), pero con más
   * cata detrás: son muchas carreras medidas, no una frase suelta.
   */
  paladar?: Record<string, { motor: string; catas: number; ganadas: number }>;
}

/**
 * La firma de una tarea: cómo se parece una tarea a otra.
 *
 * No es un modelo: son las PALABRAS que la persona escribió (o el motor que
 * eligió), en orden, sin acentos. Es una huella, no una interpretación: dos
 * tareas con las mismas palabras son la misma tarea para el router.
 */
export function firmaDe(tarea: string): string {
  const palabras = (tarea ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9áéíóúñ]+/)
    .filter((p) => p.length > 2);
  if (!palabras.length) return "";
  return createHash("sha256").update(palabras.join(" ")).digest("hex").slice(0, 16);
}

/**
 * Aprende de las decisiones con veredicto.
 *
 * Lo que se guarda: la motor que la persona quiso para cada firma de tarea.
 * Lo que se cuenta: la concordancia (de las decisiones CON veredicto, ¿cuántas
 * coinciden con lo aprendido?).
 */
export function aprendeDe(registro: DecisionRuta[]): Aprendido {
  const tabla: Record<string, string> = {};
  const conVeredicto = registro.filter((d) => d.veredicto);
  for (const d of conVeredicto) {
    const firma = firmaDe(d.tarea);
    if (!firma) continue;
    // lo que la persona quiso: la corrección si la hubo, si no la ruta que
    // ya era (un «aprobado» ratifica lo que el router dijo)
    const motor = d.ruta_correcta ?? d.ruta;
    if (!motor) continue;
    tabla[firma] = motor;
  }

  // la concordancia: de las decisiones con veredicto, cuántas coinciden con
  // lo que el router eligió
  let aciertos = 0;
  let correcciones = 0;
  for (const d of conVeredicto) {
    if (d.veredicto === "corregido" || d.veredicto === "rechazado") correcciones++;
    else if (d.veredicto === "aprobado") aciertos++;
  }
  const concordancia = conVeredicto.length ? aciertos / conVeredicto.length : 1;

  return {
    tabla,
    decisiones: registro.length,
    veredictos: conVeredicto.length,
    correcciones,
    concordancia,
  };
}

/**
 * Elige motor con lo aprendido por delante.
 *
 * El orden es el orden de la casa, de la persona hacia abajo:
 *
 *   1. **la persona** — si hay veredicto para esta tarea EXACTA, va su motor;
 *   2. **el paladar** — si no, el motor que ganó las catas de esa CATEGORÍA
 *      (medido, con el número de catas al lado);
 *   3. **el router** — si no hay nada aprendido, decide Laya (o quien sea).
 *
 * El paladar va en medio y no primero a propósito: la tabla de la persona es
 * sobre una tarea concreta, y su veredicto manda; el paladar es sobre una
 * categoría y son muchas carreras. El router sigue decidiendo cuando no hay
 * nada aprendido: lo aprendido es su memoria, no su sustituto.
 */
export function eligeConAprendido(
  tarea: string,
  aprendido: Aprendido,
  porDefecto: (tarea: string) => string,
  categoria?: string
): { ruta: string; de: "persona" | "paladar" | "router" } {
  const firma = firmaDe(tarea);
  const guardada = firma ? aprendido.tabla[firma] : undefined;
  if (guardada) return { ruta: guardada, de: "persona" };
  const cata = categoria ? aprendido.paladar?.[categoria] : undefined;
  if (cata) return { ruta: cata.motor, de: "paladar" };
  return { ruta: porDefecto(tarea), de: "router" };
}

/** Lee un registro desde JSONL (una decisión por línea). */
export function leeRegistro(texto: string): DecisionRuta[] {
  const salida: DecisionRuta[] = [];
  for (const linea of texto.split("\n")) {
    const t = linea.trim();
    if (!t) continue;
    try {
      const d = JSON.parse(t) as DecisionRuta;
      if (d && typeof d.tarea === "string" && typeof d.ruta === "string") salida.push(d);
    } catch {
      // una línea rota no es un motivo para tirar el registro entero
    }
  }
  return salida;
}
