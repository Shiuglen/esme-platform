/**
 * COMPACTAR — otro registro, más pequeño, que se reproduce igual.
 *
 * Lo que se prueba:
 *
 *   1. los trozos seguidos se juntan, con cada hora en sus latidos;
 *   2. la traza no cambia (también la de las 48 tareas resumidas por la app),
 *      y el estado tampoco, salvo los números de evento, que se mueven;
 *   3. un `rebobinar` corta la junta y se reescribe a su sitio nuevo;
 *   4. el registro compactado verifica, compactarlo otra vez no lo cambia, y
 *      el del chat da el mismo Hilo;
 *   5. cuánto encoge una tarea del tamaño de la más larga de hoy;
 *   6. juntar al escribir (por latido) tampoco cambia la traza ni el estado.
 *
 * Referencia: core/sesiones/compactar.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compactar, juntarPorLatido } from "../core/sesiones/compactar.ts";
import { estadoDe, type Estado } from "../core/sesiones/reductor.ts";
import { trazaDe, type Traza } from "../core/sesiones/traza.ts";
import { eventosDelGuardado, hiloDe, type Hilo } from "../core/sesiones/hilo.ts";
import { tallerSintetico, type OpcionesSintetico } from "../core/sesiones/sintetico.ts";
import { CADENA_VACIA, leer, sellar, type Cadena, type Evento, type Linea } from "../core/sesiones/registro.ts";

/** Las 48 tareas resumidas por la traza de la app (scripts/sesiones/traza-app.ts). */
const casos = JSON.parse(readFileSync(new URL("./fixtures/sesiones/traza-app.json", import.meta.url), "utf8")).casos as Array<{
  opciones: OpcionesSintetico;
  traza: Traza;
}>;

/** Las líneas de un registro del formato 1 (como las escribe el Taller). */
const v1 = (eventos: Linea[]) => eventos.map((e) => JSON.stringify(e)).join("\n") + "\n";

/** Sella eventos en un registro del formato 2. */
function v2(eventos: Evento[], de = "pc", desde: Cadena = CADENA_VACIA): string {
  let c = desde;
  let texto = "";
  for (const e of eventos) {
    const r = sellar(c, e, de);
    texto += `${r.linea}\n`;
    c = r.cadena;
  }
  return texto;
}

/** El estado sin los números de evento (compactar los mueve: es lo único que cambia). */
function sinPosiciones(s: Estado) {
  return {
    ...s,
    eventos: undefined,
    turnos: s.turnos.map((t) => ({ ...t, desde: undefined, hasta: undefined })),
    puntos: s.puntos.map((p) => ({ ...p, n: undefined })),
  };
}

describe("los trozos seguidos, en un solo evento", () => {
  it("el texto entero, y cada hora en sus latidos", () => {
    const t = v1([
      { tipo: "usuario", texto: "x", ts: 500 },
      { tipo: "texto", texto: "Ho", ts: 1000 },
      { tipo: "texto", texto: "la" },
      { tipo: "texto", texto: ", ", ts: 2100 },
      { tipo: "texto", texto: "mundo", ts: 3200 },
      { tipo: "pensamiento", texto: "y ahora", ts: 3300 },
      { tipo: "pensamiento", texto: " pienso" },
      { tipo: "fin", motivo: "end_turn", ms: 3000, ts: 3500 },
    ]);
    const c = compactar(leer(t));
    expect(c.eventos).toEqual([
      { tipo: "usuario", texto: "x", ts: 500 },
      { tipo: "texto", texto: "Hola, mundo", latidos: [1100, 1100], ts: 1000 },
      { tipo: "pensamiento", texto: "y ahora pienso", ts: 3300 },
      { tipo: "fin", motivo: "end_turn", ms: 3000, ts: 3500 },
    ]);
    expect(c.mapa).toEqual([0, 1, 1, 1, 1, 2, 2, 3]);
    expect(c.antes.eventos).toBe(8);
    expect(c.despues.eventos).toBe(4);
  });

  it("si el primer trozo no tiene hora, el primer latido es la hora entera", () => {
    const c = compactar(
      leer(
        v1([
          { tipo: "usuario", texto: "x", ts: 4000 },
          { tipo: "herramienta", id: "h", estado: "completed", ts: 4500 },
          { tipo: "texto", texto: "a" },
          { tipo: "texto", texto: "b", ts: 5000 },
          { tipo: "texto", texto: "c", ts: 6000 },
        ]),
      ),
    );
    expect(c.eventos[2]).toEqual({ tipo: "texto", texto: "abc", latidos: [5000, 1000] });
  });

  it("una respuesta del chat (un texto con `chat`) no es un trozo: no se junta", () => {
    const t = v2([
      { tipo: "dueno", sesion: "c" },
      { tipo: "texto", texto: "uno", chat: {} },
      { tipo: "texto", texto: "dos", chat: {} },
    ]);
    expect(compactar(leer(t)).despues.eventos).toBe(3);
  });
});

