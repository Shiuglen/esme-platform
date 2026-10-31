/**
 * EL LIENZO DE PARTIDA — lo que trae una sección con la vista `esme.lienzo`:
 * un fichero JSON Canvas 1.0 (https://jsoncanvas.org/spec/1.0/) que la app
 * abre tal cual la primera vez. Lo escribe otro y lo enseña la app, así que
 * es más estricto que la spec, y con topes (abrir luego es fácil; cerrar,
 * no: lo que hoy vale tiene que seguir valiendo).
 *
 *   - Arriba, `nodes` y `edges`, y nada más.
 *   - En cada pieza y cada conexión, las claves de la spec para su clase, y
 *     lo propio de Esme, que también es una lista cerrada: en una pieza, su
 *     tipo (`esme:tipo`, el que casa con su clase), su altura sobre el plano
 *     (`esme:z`) y su grosor (`esme:profundidad`); en una conexión, si es un
 *     flujo (`esme:tipo`) y su orden (`esme:orden`). `esme:tarea` apunta al
 *     Taller de quien lo hizo, y en un lienzo de partida no va.
 *   - Los ids, de 1 a 64 letras, cifras, «-» o «_», sin repetir entre
 *     piezas y conexiones. La posición y el tamaño, enteros y dentro del plano.
 *   - Las rutas (`file`, `background`), del paquete y desde su raíz (no desde
 *     la carpeta del lienzo), que estén, y de una clase que el lienzo sabe
 *     enseñar: nada de html, svg ni código.
 *   - Los enlaces, https a un dominio de internet (ni una IP, ni localhost, ni
 *     la red de casa) y sin usuario ni contraseña.
 *   - Nada invisible que mande en ningún texto; el de una pieza es Markdown y
 *     puede llevar tabuladores y saltos de línea.
 *
 * Sin zod: lo usan el manifiesto, al mirar los ficheros, y la app.
 *
 * Referencia: estandar/paquete.spec.yaml (`oficio.lienzo`), docs/PAQUETES.md.
 */
import { oLista } from "./oficio.ts";
import { INVISIBLES, limpia, rutaDentro } from "./permisos.ts";

/** La vista que enseña un lienzo, y la única que trae uno de partida. */
export const VISTA_LIENZO = "esme.lienzo";
export const EXTENSION_LIENZO = ".canvas";

/** Las cuatro clases de pieza de JSON Canvas 1.0. */
export const TIPOS_PIEZA = ["text", "file", "link", "group"] as const;
export type TipoPieza = (typeof TIPOS_PIEZA)[number];
/** Los lados de una pieza de donde sale o adonde llega una conexión. */
export const LADOS = ["top", "right", "bottom", "left"] as const;
/** Cómo acaba una conexión por cada lado. */
export const EXTREMOS = ["none", "arrow"] as const;
/** Cómo se pinta la imagen de fondo de un grupo (`backgroundStyle`). */
export const FONDOS = ["cover", "ratio", "repeat"] as const;

/** Las imágenes que valen de fondo de un grupo. */
export const FORMATOS_FONDO = ["png", "jpg", "jpeg", "webp", "gif", "avif"] as const;
/** Lo que una pieza `file` puede enseñar: texto, PDF, imagen, audio y vídeo. */
export const FORMATOS_FICHERO = ["md", "txt", "pdf", ...FORMATOS_FONDO, "mp3", "m4a", "ogg", "wav", "mp4", "webm"] as const;

/** La propia máquina y los nombres de la red de casa: un enlace de partida no va a ellos. */
export const DOMINIOS_LOCALES = ["localhost", "local", "internal", "home.arpa"] as const;

/** Lo propio de Esme en una pieza o una conexión va con este prefijo. */
export const PREFIJO_PROPIO = "esme:";

