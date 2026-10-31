/**
 * EL OFICIO DE UNA PLANTILLA — lo que monta al abrirla: su piel, sus
 * secciones (cada una con su vista y, si lista tareas, su filtro) y sus
 * órdenes. Y es cerrado: con topes, ids en kebab-case, vistas de una lista
 * conocida (con una de reserva), filtros de una lista sobre el estado y la
 * etiqueta de una tarea, y órdenes cuyos campos dicen su tipo. Nada libre.
 *
 * Paquetes sintéticos: las huellas son una letra repetida.
 *
 * Referencia: core/paquetes/oficio.ts, core/paquetes/manifiesto.ts,
 * core/paquetes/resolver.ts, estandar/paquete.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { leePaquete, ManifiestoV2Schema, type PaqueteConocido } from "../core/paquetes/manifiesto.ts";
import {
  ESTADOS,
  TIPOS_ENTRADA,
  TOPES,
  VISTAS,
  VISTAS_CON_FILTRO,
  VISTA_DE_RESERVA,
  esFiltro,
  esNumero,
  problemasDeOrden,
} from "../core/paquetes/oficio.ts";
import { resuelve } from "../core/paquetes/resolver.ts";

const H = (c: string) => c.repeat(64);

/** Las tareas y los comandos de la plantilla: dos órdenes que valen. */
const TAREAS = [
  {
    id: "burofax",
    title: "Redacta un burofax",
    prompt: "Redacta un burofax para {{destinatario}} sobre {{asunto}}, en tono {{tono}}.",
    inputs: [
      { key: "destinatario", description: "a quién va", type: "text" },
      { key: "asunto", description: "de qué trata", type: "text" },
      { key: "tono", description: "cómo suena", type: "choice", options: ["cordial", "firme", "último aviso"], default: "cordial" },
    ],
  },
  {
    id: "plazos",
    title: "Plazos que vencen",
    prompt: "Dime qué plazos vencen en los próximos {{ dias }} días.",
    inputs: [{ key: "dias", description: "cuántos días", type: "number", default: "7" }],
  },
];
const COMANDOS = [
  { id: "burofax", title: "Redactar un burofax", task: "burofax" },
  { id: "plazos", title: "Plazos", task: "plazos" },
];

const HOY = { id: "hoy", nombre: "Hoy" };

/** Un oficio que vale: la piel de un paquete que usa, Hoy primero, y órdenes propias y de un paquete. */
const OFICIO = {
  piel: "esme.prueba.piel-sobria/sobria",
  secciones: [
    HOY,
    { id: "expedientes", nombre: "Expedientes", vista: "esme.tareas", filtro: "etiqueta:expediente" },
    { id: "te-necesita", nombre: "Te necesita", vista: "esme.hoy", filtro: "estado:te-necesita" },
    { id: "jurisprudencia", nombre: "Jurisprudencia", vista: "esme.memoria" },
  ],
  ordenes: ["burofax", "plazos", "esme.prueba.cartas/carta"],
};

/** Una plantilla que vale, con el oficio que se le dé; cada prueba le cambia lo suyo. */
const plantilla = (oficio: unknown = OFICIO, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema_version: 2,
  id: "esme.prueba.despacho",
  version: "1.0.0",
  name: "Despacho",
  kind: "template",
  description: "Una plantilla de prueba, sintética.",
  author: "Prueba",
  license: "MIT",
  uses: [
    { id: "esme.prueba.piel-sobria", version: "^1.0", sha256: H("a") },
    { id: "esme.prueba.cartas", version: "^1.0", sha256: H("b") },
  ],
  contributes: { tasks: TAREAS, commands: COMANDOS },
  oficio,
  ...extra,
});

/** El oficio con estas secciones (detrás de Hoy). */
const conSecciones = (...secciones: unknown[]) => plantilla({ secciones: [HOY, ...secciones] });

