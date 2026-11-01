/**
 * EL CARÁCTER — cómo se siente una plantilla al abrirla, sin zod.
 *
 * El oficio dice qué monta una plantilla (su piel, sus secciones, sus
 * órdenes); su carácter, cómo se siente lo que monta (la decisión de jin del
 * 31 de octubre: la plantilla lo transforma todo, no solo el color):
 *
 *   - su LETRA (editorial, técnica o mixta), su DENSIDAD y su MOVIMIENTO;
 *   - su SONIDO: una paleta de la lista, o ninguna;
 *   - su VOCABULARIO: cómo se llaman en ese oficio las palabras que la app
 *     sabe cambiar («Hoy» es «Hoy en el despacho»; una tarea, un asunto);
 *   - su EQUIPO: quién hace qué, con su nombre, su rol y su carácter.
 *
 * El color no: es de la piel de quien la usa. Y quien la usa puede cambiarlo
 * todo en su propia capa, que no viaja en el manifiesto.
 *
 * Es cerrado por lo mismo que el oficio: lo pinta una app que no escribió
 * quien hizo la plantilla. Listas que la app sabe pintar, textos de una
 * línea con su tope, y nada a medias: un miembro lleva sus cuatro cosas.
 * Todo es opcional; lo que falta, lo pone la app (el carácter de Esme).
 *
 * La forma la valida `manifiesto.ts`, con zod; aquí están las listas, los
 * topes y los motivos, para el manifiesto, la spec y la app.
 *
 * Referencia: estandar/paquete.spec.yaml (sección `caracter`), docs/PAQUETES.md.
 */
import { oLista } from "./oficio.ts";
import { INVISIBLES } from "./permisos.ts";

/** La letra: editorial lee en serif; técnica, en una grotesca con datos en mono; mixta, las dos. */
export const LETRAS = ["editorial", "tecnica", "mixta"] as const;

/** Cuánto cabe en la pantalla. */
export const DENSIDADES = ["compacta", "comoda", "amplia"] as const;

/** Cómo se mueve: sobrio (preciso) o vivo (elástico). */
export const MOVIMIENTOS = ["sobrio", "vivo"] as const;

/** Las paletas de sonido que la app trae. Sin paleta (null), no suena. */
export const PALETAS = ["costura"] as const;

/** Las palabras que la app sabe cambiar (las de los estados, como los cuenta Hoy). */
export const PALABRAS = [
  "hoy",
  "tarea",
  "tareas",
  "asunto",
  "asuntos",
  "equipo",
  "te-necesita",
  "en-marcha",
  "terminado",
  "quieto",
  "encargar",
  "memoria",
] as const;

/** Los topes: miembros del equipo, y caracteres de un nombre, un rol, un carácter y una palabra. */
export const TOPES_CARACTER = { miembros: 12, nombre: 32, rol: 60, caracter: 120, palabra: 32 } as const;

const T = TOPES_CARACTER;
const LIMPIO = "sin espacios a los lados ni nada invisible";

export const MOTIVOS_CARACTER = {
  plantilla: "caracter es de las plantillas: es el de una forma de trabajar, no el de una pieza",
  objeto: "el carácter es un objeto: letra, densidad, movimiento, sonido, vocabulario y equipo",
  letra: `una letra de la lista: ${oLista(LETRAS)}`,
  densidad: `una densidad de la lista: ${oLista(DENSIDADES)}`,
  movimiento: `un movimiento de la lista: ${oLista(MOVIMIENTOS)}`,
  sonido: `el sonido es { paleta: ${PALETAS.join(" | ")} } o { paleta: null }`,
  paleta: `una paleta de la lista (${PALETAS.join(", ")}), o null: sin sonido`,
  vocabulario: "el vocabulario es un objeto: palabra → cómo se dice en este oficio",
  noPalabra: (p: string) => `«${p}» no es una palabra que la app sepa cambiar (${oLista(PALABRAS)})`,
  palabra: `una palabra de 1 a ${T.palabra} caracteres, ${LIMPIO}`,
  equipo: "una lista de miembros",
  miembro: "un miembro es un objeto: id, nombre, rol y carácter, los cuatro",
  nombre: `un nombre de 1 a ${T.nombre} caracteres, ${LIMPIO}`,
  rol: `un rol de 1 a ${T.rol} caracteres, ${LIMPIO}`,
  caracter: `un carácter de 1 a ${T.caracter} caracteres, ${LIMPIO}`,
  miembros: `como mucho ${T.miembros} miembros`,
  repetido: (id: string) => `el miembro «${id}» está dos veces`,
} as const;

/** Un texto de una línea que se enseña tal cual: de 1 a `tope`, sin espacios a los lados ni nada invisible. */
export const esLinea =
  (tope: number) =>
  (s: string): boolean =>
    s.length >= 1 && s.length <= tope && s.trim() === s && !INVISIBLES.test(s);

export const esPalabra = (p: string): p is (typeof PALABRAS)[number] => (PALABRAS as readonly string[]).includes(p);

/** Un miembro del equipo: quién es, qué hace y cómo es. */
export interface Miembro {
  id: string;
  nombre: string;
  rol: string;
  caracter: string;
}

/** El carácter de una plantilla. Todo opcional: lo que falta, lo pone la app. */
export interface Caracter {
  letra?: (typeof LETRAS)[number];
  densidad?: (typeof DENSIDADES)[number];
  movimiento?: (typeof MOVIMIENTOS)[number];
  sonido?: { paleta: (typeof PALETAS)[number] | null };
  vocabulario?: Partial<Record<(typeof PALABRAS)[number], string>>;
  equipo?: readonly Miembro[];
}
