/**
 * EL OFICIO — lo que una plantilla monta al abrirla, sin zod.
 *
 * Una plantilla junta paquetes en una forma de trabajar; su `oficio` dice
 * cómo se ve esa forma al abrirla (el diseño de la interfaz «Oficio»):
 *
 *   - su PIEL: un tema suyo o de un paquete que usa;
 *   - sus SECCIONES, en orden y con «hoy» la primera: cada una con su vista,
 *     de una lista conocida, y, si la vista lista tareas, su filtro;
 *   - sus ÓRDENES: comandos suyos o de sus paquetes, que se lanzan con un
 *     formulario.
 *
 * Y es cerrado, porque lo que monta lo pinta una app que no escribió quien
 * hizo la plantilla: con topes, ids en kebab-case, vistas de la lista (con
 * una de reserva para la app que aún no tenga alguna), filtros de una lista
 * sobre el estado y la etiqueta de una tarea, nada de expresiones, y
 * órdenes cuyos campos dicen su tipo y no dejan huecos libres. Abrir más
 * tarde no rompe ninguna plantilla; cerrar sí.
 *
 * La forma la valida `manifiesto.ts`, con zod; aquí están las listas, las
 * piezas que no lo necesitan y lo que se mira entre paquetes (el resolver).
 *
 * Referencia: estandar/paquete.spec.yaml (sección `oficio`), docs/PAQUETES.md.
 */
import { INVISIBLES } from "./permisos.ts";

/** Las vistas que se conocen. La app que aún no tenga alguna enseña la de reserva. */
export const VISTAS = ["esme.hoy", "esme.tareas", "esme.memoria", "esme.terminal", "esme.mesa"] as const;
export type Vista = (typeof VISTAS)[number];

/** Las que listan tareas: las únicas que admiten un filtro. */
export const VISTAS_CON_FILTRO = ["esme.hoy", "esme.tareas"] as const satisfies readonly Vista[];

/** La que se enseña cuando la app no tiene la que se nombra. */
export const VISTA_DE_RESERVA: Vista = "esme.tareas";

/** Los estados de una tarea, como los cuenta Hoy. */
export const ESTADOS = ["te-necesita", "en-marcha", "terminado", "quieto"] as const;

/** Los tipos de un campo de una tarea. */
export const TIPOS_ENTRADA = ["text", "number", "choice"] as const;
export type TipoEntrada = (typeof TIPOS_ENTRADA)[number];

/** La sección que no falta nunca, y va la primera: tu día. */
export const PRIMERA = "hoy";

/** Los topes: secciones, órdenes, caracteres de un id o un nombre, options de un choice y campos de una orden. */
export const TOPES = { secciones: 12, ordenes: 40, largo: 32, opciones: 20, campos: 10 } as const;