/** La plantilla con una tarea `t` (y su comando) de orden. */
const conOrden = (tarea: Record<string, unknown>) =>
  plantilla(
    { secciones: [HOY], ordenes: ["t"] },
    { contributes: { tasks: [{ id: "t", title: "Una orden", ...tarea }], commands: [{ id: "t", title: "Orden", task: "t" }] } }
  );

const errores = (raw: unknown): string => leePaquete(raw).errores.join("\n");

describe("el oficio — lo que vale", () => {
  it("una plantilla con su oficio vale, sin avisos, y se lee tal cual", () => {
    const r = leePaquete(plantilla());
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.paquete?.oficio?.piel).toBe("esme.prueba.piel-sobria/sobria");
    expect(r.paquete?.oficio?.secciones.map((s) => s.id)).toEqual(["hoy", "expedientes", "te-necesita", "jurisprudencia"]);
    expect(r.paquete?.oficio?.ordenes).toEqual(["burofax", "plazos", "esme.prueba.cartas/carta"]);
  });

  it("sin oficio una plantilla sigue valiendo, y un oficio sin órdenes ni piel también", () => {
    const sin = plantilla();
    delete sin.oficio;
    expect(errores(sin)).toBe("");
    const r = leePaquete(plantilla({ secciones: [HOY] }));
    expect(r.errores).toEqual([]);
    expect(r.paquete?.oficio?.ordenes).toEqual([]);
  });

  it("las vistas son las de la lista, con la Mesa; la de reserva es esme.tareas, y es de la lista", () => {
    expect([...VISTAS]).toEqual(["esme.hoy", "esme.tareas", "esme.memoria", "esme.terminal", "esme.mesa"]);
    expect(VISTA_DE_RESERVA).toBe("esme.tareas");
    for (const vista of VISTAS) expect(errores(conSecciones({ id: "x", nombre: "X", vista })), vista).toBe("");
  });

  it("los filtros de la lista: estado:<uno de los cuatro> o etiqueta:<kebab-case>, en una vista que lista tareas", () => {
    expect([...ESTADOS]).toEqual(["te-necesita", "en-marcha", "terminado", "quieto"]);
    expect([...VISTAS_CON_FILTRO]).toEqual(["esme.hoy", "esme.tareas"]);
    const filtros = [...ESTADOS.map((e) => `estado:${e}`), "etiqueta:expediente", "etiqueta:por-revisar", `etiqueta:${"a".repeat(32)}`];
    for (const filtro of filtros) {
      expect(esFiltro(filtro), filtro).toBe(true);
      for (const vista of VISTAS_CON_FILTRO)
        expect(errores(conSecciones({ id: "x", nombre: "X", vista, filtro })), `${vista} ${filtro}`).toBe("");
    }
  });

  it("la piel puede ser un tema de la propia plantilla", () => {
    const p = plantilla({ piel: "sobria", secciones: [HOY] });
    (p.contributes as Record<string, unknown>).themes = [{ id: "sobria", file: "piel.json" }];
    expect(errores(p)).toBe("");
  });

  it("los topes justos valen: 12 secciones, 40 órdenes, 32 caracteres", () => {
    const doce = Array.from({ length: TOPES.secciones - 1 }, (_, i) => ({ id: `s${i}`, nombre: `S${i}`, vista: "esme.tareas" }));
    expect(errores(conSecciones(...doce))).toBe("");
    const comandos = Array.from({ length: TOPES.ordenes }, (_, i) => ({ id: `c${i}`, title: `C${i}`, task: "plazos" }));
    const ordenes = comandos.map((c) => c.id);
    expect(errores(plantilla({ secciones: [HOY], ordenes }, { contributes: { tasks: TAREAS, commands: comandos } }))).toBe("");
    expect(errores(conSecciones({ id: "a".repeat(32), nombre: "x".repeat(32), vista: "esme.tareas" }))).toBe("");
  });
});

