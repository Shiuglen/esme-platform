/**
 * LA TRAZA DE UNA SESIÓN — la misma que la del Taller de la app.
 *
 * Lo que se prueba:
 *
 *   1. los casos de la traza de la app (app/src/main/taller/traza.test.ts),
 *      uno por uno, con los mismos números;
 *   2. 48 tareas inventadas, resumidas por la `trazaDe` REAL de la app
 *      (tests/fixtures/sesiones/traza-app.json, generado con
 *      scripts/sesiones/traza-app.ts): la del kit da exactamente lo mismo;
 *   3. con sobre: la orden abre el turno, la pregunta de un permiso no es una
 *      espera, y lo de la sesión (puntos, dueños) no es tiempo del motor.
 *
 * Referencia: core/sesiones/traza.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { trazaDe, type Traza } from "../core/sesiones/traza.ts";
import { tallerSintetico, type OpcionesSintetico } from "../core/sesiones/sintetico.ts";
import { CADENA_VACIA, leer, sellar, sinSobre, type Cadena, type Evento, type Linea } from "../core/sesiones/registro.ts";
import { huellaDe } from "../scripts/sesiones/traza-app.ts";

const usuario = (texto: string, ts?: number): Linea => ({ tipo: "usuario", texto, ...(ts !== undefined ? { ts } : {}) });
const herr = (id: string, estado: string, extra: Record<string, unknown> = {}): Linea => ({ tipo: "herramienta", id, estado, ...extra }) as Linea;
const fin = (ms: number, extra: object = {}): Linea => ({ tipo: "fin", motivo: "end_turn", ms, ...extra }) as Linea;

describe("los casos de la traza de la app", () => {
  it("sin hora (las tareas de antes): cuenta turnos, herramientas y fallos, y no inventa tiempos", () => {
    const t = trazaDe([
      usuario("Arregla el reloj\ncon cuidado"),
      herr("h1", "pending", { titulo: "Leer a.ts", clase: "read" }),
      herr("h1", "completed"),
      herr("h2", "pending", { titulo: "npm test", clase: "execute" }),
      herr("h2", "failed", { detalle: "exit 1" }),
      fin(5000),
      usuario("otra"),
      herr("h3", "completed", { titulo: "Editar b.ts", clase: "edit" }),
      fin(2000),
    ]);
    expect(t.conHoras).toBe(false);
    expect(t.turnos).toEqual([
      { n: 1, pedido: "Arregla el reloj", ms: 5000, motivo: "end_turn", error: null, herramientas: 2, fallidas: 1, tokens: null, tiempo: null, cascada: null },
      { n: 2, pedido: "otra", ms: 2000, motivo: "end_turn", error: null, herramientas: 1, fallidas: 0, tokens: null, tiempo: null, cascada: null },
    ]);
    expect(t.porClase).toEqual([
      { clase: "read", veces: 1, fallidas: 0, ms: null },
      { clase: "execute", veces: 1, fallidas: 1, ms: null },
      { clase: "edit", veces: 1, fallidas: 0, ms: null },
    ]);
    expect(t.fallidas).toEqual([{ titulo: "npm test", clase: "execute", detalle: "exit 1" }]);
    expect(t).toMatchObject({ tiempo: null, lentas: [], silencio: null });
  });

  it("con hora: el modelo, las herramientas, tu espera y el proveedor, sin contar dos veces el mismo rato", () => {
    const t = trazaDe([
      usuario("Pasa los tests", 0),
      herr("h1", "pending", { titulo: "npm test", clase: "execute", ts: 1000 }),
      { tipo: "permiso", titulo: "npm test", clase: "execute", concedido: true, ms: 60_000, ts: 61_000 },
      herr("h1", "in_progress", { ts: 61_000 }),
      herr("h1", "completed", { ts: 91_000 }),
      { tipo: "reintento", ms: 10_000, motivo: "Rate limit", ts: 95_000 },
      { tipo: "texto", texto: "listo", ts: 106_000 },
      fin(120_000, { ts: 120_000, tokens: { entrada: 5000, salida: 300, pensamiento: 0 } }),
    ]);
    const tiempo = { modelo: 20_000, herramientas: 30_000, espera: 60_000, proveedor: 10_000 };
    expect(t.turnos[0]).toMatchObject({ ms: 120_000, tokens: { entrada: 5000, salida: 300, pensamiento: 0 }, tiempo });
    expect(t.tiempo).toEqual(tiempo);
    expect(t.lentas).toEqual([{ titulo: "npm test", clase: "execute", ms: 30_000 }]);
    expect(t.porClase).toEqual([{ clase: "execute", veces: 1, fallidas: 0, ms: 30_000 }]);
  });

  it("dos herramientas a la vez no suman dos veces el mismo rato", () => {
    const t = trazaDe([
      usuario("x", 0),
      herr("a", "pending", { titulo: "Leer a", clase: "read", ts: 0 }),
      herr("b", "pending", { titulo: "Leer b", clase: "read", ts: 0 }),
      herr("a", "completed", { ts: 10_000 }),
      herr("b", "completed", { ts: 20_000 }),
      fin(30_000, { ts: 30_000 }),
    ]);
    expect(t.turnos[0].tiempo).toEqual({ modelo: 10_000, herramientas: 20_000, espera: 0, proveedor: 0 });
    expect(t.porClase).toEqual([{ clase: "read", veces: 2, fallidas: 0, ms: 30_000 }]);
  });

  it("el silencio más largo: sin herramienta, permiso ni reintento en marcha, y dice después de qué", () => {
    const t = trazaDe([
      usuario("x", 0),
      herr("h1", "pending", { titulo: "Leer a.ts", clase: "read", ts: 1000 }),
      herr("h1", "completed", { ts: 2000 }),
      { tipo: "pensamiento", texto: "…", ts: 152_000 },
      herr("h2", "pending", { titulo: "npm test", clase: "execute", ts: 153_000 }),
      herr("h2", "completed", { ts: 353_000 }),
      fin(360_000, { ts: 360_000 }),
    ]);
    expect(t.silencio).toEqual({ ms: 150_000, despues: "«Leer a.ts»" });
  });

  it("un silencio corto no es un atasco", () => {
    const t = trazaDe([usuario("x", 0), { tipo: "texto", texto: "a", ts: 20_000 }, fin(25_000, { ts: 25_000 })]);
    expect(t.silencio).toBeNull();
  });

  it("un turno que acaba en error: dura lo que dice su hora, dice por qué, y sus tokens no se saben", () => {
    const t = trazaDe([
      usuario("x", 0),
      { tipo: "texto", texto: "a", ts: 1000 },
      { tipo: "fallo", mensaje: "Internal error", ts: 8000 },
      { tipo: "fallo", mensaje: "No queda otro motor tuyo con cuenta y cuota para seguir", ts: 8000 },
    ]);
    expect(t.turnos[0]).toMatchObject({ ms: 8000, motivo: null, error: "Internal error", tokens: null });
  });

  it("las que fallaron, en orden y como mucho ocho; las más lentas, tres", () => {
    const ev: Linea[] = [usuario("x", 0)];
    for (let i = 0; i < 10; i++) {
      ev.push(herr(`f${i}`, "pending", { titulo: `falla ${i}`, clase: "execute", ts: i * 1000 }), herr(`f${i}`, "failed", { ts: i * 1000 + (i + 1) * 100 }));
    }
    const t = trazaDe([...ev, fin(20_000, { ts: 20_000 })]);
    expect(t.fallidas.map((f) => f.titulo)).toEqual(["falla 0", "falla 1", "falla 2", "falla 3", "falla 4", "falla 5", "falla 6", "falla 7"]);
    expect(t.lentas.map((l) => l.titulo)).toEqual(["falla 9", "falla 8", "falla 7"]);
    expect(t.turnos[0]).toMatchObject({ herramientas: 10, fallidas: 10 });
  });

  it("la cascada del turno: cada herramienta en su sitio y su tamaño, tu espera, el proveedor y los atascos", () => {
    const B = 5_000_000;
    const t = trazaDe([
      usuario("x", B),
      herr("h1", "pending", { titulo: "npm test", clase: "execute", ts: B + 1000 }),
      { tipo: "permiso", titulo: "npm test", clase: "execute", concedido: true, ms: 60_000, ts: B + 61_000 },
      herr("h1", "completed", { ts: B + 91_000 }),
      herr("h2", "pending", { titulo: "Leer a.ts", clase: "read", ts: B + 92_000 }),
      herr("h2", "failed", { ts: B + 93_000, detalle: "ENOENT" }),
      { tipo: "reintento", ms: 10_000, motivo: "Rate limit", ts: B + 95_000 },
      { tipo: "texto", texto: "listo", ts: B + 150_000 },
      fin(160_000, { ts: B + 160_000 }),
    ]);
    expect(t.turnos[0].cascada).toEqual({
      total: 160_000,
      barras: [
        { titulo: "npm test", clase: "execute", desde: 1000, ms: 90_000, estado: "completed" },
        { titulo: "Leer a.ts", clase: "read", desde: 92_000, ms: 1000, estado: "failed", detalle: "ENOENT" },
      ],
      esperas: [[1000, 61_000]],
      proveedor: [[95_000, 105_000]],
      silencios: [[105_000, 150_000]],
      omitidas: 0,
    });
    expect(t.silencio).toEqual({ ms: 45_000, despues: "esperar al proveedor" });
  });

  it("una cascada con cientos de herramientas guarda las 120 más largas, en orden, y dice cuántas omitió", () => {
    const ev: Linea[] = [usuario("x", 0)];
    for (let i = 0; i < 130; i++) {
      ev.push(herr(`h${i}`, "pending", { titulo: `h${i}`, clase: "read", ts: i * 100 }), herr(`h${i}`, "completed", { ts: i * 100 + (i < 10 ? 1 : 50) }));
    }
    const c = trazaDe([...ev, fin(20_000, { ts: 20_000 })]).turnos[0].cascada!;
    expect(c.barras).toHaveLength(120);
    expect(c.omitidas).toBe(10);
    expect(c.barras[0].titulo).toBe("h10");
    expect(c.barras.every((b, i) => i === 0 || c.barras[i - 1].desde <= b.desde)).toBe(true);
  });

  it("solo los últimos ocho turnos traen su cascada (lo que se ve), y sin hora no hay cascada", () => {
    const ev: Linea[] = [];
    for (let i = 0; i < 10; i++) ev.push(usuario(`t${i}`, i * 10_000), fin(5000, { ts: i * 10_000 + 5000 }));
    expect(trazaDe(ev).turnos.map((x) => x.cascada !== null)).toEqual([false, false, true, true, true, true, true, true, true, true]);
    expect(trazaDe([usuario("x"), fin(5000)]).turnos[0].cascada).toBeNull();
  });

  it("lo que un motor anuncia al abrir su sesión no es un turno: el primero empieza con tu mensaje", () => {
    const t = trazaDe([
      { tipo: "opciones", opciones: [{ id: "model", nombre: "Modelo", actual: "a", valores: [] }], ts: 0 },
      { tipo: "uso", entrada: 0, salida: 0, ts: 0 },
      usuario("Arregla el reloj", 10),
      fin(1000, { ts: 1010 }),
    ]);
    expect(t.turnos.map((x) => x.pedido)).toEqual(["Arregla el reloj"]);
  });
});

describe("la misma traza que la app, sobre tareas que nadie eligió a mano", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/sesiones/traza-app.json", import.meta.url), "utf8")) as {
    casos: Array<{ opciones: OpcionesSintetico; huella: string; eventos: number; traza: Traza }>;
  };

  it("hay casos de todo: sin hora, con muchos turnos y con más herramientas de las que se pintan", () => {
    expect(fixture.casos.length).toBeGreaterThanOrEqual(40);
    expect(fixture.casos.some((c) => !c.traza.conHoras)).toBe(true);
    expect(fixture.casos.some((c) => c.traza.turnos.length > 8)).toBe(true);
    expect(fixture.casos.some((c) => c.traza.turnos.some((t) => (t.cascada?.omitidas ?? 0) > 0))).toBe(true);
    expect(fixture.casos.some((c) => c.traza.silencio !== null)).toBe(true);
  });

  it.each(fixture.casos.map((c) => [c.opciones.semilla, c] as const))("tarea %i", (_, caso) => {
    const eventos = tallerSintetico(caso.opciones);
    // si el generador cambió, los casos se rehacen con la app (scripts/sesiones/traza-app.ts)
    expect(huellaDe(eventos), "el generador cambió: rehaz los casos").toBe(caso.huella);
    expect(trazaDe(eventos)).toEqual(caso.traza);
  });
});

describe("con sobre", () => {
  function sesion(eventos: Evento[], de = "pc"): Linea[] {
    let c: Cadena = CADENA_VACIA;
    let texto = "";
    for (const e of eventos) {
      const r = sellar(c, e, de);
      texto += `${r.linea}\n`;
      c = r.cadena;
    }
    const l = leer(texto);
    expect(l.problemas).toEqual([]);
    return l.eventos;
  }
  const motor: Evento[] = [
    { tipo: "herramienta", id: "h1", titulo: "npm test", clase: "execute", estado: "pending", ts: 1000 },
    { tipo: "herramienta", id: "h1", estado: "completed", ts: 5000 },
    { tipo: "texto", texto: "listo", ts: 6000 },
    { tipo: "fin", motivo: "end_turn", ms: 7000, ts: 7000 },
  ];

  it("la orden abre el turno con lo que pediste, y el usuario que le sigue va con ella", () => {
    const v1 = trazaDe([usuario("Pasa los tests", 0), ...(motor as Linea[])]);
    const v2 = trazaDe(
      sesion([
        { tipo: "dueno", sesion: "s", ts: 0 },
        { tipo: "orden", que: "mensaje", texto: "Pasa los tests", desde: "movil", ts: 0 },
        { tipo: "usuario", texto: "[relevo] Pasa los tests", ts: 0 },
        ...motor,
        { tipo: "punto", commit: "abc", ts: 7001 },
      ]),
    );
    expect(v2).toEqual(v1);
  });

  it("la pregunta de un permiso no es una espera; la respuesta sí", () => {
    const con = trazaDe([
      usuario("x", 0),
      { tipo: "permiso", titulo: "npm test", id: "p", ts: 500 },
      { tipo: "permiso", titulo: "npm test", id: "p", concedido: true, ms: 400, ts: 900 },
      ...(motor as Linea[]),
    ]);
    const sin = trazaDe([usuario("x", 0), { tipo: "permiso", titulo: "npm test", concedido: true, ms: 400, ts: 900 }, ...(motor as Linea[])]);
    expect(con).toEqual(sin);
    expect(con.turnos[0].tiempo?.espera).toBe(400);
  });

  it("sinSobre no cambia la traza: el sobre no es tiempo", () => {
    const l = sesion([{ tipo: "dueno", ts: 0 }, { tipo: "usuario", texto: "x", ts: 0 }, ...motor]);
    expect(trazaDe(l)).toEqual(trazaDe(l.map(sinSobre) as Linea[]));
  });
});