describe("se reproduce igual", () => {
  it("la traza de las 48 tareas de la app, compactadas, es la que dio la app", () => {
    for (const caso of casos) {
      const c = compactar(leer(v1(tallerSintetico(caso.opciones))));
      expect(trazaDe(c.eventos), `tarea ${caso.opciones.semilla}`).toEqual(caso.traza);
    }
  });

  it("el estado, salvo los números de evento (formato 1 y 2)", () => {
    for (let semilla = 1; semilla <= 20; semilla++) {
      const eventos = tallerSintetico({ semilla, turnos: 6 });
      const l1 = leer(v1(eventos));
      expect(sinPosiciones(estadoDe(compactar(l1).eventos))).toEqual(sinPosiciones(estadoDe(l1)));
      const l2 = leer(v2([{ tipo: "dueno", sesion: `t-${semilla}` }, ...(eventos as Evento[])]));
      expect(l2.valida).toBe(true);
      const c2 = compactar(l2);
      expect(sinPosiciones(estadoDe(c2.eventos))).toEqual(sinPosiciones(estadoDe(l2)));
      expect(trazaDe(c2.eventos)).toEqual(trazaDe(l2));
    }
  });

  it("el registro compactado verifica, y compactarlo otra vez no lo cambia", () => {
    const l = leer(v2([{ tipo: "dueno", sesion: "t" }, ...(tallerSintetico({ semilla: 3, turnos: 4 }) as Evento[])]));
    const una = compactar(l);
    const lc = leer(una.texto);
    expect(lc.valida).toBe(true);
    expect(lc.formato).toBe(2);
    expect(compactar(lc).texto).toBe(una.texto);
  });

  it("un registro del Taller que sigue con sobre (mixto) también", () => {
    const antes = v1(tallerSintetico({ semilla: 9, turnos: 2 }));
    const l0 = leer(antes);
    const t = antes + v2([{ tipo: "dueno", sesion: "t" }, { tipo: "usuario", texto: "sigo" }, { tipo: "texto", texto: "a" }, { tipo: "texto", texto: "b" }], "pc", l0.cadena);
    const l = leer(t);
    const c = compactar(l);
    const lc = leer(c.texto);
    expect(lc.valida).toBe(true);
    expect(lc.formato).toBe("mixto");
    expect(sinPosiciones(estadoDe(lc))).toEqual(sinPosiciones(estadoDe(l)));
  });
});

