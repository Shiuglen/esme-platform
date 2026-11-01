/**
 * LOS RECUERDOS DE PARTIDA — lo que el oficio de una plantilla ya sabe, y
 * deja en tu mente cuando aceptas su candado. Sin zod.
 *
 * Una plantilla de auditoría sabe que solo se audita con permiso firmado;
 * una de despacho, que los plazos se cuentan en días hábiles. Eso no es una
 * tarea ni un ajuste: es algo que tu mente tiene que saber desde el primer
 * día. Por eso una plantilla puede traer unos pocos `recuerdos`, de una
 * línea, cada uno con su id y su tipo (los de `remember`: nota, decisión o
 * preferencia).
 *
 * Escriben en tu mente, y lo que hay en tu mente condiciona lo que hace el
 * modelo. Así que:
 *
 *   - son de las plantillas: un paquete no escribe en tu mente al instalarse;
 *   - la PROCEDENCIA no la escribe la plantilla: la pone el kit, desde el
 *     candado que aceptaste (la plantilla, su versión y su huella), y cada
 *     recuerdo se conoce por `<plantilla>/<id>`, para cambiarlo o quitarlo;
 *   - entran con tu sí al aceptar el candado (la app los enseña antes);
 *   - sin la huella de la plantilla en el candado no se escriben: tu sí
 *     tiene que fijar lo que se escribe. Con ella, cualquier cambio de la
 *     plantilla (también en sus recuerdos) vuelve a preguntar;
 *   - se van con la plantilla (al quitarla, o cuando una versión nueva ya
 *     no los trae), salvo lo que hiciste tuyo: una versión nueva nunca pisa
 *     lo que cambiaste o quitaste.
 *
 * La forma la valida `manifiesto.ts`, con zod; aquí están las listas, los
 * topes, los motivos y lo que la app escribe (`recuerdosDePartida`).
 *
 * Referencia: estandar/paquete.spec.yaml (sección `recuerdos`),
 * core/ipc/mind-schema.ts (`remember`), core/paquetes/lock.ts, docs/PAQUETES.md.
 */
import type { Lock } from "./lock.ts";
import { oLista } from "./oficio.ts";
import { INVISIBLES } from "./permisos.ts";

/** Los tipos de un recuerdo, como los dice la plantilla. */
export const TIPOS_RECUERDO = ["nota", "decision", "preferencia"] as const;
export type TipoRecuerdo = (typeof TIPOS_RECUERDO)[number];

/** Cómo se dice cada tipo en la mente (`remember`, en core/ipc/mind-schema.ts). */
export const TIPO_EN_LA_MENTE = {
  nota: "note",
  decision: "decision",
  preferencia: "preference",
} as const satisfies Record<TipoRecuerdo, string>;

/** Los topes: cuántos recuerdos, y cuántos caracteres tiene cada uno. */
export const TOPES_RECUERDOS = { recuerdos: 20, texto: 280 } as const;

const T = TOPES_RECUERDOS;

export const MOTIVOS_RECUERDOS = {
  plantilla: "recuerdos es de las plantillas: un paquete no escribe en tu mente al instalarse",
  lista: `una lista de recuerdos, como mucho ${T.recuerdos}`,
  muchos: `como mucho ${T.recuerdos} recuerdos`,
  recuerdo: "un recuerdo es un objeto: id, texto y, si quieres, tipo",
  texto: `un texto de 1 a ${T.texto} caracteres, en una línea, sin espacios a los lados ni nada invisible`,
  tipo: `un tipo de la lista: ${oLista(TIPOS_RECUERDO)}`,
  procedencia: "la procedencia no la escribe la plantilla: la pone el kit, desde el candado que aceptaste",
  repetido: (id: string) => `el recuerdo «${id}» está dos veces`,
  mismoTexto: (id: string, otro: string) => `«${id}» dice lo mismo que «${otro}»`,
  ajeno: (delCandado: string, plantilla: string) =>
    `el candado es de ${delCandado}, no de ${plantilla}: sin tu sí, no se escribe nada en tu mente`,
  otraVersion: (delCandado: string, plantilla: string) =>
    `el candado es de la ${delCandado} y la plantilla es la ${plantilla}: hay que volver a pedir tu sí`,
  sinHuella: "el candado no tiene la huella de la plantilla: sin ella, tu sí no fija lo que se escribe en tu mente",
} as const;

/** El texto de un recuerdo: de 1 a 280, en una línea, sin espacios a los lados ni nada invisible. */
export const esTextoDeRecuerdo = (s: string): boolean =>
  s.length >= 1 && s.length <= T.texto && s.trim() === s && !INVISIBLES.test(s);

/** Dos textos que dicen lo mismo: iguales salvo las mayúsculas (y la forma de escribir los acentos). */
export const mismoTexto = (a: string): string => a.normalize("NFC").toLowerCase();

/** Un recuerdo, como lo trae la plantilla. */
export interface Recuerdo {
  id: string;
  texto: string;
  tipo?: TipoRecuerdo;
}

/** De dónde viene un recuerdo: del candado que la persona aceptó. */
export interface Procedencia {
  plantilla: string;
  version: string;
  huella: string;
}

/** Un recuerdo listo para la mente: el suyo, su tipo en la mente, su clave y su procedencia. */
export interface RecuerdoDePartida {
  id: string;
  /** `<plantilla>/<id>`: así se encuentra para cambiarlo o quitarlo. */
  clave: string;
  texto: string;
  tipo: TipoRecuerdo;
  kind: (typeof TIPO_EN_LA_MENTE)[TipoRecuerdo];
  procedencia: Procedencia;
}

/**
 * Los recuerdos de una plantilla, listos para la mente, con la procedencia
 * del candado que la persona aceptó. Lanza si ese candado no es el sí a ESTA
 * plantilla (otra, otra versión o sin su huella): sin ese sí, no se escribe
 * nada. La plantilla, ya leída (`leePaquete`): aquí no se vuelve a validar.
 */
export function recuerdosDePartida(
  plantilla: { id: string; version: string; recuerdos?: readonly Recuerdo[] },
  candado: Lock
): RecuerdoDePartida[] {
  const { raiz } = candado;
  if (raiz.id !== plantilla.id) throw new Error(MOTIVOS_RECUERDOS.ajeno(raiz.id, plantilla.id));
  if (raiz.version !== plantilla.version) throw new Error(MOTIVOS_RECUERDOS.otraVersion(raiz.version, plantilla.version));
  if (raiz.sha256 === undefined) throw new Error(MOTIVOS_RECUERDOS.sinHuella);
  const procedencia: Procedencia = { plantilla: raiz.id, version: raiz.version, huella: raiz.sha256 };
  return (plantilla.recuerdos ?? []).map((r) => {
    const tipo = r.tipo ?? "nota";
    return {
      id: r.id,
      clave: `${raiz.id}/${r.id}`,
      texto: r.texto,
      tipo,
      kind: TIPO_EN_LA_MENTE[tipo],
      procedencia: { ...procedencia },
    };
  });
}