/** «a, b o c». */
const oLista = (xs: readonly string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} o ${xs[xs.length - 1]}` : xs.join(""));

export const MOTIVOS_OFICIO = {
  plantilla: "oficio es de las plantillas: un paquete aporta piezas, y la plantilla dice cómo se montan",
  objeto: "el oficio es un objeto: piel, secciones y ordenes",
  secciones: "una lista de secciones, con «hoy» la primera",
  id: `un id en kebab-case, de hasta ${TOPES.largo}: minúsculas y cifras, con guiones sueltos («escritos», «por-revisar»)`,
  nombre: `un nombre de 1 a ${TOPES.largo} caracteres, sin espacios a los lados ni nada invisible`,
  vista: `una vista de la lista: ${VISTAS.join(", ")} (la app que no tenga la que se nombra enseña ${VISTA_DE_RESERVA})`,
  filtro: `un filtro de la lista: estado:${ESTADOS.join("|")} o etiqueta:<kebab-case>; nada de expresiones`,
  orden: "una orden es un comando de la plantilla («burofax») o de un paquete que usa («esme.ana.cartas/carta»)",
  piel: "una piel es un tema de la plantilla («sobria») o de un paquete que usa («esme.casa.piel-sobria/sobria»)",
  tipo: `type es ${oLista(TIPOS_ENTRADA)}`,
} as const;

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Un id en kebab-case de hasta 32: minúsculas y cifras, con guiones sueltos. */
export const esKebab = (s: string): boolean => s.length <= TOPES.largo && KEBAB.test(s);

/** Un texto corto que se enseña tal cual: de 1 a 32, sin espacios a los lados ni nada invisible. */
export const esTextoCorto = (s: string): boolean =>
  s.length >= 1 && s.length <= TOPES.largo && s.trim() === s && !INVISIBLES.test(s);

export const esVista = (v: string): v is Vista => (VISTAS as readonly string[]).includes(v);

/** Un filtro de la lista: `estado:<uno de ESTADOS>` o `etiqueta:<kebab-case>`. Nada de expresiones. */
export function esFiltro(f: string): boolean {
  const i = f.indexOf(":");
  if (i < 0) return false;
  const [clave, valor] = [f.slice(0, i), f.slice(i + 1)];
  if (clave === "estado") return (ESTADOS as readonly string[]).includes(valor);
  return clave === "etiqueta" && esKebab(valor);
}

/** Un número como se escribe en un `default`: entero o con punto (`7`, `-2`, `2.5`). */
export const esNumero = (s: string): boolean => /^-?\d+(\.\d+)?$/.test(s);

/** Una sección del oficio. */
export interface Seccion {
  id: string;
  nombre: string;
  vista?: string;
  filtro?: string;
}

/** El oficio de una plantilla. */
export interface Oficio {
  piel?: string;
  secciones: readonly Seccion[];
  ordenes: readonly string[];
}

/** Un campo de una tarea (sus `inputs`). */
export interface Campo {
  key: string;
  description?: string;
  required?: boolean;
  default?: string;
  type?: string;
  options?: readonly string[];
}

/** Una tarea, como la mira una orden. */
export interface TareaDeOrden {
  prompt: string;
  steps?: readonly string[];
  inputs?: readonly Campo[];
}

/** Lo que el oficio mira de un paquete que usa: sus temas, sus comandos y sus tareas. */
export interface PaqueteParaOficio {
  id: string;
  contributes: {
    themes?: ReadonlyArray<{ id: string }>;
    commands?: ReadonlyArray<{ id: string; task: string }>;
    tasks?: ReadonlyArray<TareaDeOrden & { id: string }>;
  };
}

/** Un problema de forma, con su camino dentro de lo que se mira. */
export interface Problema {
  camino: (string | number)[];
  mensaje: string;
}

/**
 * Lo que un campo con tipo tiene que cumplir, esté o no en una orden:
 * `options` solo con `choice`, y entonces de 2 a 20, sin repetir y cortas;
 * y su `default`, uno que valga para su tipo.
 */
export function problemasDeCampo(c: Campo): Problema[] {
  const p: Problema[] = [];
  if (c.options !== undefined && c.type !== "choice") p.push({ camino: ["options"], mensaje: "options solo va con type: choice" });
  if (c.type === "choice") {
    const opciones = c.options;
    if (!opciones) p.push({ camino: ["options"], mensaje: `type: choice lleva options (de 2 a ${TOPES.opciones})` });
    else {
      if (opciones.length < 2 || opciones.length > TOPES.opciones)
        p.push({ camino: ["options"], mensaje: `de 2 a ${TOPES.opciones} options (tiene ${opciones.length})` });
      const vistas = new Set<string>();
      opciones.forEach((o, i) => {
        if (!esTextoCorto(o))
          p.push({ camino: ["options", i], mensaje: `una option de 1 a ${TOPES.largo} caracteres, sin espacios a los lados ni nada invisible` });
        else if (vistas.has(o)) p.push({ camino: ["options", i], mensaje: `la option «${o}» está dos veces` });
        vistas.add(o);
      });
      if (c.default !== undefined && !opciones.includes(c.default))
        p.push({ camino: ["default"], mensaje: "el default de un choice es una de sus options" });
    }
  }
  if (c.type === "number" && c.default !== undefined && !esNumero(c.default))
    p.push({ camino: ["default"], mensaje: "el default de un number es un número (como 7, -2 o 2.5)" });
  return p;
}

/** Los huecos `{{clave}}` de un texto, con espacios dentro o sin ellos (como los deja goose). */
const HUECO = /\{\{\s*([^{}]*?)\s*\}\}/g;

/**
 * Lo que impide lanzar una tarea como orden, con un formulario: como mucho
 * 10 campos, y cada uno dice su tipo y su etiqueta (`description`), se
 * rellena (nada de `required: false`), tiene una clave en kebab-case y sale
 * en el prompt o en sus pasos; y el prompt no tiene huecos que no sean
 * campos. Todo de una vez, en el orden en que se lee.
 */
export function problemasDeOrden(t: TareaDeOrden): string[] {
  const p: string[] = [];
  const campos = t.inputs ?? [];
  if (campos.length > TOPES.campos) p.push(`tiene ${campos.length} campos (como mucho ${TOPES.campos})`);
  const texto = [t.prompt, ...(t.steps ?? [])].join("\n");
  const huecos = new Set([...texto.matchAll(HUECO)].map((m) => m[1]));
  for (const c of campos) {
    if (c.type === undefined) p.push(`el campo «${c.key}» no dice su tipo (type: ${oLista(TIPOS_ENTRADA)})`);
    if (!c.description?.trim()) p.push(`el campo «${c.key}» no tiene description (es la etiqueta del campo)`);
    if (c.required === false)
      p.push(`el campo «${c.key}» es opcional (required: false): en una orden cada campo se rellena (si quieres, con su default)`);
    if (!esKebab(c.key)) p.push(`la clave «${c.key}» no es kebab-case (de hasta ${TOPES.largo})`);
    else if (!huecos.has(c.key)) p.push(`el campo «${c.key}» no sale en el prompt ({{${c.key}}})`);
  }
  const claves = new Set(campos.map((c) => c.key));
  for (const h of huecos) if (!claves.has(h)) p.push(`el prompt usa {{${h}}} y no hay un campo «${h}»`);
  return p;
}

/** Una referencia, partida: un id de la plantilla, o `<paquete>/<id>` de uno que usa. */
export function referencia(r: string): { paquete?: string; id: string } {
  const i = r.indexOf("/");
  return i < 0 ? { id: r } : { paquete: r.slice(0, i), id: r.slice(i + 1) };
}

/**
 * Lo que el oficio nombra de los paquetes que usa, mirado con lo resuelto:
 * el tema de la piel y el comando de cada orden existen, y la tarea de cada
 * orden se puede lanzar con un formulario. Un paquete que no se resolvió no
 * se mira: su error ya está dicho.
 */
export function problemasEntrePaquetes(oficio: Oficio, paquete: (id: string) => PaqueteParaOficio | undefined): string[] {
  const p: string[] = [];
  const piel = oficio.piel === undefined ? undefined : referencia(oficio.piel);
  const dePiel = piel?.paquete === undefined ? undefined : paquete(piel.paquete);
  if (piel && dePiel && !(dePiel.contributes.themes ?? []).some((t) => t.id === piel.id))
    p.push(`oficio.piel: ${dePiel.id} no trae el tema «${piel.id}»`);
  for (const orden of oficio.ordenes) {
    const ref = referencia(orden);
    const de = ref.paquete === undefined ? undefined : paquete(ref.paquete);
    if (!de) continue;
    const comando = (de.contributes.commands ?? []).find((c) => c.id === ref.id);
    if (!comando) {
      p.push(`oficio.ordenes: ${de.id} no trae el comando «${ref.id}»`);
      continue;
    }
    // un comando lanza una tarea de su paquete (la regla 8): si no está, ese paquete no valdría
    const tarea = (de.contributes.tasks ?? []).find((t) => t.id === comando.task);
    for (const x of tarea ? problemasDeOrden(tarea) : []) p.push(`oficio.ordenes: «${orden}» no vale como orden: ${x}`);
  }
  return p;
}
