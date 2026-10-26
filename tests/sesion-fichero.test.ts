/**
 * EL FICHERO DE UNA SESIÓN — eventos.jsonl en disco, con un solo escritor.
 *
 * Lo que se prueba:
 *
 *   1. abrir un fichero nuevo apunta su `dueno`; reabrirlo sigue donde iba;
 *   2. la hora: los trozos de texto solo la llevan si pasó un latido (como el
 *      Taller), y lo demás siempre;
 *   3. lo que deja un apagón se arregla al abrir: la línea cortada se quita y
 *      un salto que faltaba se pone;
 *   4. el registro del Taller (formato 1) se sigue escribiendo en el 2;
 *   5. un solo escritor: lo de otro aparato o una sesión cerrada solo se toma
 *      a propósito, un registro que no verifica no se toca, y si alguien
 *      escribe por fuera, el escritor se para.
 *
 * Referencia: core/sesiones/fichero.ts.
 */
import { afterAll, describe, expect, it } from "vitest";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Escritor, ErrorRegistro, leerFichero } from "../core/sesiones/fichero.ts";
import { leer, sinSobre, type Evento } from "../core/sesiones/registro.ts";

const dir = mkdtempSync(join(tmpdir(), "esme-sesion-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let cuenta = 0;
const nueva = () => join(dir, `s${++cuenta}`, "eventos.jsonl");

/** Un reloj que avanza a mano. */
function reloj(inicio = 1_000) {
  let t = inicio;
  return { ahora: () => t, pasa: (ms: number) => (t += ms) };
}

describe("abrir y escribir", () => {
  it("un fichero nuevo empieza con su dueño, con el id de la sesión", () => {
    const ruta = nueva();
    const r = reloj();
    const w = Escritor.abrir(ruta, { de: "pc", sesion: "s-1", ahora: r.ahora });
    expect(w.cadena).toMatchObject({ n: 1, epoca: 1, dueno: "pc", cerrada: false });
    const l = leerFichero(ruta);
    expect(l.valida).toBe(true);
    expect(l.eventos.map(sinSobre)).toEqual([{ tipo: "dueno", sesion: "s-1", ts: 1000 }]);
  });

  it("lo anotado se lee igual, y reabrir sigue donde iba (sin otro dueño)", () => {
    const ruta = nueva();
    const r = reloj();
    const w = Escritor.abrir(ruta, { de: "pc", sesion: "s-2", ahora: r.ahora });
    w.anotar({ tipo: "usuario", texto: "hola" });
    r.pasa(10);
    w.anotar({ tipo: "fin", motivo: "end_turn", ms: 10 });
    const otra = Escritor.abrir(ruta, { de: "pc", ahora: r.ahora });
    expect(otra.cadena.n).toBe(3);
    otra.anotar({ tipo: "usuario", texto: "otra" });
    const l = leerFichero(ruta);
    expect(l.valida).toBe(true);
    expect(l.eventos.map((e) => e.tipo)).toEqual(["dueno", "usuario", "fin", "usuario"]);
    expect(l.eventos.map((e) => e.n)).toEqual([0, 1, 2, 3]);
  });

  it("la hora: los trozos solo con un latido, como el Taller; lo demás, siempre", () => {
    const ruta = nueva();
    const r = reloj();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: r.ahora });
    r.pasa(100);
    w.anotar({ tipo: "texto", texto: "a" }); // pasó más de un latido desde el dueño? no: 100 ms → sin hora
    r.pasa(950);
    w.anotar({ tipo: "texto", texto: "b" }); // 1050 ms desde la última hora → con hora
    r.pasa(10);
    w.anotar({ tipo: "pensamiento", texto: "c" }); // 10 ms → sin hora
    w.anotar({ tipo: "herramienta", id: "h1", estado: "completed" }); // no es un trozo → con hora
    const ts = leerFichero(ruta).eventos.map((e) => e.ts);
    expect(ts).toEqual([1000, undefined, 2050, undefined, 2060]);
  });

  it("una hora que ya trae el evento se respeta (importar no la inventa)", () => {
    const ruta = nueva();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: () => 5 });
    w.anotar({ tipo: "usuario", texto: "de ayer", ts: 1 });
    expect(leerFichero(ruta).eventos[1].ts).toBe(1);
  });
});

