/**
 * EL CHAT COMO SESIÓN — reproducir el registro da el mismo Hilo que se guardó.
 *
 * Lo que se prueba:
 *
 *   1. a mano: el primer guardado, una respuesta más, un recuerdo juzgado, la
 *      última respuesta que se rehace, una conversación que se acorta;
 *   2. al azar: 300 conversaciones con todo lo que hace el chat de la app
 *      (pares de turnos, juicios, respuestas vacías que se arreglan, errores,
 *      cambios de motor y de título) y lo que podría hacer mañana (editar un
 *      turno viejo, borrar, quitar un juicio): tras CADA guardado, el
 *      registro verifica y reproducirlo da exactamente el Hilo guardado;
 *   3. el registro del chat también se lee como sesión (sus turnos).
 *
 * Referencia: core/sesiones/hilo.ts, app/src/main/hilos/hilos.ts.
 */
import { describe, expect, it } from "vitest";
import { eventoDeTurno, eventosDelGuardado, hiloDe, type Hilo, type TurnoHilo } from "../core/sesiones/hilo.ts";
import { CADENA_VACIA, leer, sellar, type Cadena, type Evento, type Lectura } from "../core/sesiones/registro.ts";
import { estadoDe } from "../core/sesiones/reductor.ts";
import { azar } from "../core/sesiones/sintetico.ts";

/** Un registro de chat en memoria: abre con su dueño y apunta cada guardado. */
class Sombra {
  texto = "";
  cadena: Cadena = CADENA_VACIA;
  lineasPorGuardado: number[] = [];
  /** Lo que se apuntó en cada guardado (para saber que la prueba pasó por todo). */
  formas: string[] = [];

  constructor(id: string) {
    this.apunta({ tipo: "dueno", sesion: id, origen: "chat" });
  }

  private apunta(e: Evento) {
    const r = sellar(this.cadena, e, "pc");
    this.texto += `${r.linea}\n`;
    this.cadena = r.cadena;
  }

  lectura(): Lectura {
    return leer(this.texto);
  }

  guarda(h: Hilo): Evento[] {
    // lo que guarda la app es su JSON: eso es lo que hay que reproducir
    const guardado = JSON.parse(JSON.stringify(h)) as Hilo;
    const eventos = eventosDelGuardado(this.lectura(), guardado);
    for (const e of eventos) this.apunta(e);
    this.lineasPorGuardado.push(eventos.length);
    this.formas.push(eventos.map((e) => (e.tipo === "orden" ? e.que : e.tipo)).join(" "));
    return eventos;
  }
}

const hiloBase = (turnos: TurnoHilo[] = [], extra: Partial<Hilo> = {}): Hilo => ({
  id: "c-mf3k2a-1b2c3d",
  titulo: "Conversación nueva",
  creado: 1_761_350_400_000,
  actualizado: 1_761_350_400_000,
  motor: "anthropic",
  modelo: "un-modelo",
  turnos,
  ...extra,
});
const pregunta = (content: string): TurnoHilo => ({ role: "user", content });
const respuesta = (content: string, extra: Record<string, unknown> = {}): TurnoHilo => ({
  role: "assistant",
  content,
  who: "Anthropic · un-modelo",
  ...extra,
});