describe("el oficio — lo que se rechaza, con su motivo", () => {
  it("es de las plantillas: un paquete con oficio no vale", () => {
    expect(errores(plantilla(OFICIO, { kind: "package" }))).toContain("oficio es de las plantillas");
  });

  it("como mucho 12 secciones y 40 órdenes", () => {
    const trece = Array.from({ length: TOPES.secciones }, (_, i) => ({ id: `s${i}`, nombre: `S${i}`, vista: "esme.tareas" }));
    expect(errores(conSecciones(...trece))).toContain("oficio.secciones: como mucho 12 secciones");
    const comandos = Array.from({ length: TOPES.ordenes + 1 }, (_, i) => ({ id: `c${i}`, title: `C${i}`, task: "plazos" }));
    const ordenes = comandos.map((c) => c.id);
    expect(errores(plantilla({ secciones: [HOY], ordenes }, { contributes: { tasks: TAREAS, commands: comandos } }))).toContain(
      "oficio.ordenes: como mucho 40 órdenes"
    );
  });

  it("la primera sección es «hoy», y va tal cual: sin vista ni filtro", () => {
    expect(errores(plantilla({ secciones: [] }))).toContain("oficio.secciones: la primera es «hoy»");
    const tarde = plantilla({ secciones: [{ id: "plazos", nombre: "Plazos", vista: "esme.tareas" }, HOY] });
    expect(errores(tarde).split("\n")).toEqual(["oficio.secciones: la primera es «hoy», y no falta nunca"]);
    expect(errores(plantilla({ secciones: [{ ...HOY, vista: "esme.tareas" }] }))).toContain("oficio.secciones.0: «hoy» va tal cual");
    expect(errores(plantilla({ secciones: [{ ...HOY, filtro: "estado:en-marcha" }] }))).toContain("oficio.secciones.0: «hoy» va tal cual");
  });

  it("los ids, en kebab-case de hasta 32, y sin repetir", () => {
    for (const id of ["Mal", "mal id", "doble--guion", "-borde", "borde-", "con_guion_bajo", "acentuá", "a".repeat(33), ""])
      expect(errores(conSecciones({ id, nombre: "X", vista: "esme.tareas" })), id).toContain("oficio.secciones.1.id: un id en kebab-case");
    const dos = conSecciones({ id: "a", nombre: "A", vista: "esme.tareas" }, { id: "a", nombre: "Otra", vista: "esme.memoria" });
    expect(errores(dos)).toContain("oficio.secciones: el id «a» está repetido");
  });

  it("el nombre, de 1 a 32 caracteres, sin espacios a los lados ni nada invisible", () => {
    for (const nombre of ["", "   ", " Plazos", "Plazos ", "x".repeat(33), "Plazos‮", "Pla\u0007zos", "Dos\nlíneas"])
      expect(errores(conSecciones({ id: "x", nombre, vista: "esme.tareas" })), JSON.stringify(nombre)).toContain(
        "oficio.secciones.1.nombre: un nombre de 1 a 32 caracteres"
      );
    expect(errores(conSecciones({ id: "x", nombre: "Último aviso", vista: "esme.tareas" }))).toBe("");
  });

  it("una vista que no es de la lista no vale (ni la de un paquete), y cada sección que no es Hoy lleva la suya", () => {
    for (const vista of ["esme.casa.carpetas/lista", "esme.hoy/plazos", "esme.desconocida", "ESME.TAREAS", "esme.tareas ", ""])
      expect(errores(conSecciones({ id: "x", nombre: "X", vista })), vista).toContain("oficio.secciones.1.vista: una vista de la lista");
    expect(errores(conSecciones({ id: "x", nombre: "X" }))).toContain("oficio.secciones.1: le falta la vista");
  });

  it("un filtro fuera de la lista, o una expresión, no vale; y solo va con una vista que lista tareas", () => {
    const malos = [
      "expediente",
      "estado:inventado",
      "estado:",
      "etiqueta:",
      "etiqueta:Mal",
      "etiqueta:a b",
      "etiqueta:a:b",
      "etiqueta:*",
      `etiqueta:${"a".repeat(33)}`,
      "estado:te-necesita && etiqueta:x",
      "etiqueta:x || estado:quieto",
      "estado = quieto",
      "ESTADO:quieto",
      " estado:quieto",
      "prioridad:alta",
    ];
    for (const filtro of malos) {
      expect(esFiltro(filtro), filtro).toBe(false);
      expect(errores(conSecciones({ id: "x", nombre: "X", vista: "esme.tareas", filtro })), filtro).toContain(
        "oficio.secciones.1.filtro: un filtro de la lista"
      );
    }
    for (const vista of VISTAS.filter((v) => !(VISTAS_CON_FILTRO as readonly string[]).includes(v)))
      expect(errores(conSecciones({ id: "x", nombre: "X", vista, filtro: "estado:quieto" })), vista).toContain(
        `oficio.secciones.1: ${vista} no lista tareas`
      );
  });

  it("un oficio que no es un objeto, o sin su lista de secciones, se dice en castellano", () => {
    for (const oficio of ["despacho", [], 3]) expect(errores(plantilla(oficio)), JSON.stringify(oficio)).toContain("oficio: el oficio es un objeto");
    expect(errores(plantilla({ ordenes: [] }))).toContain("oficio.secciones: una lista de secciones");
  });

  it("una clave de más dentro del oficio o de una sección no se ignora: se rechaza, y se dice cuál", () => {
    expect(errores(plantilla({ ...OFICIO, icono: "x" }))).toContain("oficio: clave desconocida «icono»");
    expect(errores(conSecciones({ id: "x", nombre: "X", vista: "esme.tareas", filtros: "estado:quieto" }))).toContain(
      "oficio.secciones.1: clave desconocida «filtros»"
    );
  });

  it("una orden nombra un comando de la plantilla o de un paquete que usa; ni otro, ni dos veces", () => {
    const con = (ordenes: string[]) => errores(plantilla({ secciones: [HOY], ordenes }));
    expect(con(["inventada"])).toContain("oficio.ordenes: el comando «inventada» no está en esta plantilla");
    expect(con(["esme.otro.paquete/carta"])).toContain("oficio.ordenes: «esme.otro.paquete» no está en uses");
    expect(con(["burofax", "burofax"])).toContain("oficio.ordenes: «burofax» está dos veces");
    for (const orden of ["Mal", "esme.prueba.cartas/", "/carta", "esme.prueba.cartas/a/b", "esme.cartas/carta", "burofax --tono firme", ""])
      expect(con([orden]), orden).toContain("oficio.ordenes.0: una orden es un comando de la plantilla");
  });

  it("la piel es un tema de la plantilla o de un paquete que usa", () => {
    const con = (piel: string) => errores(plantilla({ piel, secciones: [HOY] }));
    expect(con("sobria")).toContain("oficio.piel: el tema «sobria» no está en esta plantilla");
    expect(con("esme.otro.piel/sobria")).toContain("oficio.piel: «esme.otro.piel» no está en uses");
    for (const piel of ["esme.prueba.piel-sobria", "Sobria", "esme.prueba.piel-sobria/", ""])
      expect(con(piel), piel).toContain("oficio.piel: una piel es un tema de la plantilla");
  });
});