/** Lo propio de Esme que lleva una pieza: su tipo, su altura sobre el plano y su grosor. */
export const PROPIAS_PIEZA = ["esme:tipo", "esme:z", "esme:profundidad"] as const;
/** Lo propio de Esme que lleva una conexión: si es un flujo, y su orden. */
export const PROPIAS_CONEXION = ["esme:tipo", "esme:orden"] as const;
/**
 * Lo propio de Esme que apunta al Taller de quien hizo el lienzo (una tarea
 * suya): quien abre la plantilla no lo tiene, y podría dar con una tarea suya
 * que se llame igual. Un lienzo de partida va sin ello.
 */
export const PROPIAS_DEL_TALLER = ["esme:tarea"] as const;

/**
 * Los tipos de Esme: los de una pieza, según su clase de JSON Canvas, y el
 * de una conexión (sin tipo, una conexión es un enlace).
 */
export const TIPOS_ESME = {
  piezas: { text: ["nota", "tarea"], file: ["documento", "imagen"], link: ["enlace"], group: ["grupo"] },
  conexiones: ["flujo"],
} as const satisfies { piezas: Record<TipoPieza, readonly string[]>; conexiones: readonly string[] };

/**
 * Los topes: lo que pesa el fichero, las piezas y las conexiones, los
 * caracteres de un texto de pieza y de una etiqueta (y de un subpath o la
 * orden de un flujo), el borde del plano (x, y y la z, a cada lado del
 * cero), el lado de una pieza, su grosor (desde 0: una pieza plana) y lo
 * largo de una URL.
 */
export const TOPES_LIENZO = {
  bytes: 256 * 1024,
  piezas: 200,
  conexiones: 400,
  texto: 4000,
  etiqueta: 120,
  coordenada: 1_000_000,
  medida: 100_000,
  profundidad: 100_000,
  url: 2048,
} as const;

/**
 * Si una ruta (ya limpia) está en el paquete: true, null si no está, o el
 * motivo por el que no se puede leer (la capa de disco lo dice con la ruta).
 */
export type HayRuta = (ruta: string) => true | null | { error: string };

/** La ruta de un lienzo de partida: un `.canvas` del paquete, con nombre. */
export const esRutaLienzo = (r: string): boolean => rutaDentro(r) && /(?:^|\/)[^/]+\.canvas$/.test(r);

const T = TOPES_LIENZO;

