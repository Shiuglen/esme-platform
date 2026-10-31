/**
 * BIFURCAR Y RECONCILIAR — una sesión que sale de otra, y dos copias que se separaron.
 *
 * Lo que se prueba:
 *
 *   1. bifurcar copia las líneas 0..n tal cual (su cadena sigue valiendo) y
 *      sigue con un `dueno` con su propia sesión y `bifurca`, que dice de
 *      dónde sale; lo copiado se puede comprobar contra el original con la
 *      cabeza que guarda `bifurca`;
 *   2. también de un registro del Taller (formato 1), y del chat (su Hilo
 *      sale con el id nuevo);
 *   3. no se bifurca por un sitio que no está ni por uno que no es de fiar
 *      (lo que viene detrás puede ponerlo en duda; lo rechazado, no), y una
 *      bifurcación que no casa con lo copiado se dice al leerla;
 *   4. una bifurcación de una bifurcación es la última sesión, y compactar
 *      deja lo copiado tal cual, hasta la última bifurcación (que sigue
 *      casando);
 *   5. reconciliar: si una copia va por delante, gana esa; si se separaron,
 *      gana la de época mayor en el primer evento distinto (si empatan, la
 *      de huella menor), lo de la otra se descarta y se dice, y da lo mismo
 *      en qué orden se le pasen. Una bifurcación no se reconcilia con su
 *      origen: es otra sesión.
 *
 * Referencia: core/sesiones/bifurcar.ts, estandar/sesion.spec.yaml (bifurca, dueno).
 */
import { describe, expect, it } from "vitest";
import { bifurcar, reconciliar } from "../core/sesiones/bifurcar.ts";
import { compactar } from "../core/sesiones/compactar.ts";
import { eventosDelGuardado, hiloDe, type Hilo } from "../core/sesiones/hilo.ts";
import { estadoDe } from "../core/sesiones/reductor.ts";
import { CADENA_VACIA, CLAVES_BIFURCA, leer, sellar, type Cadena, type Evento, type Linea } from "../core/sesiones/registro.ts";

/** Sella eventos detrás de una cadena: el texto que se añade y la cadena que queda. */
function sella(eventos: Evento[], de = "pc", desde: Cadena = CADENA_VACIA): { texto: string; cadena: Cadena } {
  let c = desde;
  let texto = "";
  for (const e of eventos) {
    const r = sellar(c, e, de);
    texto += `${r.linea}\n`;
    c = r.cadena;
  }
  return { texto, cadena: c };
}

const BASE: Evento[] = [
  { tipo: "dueno", sesion: "s-1" }, // 0
  { tipo: "usuario", texto: "arregla el reloj" }, // 1
  { tipo: "texto", texto: "Mirando." }, // 2
  { tipo: "fin", motivo: "end_turn", ms: 10 }, // 3
  { tipo: "usuario", texto: "y la alarma" }, // 4
  { tipo: "texto", texto: "Voy." }, // 5
];

const textoDe = (eventos: readonly Linea[]) => eventos.map((e) => (e as { texto?: string }).texto ?? e.tipo);

