/**
 * EL LIENZO DE PARTIDA — lo que trae una sección con la vista `esme.lienzo`:
 * un fichero JSON Canvas 1.0, cerrado y con topes. Las claves de la spec y
 * nada más, salvo lo propio de Esme con el prefijo `esme:` (la z y la
 * profundidad de una pieza, para lo espacial); las rutas, del paquete y que
 * estén; los enlaces, https.
 *
 * Lienzos sintéticos, escritos aquí mismo.
 *
 * Referencia: core/paquetes/lienzo.ts, https://jsoncanvas.org/spec/1.0/.
 */
import { describe, expect, it } from "vitest";
import {
  DOMINIOS_LOCALES,
  EXTENSION_LIENZO,
  EXTREMOS,
  FONDOS,
  FORMATOS_FICHERO,
  FORMATOS_FONDO,
  LADOS,
  PREFIJO_PROPIO,
  TIPOS_PIEZA,
  TOPES_LIENZO,
  VISTA_LIENZO,
  esRutaLienzo,
  problemasDelLienzo,
} from "../core/paquetes/lienzo.ts";

/** Un lienzo que vale: las cuatro clases de pieza, dos conexiones y lo propio de Esme. */
const LIENZO = {
  nodes: [
    {
      id: "grupo-hechos",
      type: "group",
      x: -40,
      y: -40,
      width: 900,
      height: 600,
      label: "Hechos",
      color: "4",
      background: "fondos/papel.png",
      backgroundStyle: "repeat",
    },
    {
      id: "a1",
      type: "text",
      x: 0,
      y: 0,
      width: 300,
      height: 120,
      text: "# El caso\n\nLo que sabemos:\n\t- la fecha\r\n",
      color: "#1E88E5",
      "esme:z": 2,
      "esme:profundidad": 0.5,
    },
    { id: "a2", type: "file", x: 400, y: 0, width: 300, height: 200, file: "docs/contrato.md", subpath: "#Cláusulas" },
    { id: "A_3", type: "link", x: 0, y: 300, width: 300, height: 120, url: "https://www.boe.es/" },
  ],
  edges: [
    {
      id: "e1",
      fromNode: "a1",
      fromSide: "right",
      fromEnd: "none",
      toNode: "a2",
      toSide: "left",
      toEnd: "arrow",
      color: "1",
      label: "se apoya en",
      "esme:peso": 3,
    },
    { id: "e2", fromNode: "A_3", toNode: "a1" },
  ],
};

const EN_EL_PAQUETE = new Set(["fondos/papel.png", "docs/contrato.md"]);
/** Como la capa de disco: está, no está (null) o no se puede leer (su motivo, con la ruta). */
const hay = (ruta: string): true | null | { error: string } =>
  EN_EL_PAQUETE.has(ruta) ? true : ruta === "docs/enlace.md" ? { error: "«docs/enlace.md» se sale del paquete" } : null;
const problemas = (lienzo: unknown): string[] => problemasDelLienzo(JSON.stringify(lienzo), hay);

/** El lienzo con su pieza `i` cambiada (`undefined` la quita). */
const conPieza = (i: number, cambios: Record<string, unknown>) => ({
  ...LIENZO,
  nodes: LIENZO.nodes.map((n, j) =>
    j === i ? Object.fromEntries(Object.entries({ ...n, ...cambios }).filter(([, v]) => v !== undefined)) : n
  ),
});
const conConexion = (i: number, cambios: Record<string, unknown>) => ({
  ...LIENZO,
  edges: LIENZO.edges.map((e, j) =>
    j === i ? Object.fromEntries(Object.entries({ ...e, ...cambios }).filter(([, v]) => v !== undefined)) : e
  ),
});
const texto = (n: number): Record<string, unknown> => ({ id: `t${n}`, type: "text", x: n, y: 0, width: 10, height: 10, text: "" });