const M = {
  bytes: (n: number) => `pesa ${n} bytes, y un lienzo de partida pesa como mucho ${T.bytes}`,
  json: "no es JSON que se pueda leer",
  objeto: "un lienzo es un objeto con nodes y edges (JSON Canvas 1.0)",
  arriba: (k: string) => `clave desconocida «${k}»: arriba solo van nodes y edges`,
  nodes: "nodes: una lista de piezas",
  edges: "edges: una lista de conexiones",
  piezas: `nodes: como mucho ${T.piezas} piezas`,
  conexiones: `edges: como mucho ${T.conexiones} conexiones`,
  pieza: "una pieza es un objeto",
  conexion: "una conexión es un objeto",
  falta: (k: string) => `le falta «${k}»`,
  id: "un id de 1 a 64 letras, cifras, «-» o «_»",
  repetido: (id: string) => `«${id}» está repetido`,
  deUnaPieza: (id: string) => `«${id}» ya es el id de una pieza`,
  noEsPieza: (id: string) => `«${id}» no es una pieza del lienzo`,
  tipo: oLista(TIPOS_PIEZA),
  coordenada: `un entero de -${T.coordenada} a ${T.coordenada}`,
  medida: `un entero de 1 a ${T.medida}`,
  color: "un color de los seis («1» a «6») o #RRGGBB",
  texto: `un texto de hasta ${T.texto} caracteres, sin nada invisible que mande`,
  etiqueta: `una etiqueta de hasta ${T.etiqueta} caracteres, sin nada invisible`,
  ruta: "una ruta del paquete es relativa, con «/», y no sale con «..»",
  fichero: `un fichero que el lienzo sabe enseñar: ${oLista(FORMATOS_FICHERO)}`,
  fondo: `una imagen: ${oLista(FORMATOS_FONDO)}`,
  noEsta: (r: string) => `«${r}» no está en el paquete`,
  subpath: `empieza por «#», de hasta ${T.etiqueta} caracteres y sin nada invisible`,
  estilo: oLista(FONDOS),
  url: `una URL https de hasta ${T.url} caracteres, sin usuario ni contraseña ni nada invisible`,
  dominio: (h: string) =>
    `«${h}» no es un dominio de internet (ni una IP, ni ${DOMINIOS_LOCALES[0]}, ni ${oLista(DOMINIOS_LOCALES.slice(1).map((d) => `.${d}`))})`,
  lado: oLista(LADOS),
  extremo: oLista(EXTREMOS),
  desconocida: (k: string, ejemplo: string) => `clave desconocida «${k}» (lo propio de Esme va con el prefijo ${PREFIJO_PROPIO}, como ${ejemplo})`,
  propiaDesconocida: (k: string, donde: string, validas: readonly string[]) =>
    `clave propia desconocida «${k}»: en ${donde}, lo de Esme es ${oLista(validas)}`,
  delTaller: "apunta a una tarea de tu Taller, que quien abre la plantilla no tiene: un lienzo de partida va sin ella",
  tipoPieza: (clase: TipoPieza) => `una pieza ${clase} es ${oLista(TIPOS_ESME.piezas[clase])}`,
  imagen: `una imagen va en un fichero ${oLista(FORMATOS_FONDO)}`,
  z: `un entero de -${T.coordenada} a ${T.coordenada}, en las unidades de x e y`,
  profundidad: `un entero de 0 a ${T.profundidad}`,
  tipoConexion: `una conexión de Esme es un ${oLista(TIPOS_ESME.conexiones)}, o no lleva tipo (y es un enlace)`,
  orden: `la orden de un flujo, de 1 a ${T.etiqueta} caracteres y sin nada invisible`,
  flujoSinOrden: "le falta «esme:orden»: un flujo lleva su orden",
  ordenSinFlujo: "una orden va en un flujo (esme:tipo «flujo»)",
};

type Objeto = Record<string, unknown>;

const esObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);
const de = (lista: readonly string[], v: unknown): boolean => typeof v === "string" && lista.includes(v);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const esId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const esEntero = (v: unknown, min: number, max: number): boolean =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const esColor = (v: unknown): boolean => typeof v === "string" && /^(?:[1-6]|#[0-9A-Fa-f]{6})$/.test(v);
const esEtiqueta = (v: unknown): v is string => typeof v === "string" && v.length <= T.etiqueta && !INVISIBLES.test(v);
/** Markdown: los tabuladores y los saltos de línea valen; lo demás que no se ve y manda, no. */
const esTexto = (v: unknown): boolean =>
  typeof v === "string" && v.length <= T.texto && !INVISIBLES.test(v.replace(/[\t\n\r]/g, ""));
const esSubpath = (v: unknown): boolean => esEtiqueta(v) && v.startsWith("#");
/** La orden de un flujo: una línea con algo escrito, de hasta 120. */
const esOrden = (v: unknown): boolean => esEtiqueta(v) && v.trim() !== "";
const extension = (r: string): string => /\.([^./]+)$/.exec(r)?.[1].toLowerCase() ?? "";
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Por qué no vale un enlace, o null si vale. */
function problemaDeUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > T.url || /\s/.test(v) || INVISIBLES.test(v)) return M.url;
  if (!v.startsWith("https://") || !URL.canParse(v)) return M.url;
  const url = new URL(v);
  if (url.username !== "" || url.password !== "") return M.url;
  const host = url.hostname;
  const nombre = host.endsWith(".") ? host.slice(0, -1) : host;
  const local = DOMINIOS_LOCALES.some((d) => nombre === d || nombre.endsWith(`.${d}`));
  // la URL ya ha pasado a decimal una IPv4 escrita de otra manera: 0x7f.1 llega como 127.0.0.1
  if (host.startsWith("[") || IPV4.test(nombre) || !nombre.includes(".") || local) return M.dominio(host);
  return null;
}