describe("las órdenes: campos con tipo, y nada libre", () => {
  it("la tarea de una orden propia con un campo sin tipo no vale", () => {
    const e = errores(conOrden({ prompt: "Escribe a {{para}}.", inputs: [{ key: "para", description: "a quién" }] }));
    expect(e).toContain("oficio.ordenes: «t» no vale como orden: el campo «para» no dice su tipo (type: text, number o choice)");
  });

  it("un hueco del prompt que no es un campo no vale; un campo que no sale en el prompt (ni en sus pasos), tampoco", () => {
    expect(errores(conOrden({ prompt: "Escribe a {{para}} el {{dia}}.", inputs: [{ key: "para", description: "a quién", type: "text" }] }))).toContain(
      "el prompt usa {{dia}} y no hay un campo «dia»"
    );
    expect(errores(conOrden({ prompt: "Escribe algo.", inputs: [{ key: "para", description: "a quién", type: "text" }] }))).toContain(
      "el campo «para» no sale en el prompt ({{para}})"
    );
    const enPasos = { prompt: "Escribe la carta.", steps: ["Ponla a nombre de {{ para }}."], inputs: [{ key: "para", description: "a quién", type: "text" }] };
    expect(errores(conOrden(enPasos))).toBe("");
  });

  it("cada campo lleva su description (es su etiqueta) y se rellena: required: false no vale en una orden", () => {
    expect(errores(conOrden({ prompt: "Escribe a {{para}}.", inputs: [{ key: "para", type: "text" }] }))).toContain(
      "el campo «para» no tiene description"
    );
    expect(errores(conOrden({ prompt: "Escribe a {{para}}.", inputs: [{ key: "para", description: "a quién", type: "text", required: false }] }))).toContain(
      "el campo «para» es opcional (required: false)"
    );
  });

  it("como mucho 10 campos, con su clave en kebab-case de hasta 32", () => {
    const once = Array.from({ length: TOPES.campos + 1 }, (_, i) => ({ key: `c${i}`, description: `C${i}`, type: "text" }));
    const e = errores(conOrden({ prompt: once.map((c) => `{{${c.key}}}`).join(" "), inputs: once }));
    expect(e).toContain("tiene 11 campos (como mucho 10)");
    expect(errores(conOrden({ prompt: "A {{Para}}.", inputs: [{ key: "Para", description: "a quién", type: "text" }] }))).toContain(
      "la clave «Para» no es kebab-case"
    );
  });

  it("problemasDeOrden lo dice todo de una vez, y nada si la tarea vale", () => {
    expect(problemasDeOrden(TAREAS[0])).toEqual([]);
    expect(problemasDeOrden({ prompt: "{{a}} {{b}}", inputs: [{ key: "a" }] })).toEqual([
      "el campo «a» no dice su tipo (type: text, number o choice)",
      "el campo «a» no tiene description (es la etiqueta del campo)",
      "el prompt usa {{b}} y no hay un campo «b»",
    ]);
  });
});

