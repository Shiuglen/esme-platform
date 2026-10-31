/**
 * REPRODUCIR UNA SESIÓN — el estado es lo que sale de leer el registro.
 *
 * Lo que se prueba:
 *
 *   1. un registro del Taller de hoy (formato 1) da sus turnos: lo que se
 *      pidió, lo que respondió, lo que pensó, sus pasos, su plan y su fin;
 *   2. con sobre: la sesión, el dueño, su época, los puntos, el traspaso y el
 *      cierre; un `orden {mensaje}` abre el turno y el `usuario` va con él;
 *   3. los permisos que esperan, en dos tiempos;
 *   4. rebobinar: el contenido vuelve, lo gastado no; y leer el estado en el
 *      evento n sin tocar nada;
 *   5. reproducir es puro, y un tipo que no se conoce no se aplica;
 *   6. plegado, un turno del estado es un turno de estandar/turno.spec.yaml.
 *
 * Referencia: core/sesiones/reductor.ts, estandar/sesion.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { erroresTurno } from "../core/turnos/turno.ts";
import { CLAVES_ESTADO, CLAVES_TURNO_ESTADO, estadoDe, estadoEn, turnoDelContrato } from "../core/sesiones/reductor.ts";
import { CADENA_VACIA, leer, sellar, type Cadena, type Evento, type Linea } from "../core/sesiones/registro.ts";

/** Sella eventos (con el aparato de cada uno) y lee el registro. */
function sesion(eventos: Array<Evento | [Evento, string]>) {
  let c: Cadena = CADENA_VACIA;
  let texto = "";
  for (const x of eventos) {
    const [e, de] = Array.isArray(x) ? x : [x, "pc"];
    const r = sellar(c, e, de);
    texto += `${r.linea}\n`;
    c = r.cadena;
  }
  const l = leer(texto);
  expect(l.problemas).toEqual([]);
  return l;
}

const taller: Linea[] = [
  { tipo: "opciones", opciones: [{ id: "modelo", nombre: "Modelo", actual: "m1", valores: [] }], ts: 0 },
  { tipo: "contexto", usado: 10, total: 100, ts: 0 },
  { tipo: "usuario", texto: "Arregla el reloj\ncon cuidado", ts: 1000 },
  { tipo: "herencia", tokens: 300, recuerdos: 2, ts: 1001 },
  { tipo: "pensamiento", texto: "Miro ", ts: 1002 },
  { tipo: "pensamiento", texto: "el fichero" },
  { tipo: "plan", pasos: [{ texto: "Leer", estado: "in_progress" }], ts: 1003 },
  { tipo: "herramienta", id: "h1", titulo: "Leer reloj.ts", clase: "read", estado: "pending", ts: 1004 },
  { tipo: "herramienta", id: "h1", estado: "completed", ts: 1100 },
  {
    tipo: "herramienta",
    id: "h2",
    titulo: "Editar reloj.ts",
    clase: "edit",
    estado: "completed",
    diff: [{ ruta: "reloj.ts", antes: "a\nb\n", despues: "a\nB\nc\n" }],
    ts: 1200,
  },
  { tipo: "texto", texto: "Hecho: ", ts: 1300 },
  { tipo: "texto", texto: "el reloj ya va." },
  { tipo: "plan", pasos: [{ texto: "Leer", estado: "completed" }], ts: 1301 },
  { tipo: "fin", motivo: "end_turn", ms: 400, tokens: { entrada: 50, salida: 20, pensamiento: 5 }, ts: 1400 },
  { tipo: "usuario", texto: "Y la alarma", ts: 2000 },
  { tipo: "fallo", mensaje: "Se cayó el motor", ts: 2100 },
  { tipo: "fallo", mensaje: "Otra vez", ts: 2200 },
];

