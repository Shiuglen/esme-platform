/**
 * EL CARÁCTER DE UNA PLANTILLA — cómo se siente al abrirla: su letra, su
 * densidad, su movimiento, su sonido, su vocabulario (cómo se llaman «Hoy»,
 * «tarea» o «Te necesita» en ese oficio) y su equipo. El color no: es de la
 * piel de quien la usa. Y es cerrado, como el oficio: listas que la app sabe
 * pintar, textos con tope y nada a medias.
 *
 * Plantillas sintéticas.
 *
 * Referencia: core/paquetes/caracter.ts, core/paquetes/manifiesto.ts,
 * estandar/paquete.spec.yaml (sección `caracter`).
 */
import { describe, expect, it } from "vitest";
import { leePaquete } from "../core/paquetes/manifiesto.ts";
import {
  DENSIDADES,
  LETRAS,
  MOVIMIENTOS,
  PALABRAS,
  PALETAS,
  TOPES_CARACTER,
} from "../core/paquetes/caracter.ts";

/** Una plantilla que vale, con el carácter que se le dé. */
const plantilla = (caracter: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema_version: 2,
  id: "esme.prueba.despacho",
  version: "1.0.0",
  name: "Despacho",
  kind: "template",
  description: "Una plantilla de prueba, sintética.",
  author: "Prueba",
  license: "MIT",
  contributes: { tasks: [{ id: "t", title: "Una tarea", prompt: "Haz algo útil." }] },
  caracter,
  ...extra,
});

const errores = (raw: unknown): string[] => leePaquete(raw).errores;

const PASANTE = { id: "pasante", nombre: "Pasante", rol: "busca jurisprudencia", caracter: "meticuloso, cita siempre la fuente" };
const REDACTORA = { id: "redactora", nombre: "Redactora", rol: "prepara escritos", caracter: "formal, cuida el tono y los plazos" };

/** Un carácter con todo. */
const COMPLETO = {
  letra: "editorial",
  densidad: "amplia",
  movimiento: "sobrio",
  sonido: { paleta: "costura" },
  vocabulario: { hoy: "Hoy en el despacho", tarea: "asunto", tareas: "asuntos", "te-necesita": "Pendiente de ti" },
  equipo: [PASANTE, REDACTORA],
};

const SIN_INVISIBLES = "sin espacios a los lados ni nada invisible";

describe("el carácter — las listas, las de la app", () => {
  it("letras, densidades, movimientos, paletas, palabras y topes", () => {
    expect([...LETRAS]).toEqual(["editorial", "tecnica", "mixta"]);
    expect([...DENSIDADES]).toEqual(["compacta", "comoda", "amplia"]);
    expect([...MOVIMIENTOS]).toEqual(["sobrio", "vivo"]);
    expect([...PALETAS]).toEqual(["costura"]);
    expect([...PALABRAS]).toEqual([
      "hoy", "tarea", "tareas", "asunto", "asuntos", "equipo",
      "te-necesita", "en-marcha", "terminado", "quieto", "encargar", "memoria",
    ]);
    expect(TOPES_CARACTER).toEqual({ miembros: 12, nombre: 32, rol: 60, caracter: 120, palabra: 32 });
  });
});

describe("el carácter — lo que vale", () => {
  it("un carácter con todo vale, sin avisos, y se lee tal cual", () => {
    const r = leePaquete(plantilla(COMPLETO));
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.paquete?.caracter).toEqual(COMPLETO);
  });

  it("todo es opcional: lo que falta lo pone la app (el de Esme)", () => {
    for (const c of [{}, { letra: "tecnica" }, { sonido: { paleta: null } }, { vocabulario: {} }, { equipo: [] }])
      expect(errores(plantilla(c)), JSON.stringify(c)).toEqual([]);
  });

  it("los textos llegan a su tope, y no pasan", () => {
    const largo = { id: "a".repeat(32), nombre: "n".repeat(32), rol: "r".repeat(60), caracter: "c".repeat(120) };
    expect(errores(plantilla({ vocabulario: { hoy: "h".repeat(32) }, equipo: [largo] }))).toEqual([]);
    const doce = Array.from({ length: 12 }, (_, i) => ({ ...PASANTE, id: `m${i}` }));
    expect(errores(plantilla({ equipo: doce }))).toEqual([]);
  });
});