describe("bifurcar", () => {
  it("copia las líneas 0..n tal cual y sigue con un dueño que dice de dónde sale", () => {
    const fuente = sella(BASE).texto;
    const l = leer(fuente);
    const b = bifurcar(l, 3, { sesion: "s-2", de: "movil" });
    // lo copiado, byte a byte
    expect(b.texto.startsWith(l.lineas.slice(0, 4).join("\n") + "\n")).toBe(true);
    const lb = leer(b.texto);
    expect(lb.valida).toBe(true);
    expect(lb.eventos).toHaveLength(5);
    expect(lb.eventos[4]).toMatchObject({ tipo: "dueno", n: 4, epoca: 2, de: "movil", sesion: "s-2", bifurca: { sesion: "s-1", n: 3 } });
    // la cabeza de lo copiado es la del original en ese punto: se puede comprobar contra él
    const origen = b.dueno.bifurca!;
    expect(Object.keys(origen)).toEqual([...CLAVES_BIFURCA]);
    expect(leer(fuente, { cabeza: origen.cabeza, n: origen.n + 1 }).valida).toBe(true);
    expect(leer(fuente.replace("arregla", "rompe"), { cabeza: origen.cabeza, n: origen.n + 1 }).valida).toBe(false);
    // el estado es el de la sesión nueva, con lo que traía hasta n
    const s = estadoDe(lb);
    expect(s).toMatchObject({ sesion: "s-2", epoca: 2, dueno: "movil", bifurca: { sesion: "s-1", n: 3 } });
    expect(s.turnos.map((t) => t.pedido)).toEqual(["arregla el reloj"]);
    // y quien la abre sigue escribiendo detrás
    const mas = sella([{ tipo: "usuario", texto: "otra cosa" }], "movil", b.cadena);
    expect(leer(b.texto + mas.texto).valida).toBe(true);
    // el original sigue siendo de su sesión
    expect(estadoDe(l)).toMatchObject({ sesion: "s-1", bifurca: null });
  });

  it("de un registro del Taller (formato 1): hace falta decir de qué sesión sale", () => {
    const fuente = BASE.slice(1).map((e) => JSON.stringify(e)).join("\n") + "\n";
    const l = leer(fuente);
    expect(() => bifurcar(l, 1, { sesion: "s-2", de: "pc" })).toThrow(/de qué sesión/);
    const b = bifurcar(l, 1, { sesion: "s-2", de: "pc", desde: "tarea-7" });
    const lb = leer(b.texto);
    expect(lb.valida).toBe(true);
    expect(lb.formato).toBe("mixto");
    expect(estadoDe(lb)).toMatchObject({ sesion: "s-2", bifurca: { sesion: "tarea-7", n: 1 } });
  });

  it("el chat bifurcado da el mismo Hilo, con su id nuevo", () => {
    const h: Hilo = {
      id: "c-uno-123456",
      titulo: "hola",
      creado: 1,
      actualizado: 2,
      motor: "m",
      modelo: "x",
      turnos: [
        { role: "user", content: "hola" },
        { role: "assistant", content: "¿qué tal?" },
      ],
    };
    let texto = sella([{ tipo: "dueno", sesion: h.id }]).texto;
    const l0 = leer(texto);
    texto += sella(eventosDelGuardado(l0, h), "pc", l0.cadena).texto;
    const l = leer(texto);
    const b = bifurcar(l, l.cadena.n - 1, { sesion: "c-dos-654321", de: "pc" });
    expect(hiloDe(leer(b.texto))).toEqual({ ...h, id: "c-dos-654321" });
  });

  it("no se bifurca por un sitio que no está, ni por uno que no verifica", () => {
    const fuente = sella(BASE).texto;
    expect(() => bifurcar(leer(fuente), 6, { sesion: "s-2", de: "pc" })).toThrow(/no tiene la línea 6/);
    expect(() => bifurcar(leer(fuente), -1, { sesion: "s-2", de: "pc" })).toThrow(/no tiene la línea -1/);
    const roto = fuente.replace("Mirando.", "Mirado.");
    expect(() => bifurcar(leer(roto), 4, { sesion: "s-2", de: "pc" })).toThrow(/no verifica/);
    // la 2 cambió (la 3 lo dice): la 2 es la que está en duda, así que tampoco por ahí
    expect(() => bifurcar(leer(roto), 2, { sesion: "s-2", de: "pc" })).toThrow(/no verifica/);
    // lo roto después de n no importa: lo copiado sí verifica (así se rescata lo de antes del daño)
    expect(leer(bifurcar(leer(roto), 1, { sesion: "s-2", de: "pc" }).texto).valida).toBe(true);
    // una lectura cuyas líneas se tocaron después de leerlas no se copia: se vuelve a leer lo que se copiaría
    const l = leer(fuente);
    const tocada = { ...l, lineas: l.lineas.map((x) => x.replace("arregla", "rompe")) };
    expect(() => bifurcar(tocada, 3, { sesion: "s-2", de: "pc" })).toThrow(/no se lee igual/);
  });

  it("lo que el portátil escribió tarde no pone en duda lo de antes: se bifurca justo antes", () => {
    const { texto, cadena } = sella(BASE);
    const mudanza = sellar(cadena, { tipo: "dueno" }, "el-101");
    const tarde = sellar({ ...mudanza.cadena, epoca: 1, dueno: "pc" }, { tipo: "texto", texto: "sigo yo" }, "pc");
    const l = leer(`${texto}${mudanza.linea}\n${tarde.linea}\n`);
    expect(l.fiables).toBe(7);
    expect(leer(bifurcar(l, 6, { sesion: "s-2", de: "el-101" }).texto).valida).toBe(true);
    expect(() => bifurcar(l, 7, { sesion: "s-2", de: "el-101" })).toThrow(/no verifica/);
  });

  it("lo que dice el registro manda, y la sesión nueva estrena su id", () => {
    const l = leer(sella(BASE).texto);
    expect(() => bifurcar(l, 3, { sesion: "s-2", de: "pc", desde: "otra" })).toThrow(/es de la sesión «s-1»/);
    expect(() => bifurcar(l, 3, { sesion: "s-1", de: "pc" })).toThrow(/otro id/);
    expect(() => bifurcar(l, 3, { sesion: "", de: "pc" })).toThrow(/necesita su id/);
    expect(bifurcar(l, 3, { sesion: "s-2", de: "pc", desde: "s-1" }).dueno.bifurca.sesion).toBe("s-1");
  });

  it("una bifurcación que no casa con lo copiado se dice al leerla", () => {
    const b = bifurcar(leer(sella(BASE).texto), 3, { sesion: "s-2", de: "movil" });
    const cabeza = `"cabeza":"${b.dueno.bifurca!.cabeza}"`;
    expect(b.texto).toContain(cabeza);
    const mal = b.texto.replace(cabeza, `"cabeza":"${"f".repeat(64)}"`);
    expect(leer(mal).problemas).toEqual([{ linea: 4, problema: expect.stringMatching(/bifurcación no casa/) }]);
    const otraN = b.texto.replace('"bifurca":{"sesion":"s-1","n":3,', '"bifurca":{"sesion":"s-1","n":2,');
    expect(otraN).not.toBe(b.texto);
    expect(leer(otraN).problemas).toEqual([{ linea: 4, problema: expect.stringMatching(/bifurcación no casa/) }]);
    // una sola explicación por línea: si lo que no casa es su «ant», se dice eso y nada más
    const ant = `"ant":"${b.dueno.ant}"`;
    expect(b.texto).toContain(ant);
    const otroAnt = b.texto.replace(ant, `"ant":"${"0".repeat(64)}"`);
    expect(leer(otroAnt).problemas).toEqual([{ linea: 4, problema: expect.stringMatching(/la huella no casa/) }]);
  });

  it("un dueño que bifurca sin decirlo bien se dice, y la línea se queda", () => {
    const copia = sella(BASE.slice(0, 4));
    const { cabeza } = copia.cadena;
    const casos: Array<[unknown, RegExp]> = [
      [{ tipo: "dueno", sesion: "s-2", bifurca: "s-1" }, /lleva «sesion», «n» y «cabeza»/],
      [{ tipo: "dueno", sesion: "s-2", bifurca: { sesion: "s-1", n: 3 } }, /lleva «sesion», «n» y «cabeza»/],
      [{ tipo: "dueno", sesion: "s-2", bifurca: { sesion: "s-1", n: "3", cabeza } }, /lleva «sesion», «n» y «cabeza»/],
      [{ tipo: "dueno", bifurca: { sesion: "s-1", n: 3, cabeza } }, /estrena su propia/],
      [{ tipo: "dueno", sesion: "s-1", bifurca: { sesion: "s-1", n: 3, cabeza } }, /estrena su propia/],
    ];
    for (const [dueno, por] of casos) {
      const l = leer(`${copia.texto}${sellar(copia.cadena, dueno as Evento, "movil").linea}\n`);
      expect(l.problemas, String(por)).toEqual([{ linea: 4, problema: expect.stringMatching(por) }]);
      expect(l.eventos).toHaveLength(5);
    }
  });

  it("una bifurcación de una bifurcación: la sesión es la última, y cada una dice de dónde salió", () => {
    const b1 = bifurcar(leer(sella(BASE).texto), 3, { sesion: "s-2", de: "movil" });
    const mas = sella([{ tipo: "usuario", texto: "otra" }, { tipo: "texto", texto: "Va." }], "movil", b1.cadena);
    const l1 = leer(b1.texto + mas.texto);
    const l2 = leer(bifurcar(l1, l1.cadena.n - 1, { sesion: "s-3", de: "pc" }).texto);
    expect(l2.valida).toBe(true);
    expect(estadoDe(l2)).toMatchObject({ sesion: "s-3", epoca: 3, dueno: "pc", bifurca: { sesion: "s-2", n: 6 } });
    expect(estadoDe(l2).turnos.map((t) => t.pedido)).toEqual(["arregla el reloj", "otra"]);
  });

  it("compactar una bifurcación deja lo copiado tal cual: la bifurcación sigue casando", () => {
    const trozos = (letra: string) => Array.from({ length: 5 }, (_, i) => ({ tipo: "texto", texto: `${letra}${i} ` }) as Evento);
    const fuente = sella([{ tipo: "dueno", sesion: "s-1" }, { tipo: "usuario", texto: "uno" }, ...trozos("a"), { tipo: "fin", motivo: "end_turn", ms: 1 }]);
    const lf = leer(fuente.texto);
    const b = bifurcar(lf, lf.cadena.n - 1, { sesion: "s-2", de: "pc" });
    const despues = sella([{ tipo: "usuario", texto: "dos" }, ...trozos("b")], "pc", b.cadena);
    // y después se muda al 101, que sigue escribiendo
    const mudanza = sella([{ tipo: "dueno" }, ...trozos("c")], "el-101", despues.cadena);
    const l = leer(b.texto + despues.texto + mudanza.texto);
    const c = compactar(l);
    const lc = leer(c.texto);
    expect(lc.valida).toBe(true);
    // lo copiado y el dueño que lo dice, byte a byte; lo de después (también tras la mudanza), compactado
    expect(c.texto.startsWith(b.texto)).toBe(true);
    expect(lc.cadena.n).toBe(b.cadena.n + 4);
    // se reproduce igual
    const turnos = (x: typeof l) => estadoDe(x).turnos.map((t) => [t.pedido, t.respuesta]);
    expect(turnos(lc)).toEqual(turnos(l));
    expect(turnos(lc)[1]).toEqual(["dos", "b0 b1 b2 b3 b4 c0 c1 c2 c3 c4 "]);
    expect(estadoDe(lc)).toMatchObject({ sesion: "s-2", epoca: 3, dueno: "el-101" });
    // y el origen se comprueba con lo que dice la bifurcación
    const { bifurca } = estadoDe(lc);
    expect(bifurca).toEqual(b.dueno.bifurca);
    expect(leer(fuente.texto, { cabeza: bifurca!.cabeza, n: bifurca!.n + 1 }).valida).toBe(true);
  });

  it("compactar una bifurcación de una bifurcación deja tal cual hasta la última", () => {
    const trozos = (letra: string) => Array.from({ length: 5 }, (_, i) => ({ tipo: "texto", texto: `${letra}${i} ` }) as Evento);
    const fuente = sella([{ tipo: "dueno", sesion: "s-1" }, { tipo: "usuario", texto: "uno" }, ...trozos("a"), { tipo: "fin", motivo: "end_turn", ms: 1 }]);
    const lf = leer(fuente.texto);
    const b1 = bifurcar(lf, lf.cadena.n - 1, { sesion: "s-2", de: "pc" });
    // entre las dos bifurcaciones, trozos que compactar juntaría si no fueran de lo copiado
    const medio = sella([{ tipo: "usuario", texto: "dos" }, ...trozos("b"), { tipo: "fin", motivo: "end_turn", ms: 1 }], "pc", b1.cadena);
    const l1 = leer(b1.texto + medio.texto);
    const b2 = bifurcar(l1, l1.cadena.n - 1, { sesion: "s-3", de: "movil" });
    const despues = sella([{ tipo: "usuario", texto: "tres" }, ...trozos("c")], "movil", b2.cadena);
    const l = leer(b2.texto + despues.texto);
    const c = compactar(l);
    const lc = leer(c.texto);
    expect(lc.valida).toBe(true);
    expect(c.texto.startsWith(b2.texto)).toBe(true);
    expect(lc.cadena.n).toBe(b2.cadena.n + 2);
    expect(estadoDe(lc)).toMatchObject({ sesion: "s-3", bifurca: b2.dueno.bifurca });
    expect(estadoDe(lc).turnos.map((t) => t.respuesta)).toEqual(estadoDe(l).turnos.map((t) => t.respuesta));
  });
});

