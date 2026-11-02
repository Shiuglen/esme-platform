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
 *      escribe por fuera, el escritor se para;
 *   6. los trozos se juntan hasta el siguiente latido (una línea por latido,
 *      no por trozo), y el Escritor escribe lo mismo que `juntarPorLatido`.
 *
 * Referencia: core/sesiones/fichero.ts.
 */
import { afterAll, describe, expect, it } from "vitest";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Escritor, ErrorRegistro, leerFichero } from "../core/sesiones/fichero.ts";
import { juntarPorLatido } from "../core/sesiones/compactar.ts";
import { leer, sinSobre, type Evento } from "../core/sesiones/registro.ts";
import { tallerSintetico } from "../core/sesiones/sintetico.ts";

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

describe("los trozos, juntos hasta el siguiente latido", () => {
  it("los trozos seguidos van en una sola línea hasta el siguiente latido, con la hora del primero", () => {
    const ruta = nueva();
    const r = reloj();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: r.ahora });
    r.pasa(100);
    expect(w.anotar({ tipo: "texto", texto: "Ho" })).toEqual([]); // espera
    r.pasa(100);
    expect(w.anotar({ tipo: "texto", texto: "la" })).toEqual([]);
    r.pasa(900); // 1100 ms desde la última hora: este trozo lleva la suya y empieza otra línea
    expect(w.anotar({ tipo: "texto", texto: ", mu" }).map(sinSobre)).toEqual([{ tipo: "texto", texto: "Hola" }]);
    r.pasa(10);
    expect(w.anotar({ tipo: "texto", texto: "ndo" })).toEqual([]);
    expect(w.anotar({ tipo: "herramienta", id: "h1", estado: "completed" }).map(sinSobre)).toEqual([
      { tipo: "texto", texto: ", mundo", ts: 2100 },
      { tipo: "herramienta", id: "h1", estado: "completed", ts: 2110 },
    ]);
    const l = leerFichero(ruta);
    expect(l.valida).toBe(true);
    expect(l.eventos.map((e) => [e.n, e.tipo, (e as { texto?: string }).texto])).toEqual([
      [0, "dueno", undefined],
      [1, "texto", "Hola"],
      [2, "texto", ", mundo"],
      [3, "herramienta", undefined],
    ]);
  });

  it("otro tipo, o un texto que lleva algo más que su texto, corta la junta", () => {
    const ruta = nueva();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: () => 1 });
    w.anotar({ tipo: "texto", texto: "a" });
    w.anotar({ tipo: "pensamiento", texto: "b" });
    w.anotar({ tipo: "pensamiento", texto: "c" });
    w.anotar({ tipo: "texto", texto: "una respuesta entera", chat: {} });
    expect(leerFichero(ruta).eventos.slice(1).map(sinSobre)).toEqual([
      { tipo: "texto", texto: "a" },
      { tipo: "pensamiento", texto: "bc" },
      { tipo: "texto", texto: "una respuesta entera", chat: {} },
    ]);
  });

  it("lo que espera se escribe al vaciar o al sincronizar (antes, quien lee no lo ve)", () => {
    const ruta = nueva();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: () => 1 });
    w.anotar({ tipo: "texto", texto: "a" });
    expect(leerFichero(ruta).eventos).toHaveLength(1);
    expect(w.vaciar().map(sinSobre)).toEqual([{ tipo: "texto", texto: "a" }]);
    expect(w.vaciar()).toEqual([]);
    w.anotar({ tipo: "texto", texto: "b" });
    w.sincronizar();
    expect(leerFichero(ruta).eventos.slice(1).map(sinSobre)).toEqual([
      { tipo: "texto", texto: "a" },
      { tipo: "texto", texto: "b" },
    ]);
  });

  it("si lo que sigue no se puede escribir, lo que esperaba queda escrito una sola vez", () => {
    const ruta = nueva();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: () => 1, validar: false });
    w.anotar({ tipo: "texto", texto: "a" });
    expect(() => w.anotar({ tipo: "raro", n: 5 } as unknown as Evento)).toThrow(/sobre/);
    expect(w.vaciar()).toEqual([]);
    expect(leerFichero(ruta).eventos.slice(1).map(sinSobre)).toEqual([{ tipo: "texto", texto: "a" }]);
  });

  it("sin juntar, cada trozo es su línea", () => {
    const ruta = nueva();
    const w = Escritor.abrir(ruta, { de: "pc", ahora: () => 1, juntar: false });
    expect(w.anotar({ tipo: "texto", texto: "a" }).map(sinSobre)).toEqual([{ tipo: "texto", texto: "a" }]);
    w.anotar({ tipo: "texto", texto: "b" });
    expect(leerFichero(ruta).eventos.slice(1).map(sinSobre)).toEqual([
      { tipo: "texto", texto: "a" },
      { tipo: "texto", texto: "b" },
    ]);
  });

  it("una tarea del Taller escrita con el Escritor da lo mismo que juntarPorLatido", () => {
    const eventos = tallerSintetico({ semilla: 5, turnos: 4 }) as Evento[];
    const ruta = nueva();
    let hora = eventos.find((e) => e.ts !== undefined)!.ts!;
    const w = Escritor.abrir(ruta, { de: "pc", ahora: () => hora });
    // el reloj va por la última hora apuntada: un trozo sin hora sigue sin ella
    for (const e of eventos) {
      if (e.ts !== undefined) hora = e.ts;
      w.anotar(e);
    }
    w.vaciar();
    const l = leerFichero(ruta);
    expect(l.valida).toBe(true);
    const juntos = juntarPorLatido(eventos);
    expect(l.eventos.slice(1).map(sinSobre)).toEqual(juntos);
    expect(juntos.length).toBeLessThan(eventos.length / 3);
  });
});