describe("el carácter — lo que se rechaza, con su motivo", () => {
  it("es de las plantillas: un paquete no trae carácter", () => {
    expect(errores(plantilla(COMPLETO, { kind: "package" }))).toEqual([
      "caracter: caracter es de las plantillas: es el de una forma de trabajar, no el de una pieza",
    ]);
  });

  it("es un objeto", () => {
    expect(errores(plantilla("editorial"))).toEqual([
      "caracter: el carácter es un objeto: letra, densidad, movimiento, sonido, vocabulario y equipo",
    ]);
  });

  it("letra, densidad, movimiento y paleta, de su lista", () => {
    expect(errores(plantilla({ letra: "serif" }))).toEqual(["caracter.letra: una letra de la lista: editorial, tecnica o mixta"]);
    expect(errores(plantilla({ densidad: "cómoda" }))).toEqual(["caracter.densidad: una densidad de la lista: compacta, comoda o amplia"]);
    expect(errores(plantilla({ movimiento: "nada" }))).toEqual(["caracter.movimiento: un movimiento de la lista: sobrio o vivo"]);
    const paleta = "caracter.sonido.paleta: una paleta de la lista (costura), o null: sin sonido";
    expect(errores(plantilla({ sonido: { paleta: "campanas" } }))).toEqual([paleta]);
    expect(errores(plantilla({ sonido: {} }))).toEqual([paleta]);
    expect(errores(plantilla({ sonido: "costura" }))).toEqual(["caracter.sonido: el sonido es { paleta: costura } o { paleta: null }"]);
    expect(errores(plantilla({ sonido: { paleta: "costura", volumen: 3 } }))).toEqual(["caracter.sonido: clave desconocida «volumen»"]);
  });

  it("una clave de más dentro del carácter se rechaza, y se dice cuál (el color es de la piel)", () => {
    expect(errores(plantilla({ letra: "mixta", color: "#1E88E5" }))).toEqual(["caracter: clave desconocida «color»"]);
  });

  it("el vocabulario: solo las palabras que la app sabe cambiar, cada una de 1 a 32 y en una línea", () => {
    expect(errores(plantilla({ vocabulario: { prioridad: "Urgente" } }))).toEqual([
      `caracter.vocabulario: «prioridad» no es una palabra que la app sepa cambiar (${PALABRAS.slice(0, -1).join(", ")} o memoria)`,
    ]);
    const palabra = `una palabra de 1 a 32 caracteres, ${SIN_INVISIBLES}`;
    for (const mala of ["", " Hoy", "Hoy ", "h".repeat(33), "Hoy\nmañana", "Ho\u202Ey", 3])
      expect(errores(plantilla({ vocabulario: { hoy: mala } })), JSON.stringify(mala)).toEqual([`caracter.vocabulario.hoy: ${palabra}`]);
    expect(errores(plantilla({ vocabulario: ["hoy"] }))).toEqual([
      "caracter.vocabulario: el vocabulario es un objeto: palabra → cómo se dice en este oficio",
    ]);
  });

  it("el equipo: cada miembro con sus cuatro, en kebab-case el id y cada texto con su tope", () => {
    expect(errores(plantilla({ equipo: [{ id: "pasante", nombre: "Pasante", caracter: "meticuloso" }] }))).toEqual([
      `caracter.equipo.0.rol: un rol de 1 a 60 caracteres, ${SIN_INVISIBLES}`,
    ]);
    expect(errores(plantilla({ equipo: [{ ...PASANTE, id: "Pasante" }] }))).toEqual([
      "caracter.equipo.0.id: un id en kebab-case, de hasta 32: minúsculas y cifras, con guiones sueltos («escritos», «por-revisar»)",
    ]);
    expect(errores(plantilla({ equipo: [{ ...PASANTE, nombre: "n".repeat(33) }] }))).toEqual([
      `caracter.equipo.0.nombre: un nombre de 1 a 32 caracteres, ${SIN_INVISIBLES}`,
    ]);
    expect(errores(plantilla({ equipo: [{ ...PASANTE, rol: "r".repeat(61) }] }))).toEqual([
      `caracter.equipo.0.rol: un rol de 1 a 60 caracteres, ${SIN_INVISIBLES}`,
    ]);
    expect(errores(plantilla({ equipo: [{ ...PASANTE, caracter: "c".repeat(121) }] }))).toEqual([
      `caracter.equipo.0.caracter: un carácter de 1 a 120 caracteres, ${SIN_INVISIBLES}`,
    ]);
    expect(errores(plantilla({ equipo: [{ ...PASANTE, caracter: "meticuloso\ny serio" }] }))).toEqual([
      `caracter.equipo.0.caracter: un carácter de 1 a 120 caracteres, ${SIN_INVISIBLES}`,
    ]);
  });

  it("el equipo: un miembro no trae nada más (si un día tiene su agente, se dirá cómo)", () => {
    expect(errores(plantilla({ equipo: [{ ...PASANTE, agente: "tutor" }] }))).toEqual(["caracter.equipo.0: clave desconocida «agente»"]);
    expect(errores(plantilla({ equipo: ["pasante"] }))).toEqual([
      "caracter.equipo.0: un miembro es un objeto: id, nombre, rol y carácter, los cuatro",
    ]);
  });

  it("el equipo: ningún id dos veces, y como mucho 12", () => {
    expect(errores(plantilla({ equipo: [PASANTE, REDACTORA, { ...REDACTORA, nombre: "Otra" }] }))).toEqual([
      "caracter.equipo: el miembro «redactora» está dos veces",
    ]);
    const trece = Array.from({ length: 13 }, (_, i) => ({ ...PASANTE, id: `m${i}` }));
    expect(errores(plantilla({ equipo: trece }))).toEqual(["caracter.equipo: como mucho 12 miembros"]);
    expect(errores(plantilla({ equipo: PASANTE }))).toEqual(["caracter.equipo: una lista de miembros"]);
  });
});