describe("un registro del Taller de hoy (formato 1)", () => {
  const s = estadoDe(taller);

  it("da sus turnos: lo que se pidió, respondió y pensó", () => {
    expect(s.formato).toBe(1);
    expect(s.turnos).toHaveLength(2);
    expect(s.turnos[0]).toMatchObject({
      n: 1,
      desde: 2,
      hasta: 13,
      pedido: "Arregla el reloj\ncon cuidado",
      respuesta: "Hecho: el reloj ya va.",
      pensamiento: "Miro el fichero",
      herencia: { tokens: 300, recuerdos: 2 },
      fin: { motivo: "end_turn", ms: 400, tokens: { entrada: 50, salida: 20, pensamiento: 5 } },
      error: null,
    });
    expect(s.turnos[1]).toMatchObject({ n: 2, desde: 14, hasta: 16, pedido: "Y la alarma", respuesta: "", fin: null });
  });

  it("los pasos se juntan por id, en el orden en que empezaron", () => {
    expect(s.turnos[0].pasos).toEqual([
      { id: "h1", titulo: "Leer reloj.ts", clase: "read", estado: "completed" },
      {
        id: "h2",
        titulo: "Editar reloj.ts",
        clase: "edit",
        estado: "completed",
        diff: [{ ruta: "reloj.ts", antes: "a\nb\n", despues: "a\nB\nc\n" }],
      },
    ]);
  });

  it("el plan es el último; el error, el primero (como la traza)", () => {
    expect(s.turnos[0].plan).toEqual([{ texto: "Leer", estado: "completed" }]);
    expect(s.plan).toEqual([{ texto: "Leer", estado: "completed" }]);
    expect(s.turnos[1].error).toBe("Se cayó el motor");
  });

  it("lo que el motor anuncia al abrir no abre turno, y queda en el estado", () => {
    expect(s.opciones.map((o) => o.actual)).toEqual(["m1"]);
    expect(s.contexto).toEqual({ usado: 10, total: 100 });
  });

  it("lo gastado es la suma de lo que dice cada fin", () => {
    expect(s.uso).toEqual({ entrada: 50, salida: 20, pensamiento: 5 });
    expect(s.eventos).toBe(17);
  });

  it("sin sobre no hay dueño ni sesión", () => {
    expect(s).toMatchObject({ sesion: null, epoca: 0, dueno: null, cerrada: false, traspaso: null });
  });
});

describe("con sobre: el dueño, los puntos, el traspaso y el cierre", () => {
  const l = sesion([
    { tipo: "dueno", sesion: "s-9", origen: "taller" },
    { tipo: "orden", que: "mensaje", texto: "Hola", desde: "movil" },
    { tipo: "usuario", texto: "[relevo] Hola" },
    { tipo: "texto", texto: "¡Hola!" },
    { tipo: "fin", motivo: "end_turn", ms: 5 },
    { tipo: "punto", commit: "abc123", rama: "esme/s-9" },
    { tipo: "traspaso", a: "el-101", motivo: "mudarse" },
    [{ tipo: "dueno" }, "el-101"],
    [{ tipo: "usuario", texto: "Sigue" }, "el-101"],
    [{ tipo: "cierre", motivo: "hecha" }, "el-101"],
  ]);
  const s = estadoDe(l);

  it("la sesión, su formato, y el dueño de ahora con su época", () => {
    expect(s).toMatchObject({ sesion: "s-9", formato: 2, epoca: 2, dueno: "el-101", cerrada: true, traspaso: null });
  });

  it("el estado y sus turnos tienen las claves que dice la spec, ni una más", () => {
    // la conformidad compara la spec con estas listas; esto, las listas con lo que sale de verdad
    expect(Object.keys(s).sort()).toEqual([...CLAVES_ESTADO].sort());
    for (const t of s.turnos) expect(Object.keys(t).sort()).toEqual([...CLAVES_TURNO_ESTADO].sort());
  });

  it("la orden abre el turno y el usuario (lo que recibió el motor) va con ella", () => {
    expect(s.turnos.map((t) => [t.n, t.pedido, t.respuesta])).toEqual([
      [1, "Hola", "¡Hola!"],
      [2, "Sigue", ""],
    ]);
    // un turno llega hasta antes del siguiente: su punto (y lo que pasó después) es suyo
    expect(s.turnos[0]).toMatchObject({ desde: 1, hasta: 7 });
    expect(s.turnos[1]).toMatchObject({ desde: 8, hasta: 9 });
  });

  it("el `usuario` es el de la orden solo hasta que el motor dice algo: después, abre otro turno", () => {
    const s = estadoDe(
      sesion([
        { tipo: "dueno", sesion: "s-e" },
        { tipo: "orden", que: "mensaje", texto: "Hola" },
        { tipo: "opciones", opciones: [] }, // un anuncio no es el motor diciendo algo
        { tipo: "usuario", texto: "Hola" },
        { tipo: "texto", texto: "¡Hola!" },
        { tipo: "fin", motivo: "end_turn", ms: 5 },
        { tipo: "orden", que: "mensaje", texto: "Cuenta" }, // nadie dice lo que recibió el motor…
        { tipo: "texto", texto: "Uno." },
        { tipo: "fin", motivo: "end_turn", ms: 5 },
        { tipo: "usuario", texto: "<aviso>acabó</aviso>" }, // …así que esto es otro turno, no el suyo
        { tipo: "texto", texto: "Visto." },
      ]),
    );
    expect(s.turnos.map((t) => [t.pedido, t.respuesta])).toEqual([
      ["Hola", "¡Hola!"],
      ["Cuenta", "Uno."],
      ["<aviso>acabó</aviso>", "Visto."],
    ]);
  });

  it("los puntos, con el evento en que se apuntaron", () => {
    expect(s.puntos).toEqual([{ n: 5, commit: "abc123", rama: "esme/s-9" }]);
  });

  it("un traspaso espera hasta que el nuevo dueño llega", () => {
    expect(estadoEn(l, 6)).toMatchObject({ traspaso: { a: "el-101", motivo: "mudarse" }, dueno: "pc", epoca: 1 });
    expect(estadoEn(l, 7)).toMatchObject({ traspaso: null, dueno: "el-101", epoca: 2 });
  });
});