describe("los campos con tipo — en cualquier tarea", () => {
  const conCampo = (campo: Record<string, unknown>) =>
    errores({
      schema_version: 2,
      id: "esme.prueba.algo",
      version: "1.0.0",
      name: "Algo",
      kind: "package",
      description: "Un paquete de prueba, sintético.",
      author: "Prueba",
      license: "MIT",
      contributes: { tasks: [{ id: "t", title: "Una tarea", prompt: "Haz {{x}}.", inputs: [{ key: "x", ...campo }] }] },
    });

  it("type: text, number o choice; sin type sigue valiendo fuera de una orden", () => {
    expect([...TIPOS_ENTRADA]).toEqual(["text", "number", "choice"]);
    for (const type of TIPOS_ENTRADA)
      expect(conCampo({ type, ...(type === "choice" ? { options: ["a", "b"] } : {}) }), type).toBe("");
    expect(conCampo({})).toBe("");
    for (const type of ["fecha", "string", "Text", "select"])
      expect(conCampo({ type }), type).toContain("contributes.tasks.0.inputs.0.type: type es text, number o choice");
  });

  it("choice lleva options: de 2 a 20, sin repetir, cada una de 1 a 32 caracteres; y options sin choice no vale", () => {
    expect(conCampo({ type: "choice" })).toContain("type: choice lleva options");
    expect(conCampo({ type: "choice", options: ["sola"] })).toContain("de 2 a 20 options");
    expect(conCampo({ type: "choice", options: Array.from({ length: 21 }, (_, i) => `o${i}`) })).toContain("de 2 a 20 options");
    expect(conCampo({ type: "choice", options: ["a", "a"] })).toContain("la option «a» está dos veces");
    for (const o of ["", " a", "x".repeat(33), "a‮b"])
      expect(conCampo({ type: "choice", options: ["b", o] }), JSON.stringify(o)).toContain("una option de 1 a 32 caracteres");
    expect(conCampo({ type: "text", options: ["a", "b"] })).toContain("options solo va con type: choice");
    expect(conCampo({ options: ["a", "b"] })).toContain("options solo va con type: choice");
  });

  it("el default de un number es un número, y el de un choice, una de sus options", () => {
    for (const n of ["7", "-2", "0", "2.5", "-0.25"]) {
      expect(esNumero(n), n).toBe(true);
      expect(conCampo({ type: "number", default: n }), n).toBe("");
    }
    for (const n of ["siete", "2,5", "1e3", " 7", "7 ", "", ".5", "5.", "+3", "0x10", "Infinity", "NaN"]) {
      expect(esNumero(n), n).toBe(false);
      expect(conCampo({ type: "number", default: n }), n).toContain("el default de un number es un número");
    }
    expect(conCampo({ type: "choice", options: ["a", "b"], default: "c" })).toContain("el default de un choice es una de sus options");
    expect(conCampo({ type: "choice", options: ["a", "b"], default: "b" })).toBe("");
  });
});