describe("a mano", () => {
  it("el primer guardado: los turnos y el punto (el dueño ya lo apuntó quien abrió)", () => {
    const s = new Sombra("c-mf3k2a-1b2c3d");
    const h = hiloBase([pregunta("hola"), respuesta("¡Hola! ¿Qué tal?", { query: "hola", ids: ["r1"], tokens: 12, pensamiento: "", pasos: [] })]);
    const eventos = s.guarda(h);
    expect(eventos.map((e) => e.tipo)).toEqual(["orden", "texto", "punto"]);
    expect(eventos[0]).toEqual({ tipo: "orden", que: "mensaje", texto: "hola" });
    expect(hiloDe(s.lectura())).toEqual(h);
  });

  it("una respuesta más: solo lo nuevo, y el punto con la fecha nueva", () => {
    const s = new Sombra("c-mf3k2a-1b2c3d");
    const turnos = [pregunta("hola"), respuesta("hola")];
    s.guarda(hiloBase(turnos));
    const h = hiloBase([...turnos, pregunta("¿y el reloj?"), respuesta("Va bien")], { actualizado: 1_761_350_500_000 });
    expect(s.guarda(h).map((e) => e.tipo)).toEqual(["orden", "texto", "punto"]);
    expect(hiloDe(s.lectura())).toEqual(h);
  });

  it("un recuerdo que sirvió es una orden de juzgar, no otra copia del turno", () => {
    const s = new Sombra("c-mf3k2a-1b2c3d");
    const turnos = [pregunta("hola"), respuesta("hola", { ids: ["r1"], query: "hola" })];
    s.guarda(hiloBase(turnos));
    const h = hiloBase([turnos[0], { ...turnos[1], judged: true }]);
    expect(s.guarda(h)).toEqual([{ tipo: "orden", que: "juzgar", turno: 1 }]);
    expect(hiloDe(s.lectura())).toEqual(h);
  });

  it("la última respuesta que se rehace (la vacía que se explica): se rebobina hasta antes de ella", () => {
    const s = new Sombra("c-mf3k2a-1b2c3d");
    const turnos = [pregunta("hola"), respuesta("")];
    s.guarda(hiloBase(turnos));
    const h = hiloBase([turnos[0], respuesta("El modelo respondió vacío: no trajo texto.", { error: true })]);
    const eventos = s.guarda(h);
    expect(eventos[0]).toEqual({ tipo: "orden", que: "rebobinar", hasta: 1 });
    // el punto de antes también se rebobinó: va otra vez, al final
    expect(eventos.slice(1).map((e) => e.tipo)).toEqual(["texto", "punto"]);
    expect(hiloDe(s.lectura())).toEqual(h);
  });

  it("al rehacer un turno viejo, los juicios de después de apuntarlo se vuelven a apuntar", () => {
    const s = new Sombra("c-mf3k2a-1b2c3d");
    const t = [pregunta("a"), respuesta("A", { ids: ["x"] }), pregunta("b"), respuesta("B")];
    s.guarda(hiloBase(t));
    s.guarda(hiloBase([t[0], { ...t[1], judged: true }, t[2], t[3]])); // juicio, apuntado DESPUÉS de los turnos
    const h = hiloBase([t[0], { ...t[1], judged: true }, pregunta("b, mejor dicho"), respuesta("B'")]);
    const eventos = s.guarda(h);
    expect(eventos.map((e) => (e.tipo === "orden" ? e.que : e.tipo))).toEqual(["rebobinar", "mensaje", "texto", "juzgar", "punto"]);
    expect(hiloDe(s.lectura())).toEqual(h);
  });

  it("una conversación que se acorta, y un guardado que no cambia nada no apunta nada", () => {
    const s = new Sombra("c-mf3k2a-1b2c3d");
    s.guarda(hiloBase([pregunta("a"), respuesta("A"), pregunta("b"), respuesta("B")]));
    const h = hiloBase([pregunta("a"), respuesta("A")]);
    s.guarda(h);
    expect(hiloDe(s.lectura())).toEqual(h);
    expect(s.guarda(h)).toEqual([]);
  });

  it("los campos que el chat añada mañana viajan tal cual (en el turno y en el Hilo)", () => {
    const s = new Sombra("c-mf3k2a-1b2c3d");
    const h = { ...hiloBase([{ role: "user", content: "x", adjuntos: ["a.png"] }, { role: "sistema", content: "aviso" }]), carpeta: "trabajo" };
    s.guarda(h);
    expect(hiloDe(s.lectura())).toEqual(h);
  });

  it("un registro de otra conversación no se mezcla", () => {
    const s = new Sombra("c-otra-000000");
    expect(() => s.guarda(hiloBase([pregunta("a")]))).toThrow(/otra/);
  });

  it("un turno del asistente lleva siempre `chat`, aunque no traiga nada más", () => {
    expect(eventoDeTurno({ role: "assistant", content: "x" })).toEqual({ tipo: "texto", texto: "x", chat: {} });
  });
});