describe("los permisos que esperan", () => {
  const opciones = [{ id: "si", nombre: "Sí", tipo: "allow_once" }];
  const base: Linea[] = [
    { tipo: "usuario", texto: "Limpia" },
    { tipo: "permiso", titulo: "Borrar x", id: "p1", opciones },
    { tipo: "permiso", titulo: "Leer y", id: "p2", clase: "read" },
  ];

  it("la pregunta espera; la respuesta (por id, o la más antigua) la quita", () => {
    expect(estadoDe(base).permisos).toEqual([
      { titulo: "Borrar x", id: "p1", opciones },
      { titulo: "Leer y", id: "p2", clase: "read" },
    ]);
    const conId = [...base, { tipo: "permiso", titulo: "Leer y", id: "p2", concedido: true, ms: 30 } as Linea];
    expect(estadoDe(conId).permisos.map((p) => p.id)).toEqual(["p1"]);
    const sinId = [...base, { tipo: "permiso", titulo: "Borrar x", concedido: false, ms: 50 } as Linea];
    expect(estadoDe(sinId).permisos.map((p) => p.id)).toEqual(["p2"]);
  });

  it("la respuesta suelta del Taller de hoy (sin pregunta) no quita nada", () => {
    const hoy: Linea[] = [{ tipo: "usuario", texto: "x" }, { tipo: "permiso", titulo: "Leer", concedido: true, ms: 9 }];
    expect(estadoDe(hoy).permisos).toEqual([]);
  });
});