describe("reconciliar dos copias que se separaron", () => {
  const base = sella(BASE.slice(0, 3));

  it("si una va por delante de la otra, gana la que va por delante y no se descarta nada", () => {
    const delante = base.texto + sella([{ tipo: "texto", texto: " Más." }], "pc", base.cadena).texto;
    const r = reconciliar(leer(base.texto), leer(delante));
    expect(r).toMatchObject({ gana: "b", separacion: null, descartadas: [] });
    expect(r.texto).toBe(delante);
    expect(reconciliar(leer(delante), leer(delante))).toMatchObject({ gana: "iguales", descartadas: [] });
  });

  it("la época mayor gana: lo que el portátil escribió sin red pierde contra la mudanza al 101", () => {
    const portatil = base.texto + sella([{ tipo: "texto", texto: " a1" }, { tipo: "texto", texto: " a2" }], "pc", base.cadena).texto;
    const el101 = base.texto + sella([{ tipo: "dueno" }, { tipo: "texto", texto: " b1" }], "el-101", base.cadena).texto;
    const r = reconciliar(leer(portatil), leer(el101));
    expect(r.gana).toBe("b");
    expect(r.separacion).toBe(3);
    expect(textoDe(r.descartadas)).toEqual([" a1", " a2"]);
    expect(r.motivo).toMatch(/época 2/);
    expect(r.texto).toBe(el101);
    // da lo mismo el orden
    const al_reves = reconciliar(leer(el101), leer(portatil));
    expect(al_reves.gana).toBe("a");
    expect(al_reves.texto).toBe(el101);
    expect(textoDe(al_reves.descartadas)).toEqual([" a1", " a2"]);
  });

  it("si empatan en época, gana la de huella menor, y todos eligen la misma", () => {
    const movil = base.texto + sella([{ tipo: "dueno" }, { tipo: "texto", texto: " m" }], "movil", base.cadena).texto;
    const el101 = base.texto + sella([{ tipo: "dueno" }, { tipo: "texto", texto: " b" }], "el-101", base.cadena).texto;
    const r1 = reconciliar(leer(movil), leer(el101));
    const r2 = reconciliar(leer(el101), leer(movil));
    expect(r1.texto).toBe(r2.texto);
    expect(r1.separacion).toBe(3);
    expect(r1.motivo).toMatch(/huella/);
    // la que gana es la de huella menor en la línea en que se separan
    const h3 = (t: string) => leer(leer(t).lineas.slice(0, 4).join("\n") + "\n").cadena.cabeza;
    const [gana, pierde] = r1.texto === movil ? [movil, el101] : [el101, movil];
    expect(h3(gana) < h3(pierde)).toBe(true);
    expect(textoDe(r1.descartadas)).toEqual(["dueno", pierde === movil ? " m" : " b"]);
  });

  it("el Taller de antes siguió sin sobre mientras Esme tomaba la sesión: gana Esme", () => {
    const v1 = BASE.slice(1, 3).map((e) => JSON.stringify(e)).join("\n") + "\n";
    const viejo = `${v1}${JSON.stringify({ tipo: "texto", texto: " sigo" })}\n`;
    const esme = v1 + sella([{ tipo: "dueno", sesion: "t-7" }, { tipo: "texto", texto: " tomo" }], "pc", leer(v1).cadena).texto;
    const r = reconciliar(leer(viejo), leer(esme));
    expect(r).toMatchObject({ gana: "b", separacion: 2, texto: esme });
    expect(textoDe(r.descartadas)).toEqual([" sigo"]);
    expect(r.motivo).toMatch(/época 1/);
  });

  it("dos copias sin sobre que se separan: la de huella menor, en cualquier orden", () => {
    const v1 = (extra: string) => [...BASE.slice(1, 3), { tipo: "texto", texto: extra }].map((e) => JSON.stringify(e)).join("\n") + "\n";
    const [x, y] = [v1(" x"), v1(" y")];
    const r1 = reconciliar(leer(x), leer(y));
    expect(reconciliar(leer(y), leer(x)).texto).toBe(r1.texto);
    expect(r1.motivo).toMatch(/época 0.*huella/);
    // se separan en la última línea: su huella es la cabeza de todo
    const pierde = r1.texto === x ? y : x;
    expect(leer(r1.texto).cadena.cabeza < leer(pierde).cadena.cabeza).toBe(true);
  });

  it("una copia vacía va por detrás de cualquiera", () => {
    expect(reconciliar(leer(""), leer(base.texto))).toMatchObject({ gana: "b", separacion: null, descartadas: [], texto: base.texto });
  });

  it("solo se reconcilian copias de la misma sesión, y que verifican", () => {
    const otra = sella([{ tipo: "dueno", sesion: "s-9" }, { tipo: "usuario", texto: "x" }]).texto;
    expect(() => reconciliar(leer(base.texto), leer(otra))).toThrow(/misma sesión/);
    expect(() => reconciliar(leer(base.texto), leer(base.texto.replace("arregla", "rompe")))).toThrow(/verifica/);
    // sin sobre no dicen su sesión: si no comparten ni la primera línea, no son la misma
    expect(() => reconciliar(leer('{"tipo":"usuario","texto":"a"}\n'), leer('{"tipo":"usuario","texto":"b"}\n'))).toThrow(/primera línea/);
  });

  it("una bifurcación es otra sesión: no se reconcilia con su origen", () => {
    const fuente = sella(BASE).texto;
    const b = bifurcar(leer(fuente), 3, { sesion: "s-2", de: "movil" });
    expect(() => reconciliar(leer(fuente), leer(b.texto))).toThrow(/misma sesión/);
  });
});