describe("al azar: tras cada guardado, el registro da el Hilo guardado", () => {
  const PALABRAS = ["reloj", "hora", "alarma", "café", "prueba", "ñandú", "“comillas”", "línea\nnueva", "emoji 🙂", "\\barra", "tab\tulado"];

  function conversacion(semilla: number, guardados: number) {
    const r = azar(semilla);
    const entre = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
    const frase = () => Array.from({ length: entre(1, 8) }, () => PALABRAS[entre(0, PALABRAS.length - 1)]).join(" ");
    const id = `c-${semilla.toString(36).padStart(6, "0")}-abc123`;
    const s = new Sombra(id);
    let h = hiloBase([], { id, creado: 1_761_000_000_000 + semilla });
    let reloj = h.creado;
    for (let g = 0; g < guardados; g++) {
      let turnos = [...h.turnos];
      const x = r();
      if (x < 0.45 || turnos.length === 0) {
        const conMemoria = r() < 0.6;
        turnos.push(pregunta(frase()));
        turnos.push(
          respuesta(frase(), {
            ...(conMemoria ? { query: frase(), ids: [`r${entre(1, 99)}`], abstained: r() < 0.2, tokens: entre(0, 900) } : {}),
            pensamiento: r() < 0.3 ? frase() : "",
            pasos: r() < 0.3 ? [{ id: `p${g}`, nombre: "buscar", estado: "hecho", args: { q: frase() }, resumen: frase() }] : [],
          }),
        );
      } else if (x < 0.6) {
        const juzgables = turnos.map((t, i) => [t, i] as const).filter(([t]) => Array.isArray(t.ids) && !t.judged);
        if (juzgables.length) {
          const [t, i] = juzgables[entre(0, juzgables.length - 1)];
          turnos[i] = { ...t, judged: true };
        }
      } else if (x < 0.7) {
        const u = turnos[turnos.length - 1];
        turnos[turnos.length - 1] = { ...u, content: `El modelo respondió vacío. ${frase()}`, error: true };
      } else if (x < 0.77) {
        const i = entre(0, turnos.length - 1);
        turnos[i] = { ...turnos[i], content: frase() };
      } else if (x < 0.82) {
        turnos = turnos.slice(0, entre(0, turnos.length - 1));
      } else if (x < 0.86) {
        const i = entre(0, turnos.length - 1);
        const { judged: _j, ...sin } = turnos[i];
        turnos[i] = sin as TurnoHilo;
      } else if (x < 0.92) {
        turnos.push(pregunta(frase()));
      }
      reloj += entre(1_000, 600_000);
      const primera = turnos.find((t) => t.role === "user")?.content ?? "";
      h = {
        ...h,
        titulo: primera ? primera.slice(0, 55) : "Conversación nueva",
        actualizado: x > 0.97 ? h.actualizado : reloj,
        motor: r() < 0.05 ? "openai" : h.motor,
        modelo: r() < 0.05 ? `m-${entre(1, 4)}` : h.modelo,
        turnos,
      };
      s.guarda(h);
      const l = s.lectura();
      expect(l.problemas, `semilla ${semilla}, guardado ${g}`).toEqual([]);
      expect(hiloDe(l), `semilla ${semilla}, guardado ${g}`).toEqual(JSON.parse(JSON.stringify(h)));
    }
    return s;
  }

  it("300 conversaciones de 1 a 25 guardados", () => {
    let lineas = 0;
    let guardados = 0;
    const formas: string[] = [];
    for (let semilla = 1; semilla <= 300; semilla++) {
      const s = conversacion(semilla, 1 + (semilla % 25));
      lineas += s.lineasPorGuardado.reduce((a, b) => a + b, 0);
      guardados += s.lineasPorGuardado.length;
      formas.push(...s.formas);
    }
    // pasó por todo: rebobinar, juzgar, y juicios que se reponen tras rebobinar
    const cuantas = (re: RegExp) => formas.filter((f) => re.test(f)).length;
    expect(cuantas(/^juzgar/)).toBeGreaterThan(50);
    expect(cuantas(/rebobinar/)).toBeGreaterThan(200);
    expect(cuantas(/rebobinar.*juzgar/)).toBeGreaterThan(10);
    expect(cuantas(/^$/)).toBeGreaterThan(0);
    // lo barato: un par de turnos y su punto son tres líneas; rehacer cuesta más, pero poco
    expect(lineas / guardados).toBeLessThan(6);
  });

  it("y el registro del chat también se lee como sesión: un turno por pregunta", () => {
    const s = new Sombra("c-mf3k2a-1b2c3d");
    s.guarda(hiloBase([pregunta("a"), respuesta("A"), pregunta("b"), respuesta("B")]));
    const e = estadoDe(s.lectura());
    expect(e.sesion).toBe("c-mf3k2a-1b2c3d");
    expect(e.turnos.map((t) => [t.pedido, t.respuesta])).toEqual([
      ["a", "A"],
      ["b", "B"],
    ]);
  });
});