describe("rebobinar: el contenido vuelve, lo gastado no", () => {
  const tokens = (entrada: number) => ({ entrada, salida: 1, pensamiento: 0 });
  const base: Evento[] = [
    { tipo: "dueno", sesion: "s-r" }, // 0
    { tipo: "orden", que: "mensaje", texto: "uno" }, // 1
    { tipo: "texto", texto: "r1" }, // 2
    { tipo: "fin", motivo: "end_turn", ms: 1, tokens: tokens(10) }, // 3
    { tipo: "orden", que: "mensaje", texto: "dos" }, // 4
    { tipo: "plan", pasos: [{ texto: "x", estado: "pending" }] }, // 5
    { tipo: "permiso", titulo: "Borrar", id: "p" }, // 6
    { tipo: "fin", motivo: "cancelled", ms: 1, tokens: tokens(20) }, // 7
    { tipo: "punto", commit: "c2" }, // 8
  ];
  const antes = sesion(base);
  const tras = (...mas: Evento[]) => estadoDe(sesion([...base, ...mas]));

  it("vuelve a como estaba tras el evento `hasta`: sin los turnos, el plan ni los puntos de después", () => {
    const s = tras({ tipo: "orden", que: "rebobinar", hasta: 3 }, { tipo: "orden", que: "mensaje", texto: "tres" });
    expect(s.turnos.map((t) => [t.n, t.pedido])).toEqual([
      [1, "uno"],
      [2, "tres"],
    ]);
    expect(s.plan).toBeNull();
    expect(s.puntos).toEqual([]);
    expect(s.permisos).toEqual([]);
    // lo gastado no vuelve: los dos turnos se pagaron
    expect(s.uso).toEqual({ entrada: 30, salida: 2, pensamiento: 0 });
  });

  it("-1 es antes del primer evento; un `hasta` del futuro no hace nada", () => {
    expect(tras({ tipo: "orden", que: "rebobinar", hasta: -1 }).turnos).toEqual([]);
    expect(tras({ tipo: "orden", que: "rebobinar", hasta: 99 }).turnos).toHaveLength(2);
  });

  it("un permiso que esperaba ya no espera", () => {
    expect(tras({ tipo: "orden", que: "rebobinar", hasta: 6 }).permisos).toEqual([]);
    expect(estadoEn(antes, 6).permisos).toHaveLength(1);
  });

  it("leer el estado en el evento n es reproducir hasta ahí, sin tocar el registro", () => {
    const enCuatro = estadoEn(antes, 4);
    expect(enCuatro.turnos.map((t) => t.pedido)).toEqual(["uno", "dos"]);
    expect(enCuatro.eventos).toBe(5);
    expect(estadoEn(antes, 3)).toEqual(estadoDe(antes.eventos.slice(0, 4)));
    expect(estadoDe(antes).turnos).toHaveLength(2);
  });
});

describe("reproducir es puro", () => {
  it("el mismo registro da el mismo estado, y no lo toca", () => {
    const copia = structuredClone(taller);
    expect(estadoDe(taller)).toEqual(estadoDe(taller));
    expect(taller).toEqual(copia);
  });

  it("un tipo que no se conoce se conserva en el registro y no se aplica", () => {
    const con = [...taller.slice(0, 3), { tipo: "holograma", cara: 3 } as unknown as Linea, ...taller.slice(3)];
    const s = estadoDe(con);
    expect(s.turnos.map((t) => t.respuesta)).toEqual(estadoDe(taller).turnos.map((t) => t.respuesta));
    expect(s.eventos).toBe(18);
  });
});

describe("plegado, un turno del estado es un turno del contrato", () => {
  it("pregunta, respuesta, pasos y lo que cambió en cada fichero", () => {
    const t = turnoDelContrato(estadoDe(taller).turnos[0], { id: "tarea-1#1", motor: "claude" });
    expect(t).toMatchObject({
      id: "tarea-1#1",
      motor: "claude",
      modo: "estandar",
      pregunta: "Arregla el reloj\ncon cuidado",
      respuesta: "Hecho: el reloj ya va.",
      actividad: [
        { paso: "Leer reloj.ts", estado: "ok" },
        { paso: "Editar reloj.ts", estado: "ok" },
      ],
      cambios: [{ ruta: "reloj.ts", anadidos: 2, borrados: 1 }],
    });
    expect(erroresTurno(t)).toEqual([]);
  });

  it("un paso que falló o no terminó es un fallo; un fichero nuevo, todo añadido", () => {
    const s = estadoDe([
      { tipo: "usuario", texto: "x" },
      { tipo: "herramienta", id: "a", titulo: "Ejecutar", estado: "failed", detalle: "exit 1" },
      { tipo: "herramienta", id: "b", titulo: "Crear n.ts", estado: "in_progress", diff: [{ ruta: "n.ts", despues: "1\n2\n" }] },
      { tipo: "texto", texto: "Lo intenté" },
    ]);
    const t = turnoDelContrato(s.turnos[0], { id: "t", motor: "m" });
    expect(t.actividad).toEqual([
      { paso: "Ejecutar", estado: "fallo", detalle: "exit 1" },
      { paso: "Crear n.ts", estado: "fallo" },
    ]);
    expect(t.cambios).toEqual([{ ruta: "n.ts", anadidos: 2, borrados: 0 }]);
  });
});