describe("lo que deja un apagón se arregla al abrir", () => {
  it("la última línea cortada se quita antes de seguir", () => {
    const ruta = nueva();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: () => 1 });
    w.anotar({ tipo: "usuario", texto: "hola" });
    const entero = readFileSync(ruta, "utf8");
    appendFileSync(ruta, '{"n":2,"epoca":1,"de":"pc","ant":"ab');
    const otra = Escritor.abrir(ruta, { de: "pc", ahora: () => 2 });
    expect(otra.apertura.quitados).toBeGreaterThan(0);
    expect(readFileSync(ruta, "utf8")).toBe(entero);
    otra.anotar({ tipo: "usuario", texto: "sigo" });
    const l = leerFichero(ruta);
    expect(l.valida).toBe(true);
    expect(l.eventos).toHaveLength(3);
  });

  it("un salto final que faltaba se pone", () => {
    const ruta = nueva();
    Escritor.abrir(ruta, { de: "pc", ahora: () => 1 }).anotar({ tipo: "usuario", texto: "hola" });
    writeFileSync(ruta, readFileSync(ruta, "utf8").slice(0, -1));
    Escritor.abrir(ruta, { de: "pc", ahora: () => 2 }).anotar({ tipo: "usuario", texto: "sigo" });
    const l = leerFichero(ruta);
    expect(l.valida).toBe(true);
    expect(l.sinSalto).toBe(false);
    expect(l.eventos).toHaveLength(3);
  });
});

describe("el registro del Taller (formato 1) sigue en el 2", () => {
  it("se apunta un dueño detrás de lo que había, sin tocarlo", () => {
    const ruta = nueva();
    const r = reloj();
    const v1 = [
      { tipo: "usuario", texto: "hola", ts: 10 },
      { tipo: "texto", texto: "ho" },
      { tipo: "fin", motivo: "end_turn", ms: 5, ts: 15 },
    ];
    const antes = v1.map((e) => JSON.stringify(e)).join("\n") + "\n";
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, antes);
    const w = Escritor.abrir(ruta, { de: "pc", sesion: "tarea-7", ahora: r.ahora });
    w.anotar({ tipo: "usuario", texto: "más" });
    const texto = readFileSync(ruta, "utf8");
    expect(texto.startsWith(antes)).toBe(true);
    const l = leer(texto);
    expect(l.valida).toBe(true);
    expect(l.formato).toBe("mixto");
    expect(l.eventos.slice(3).map((e) => [e.n, e.tipo])).toEqual([
      [3, "dueno"],
      [4, "usuario"],
    ]);
  });
});

describe("un solo escritor", () => {
  it("una sesión de otro aparato no se toma sin querer; tomándola, sube la época", () => {
    const ruta = nueva();
    Escritor.abrir(ruta, { de: "pc", ahora: () => 1 }).anotar({ tipo: "usuario", texto: "hola" });
    expect(() => Escritor.abrir(ruta, { de: "el-101", ahora: () => 2 })).toThrow(/dueño/);
    const w = Escritor.abrir(ruta, { de: "el-101", tomar: true, ahora: () => 2 });
    expect(w.cadena).toMatchObject({ epoca: 2, dueno: "el-101" });
    expect(leerFichero(ruta).valida).toBe(true);
  });

  it("una sesión cerrada solo se reabre a propósito", () => {
    const ruta = nueva();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: () => 1 });
    w.anotar({ tipo: "cierre", motivo: "hecha" });
    expect(() => Escritor.abrir(ruta, { de: "pc", ahora: () => 2 })).toThrow(/cerrada/);
    const otra = Escritor.abrir(ruta, { de: "pc", tomar: true, ahora: () => 2 });
    expect(otra.cadena).toMatchObject({ epoca: 2, cerrada: false });
  });

  it("un registro que no verifica no se toca: se dice qué pasa", () => {
    const ruta = nueva();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: () => 1 });
    w.anotar({ tipo: "usuario", texto: "hola" });
    w.anotar({ tipo: "usuario", texto: "adiós" });
    const antes = readFileSync(ruta, "utf8");
    writeFileSync(ruta, antes.replace('"hola"', '"HOLA"'));
    let error: unknown;
    try {
      Escritor.abrir(ruta, { de: "pc", ahora: () => 2 });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ErrorRegistro);
    expect((error as ErrorRegistro).problemas[0]).toMatchObject({ linea: 2 });
    expect(readFileSync(ruta, "utf8")).toBe(antes.replace('"hola"', '"HOLA"'));
  });

  it("si alguien escribe por fuera, el escritor se para en vez de mezclar dos historias", () => {
    const ruta = nueva();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: () => 1 });
    appendFileSync(ruta, JSON.stringify({ tipo: "texto", texto: "colado" }) + "\n");
    expect(() => w.anotar({ tipo: "usuario", texto: "hola" })).toThrow(/por fuera/);
  });

  it("lo que no es del contrato no se escribe (salvo que se diga)", () => {
    const ruta = nueva();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: () => 1 });
    expect(() => w.anotar({ tipo: "fin", ms: 3 } as unknown as Evento)).toThrow(/motivo/);
    expect(() => w.anotar({ tipo: "holograma" } as unknown as Evento)).toThrow(/holograma/);
    const libre = Escritor.abrir(ruta, { de: "pc", ahora: () => 1, validar: false });
    libre.anotar({ tipo: "holograma", cara: 3 } as unknown as Evento);
    expect(leerFichero(ruta).eventos[1]).toMatchObject({ tipo: "holograma", cara: 3 });
  });
});
