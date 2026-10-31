/**
 * LOS RECUERDOS DE PARTIDA DE UNA PLANTILLA — lo que su oficio ya sabe, y
 * que deja en tu mente cuando aceptas su candado: unos pocos, de una línea,
 * cada uno con su id y su tipo (los de `remember`). La procedencia no la
 * escribe la plantilla: la pone el kit desde el candado que aceptaste (la
 * plantilla, su versión y su huella). Sin ese sí, no se escribe nada.
 *
 * Plantillas sintéticas: las huellas son una letra repetida.
 *
 * Referencia: core/paquetes/recuerdos.ts, core/paquetes/manifiesto.ts,
 * core/ipc/mind-schema.ts, estandar/paquete.spec.yaml (sección `recuerdos`).
 */
import { describe, expect, it } from "vitest";
import { leePaquete, type ManifiestoV2 } from "../core/paquetes/manifiesto.ts";
import type { Lock } from "../core/paquetes/lock.ts";
import { MindMethods } from "../core/ipc/mind-schema.ts";
import {
  TIPOS_RECUERDO,
  TIPO_EN_LA_MENTE,
  TOPES_RECUERDOS,
  recuerdosDePartida,
} from "../core/paquetes/recuerdos.ts";

const H = (c: string) => c.repeat(64);

const ALCANCE = { id: "alcance", texto: "Solo se audita con permiso firmado y dentro de su alcance.", tipo: "decision" };
const INFORMES = { id: "informes", texto: "Prefiero informes cortos, con la prueba de cada hallazgo." };

/** Una plantilla que vale, con los recuerdos que se le den. */
const plantilla = (recuerdos: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema_version: 2,
  id: "esme.prueba.auditoria",
  version: "1.0.0",
  name: "Auditoría",
  kind: "template",
  description: "Una plantilla de prueba, sintética.",
  author: "Prueba",
  license: "MIT",
  contributes: { tasks: [{ id: "t", title: "Una tarea", prompt: "Haz algo útil." }] },
  recuerdos,
  ...extra,
});

const errores = (raw: unknown): string[] => leePaquete(raw).errores;
const leida = (raw: unknown): ManifiestoV2 => {
  const r = leePaquete(raw);
  if (!r.ok) throw new Error(r.errores.join("\n"));
  return r.paquete!;
};

/** El candado que la persona aceptó para la plantilla (por defecto, el de la de prueba, con su huella). */
const candado = (raiz: Partial<Lock["raiz"]> = {}): Lock => ({
  lock_version: 1,
  raiz: { id: "esme.prueba.auditoria", version: "1.0.0", sha256: H("c"), permisos: [], ...raiz },
  paquetes: [],
  permisos: [],
});

const LINEA = "en una línea, sin espacios a los lados ni nada invisible";

describe("los recuerdos de partida — las listas, y la mente", () => {
  it("los tipos, cómo se dicen en la mente y los topes", () => {
    expect([...TIPOS_RECUERDO]).toEqual(["nota", "decision", "preferencia"]);
    expect(TIPO_EN_LA_MENTE).toEqual({ nota: "note", decision: "decision", preferencia: "preference" });
    expect(TOPES_RECUERDOS).toEqual({ recuerdos: 20, texto: 280 });
  });

  it("cada tipo es uno de los que la mente recuerda (remember), y no falta ninguno", () => {
    const deLaMente = MindMethods.remember.shape.kind.unwrap().options;
    expect([...Object.values(TIPO_EN_LA_MENTE)].sort()).toEqual([...deLaMente].sort());
    expect(Object.keys(TIPO_EN_LA_MENTE)).toEqual([...TIPOS_RECUERDO]);
  });
});

describe("los recuerdos de partida — lo que vale", () => {
  it("una plantilla con sus recuerdos vale, sin avisos; el tipo, si falta, es nota", () => {
    const r = leePaquete(plantilla([ALCANCE, INFORMES]));
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.paquete?.recuerdos).toEqual([ALCANCE, { ...INFORMES, tipo: "nota" }]);
  });

  it("llegan a su tope, y no pasan: 20 recuerdos, de 280 caracteres", () => {
    const veinte = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, texto: `Recuerdo número ${i}.` }));
    expect(errores(plantilla(veinte))).toEqual([]);
    expect(errores(plantilla([{ id: "largo", texto: "x".repeat(280) }]))).toEqual([]);
  });
});

