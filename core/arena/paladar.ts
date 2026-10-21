/**
 * EL PALADAR — lo que la cata enseña, por categoría.
 *
 * Una cata ciega da un veredicto: «A gana». De una cata no se aprende nada
 * (puede ser suerte). De muchas, sí: «para pruebas, tu cata dice Qwen». Eso es
 * el paladar: la memoria de la persona, pero MEDIDA — con el número de catas
 * al lado, para que se pueda discutir.
 *
 * Las reglas que lo hacen fiable (y son las de la casa):
 *
 *   1. **Sólo cuentan las catas limpias.** Una arena contaminada (el
 *      compromiso no verifica) no entra: no se sabe quién ganó de verdad.
 *   2. **Un paladar necesita catas.** Por debajo de `MINIMO_CATAS` de un motor
 *      en una categoría, ese motor no propone nada: hay una impresión, no un
 *      paladar.
 *   3. **Gana el que gana de verdad.** La tasa de victoria tiene que pasar
 *      la mitad. Un motor que gana 1 de 3 no es el elegido de nadie.
 *   4. **El número va siempre al lado.** Aunque no proponga, la cuenta está:
 *      se ven las catas, las ganadas y la tasa.
 *
 * Y el paladar no manda sobre la persona: el router primero pregunta por el
 * veredicto exacto de la persona, luego por el paladar de la categoría, y
 * sólo si no hay nada, decide el router (core/router/aprende.ts).
 *
 * Referencia: estandar/arena.spec.yaml, core/arena/arena.ts, docs/ARENA.md.
 */
import { juzgaArena, mapaDe, type Arena, type CategoriaArena } from "./arena.ts";

/** Cuántas catas hacen falta para que un motor tenga paladar. */
export const MINIMO_CATAS = 3;

/** Lo que el paladar sabe de un motor en una categoría. */
export interface CataMotor {
  /** Cuántas catas hizo el motor en esa categoría. */
  catas: number;
  /** Cuántas ganó. */
  ganadas: number;
  /** La tasa de victoria (0-1). */
  tasa: number;
}

/** El paladar: categoría → motor → lo que se sabe de él. */
export type Paladar = Record<string, Record<string, CataMotor>>;

/** Una propuesta del paladar: el motor que gana esa categoría. */
export interface PropuestaPaladar {
  /** La categoría. */
  categoria: string;
  /** El motor propuesto. */
  motor: string;
  /** Las catas que tuvo. */
  catas: number;
  /** Las ganadas. */
  ganadas: number;
  /** La tasa. */
  tasa: number;
}

/**
 * Agrega un montón de arenas en un paladar.
 *
 * Sólo cuentan las arenas limpias y reveladas (con veredicto). Las que no,
 * no entran — ni para bien ni para mal: una cata que no se puede verificar es
 * un número que no existe.
 */
export function agregaPaladar(arenas: readonly Arena[]): Paladar {
  const paladar: Paladar = {};
  for (const arena of arenas) {
    const juicio = juzgaArena(arena);
    if (!juicio.ok || juicio.integridad !== "limpia") continue;
    if (!arena.veredicto) continue;
    const mapa = mapaDe(arena);
    const motor = mapa[arena.veredicto.elegida];
    if (!motor) continue;

    const categoria = arena.categoria;
    const porMotor = paladar[categoria] ?? (paladar[categoria] = {});
    // el que ganó suma su victoria; los demás sólo cuentan su cata
    for (const participante of arena.participantes) {
      const quien = mapa[participante.etiqueta];
      if (!quien) continue;
      const cata = porMotor[quien] ?? (porMotor[quien] = { catas: 0, ganadas: 0, tasa: 0 });
      cata.catas += 1;
      if (participante.etiqueta === arena.veredicto.elegida) cata.ganadas += 1;
    }
  }
  for (const porMotor of Object.values(paladar)) {
    for (const cata of Object.values(porMotor)) {
      cata.tasa = cata.catas ? cata.ganadas / cata.catas : 0;
    }
  }
  return paladar;
}

/**
 * Lo que el paladar propone para una categoría.
 *
 * Sólo propone si hay motor con catas de sobra Y con la tasa por encima de
 * la mitad. Si hay varios, gana el de más tasa; a igualdad, el de más catas
 * (más cata, menos suerte).
 */
export function proponePaladar(paladar: Paladar, categoria: string): PropuestaPaladar | null {
  const porMotor = paladar[categoria];
  if (!porMotor) return null;
  let mejor: PropuestaPaladar | null = null;
  for (const [motor, cata] of Object.entries(porMotor)) {
    if (cata.catas < MINIMO_CATAS) continue;
    if (cata.tasa <= 0.5) continue;
    const propuesta: PropuestaPaladar = {
      categoria,
      motor,
      catas: cata.catas,
      ganadas: cata.ganadas,
      tasa: cata.tasa,
    };
    if (
      !mejor ||
      propuesta.tasa > mejor.tasa ||
      (propuesta.tasa === mejor.tasa && propuesta.catas > mejor.catas)
    ) {
      mejor = propuesta;
    }
  }
  return mejor;
}

/** Las categorías que el paladar sabe algo (con su cuenta). */
export function resumenPaladar(paladar: Paladar): Array<{
  categoria: string;
  motores: Array<{ motor: string; catas: number; ganadas: number; tasa: number }>;
  propuesta: PropuestaPaladar | null;
}> {
  return Object.keys(paladar)
    .sort()
    .map((categoria) => {
      const porMotor = paladar[categoria];
      const motores = Object.keys(porMotor)
        .sort()
        .map((motor) => ({
          motor,
          catas: porMotor[motor].catas,
          ganadas: porMotor[motor].ganadas,
          tasa: porMotor[motor].tasa,
        }));
      return { categoria, motores, propuesta: proponePaladar(paladar, categoria) };
    });
}

/**
 * El paladar como lo que el router sabe: categoría → motor.
 *
 * Sólo las propuestas que pasan el listón (catas de sobra y tasa por encima
 * de la mitad). Lo demás no se enseña: un paladar con miedo no es un paladar.
 */
export function paladarParaRouter(
  paladar: Paladar
): Record<string, { motor: string; catas: number; ganadas: number }> {
  const salida: Record<string, { motor: string; catas: number; ganadas: number }> = {};
  for (const categoria of Object.keys(paladar)) {
    const propuesta = proponePaladar(paladar, categoria);
    if (!propuesta) continue;
    salida[categoria] = {
      motor: propuesta.motor,
      catas: propuesta.catas,
      ganadas: propuesta.ganadas,
    };
  }
  return salida;
}

/** La categoría de una tarea, si se puede saber (si no, `libre`). */
export function categoriaDe(tarea: string): CategoriaArena {
  const texto = (tarea ?? "").toLowerCase();
  const reglas: Array<[CategoriaArena, RegExp]> = [
    ["pruebas", /\b(test|tests|prueba|pruebas|bug|falla|error)\w*/],
    ["docs", /\b(doc|docs|documentaci|readme|manual)\w*/],
    ["refactor", /\b(refactor|limpia|reorganiza|simplifica)\w*/],
    ["diseno", /\b(dise|diseñ|arquitectur|api|contrato)\w*/],
    ["investigacion", /\b(investiga|busca|compara|analiza|estudio)\w*/],
    ["codigo", /\b(codigo|código|implementa|escribe|programa|funci[oó]n|bugfix)\w*/],
  ];
  for (const [categoria, patron] of reglas) {
    if (patron.test(texto)) return categoria;
  }
  return "libre";
}