/** Las claves de todas las piezas, y las que pide y admite cada clase. */
const COMUNES = ["id", "type", "x", "y", "width", "height"] as const;
const CLASES: Record<TipoPieza, { piden: readonly string[]; admiten: readonly string[] }> = {
  text: { piden: ["text"], admiten: [] },
  file: { piden: ["file"], admiten: ["subpath"] },
  link: { piden: ["url"], admiten: [] },
  group: { piden: [], admiten: ["label", "background", "backgroundStyle"] },
};
const CONEXION = { piden: ["id", "fromNode", "toNode"], admiten: ["fromSide", "fromEnd", "toSide", "toEnd", "color", "label"] } as const;

/** Cómo se dice un problema de una pieza o una conexión: entera (`nodes.2: …`) o de un campo (`nodes.2.file: …`). */
interface Dice {
  todo: (motivo: string) => void;
  campo: (campo: string, motivo: string) => void;
}
const diceEn = (sitio: string, problemas: string[]): Dice => ({
  todo: (motivo) => void problemas.push(`${sitio}: ${motivo}`),
  campo: (campo, motivo) => void problemas.push(`${sitio}.${campo}: ${motivo}`),
});

/** Las claves que no son de la spec para lo que es, ni propias (`ejemplo` es una propia que sí vale ahí). */
function revisaClaves(o: Objeto, validas: readonly string[], ejemplo: string, dice: Dice): void {
  for (const k of Object.keys(o)) if (!k.startsWith(PREFIJO_PROPIO) && !validas.includes(k)) dice.todo(M.desconocida(k, ejemplo));
}

/** Las claves propias que no son de la lista de lo que es (`donde`), o que apuntan al Taller de quien lo hizo. */
function revisaNombresPropios(o: Objeto, validas: readonly string[], donde: string, dice: Dice): void {
  for (const k of Object.keys(o)) {
    if (!k.startsWith(PREFIJO_PROPIO)) continue;
    if ((PROPIAS_DEL_TALLER as readonly string[]).includes(k)) dice.campo(k, M.delTaller);
    else if (!validas.includes(k)) dice.todo(M.propiaDesconocida(k, donde, validas));
  }
}

/** Una ruta de dentro del lienzo: del paquete, de una de estas clases, y que esté. */
function revisaRuta(v: unknown, campo: string, formatos: readonly string[], motivoFormato: string, hay: HayRuta, dice: Dice): void {
  if (typeof v !== "string" || !rutaDentro(v)) return dice.campo(campo, M.ruta);
  if (!formatos.includes(extension(v))) return dice.campo(campo, motivoFormato);
  const esta = hay(limpia(v));
  if (esta === null) dice.campo(campo, M.noEsta(v));
  else if (esta !== true) dice.campo(campo, esta.error);
}

/**
 * Una pieza. Devuelve si su id sirve para mirar las conexiones: si falta, no
 * vale o está repetido, lo que dijeran de ellas sería el eco de ese problema.
 */
