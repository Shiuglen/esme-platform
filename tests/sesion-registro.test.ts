/**
 * EL REGISTRO DE UNA SESIÓN — se añade, se lee, y lo que cambió se nota.
 *
 * Lo que se prueba:
 *
 *   1. lo que se sella se lee igual (el sobre va aparte del evento);
 *   2. el número es la posición, la época sube con cada dueño, y la cadena
 *      de huellas encierra todo lo anterior;
 *   3. el formato 1 del Taller se lee tal cual, sin migrar nada, y un
 *      registro puede seguir en formato 2 detrás;
 *   4. una última línea cortada se aguanta; una línea cambiada, quitada,
 *      movida o repetida se detecta (y se dice dónde);
 *   5. un solo escritor: la época vieja, el aparato ajeno y lo escrito tras
 *      el cierre se rechazan, al escribir y al leer;
 *   6. hasta dónde se fía: un problema pone en duda su línea, y una huella
 *      que no casa, las de antes (lo que dice `fiables`).
 *
 * Referencia: core/sesiones/registro.ts, estandar/sesion.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import {
  CADENA_VACIA,
  GENESIS,
  huella,
  leer,
  sellar,
  sesionTras,
  sinSobre,
  validarEvento,
  type Cadena,
  type Evento,
} from "../core/sesiones/registro.ts";

/** Sella una lista de eventos y devuelve el texto del registro. */
function registro(eventos: Array<{ e: Evento; de?: string }>, desde: Cadena = CADENA_VACIA): { texto: string; cadena: Cadena } {
  let cadena = desde;
  let texto = "";
  for (const { e, de } of eventos) {
    const r = sellar(cadena, e, de ?? "pc");
    texto += `${r.linea}\n`;
    cadena = r.cadena;
  }
  return { texto, cadena };
}

const corta: Evento[] = [
  { tipo: "dueno", sesion: "s-1", ts: 1000 } as Evento,
  { tipo: "usuario", texto: "Arregla el reloj", ts: 1000 } as Evento,
  { tipo: "texto", texto: "Voy" } as Evento,
  { tipo: "herramienta", id: "h1", titulo: "Leer a.ts", clase: "read", estado: "completed", ts: 1500 } as Evento,
  { tipo: "fin", motivo: "end_turn", ms: 900, ts: 1900 } as Evento,
];
const texto0 = () => registro(corta.map((e) => ({ e }))).texto;
const lineas = (t: string) => t.split("\n").filter(Boolean);