describe("rebobinar corta la junta", () => {
  it("un trozo al que se rebobina se queda al final de su junta, y el `hasta` va a su sitio nuevo", () => {
    const t = v2([
      { tipo: "dueno", sesion: "s" }, // 0
      { tipo: "usuario", texto: "x" }, // 1
      { tipo: "texto", texto: "a" }, // 2
      { tipo: "texto", texto: "b" }, // 3  ← aquí se rebobina
      { tipo: "texto", texto: "c" }, // 4
      { tipo: "texto", texto: "d" }, // 5
      { tipo: "orden", que: "rebobinar", hasta: 3 }, // 6
      { tipo: "texto", texto: "e" }, // 7
    ]);
    const l = leer(t);
    const c = compactar(l);
    expect(c.eventos.map((e) => (e.tipo === "texto" ? e.texto : e.tipo))).toEqual(["dueno", "usuario", "ab", "cd", "orden", "e"]);
    expect(c.eventos[4]).toMatchObject({ tipo: "orden", que: "rebobinar", hasta: 2 });
    expect(estadoDe(l).turnos[0].respuesta).toBe("abe");
    expect(estadoDe(c.eventos).turnos[0].respuesta).toBe("abe");
  });

  it("el chat, compactado, da el mismo Hilo", () => {
    const h: Hilo = {
      id: "c-abcdef-123456",
      titulo: "hola",
      creado: 1,
      actualizado: 2,
      motor: "m",
      modelo: "x",
      turnos: [
        { role: "user", content: "hola" },
        { role: "assistant", content: "" },
      ],
    };
    let texto = v2([{ tipo: "dueno", sesion: h.id }]);
    const guarda = (x: Hilo) => {
      const l = leer(texto);
      texto += v2(eventosDelGuardado(l, x), "pc", l.cadena);
    };
    guarda(h);
    const arreglado = { ...h, actualizado: 3, turnos: [h.turnos[0], { role: "assistant", content: "vacío", error: true }] };
    guarda(arreglado);
    const c = compactar(leer(texto));
    expect(hiloDe(leer(c.texto))).toEqual(arreglado);
  });
});

describe("cuánto encoge", () => {
  it("una tarea del tamaño de la más larga de hoy (110.484 eventos) encoge más de la mitad", () => {
    const l = leer(v1(tallerSintetico({ semilla: 1, eventos: 110_484 })));
    const c = compactar(l);
    expect(c.antes.eventos).toBe(110_484);
    expect(c.despues.eventos).toBeLessThan(c.antes.eventos / 2);
    expect(c.despues.bytes).toBeLessThan(c.antes.bytes);
    expect(sinPosiciones(estadoDe(c.eventos))).toEqual(sinPosiciones(estadoDe(l)));
    expect(trazaDe(c.eventos)).toEqual(trazaDe(l));
  });
});

describe("juntar al escribir, por latido", () => {
  it("la traza de las 48 tareas de la app no cambia", () => {
    for (const caso of casos) {
      expect(trazaDe(juntarPorLatido(tallerSintetico(caso.opciones))), `tarea ${caso.opciones.semilla}`).toEqual(caso.traza);
    }
  });

  it("el estado tampoco, salvo los números de evento", () => {
    for (let semilla = 1; semilla <= 20; semilla++) {
      const eventos = tallerSintetico({ semilla, turnos: 6 });
      expect(sinPosiciones(estadoDe(juntarPorLatido(eventos)))).toEqual(sinPosiciones(estadoDe(eventos)));
    }
  });

  it("cada línea junta lo de un latido: solo su primer trozo traía hora, y no necesita `latidos`", () => {
    const eventos = tallerSintetico({ semilla: 7, turnos: 5 });
    const juntos = juntarPorLatido(eventos);
    expect(juntos.some((e) => "latidos" in e)).toBe(false);
    // las horas, en el mismo orden: ninguna se pierde ni se inventa
    expect(juntos.flatMap((e) => (e.ts === undefined ? [] : [e.ts]))).toEqual(eventos.flatMap((e) => (e.ts === undefined ? [] : [e.ts])));
    // y el texto entero, en orden
    const texto = (xs: readonly Linea[]) => xs.map((e) => (e.tipo === "texto" || e.tipo === "pensamiento" ? e.texto : "|")).join("");
    expect(texto(juntos)).toBe(texto(eventos));
  });

  it("compactar lo que se juntó al escribir da lo mismo que compactar trozo a trozo", () => {
    const eventos = tallerSintetico({ semilla: 11, turnos: 4 });
    expect(compactar(leer(v1(juntarPorLatido(eventos)))).eventos).toEqual(compactar(leer(v1(eventos))).eventos);
  });
});