function revisaPieza(n: unknown, ids: Set<string>, hay: HayRuta, dice: Dice): boolean {
  if (!esObjeto(n)) {
    dice.todo(M.pieza);
    return false;
  }
  const tiene = (k: string): boolean => Object.hasOwn(n, k);
  for (const k of COMUNES) if (!tiene(k)) dice.todo(M.falta(k));

  let fiable = false;
  if (tiene("id")) {
    if (!esId(n.id)) dice.campo("id", M.id);
    else if (ids.has(n.id)) dice.campo("id", M.repetido(n.id));
    else {
      ids.add(n.id);
      fiable = true;
    }
  }
  const clase = de(TIPOS_PIEZA, n.type) ? (n.type as TipoPieza) : null;
  if (tiene("type") && clase === null) dice.campo("type", M.tipo);
  for (const k of ["x", "y"]) if (tiene(k) && !esEntero(n[k], -T.coordenada, T.coordenada)) dice.campo(k, M.coordenada);
  for (const k of ["width", "height"]) if (tiene(k) && !esEntero(n[k], 1, T.medida)) dice.campo(k, M.medida);
  if (tiene("color") && !esColor(n.color)) dice.campo("color", M.color);

  // lo de su clase, y las claves de más: sin una clase que valga no se sabe cuáles son
  if (clase !== null) {
    const { piden, admiten } = CLASES[clase];
    for (const k of piden) if (!tiene(k)) dice.todo(M.falta(k));
    if (clase === "text" && tiene("text") && !esTexto(n.text)) dice.campo("text", M.texto);
    if (clase === "file") {
      if (tiene("file")) revisaRuta(n.file, "file", FORMATOS_FICHERO, M.fichero, hay, dice);
      if (tiene("subpath") && !esSubpath(n.subpath)) dice.campo("subpath", M.subpath);
    }
    if (clase === "link" && tiene("url")) {
      const motivo = problemaDeUrl(n.url);
      if (motivo !== null) dice.campo("url", motivo);
    }
    if (clase === "group") {
      if (tiene("label") && !esEtiqueta(n.label)) dice.campo("label", M.etiqueta);
      if (tiene("background")) revisaRuta(n.background, "background", FORMATOS_FONDO, M.fondo, hay, dice);
      if (tiene("backgroundStyle") && !de(FONDOS, n.backgroundStyle)) dice.campo("backgroundStyle", M.estilo);
    }
    revisaClaves(n, [...COMUNES, "color", ...piden, ...admiten], "esme:z", dice);
  }
  revisaPropiosDePieza(n, clase, dice);
  return fiable;
}

/**
 * Lo propio de Esme de una pieza: su tipo, que casa con su clase (sin una
 * clase que valga, o con un fichero que no vale, no se dice: sería su eco),
 * y su z y su profundidad, enteros.
 */
function revisaPropiosDePieza(n: Objeto, clase: TipoPieza | null, dice: Dice): void {
  revisaNombresPropios(n, PROPIAS_PIEZA, "una pieza", dice);
  const tiene = (k: string): boolean => Object.hasOwn(n, k);
  if (tiene("esme:tipo") && clase !== null) {
    const tipo = n["esme:tipo"];
    if (!de(TIPOS_ESME.piezas[clase], tipo)) dice.campo("esme:tipo", M.tipoPieza(clase));
    else if (tipo === "imagen" && typeof n.file === "string") {
      const formato = extension(n.file);
      const fichero = (FORMATOS_FICHERO as readonly string[]).includes(formato);
      if (fichero && !(FORMATOS_FONDO as readonly string[]).includes(formato)) dice.campo("esme:tipo", M.imagen);
    }
  }
  if (tiene("esme:z") && !esEntero(n["esme:z"], -T.coordenada, T.coordenada)) dice.campo("esme:z", M.z);
  if (tiene("esme:profundidad") && !esEntero(n["esme:profundidad"], 0, T.profundidad)) dice.campo("esme:profundidad", M.profundidad);
}

/**
 * Lo propio de Esme de una conexión: un flujo lleva su orden y una orden va
 * en un flujo. Con un tipo que no vale, la orden no se dice otra vez.
 */
function revisaPropiosDeConexion(e: Objeto, dice: Dice): void {
  revisaNombresPropios(e, PROPIAS_CONEXION, "una conexión", dice);
  const tiene = (k: string): boolean => Object.hasOwn(e, k);
  const tipo = e["esme:tipo"];
  const tipoValido = de(TIPOS_ESME.conexiones, tipo);
  if (tiene("esme:tipo") && !tipoValido) dice.campo("esme:tipo", M.tipoConexion);
  if (tiene("esme:orden") && !esOrden(e["esme:orden"])) dice.campo("esme:orden", M.orden);
  if (tipoValido && tipo === "flujo" && !tiene("esme:orden")) dice.todo(M.flujoSinOrden);
  if (tiene("esme:orden") && !tiene("esme:tipo")) dice.campo("esme:orden", M.ordenSinFlujo);
}