describe("los recuerdos de partida — lo que se rechaza, con su motivo", () => {
  it("es de las plantillas: un paquete no escribe en tu mente al instalarse", () => {
    expect(errores(plantilla([ALCANCE], { kind: "package" }))).toEqual([
      "recuerdos: recuerdos es de las plantillas: un paquete no escribe en tu mente al instalarse",
    ]);
  });

  it("una lista de recuerdos, como mucho 20", () => {
    expect(errores(plantilla("Solo se audita con permiso."))).toEqual(["recuerdos: una lista de recuerdos, como mucho 20"]);
    const veintiuno = Array.from({ length: 21 }, (_, i) => ({ id: `r${i}`, texto: `Recuerdo número ${i}.` }));
    expect(errores(plantilla(veintiuno))).toEqual(["recuerdos: como mucho 20 recuerdos"]);
  });

  it("cada recuerdo es un objeto con su id en kebab-case, su texto de una línea y su tipo de la lista", () => {
    expect(errores(plantilla(["Solo se audita con permiso."]))).toEqual([
      "recuerdos.0: un recuerdo es un objeto: id, texto y, si quieres, tipo",
    ]);
    expect(errores(plantilla([{ ...ALCANCE, id: "Alcance" }]))).toEqual([
      "recuerdos.0.id: un id en kebab-case, de hasta 32: minúsculas y cifras, con guiones sueltos («escritos», «por-revisar»)",
    ]);
    const texto = `un texto de 1 a 280 caracteres, ${LINEA}`;
    for (const malo of ["", " Solo con permiso.", "Solo con permiso. ", "x".repeat(281), "Solo con permiso.\nY firmado.", "Solo\u202Ecierto", 7])
      expect(errores(plantilla([{ id: "a", texto: malo }])), JSON.stringify(malo)).toEqual([`recuerdos.0.texto: ${texto}`]);
    expect(errores(plantilla([{ id: "a" }]))).toEqual([`recuerdos.0.texto: ${texto}`]);
    expect(errores(plantilla([{ ...ALCANCE, tipo: "regla" }]))).toEqual([
      "recuerdos.0.tipo: un tipo de la lista: nota, decision o preferencia",
    ]);
    expect(errores(plantilla([{ ...ALCANCE, peso: 3 }]))).toEqual(["recuerdos.0: clave desconocida «peso»"]);
  });

  it("la procedencia no la escribe la plantilla: la pone el kit, desde el candado", () => {
    const falsa = { ...ALCANCE, procedencia: { plantilla: "esme.casa.esme", version: "1.0.0" } };
    expect(errores(plantilla([falsa]))).toEqual([
      "recuerdos.0.procedencia: la procedencia no la escribe la plantilla: la pone el kit, desde el candado que aceptaste",
    ]);
  });

  it("ningún id dos veces, y ningún texto dos veces (aunque cambien las mayúsculas)", () => {
    expect(errores(plantilla([ALCANCE, { ...INFORMES, id: "alcance" }]))).toEqual(["recuerdos: el recuerdo «alcance» está dos veces"]);
    expect(errores(plantilla([ALCANCE, { id: "otra-vez", texto: ALCANCE.texto.toUpperCase() }]))).toEqual([
      "recuerdos: «otra-vez» dice lo mismo que «alcance»",
    ]);
  });
});

describe("recuerdosDePartida — lo que se escribe en tu mente, con su procedencia, solo con tu sí", () => {
  it("cada recuerdo, en su orden, con su tipo en la mente, su clave y la procedencia del candado", () => {
    expect(recuerdosDePartida(leida(plantilla([ALCANCE, INFORMES])), candado())).toEqual([
      {
        id: "alcance",
        clave: "esme.prueba.auditoria/alcance",
        texto: ALCANCE.texto,
        tipo: "decision",
        kind: "decision",
        procedencia: { plantilla: "esme.prueba.auditoria", version: "1.0.0", huella: H("c") },
      },
      {
        id: "informes",
        clave: "esme.prueba.auditoria/informes",
        texto: INFORMES.texto,
        tipo: "nota",
        kind: "note",
        procedencia: { plantilla: "esme.prueba.auditoria", version: "1.0.0", huella: H("c") },
      },
    ]);
  });

  it("una plantilla sin recuerdos no deja nada", () => {
    const sin = { ...plantilla(undefined) };
    delete sin.recuerdos;
    expect(recuerdosDePartida(leida(sin), candado())).toEqual([]);
  });

  it("con el candado de otra plantilla, de otra versión o sin la huella de la plantilla, no se escribe nada", () => {
    const m = leida(plantilla([ALCANCE]));
    expect(() => recuerdosDePartida(m, candado({ id: "esme.prueba.otra" }))).toThrow(
      "el candado es de esme.prueba.otra, no de esme.prueba.auditoria: sin tu sí, no se escribe nada en tu mente"
    );
    expect(() => recuerdosDePartida(m, candado({ version: "0.9.0" }))).toThrow(
      "el candado es de la 0.9.0 y la plantilla es la 1.0.0: hay que volver a pedir tu sí"
    );
    expect(() => recuerdosDePartida(m, candado({ sha256: undefined }))).toThrow(
      "el candado no tiene la huella de la plantilla: sin ella, tu sí no fija lo que se escribe en tu mente"
    );
  });
});