describe("el oficio entre paquetes — lo mira el resolver", () => {
  /** Un paquete conocido (pasa por el esquema de verdad). */
  const conocido = (id: string, sha256: string, contributes: Record<string, unknown>): PaqueteConocido => ({
    manifiesto: ManifiestoV2Schema.parse({
      schema_version: 2,
      id,
      version: "1.0.0",
      name: id,
      kind: "package",
      description: "Un paquete de prueba, sintético.",
      author: "Prueba",
      license: "MIT",
      contributes,
    }),
    sha256,
  });
  const tareaCarta = (inputs: unknown[]) => ({ id: "carta", title: "Una carta", prompt: "Escribe una carta a {{para}}.", inputs });
  const piel = (tema = "sobria") => conocido("esme.prueba.piel-sobria", H("a"), { themes: [{ id: tema, file: "piel.json" }] });
  const cartas = (inputs: unknown[] = [{ key: "para", description: "a quién", type: "text" }], comando = "carta") =>
    conocido("esme.prueba.cartas", H("b"), { tasks: [tareaCarta(inputs)], commands: [{ id: comando, title: "Carta", task: "carta" }] });
  const raiz = () => ManifiestoV2Schema.parse(plantilla());

  it("la piel y la orden de los paquetes que usa existen, y la orden tiene sus campos con tipo: resuelve, con candado", () => {
    const r = resuelve(raiz(), [piel(), cartas()]);
    expect(r.errores).toEqual([]);
    expect(r.lock).not.toBeNull();
  });

  it("un tema o un comando que el paquete no trae: error, y sin candado", () => {
    const r = resuelve(raiz(), [piel("otra"), cartas(undefined, "otro")]);
    expect(r.errores).toContain("oficio.piel: esme.prueba.piel-sobria no trae el tema «sobria»");
    expect(r.errores).toContain("oficio.ordenes: esme.prueba.cartas no trae el comando «carta»");
    expect(r.lock).toBeNull();
  });

  it("una orden de un paquete cuya tarea tiene un campo sin tipo: error", () => {
    const r = resuelve(raiz(), [piel(), cartas([{ key: "para", description: "a quién" }])]);
    expect(r.errores).toEqual([
      "oficio.ordenes: «esme.prueba.cartas/carta» no vale como orden: el campo «para» no dice su tipo (type: text, number o choice)",
    ]);
  });

  it("un paquete que no se resolvió no repite su error en el oficio", () => {
    const r = resuelve(raiz(), [piel()]);
    expect(r.errores).toEqual(["esme.prueba.cartas: no se conoce ningún paquete con ese id (lo usa esme.prueba.despacho)"]);
  });
});