describe("el lienzo de partida — lo que vale", () => {
  it("las cuatro clases de pieza, con sus conexiones y lo propio de Esme, valen tal cual", () => {
    expect(problemas(LIENZO)).toEqual([]);
  });

  it("un lienzo vacío vale: nodes y edges son opcionales", () => {
    expect(problemas({})).toEqual([]);
    expect(problemas({ nodes: [], edges: [] })).toEqual([]);
  });

  it("las listas y los topes son los de JSON Canvas 1.0, cerrados", () => {
    expect(VISTA_LIENZO).toBe("esme.lienzo");
    expect(EXTENSION_LIENZO).toBe(".canvas");
    expect([...TIPOS_PIEZA]).toEqual(["text", "file", "link", "group"]);
    expect([...LADOS]).toEqual(["top", "right", "bottom", "left"]);
    expect([...EXTREMOS]).toEqual(["none", "arrow"]);
    expect([...FONDOS]).toEqual(["cover", "ratio", "repeat"]);
    expect(PREFIJO_PROPIO).toBe("esme:");
    expect([...FORMATOS_FICHERO]).toEqual(["md", "txt", "pdf", "png", "jpg", "jpeg", "webp", "gif", "avif", "mp3", "m4a", "ogg", "wav", "mp4", "webm"]);
    expect([...FORMATOS_FONDO]).toEqual(["png", "jpg", "jpeg", "webp", "gif", "avif"]);
    expect([...DOMINIOS_LOCALES]).toEqual(["localhost", "local", "internal", "home.arpa"]);
    expect(TOPES_LIENZO).toEqual({
      bytes: 262144,
      piezas: 200,
      conexiones: 400,
      texto: 4000,
      etiqueta: 120,
      propios: 8,
      coordenada: 1000000,
      medida: 100000,
      url: 2048,
    });
  });

  it("los topes justos valen: 200 piezas, 400 conexiones, un texto de 4000, una etiqueta de 120, el borde del plano y una URL de 2048", () => {
    const nodes = Array.from({ length: TOPES_LIENZO.piezas }, (_, n) => texto(n));
    const edges = Array.from({ length: TOPES_LIENZO.conexiones }, (_, n) => ({ id: `e${n}`, fromNode: "t0", toNode: `t${n % 200}` }));
    expect(problemas({ nodes, edges })).toEqual([]);
    expect(problemas(conPieza(1, { text: "x".repeat(TOPES_LIENZO.texto) }))).toEqual([]);
    expect(problemas(conPieza(0, { label: "x".repeat(TOPES_LIENZO.etiqueta) }))).toEqual([]);
    const { coordenada: c, medida: m } = TOPES_LIENZO;
    expect(problemas(conPieza(1, { x: -c, y: c, width: m, height: 1 }))).toEqual([]);
    const url = "https://www.boe.es/" + "x".repeat(TOPES_LIENZO.url - "https://www.boe.es/".length);
    expect(url).toHaveLength(TOPES_LIENZO.url);
    expect(problemas(conPieza(3, { url }))).toEqual([]);
  });

  it("los enlaces: https a un dominio de internet, con su puerto, su ruta y su ancla si quiere", () => {
    for (const url of ["https://boe.es:8443/buscar?q=ley#art-1", "https://españa.es/", "https://WWW.BOE.ES/", "https://www.boe.es./"])
      expect(problemas(conPieza(3, { url })), url).toEqual([]);
  });

  it("las rutas de dentro del lienzo van desde la raíz del paquete, y «./» no cambia nada", () => {
    expect(problemas(conPieza(2, { file: "./docs/contrato.md" }))).toEqual([]);
    expect(problemas(conPieza(0, { background: "./fondos//papel.png" }))).toEqual([]);
  });

  it("las clases de fichero de la lista, sin mirar mayúsculas", () => {
    const todos = new Set([...FORMATOS_FICHERO, "PNG", "Md"].map((f) => `docs/a.${f}`));
    const hayTodos = (r: string): true | null => (todos.has(r) || EN_EL_PAQUETE.has(r) ? true : null);
    for (const f of todos) expect(problemasDelLienzo(JSON.stringify(conPieza(2, { file: f })), hayTodos), f).toEqual([]);
  });

  it("lo propio de Esme: esme:<kebab-case>, con un número, un sí/no o un texto corto, y hasta 8 por pieza", () => {
    const propios = Object.fromEntries(Array.from({ length: TOPES_LIENZO.propios }, (_, n) => [`esme:p${n}`, n]));
    expect(problemas(conPieza(1, { "esme:z": -3, "esme:visible": true, "esme:capa": "fondo" }))).toEqual([]);
    expect(problemas(conPieza(1, { "esme:z": undefined, "esme:profundidad": undefined, ...propios }))).toEqual([]);
  });

  it("la ruta de un lienzo de partida: un .canvas del paquete", () => {
    for (const r of ["mapa.canvas", "lienzos/mapa.canvas", "./lienzos/de-trabajo.canvas"]) expect(esRutaLienzo(r), r).toBe(true);
    for (const r of ["mapa.json", "mapa.canvas.json", ".canvas", "lienzos/.canvas", "../mapa.canvas", "/mapa.canvas", "C:/mapa.canvas", "lienzos\\mapa.canvas", ""])
      expect(esRutaLienzo(r), r).toBe(false);
  });
});