describe("sellar y leer: el sobre va aparte del evento", () => {
  it("lo que se sella se lee igual, con su sobre", () => {
    const l = leer(texto0());
    expect(l.valida).toBe(true);
    expect(l.problemas).toEqual([]);
    expect(l.formato).toBe(2);
    expect(l.eventos.map(sinSobre)).toEqual(corta);
  });

  it("el número es la posición, todo lo escribe el dueño en la época 1", () => {
    const l = leer(texto0());
    expect(l.eventos.map((e) => e.n)).toEqual([0, 1, 2, 3, 4]);
    expect(l.eventos.every((e) => e.epoca === 1 && e.de === "pc")).toBe(true);
    expect(l.cadena).toMatchObject({ n: 5, epoca: 1, dueno: "pc", cerrada: false });
  });

  it("la hora del evento va en el sobre, y sin hora no se inventa", () => {
    const l = leer(texto0());
    expect(l.eventos[1].ts).toBe(1000);
    expect("ts" in l.eventos[2]).toBe(false);
  });

  it("cada ant es la huella de todo lo anterior, y la cabeza la de todo", () => {
    const t = texto0();
    const crudas = lineas(t);
    const l = leer(t);
    let h = GENESIS;
    for (const [k, cruda] of crudas.entries()) {
      expect(l.eventos[k].ant, `ant de la línea ${k}`).toBe(h);
      h = huella(h, cruda);
    }
    expect(l.cadena.cabeza).toBe(h);
  });

  it("la huella encierra la anterior: no es la de la línea sola", () => {
    expect(huella(GENESIS, "x")).not.toBe(huella("1".repeat(64), "x"));
    expect(huella(GENESIS, "x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("el sobre va primero en la línea, y el evento después (se lee de un vistazo)", () => {
    const primera = lineas(texto0())[1];
    expect(primera.startsWith('{"n":1,"epoca":1,"de":"pc","ts":1000,"ant":"')).toBe(true);
    expect(primera).toContain('"tipo":"usuario","texto":"Arregla el reloj"}');
  });

  it("seguir escribiendo desde lo leído da el mismo registro que escribirlo de una vez", () => {
    const entero = texto0();
    const mitad = registro(corta.slice(0, 2).map((e) => ({ e }))).texto;
    const l = leer(mitad);
    const resto = registro(corta.slice(2).map((e) => ({ e })), l.cadena).texto;
    expect(mitad + resto).toBe(entero);
  });
});

describe("el formato 1 del Taller: se lee tal cual, sin migrar nada", () => {
  const v1 = [
    { tipo: "usuario", texto: "hola", ts: 10 },
    { tipo: "texto", texto: "ho" },
    { tipo: "texto", texto: "la", ts: 1200 },
    { tipo: "fin", motivo: "end_turn", ms: 50, ts: 1250 },
  ];
  const textoV1 = v1.map((e) => JSON.stringify(e)).join("\n") + "\n";

  it("las líneas del Taller son un registro válido del formato 1", () => {
    const l = leer(textoV1);
    expect(l.formato).toBe(1);
    expect(l.valida).toBe(true);
    expect(l.eventos).toEqual(v1);
    expect(l.cadena).toMatchObject({ n: 4, epoca: 0, dueno: null });
  });

  it("y puede seguir en formato 2: el primer sobre es un dueño, y el número cuenta las de antes", () => {
    const l1 = leer(textoV1);
    const resto = registro([{ e: { tipo: "dueno", sesion: "tarea-1" } as Evento }, { e: { tipo: "usuario", texto: "otra" } as Evento }], l1.cadena).texto;
    const l = leer(textoV1 + resto);
    expect(l.formato).toBe("mixto");
    expect(l.valida).toBe(true);
    expect(l.eventos.slice(4).map((e) => e.n)).toEqual([4, 5]);
  });

  it("la cadena también encierra las líneas sin sobre: cambiar una del formato 1 se nota en el primer sobre", () => {
    const l1 = leer(textoV1);
    const resto = registro([{ e: { tipo: "dueno", sesion: "tarea-1" } as Evento }], l1.cadena).texto;
    const cambiado = textoV1.replace('"texto":"ho"', '"texto":"HO"') + resto;
    const l = leer(cambiado);
    expect(l.valida).toBe(false);
    expect(l.problemas[0].linea).toBe(4);
    expect(l.problemas[0].problema).toMatch(/huella/);
  });

  it("una línea sin sobre después del formato 2 no vale", () => {
    const t = texto0() + JSON.stringify({ tipo: "texto", texto: "colada" }) + "\n";
    const l = leer(t);
    expect(l.valida).toBe(false);
    expect(l.problemas.map((p) => p.linea)).toEqual([5]);
  });
});

describe("una última línea cortada se aguanta; una cambiada se detecta", () => {
  it("un apagón a mitad de escribir: la última línea cortada se deja fuera y se dice", () => {
    const t = texto0();
    const cortado = t + t.split("\n")[1].slice(0, 30);
    const l = leer(cortado);
    expect(l.valida).toBe(true);
    expect(l.cortada).toBe(true);
    expect(l.eventos).toHaveLength(5);
    expect(l.aceptado).toBe(t.length);
    expect(l.cadena.cabeza).toBe(leer(t).cadena.cabeza);
  });

  it("una última línea entera sin su salto final vale (y se dice)", () => {
    const t = texto0().slice(0, -1);
    const l = leer(t);
    expect(l.valida).toBe(true);
    expect(l.sinSalto).toBe(true);
    expect(l.cortada).toBe(false);
    expect(l.eventos).toHaveLength(5);
  });

  it("una línea cambiada en medio se detecta, y se dice cuál", () => {
    const t = texto0().replace('"texto":"Voy"', '"texto":"Fui"');
    const l = leer(t);
    expect(l.valida).toBe(false);
    // la línea 2 cambió: la 3 lo dice (su ant ya no es la huella de lo anterior), y solo una vez
    expect(l.problemas).toEqual([{ linea: 3, problema: expect.stringMatching(/línea 2/) }]);
    // y lo que pone en duda es la 2: de fiar, solo las dos primeras
    expect(l.fiables).toBe(2);
    expect(leer(texto0()).fiables).toBe(5);
  });

  it("una línea quitada, movida o repetida también se detecta", () => {
    const crudas = lineas(texto0());
    const quitada = [crudas[0], crudas[1], crudas[3], crudas[4]].join("\n") + "\n";
    const movida = [crudas[0], crudas[2], crudas[1], crudas[3], crudas[4]].join("\n") + "\n";
    const repetida = [crudas[0], crudas[1], crudas[1], crudas[2], crudas[3], crudas[4]].join("\n") + "\n";
    for (const t of [quitada, movida, repetida]) expect(leer(t).valida).toBe(false);
    // falta la 2: la 1 ya no la confirma nadie (la que va detrás encierra a la que falta)
    expect(leer(quitada).fiables).toBe(1);
    expect(leer(movida).fiables).toBe(0);
    expect(leer(repetida).fiables).toBe(1);
  });

  it("una cabeza de más líneas de las que hay: lo que queda no lo ancla nada", () => {
    const t = texto0();
    const l = leer(t, { cabeza: leer(t).cadena.cabeza, n: 9 });
    expect(l.problemas).toEqual([{ linea: 5, problema: expect.stringMatching(/tiene 5 líneas y la cabeza es de 9/) }]);
    expect(l.fiables).toBe(0);
  });

  it("la última línea solo la protege la cabeza que guarda quien copia", () => {
    const t = texto0();
    const cabeza = leer(t).cadena.cabeza;
    const cambiada = t.replace('"motivo":"end_turn"', '"motivo":"cancelled"');
    expect(leer(cambiada).valida).toBe(true); // nadie detrás que lo note…
    const l = leer(cambiada, { cabeza });
    expect(l.valida).toBe(false); // …salvo la cabeza
    expect(l.problemas[0].problema).toMatch(/cabeza/);
    expect(l.fiables).toBe(0); // la cabeza no dice cuál: ninguna es de fiar
    expect(leer(t, { cabeza }).valida).toBe(true);
  });

  it("un fichero que pasó por Windows («\\r\\n») sigue verificando", () => {
    const t = texto0().replace(/\n/g, "\r\n");
    const l = leer(t);
    expect(l.valida).toBe(true);
    expect(l.cadena.cabeza).toBe(leer(texto0()).cadena.cabeza);
  });

  it("las líneas en blanco no cuentan (ni para el número ni para la huella)", () => {
    const t = texto0().replace("\n", "\n\n  \n");
    const l = leer(t);
    expect(l.valida).toBe(true);
    expect(l.eventos).toHaveLength(5);
  });

  it("una línea rota en medio no se aguanta: solo la última puede estar cortada", () => {
    const crudas = lineas(texto0());
    const t = [crudas[0], crudas[1].slice(0, 20), crudas[2]].join("\n") + "\n";
    const l = leer(t);
    expect(l.valida).toBe(false);
    expect(l.problemas.some((p) => p.linea === 1)).toBe(true);
    // y la 0 también queda en duda: era la rota la que la confirmaba
    expect(l.fiables).toBe(0);
  });

  it("un tipo que no se conoce se conserva y no es un problema (un aparato viejo no rompe un registro nuevo)", () => {
    const { texto } = registro([{ e: corta[0] }, { e: { tipo: "holograma", cara: 3 } as unknown as Evento }]);
    const l = leer(texto);
    expect(l.valida).toBe(true);
    expect(l.eventos[1]).toMatchObject({ tipo: "holograma", cara: 3 });
  });
});

describe("un solo escritor: el dueño y su época", () => {
  const base = () => registro(corta.map((e) => ({ e }))).cadena;

  it("lo primero que se apunta es un dueño", () => {
    expect(() => sellar(CADENA_VACIA, { tipo: "texto", texto: "x" } as Evento, "pc")).toThrow(/dueno/);
  });

  it("cada dueño sube la época y pasa a ser el único escritor", () => {
    const c = base();
    const m = sellar(c, { tipo: "dueno" } as Evento, "el-101");
    expect(m.cadena).toMatchObject({ epoca: 2, dueno: "el-101" });
    expect(() => sellar(m.cadena, { tipo: "texto", texto: "sigo" } as Evento, "pc")).toThrow(/dueño/);
    expect(() => sellar(m.cadena, { tipo: "texto", texto: "sigo" } as Evento, "el-101")).not.toThrow();
  });

  it("el portátil que despierta tras la mudanza: lo que escribe con su época vieja se rechaza al leer", () => {
    const { texto, cadena } = registro(corta.map((e) => ({ e })));
    const mudanza = sellar(cadena, { tipo: "dueno" } as Evento, "el-101");
    // el portátil sigue con SU cadena (la de antes de la mudanza), con su época 1
    const viejo = { ...mudanza.cadena, epoca: 1, dueno: "pc" };
    const tarde = sellar(viejo, { tipo: "texto", texto: "sigo yo" } as Evento, "pc");
    const l = leer(`${texto}${mudanza.linea}\n${tarde.linea}\n`);
    expect(l.valida).toBe(false);
    expect(l.problemas).toEqual([{ linea: 6, problema: expect.stringMatching(/época vieja/) }]);
    // lo rechazado no pone en duda lo de antes: lo de la mudanza sigue siendo de fiar
    expect(l.fiables).toBe(6);
  });

  it("dentro de una época solo escribe su dueño", () => {
    const { texto, cadena } = registro(corta.map((e) => ({ e })));
    const ajeno = sellar({ ...cadena, dueno: "movil" }, { tipo: "texto", texto: "me cuelo" } as Evento, "movil");
    const l = leer(`${texto}${ajeno.linea}\n`);
    expect(l.problemas).toEqual([{ linea: 5, problema: expect.stringMatching(/dueño/) }]);
  });

  it("un dueño que no sube la época no vale", () => {
    const { texto, cadena } = registro(corta.map((e) => ({ e })));
    const linea = JSON.stringify({ n: 5, epoca: 1, de: "el-101", ant: cadena.cabeza, tipo: "dueno" });
    expect(leer(`${texto}${linea}\n`).problemas[0].problema).toMatch(/época/);
  });

  it("tras el cierre solo cabe un dueño que la reabra", () => {
    const c = base();
    const cerrada = sellar(c, { tipo: "cierre", motivo: "hecha" } as Evento, "pc").cadena;
    expect(cerrada.cerrada).toBe(true);
    expect(() => sellar(cerrada, { tipo: "texto", texto: "x" } as Evento, "pc")).toThrow(/cerrada/);
    const reabierta = sellar(cerrada, { tipo: "dueno" } as Evento, "pc").cadena;
    expect(reabierta).toMatchObject({ cerrada: false, epoca: 2 });
    // y al leer, lo escrito tras el cierre se dice
    const { texto } = registro(corta.map((e) => ({ e })));
    const r1 = sellar(c, { tipo: "cierre" } as Evento, "pc");
    const tras = sellar({ ...r1.cadena, cerrada: false }, { tipo: "texto", texto: "x" } as Evento, "pc");
    expect(leer(`${texto}${r1.linea}\n${tras.linea}\n`).problemas[0].problema).toMatch(/cierre/);
  });

  it("la sesión de un registro: la de su primer dueño, y la de cada bifurcación", () => {
    const bifurca = { sesion: "s-1", n: 3, cabeza: GENESIS };
    const vista = (eventos: Evento[]) => eventos.reduce<string | null>(sesionTras, null);
    expect(vista([{ tipo: "texto", texto: "x" } as Evento])).toBe(null);
    expect(vista([{ tipo: "dueno", sesion: "s-1" }, { tipo: "dueno", sesion: "otra" }, { tipo: "dueno" }])).toBe("s-1");
    expect(vista([{ tipo: "dueno" }, { tipo: "dueno", sesion: "s-1" }])).toBe("s-1");
    expect(vista([{ tipo: "dueno", sesion: "s-1" }, { tipo: "dueno", sesion: "s-2", bifurca }, { tipo: "dueno" }])).toBe("s-2");
  });

  it("los nombres del sobre no se pueden usar como campos del evento", () => {
    for (const k of ["n", "epoca", "de", "ant"]) {
      expect(() => sellar(base(), { tipo: "texto", texto: "x", [k]: 1 } as unknown as Evento, "pc")).toThrow(/sobre/);
    }
  });
});

describe("la forma de cada evento (la que dice la spec)", () => {
  it("un evento conocido con sus campos vale", () => {
    expect(validarEvento({ tipo: "fin", motivo: "end_turn", ms: 10 } as Evento)).toEqual([]);
    expect(validarEvento({ tipo: "orden", que: "mensaje", texto: "hola" } as Evento)).toEqual([]);
  });

  it("le falta un campo obligatorio, o trae uno que su tipo no tiene: se dice", () => {
    expect(validarEvento({ tipo: "fin", ms: 10 } as unknown as Evento)).toEqual(["fin: falta «motivo»"]);
    expect(validarEvento({ tipo: "texto", texto: "x", color: "rojo" } as unknown as Evento)).toEqual(["texto: «color» no es un campo de su tipo"]);
  });

  it("una orden que no está en la lista cerrada no vale", () => {
    expect(validarEvento({ tipo: "orden", que: "bailar" } as unknown as Evento)).toEqual(["orden: «bailar» no es una orden"]);
  });

  it("un tipo que no se conoce se dice (al escribir; al leer se conserva)", () => {
    expect(validarEvento({ tipo: "holograma" } as unknown as Evento)).toEqual(["«holograma» no es un tipo de evento"]);
  });
});