/** Una conexión: entre dos piezas del lienzo (si sus ids se pueden mirar), con lados y extremos de la lista. */
function revisaConexion(e: unknown, piezas: ReadonlySet<string>, fiables: boolean, ids: Set<string>, dice: Dice): void {
  if (!esObjeto(e)) return dice.todo(M.conexion);
  const tiene = (k: string): boolean => Object.hasOwn(e, k);
  for (const k of CONEXION.piden) if (!tiene(k)) dice.todo(M.falta(k));
  if (tiene("id")) {
    if (!esId(e.id)) dice.campo("id", M.id);
    else if (ids.has(e.id)) dice.campo("id", M.repetido(e.id));
    else if (piezas.has(e.id)) dice.campo("id", M.deUnaPieza(e.id));
    else ids.add(e.id);
  }
  for (const k of ["fromNode", "toNode"]) {
    if (!tiene(k)) continue;
    const v = e[k];
    if (!esId(v)) dice.campo(k, M.id);
    else if (fiables && !piezas.has(v)) dice.campo(k, M.noEsPieza(v));
  }
  for (const k of ["fromSide", "toSide"]) if (tiene(k) && !de(LADOS, e[k])) dice.campo(k, M.lado);
  for (const k of ["fromEnd", "toEnd"]) if (tiene(k) && !de(EXTREMOS, e[k])) dice.campo(k, M.extremo);
  if (tiene("color") && !esColor(e.color)) dice.campo("color", M.color);
  if (tiene("label") && !esEtiqueta(e.label)) dice.campo("label", M.etiqueta);
  revisaClaves(e, [...CONEXION.piden, ...CONEXION.admiten], "esme:orden", dice);
  revisaPropiosDeConexion(e, dice);
}

/**
 * Lo que no vale de un lienzo de partida, cada cosa con su sitio
 * (`nodes.2.file: …`); vacío si vale. `hay` dice si una ruta de dentro está
 * en el paquete. Primero lo que pesa, luego que se lea, y luego todo lo demás.
 */
export function problemasDelLienzo(texto: string, hay: HayRuta): string[] {
  const bytes = new TextEncoder().encode(texto).length;
  if (bytes > T.bytes) return [M.bytes(bytes)];
  let leido: unknown;
  try {
    leido = JSON.parse(texto);
  } catch {
    return [M.json];
  }
  if (!esObjeto(leido)) return [M.objeto];
  const lienzo: Objeto = leido;

  const problemas: string[] = [];
  for (const k of Object.keys(lienzo)) if (k !== "nodes" && k !== "edges") problemas.push(M.arriba(k));

  /** Una lista de arriba: vacía si no está, y null si no es una lista o pasa del tope (ya dicho). */
  const lista = (clave: "nodes" | "edges", noEsLista: string, tope: number, demasiadas: string): unknown[] | null => {
    const v = Object.hasOwn(lienzo, clave) ? lienzo[clave] : [];
    if (!Array.isArray(v)) problemas.push(noEsLista);
    else if (v.length > tope) problemas.push(demasiadas);
    else return v;
    return null;
  };

  const nodes = lista("nodes", M.nodes, T.piezas, M.piezas);
  const piezas = new Set<string>();
  let fiables = nodes !== null;
  for (const [i, n] of (nodes ?? []).entries()) if (!revisaPieza(n, piezas, hay, diceEn(`nodes.${i}`, problemas))) fiables = false;

  const edges = lista("edges", M.edges, T.conexiones, M.conexiones);
  const conexiones = new Set<string>();
  for (const [i, e] of (edges ?? []).entries()) revisaConexion(e, piezas, fiables, conexiones, diceEn(`edges.${i}`, problemas));
  return problemas;
}