describe("el lienzo de partida — lo que se rechaza, con su motivo", () => {
  it("no es JSON, no es un objeto, o trae algo más arriba que nodes y edges", () => {
    expect(problemasDelLienzo("{", hay)).toEqual(["no es JSON que se pueda leer"]);
    for (const t of ["[]", "null", "3", '"lienzo"'])
      expect(problemasDelLienzo(t, hay), t).toEqual(["un lienzo es un objeto con nodes y edges (JSON Canvas 1.0)"]);
    expect(problemas({ ...LIENZO, "esme:version": 1 })).toEqual(["clave desconocida «esme:version»: arriba solo van nodes y edges"]);
    expect(problemas({ nodes: {} })).toEqual(["nodes: una lista de piezas"]);
    expect(problemas({ edges: "e1" })).toEqual(["edges: una lista de conexiones"]);
  });

  it("los topes: 200 piezas, 400 conexiones y 256 KiB", () => {
    const nodes = Array.from({ length: TOPES_LIENZO.piezas + 1 }, (_, n) => texto(n));
    expect(problemas({ nodes })).toEqual(["nodes: como mucho 200 piezas"]);
    const edges = Array.from({ length: TOPES_LIENZO.conexiones + 1 }, (_, n) => ({ id: `e${n}`, fromNode: "a1", toNode: "a2" }));
    expect(problemas({ ...LIENZO, edges })).toEqual(["edges: como mucho 400 conexiones"]);
    const pesado = JSON.stringify(LIENZO) + " ".repeat(TOPES_LIENZO.bytes);
    expect(problemasDelLienzo(pesado, hay)).toEqual([
      `pesa ${new TextEncoder().encode(pesado).length} bytes, y un lienzo de partida pesa como mucho ${TOPES_LIENZO.bytes}`,
    ]);
  });

  it("cada pieza: un objeto con id, tipo, posición y tamaño enteros, dentro del plano", () => {
    for (const nodo of ["a1", null, [], 3]) expect(problemas({ nodes: [nodo] }), JSON.stringify(nodo)).toEqual(["nodes.0: una pieza es un objeto"]);
    expect(problemas(conPieza(1, { x: undefined, height: undefined }))).toEqual(["nodes.1: le falta «x»", "nodes.1: le falta «height»"]);
    expect(problemas(conPieza(1, { x: 1.5, y: "0" }))).toEqual([
      "nodes.1.x: un entero de -1000000 a 1000000",
      "nodes.1.y: un entero de -1000000 a 1000000",
    ]);
    expect(problemas(conPieza(1, { x: TOPES_LIENZO.coordenada + 1, y: -TOPES_LIENZO.coordenada - 1 }))).toEqual([
      "nodes.1.x: un entero de -1000000 a 1000000",
      "nodes.1.y: un entero de -1000000 a 1000000",
    ]);
    expect(problemas(conPieza(1, { width: 0, height: -10 }))).toEqual([
      "nodes.1.width: un entero de 1 a 100000",
      "nodes.1.height: un entero de 1 a 100000",
    ]);
    expect(problemas(conPieza(1, { width: TOPES_LIENZO.medida + 1, height: 2.5 }))).toEqual([
      "nodes.1.width: un entero de 1 a 100000",
      "nodes.1.height: un entero de 1 a 100000",
    ]);
    // un número que JSON da por infinito
    const infinito = JSON.stringify(LIENZO).replace('"x":0,"y":0', '"x":1e400,"y":0');
    expect(problemasDelLienzo(infinito, hay)).toEqual(["nodes.1.x: un entero de -1000000 a 1000000"]);
    expect(problemas(conPieza(1, { type: "video" }))).toEqual(["nodes.1.type: text, file, link o group"]);
    expect(problemas(conPieza(1, { type: undefined }))).toEqual(["nodes.1: le falta «type»"]);
  });

  it("los ids: de 1 a 64 letras, cifras, «-» o «_», y sin repetir", () => {
    for (const id of ["", "a b", "a/b", "ñ", "x".repeat(65), 7])
      expect(problemas(conPieza(2, { id })), String(id)).toContain(
        "nodes.2.id: un id de 1 a 64 letras, cifras, «-» o «_»"
      );
    expect(problemas(conPieza(2, { id: "a1" }))).toEqual(["nodes.2.id: «a1» está repetido"]);
    expect(problemas(conConexion(1, { id: "e1" }))).toEqual(["edges.1.id: «e1» está repetido"]);
    expect(problemas(conConexion(1, { id: "a1" }))).toEqual(["edges.1.id: «a1» ya es el id de una pieza"]);
    expect(problemas(conConexion(1, { id: "e 2" }))).toEqual(["edges.1.id: un id de 1 a 64 letras, cifras, «-» o «_»"]);
  });

  it("el color: uno de los seis o #RRGGBB", () => {
    for (const color of ["7", "0", "#FFF", "#GGGGGG", "red", "1 ", 1])
      expect(problemas(conPieza(1, { color })), String(color)).toEqual([
        "nodes.1.color: un color de los seis («1» a «6») o #RRGGBB",
      ]);
    expect(problemas(conConexion(0, { color: "rojo" }))).toEqual(["edges.0.color: un color de los seis («1» a «6») o #RRGGBB"]);
  });

  it("el texto: Markdown con sus saltos de línea, de hasta 4000, sin nada invisible que mande", () => {
    for (const text of ["\u001b[31mrojo", "al revés \u202e", "x".repeat(TOPES_LIENZO.texto + 1), 3])
      expect(problemas(conPieza(1, { text })), JSON.stringify(text)).toEqual([
        "nodes.1.text: un texto de hasta 4000 caracteres, sin nada invisible que mande",
      ]);
    expect(problemas(conPieza(1, { text: undefined }))).toEqual(["nodes.1: le falta «text»"]);
  });

  it("file y fondo: una ruta del paquete, y que esté; subpath empieza por «#»", () => {
    for (const file of ["../fuera.md", "/etc/passwd", "C:/x.md", "docs\\contrato.md", "docs/con\u202eexe.md", "", 3])
      expect(problemas(conPieza(2, { file })), String(file)).toEqual([
        "nodes.2.file: una ruta del paquete es relativa, con «/», y no sale con «..»",
      ]);
    for (const file of ["web/portada.html", "web/logo.svg", "lienzos/otro.canvas", "module.yaml", "bin/arranca.sh", "docs/LEEME"])
      expect(problemas(conPieza(2, { file })), file).toEqual([
        "nodes.2.file: un fichero que el lienzo sabe enseñar: md, txt, pdf, png, jpg, jpeg, webp, gif, avif, mp3, m4a, ogg, wav, mp4 o webm",
      ]);
    expect(problemas(conPieza(2, { file: "docs/no-esta.md" }))).toEqual(["nodes.2.file: «docs/no-esta.md» no está en el paquete"]);
    expect(problemas(conPieza(2, { file: "docs/enlace.md" }))).toEqual(["nodes.2.file: «docs/enlace.md» se sale del paquete"]);
    for (const subpath of ["Cláusulas", "#" + "x".repeat(TOPES_LIENZO.etiqueta), "#con\nsalto", 1])
      expect(problemas(conPieza(2, { subpath })), JSON.stringify(subpath)).toEqual([
        "nodes.2.subpath: empieza por «#», de hasta 120 caracteres y sin nada invisible",
      ]);
    expect(problemas(conPieza(0, { background: "fondos/no-esta.png" }))).toEqual([
      "nodes.0.background: «fondos/no-esta.png» no está en el paquete",
    ]);
    expect(problemas(conPieza(0, { background: "../fondo.png" }))).toEqual([
      "nodes.0.background: una ruta del paquete es relativa, con «/», y no sale con «..»",
    ]);
    for (const background of ["fondos/papel.svg", "docs/contrato.md", "fondos/papel"])
      expect(problemas(conPieza(0, { background })), background).toEqual(["nodes.0.background: una imagen: png, jpg, jpeg, webp, gif o avif"]);
    expect(problemas(conPieza(0, { backgroundStyle: "stretch" }))).toEqual(["nodes.0.backgroundStyle: cover, ratio o repeat"]);
  });

  it("link: una URL https de hasta 2048, sin usuario ni contraseña ni nada invisible", () => {
    const largo = "https://www.boe.es/" + "x".repeat(TOPES_LIENZO.url);
    const malas = ["http://www.boe.es/", "https://ana:clave@www.boe.es/", "https://ana@www.boe.es/", "javascript:alert(1)", "data:text/html,hola"];
    for (const url of [...malas, "www.boe.es", "https://", "https://www.boe.es/ con espacio", "https://www.boe.es/\u202efdp.exe", largo, "", 7])
      expect(problemas(conPieza(3, { url })), String(url)).toEqual([
        "nodes.3.url: una URL https de hasta 2048 caracteres, sin usuario ni contraseña ni nada invisible",
      ]);
    expect(problemas(conPieza(3, { url: undefined }))).toEqual(["nodes.3: le falta «url»"]);
  });

  it("link: a un dominio de internet; ni una IP, ni localhost, ni la red de casa", () => {
    const casos: Array<[string, string]> = [
      ["https://192.168.1.1/", "192.168.1.1"],
      ["https://0x7f.1/", "127.0.0.1"],
      ["https://[::1]/", "[::1]"],
      ["https://localhost/", "localhost"],
      ["https://localhost./", "localhost."],
      ["https://panel.localhost/", "panel.localhost"],
      ["https://impresora.local/", "impresora.local"],
      ["https://wiki.internal/", "wiki.internal"],
      ["https://router.home.arpa/", "router.home.arpa"],
      ["https://intranet/", "intranet"],
    ];
    for (const [url, host] of casos)
      expect(problemas(conPieza(3, { url })), url).toEqual([
        `nodes.3.url: «${host}» no es un dominio de internet (ni una IP, ni localhost, ni .local, .internal o .home.arpa)`,
      ]);
  });

  it("las etiquetas: de hasta 120, sin nada invisible", () => {
    expect(problemas(conPieza(0, { label: "x".repeat(TOPES_LIENZO.etiqueta + 1) }))).toEqual([
      "nodes.0.label: una etiqueta de hasta 120 caracteres, sin nada invisible",
    ]);
    expect(problemas(conConexion(0, { label: "salto\nde línea" }))).toEqual([
      "edges.0.label: una etiqueta de hasta 120 caracteres, sin nada invisible",
    ]);
  });

  it("las claves que no son de su clase de pieza, ni llevan el prefijo esme:, no valen", () => {
    expect(problemas(conPieza(1, { z: 1 }))).toEqual(["nodes.1: clave desconocida «z» (lo propio de Esme va con el prefijo esme:, como esme:z)"]);
    expect(problemas(conPieza(0, { "Esme:z": 1 }))).toEqual([
      "nodes.0: clave desconocida «Esme:z» (lo propio de Esme va con el prefijo esme:, como esme:z)",
    ]);
    // __proto__ llega como una clave más (JSON.parse no la toma por el prototipo), y no vale
    const proto = JSON.stringify(LIENZO).replace('"id":"a1",', '"id":"a1","__proto__":{"x":1},');
    expect(problemasDelLienzo(proto, hay)).toEqual([
      "nodes.1: clave desconocida «__proto__» (lo propio de Esme va con el prefijo esme:, como esme:z)",
    ]);
    expect(problemas(conPieza(1, { url: "https://www.boe.es/" }))).toEqual([
      "nodes.1: clave desconocida «url» (lo propio de Esme va con el prefijo esme:, como esme:z)",
    ]);
    expect(problemas(conConexion(1, { peso: 2 }))).toEqual([
      "edges.1: clave desconocida «peso» (lo propio de Esme va con el prefijo esme:, como esme:z)",
    ]);
  });

  it("lo propio de Esme: con nombre en kebab-case, un valor simple y 8 como mucho", () => {
    for (const k of ["esme:", "esme:Z", "esme:la z", "esme:" + "z".repeat(33)])
      expect(problemas(conPieza(1, { [k]: 1 })), k).toEqual([`nodes.1: «${k}»: lo propio de Esme se nombra esme:<kebab-case>`]);
    for (const v of [{ x: 1 }, [1], null, "x".repeat(121), "con\u202einvisible", "dos\nlíneas"])
      expect(problemas(conPieza(1, { "esme:z": v })), JSON.stringify(v)).toEqual([
        "nodes.1.esme:z: un número, un sí/no o un texto de hasta 120",
      ]);
    const infinito = JSON.stringify(LIENZO).replace('"esme:z":2', '"esme:z":1e400');
    expect(problemasDelLienzo(infinito, hay)).toEqual(["nodes.1.esme:z: un número, un sí/no o un texto de hasta 120"]);
    expect(problemas(conConexion(0, { "esme:Peso": 1 }))).toEqual(["edges.0: «esme:Peso»: lo propio de Esme se nombra esme:<kebab-case>"]);
    const nueve = Object.fromEntries(Array.from({ length: TOPES_LIENZO.propios + 1 }, (_, n) => [`esme:p${n}`, n]));
    expect(problemas(conPieza(1, { "esme:z": undefined, "esme:profundidad": undefined, ...nueve }))).toEqual([
      "nodes.1: como mucho 8 claves propias (esme:)",
    ]);
  });

  it("las conexiones: entre piezas del lienzo, con lados y extremos de la lista", () => {
    expect(problemas({ ...LIENZO, edges: ["e1"] })).toEqual(["edges.0: una conexión es un objeto"]);
    expect(problemas(conConexion(0, { toNode: "nada" }))).toEqual(["edges.0.toNode: «nada» no es una pieza del lienzo"]);
    expect(problemas(conConexion(0, { fromNode: 3 }))).toEqual(["edges.0.fromNode: un id de 1 a 64 letras, cifras, «-» o «_»"]);
    expect(problemas(conConexion(1, { fromNode: undefined }))).toEqual(["edges.1: le falta «fromNode»"]);
    expect(problemas(conConexion(0, { fromSide: "center", toSide: "arriba" }))).toEqual([
      "edges.0.fromSide: top, right, bottom o left",
      "edges.0.toSide: top, right, bottom o left",
    ]);
    expect(problemas(conConexion(0, { fromEnd: "circle", toEnd: true }))).toEqual([
      "edges.0.fromEnd: none o arrow",
      "edges.0.toEnd: none o arrow",
    ]);
    expect(problemas(conConexion(0, { id: undefined }))).toEqual(["edges.0: le falta «id»"]);
  });
});
