/**
 * UNA SESIÓN DESDE LA TERMINAL — `npm run sesion`, orden a orden.
 *
 * Se corre en el mismo proceso (`sesion(argv, io)`), con ficheros en una
 * carpeta temporal: lo que dice, con qué sale y lo que escribe. Solo `medir`
 * abre procesos nuevos (la primera vez es eso: un proceso que no ha
 * calentado nada).
 *
 * Referencia: scripts/sesion.ts, estandar/sesion.spec.yaml (reglas).
 */
import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sesion } from "../scripts/sesion.ts";
import { importarClaudeCode } from "../core/sesiones/claude-code.ts";
import { formasDe } from "../core/sesiones/formas.ts";
import { estadoDe, estadoEn } from "../core/sesiones/reductor.ts";
import { leer } from "../core/sesiones/registro.ts";
import { tallerSintetico } from "../core/sesiones/sintetico.ts";

const dir = mkdtempSync(join(tmpdir(), "esme-sesion-cli-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const en = (nombre: string) => join(dir, nombre);

/** Una sesión de Claude Code (sintética) y el registro que sale de importarla. */
const CLAUDE_CODE = fileURLToPath(new URL("./fixtures/sesiones/claude-code/compactada.jsonl", import.meta.url));
const IMPORTADA = importarClaudeCode(readFileSync(CLAUDE_CODE, "utf8"), { de: "pc" });

/** Un registro de la carpeta temporal, escrito a mano. */
function registro(nombre: string, texto: string): string {
  writeFileSync(en(nombre), texto);
  return en(nombre);
}

/** Corre una orden y recoge lo que dice. */
function corre(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const codigo = sesion(argv, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { codigo, out: out.join("\n"), err: err.join("\n") };
}

describe("cómo se usa", () => {
  it("sin orden, o con una que no existe, dice cómo se usa y sale con 2", () => {
    for (const argv of [[], ["borrar", "x"], ["toString"], ["__proto__", "x"], ["constructor"]]) {
      const r = corre(...argv);
      expect(r.codigo, argv.join(" ")).toBe(2);
      expect(r.err).toContain("Uso: npm run sesion");
    }
    expect(corre("toString").err).toContain("No conozco la orden «toString».");
  });

  it("con --ayuda lo dice por la salida normal, y sale con 0", () => {
    const r = corre("--ayuda");
    expect(r.codigo).toBe(0);
    expect(r.out).toContain("Uso: npm run sesion");
  });

  it("los ficheros que faltan o sobran, las opciones que no admite y las que van sin valor son un error de uso", () => {
    const r = registro("uso.jsonl", IMPORTADA.texto);
    const casos: [string[], string][] = [
      [["ver"], "«ver» lleva un fichero, y van 0."],
      [["compactar", r], "«compactar» lleva 2 cosas, y van 1."],
      [["ver", r, r], "«ver» lleva un fichero, y van 2."],
      [["ver", r, "--de", "pc"], "«ver» no admite --de."],
      [["ver", r, "--en"], "Falta el valor de --en."],
      [["ver", r, "--en", "--json"], "Falta el valor de --en."],
      [["ver", r, "--en", "tres"], "--en tiene que ser un número entero: «tres»."],
      [["medir", "--eventos", "0"], "--eventos tiene que ser un número entero de 1 o más: «0»."],
    ];
    for (const [argv, dice] of casos) {
      const s = corre(...argv);
      expect(s.codigo, argv.join(" ")).toBe(2);
      expect(s.err).toContain(dice);
    }
  });

  it("un fichero que no se puede leer es un error (sale con 1), no un error de uso", () => {
    const r = corre("ver", en("no-existe.jsonl"));
    expect(r.codigo).toBe(1);
    expect(r.err).toBe(`No puedo leer «${en("no-existe.jsonl")}».`);
  });
});

describe("importar", () => {
  it("escribe el registro que da importar la sesión, y cuenta lo que entró y lo que no", () => {
    const salida = en("importada.jsonl");
    const r = corre("importar", CLAUDE_CODE, salida, "--de", "pc");
    expect(r.codigo).toBe(0);
    expect(readFileSync(salida, "utf8")).toBe(IMPORTADA.texto);
    expect(r.out).toContain(`Importada la sesión ${IMPORTADA.sesion} de Claude Code en ${salida}: 2 turnos, 3 herramientas, 18 eventos.`);
    expect(r.out).toContain("13 en el hilo, 0 fuera (lo que se dejó al rebobinar), 0 de subagentes, 0 repetidas y 1 rota.");
    expect(r.out).toContain("No entran: 0 ocultas o de nadie, 1 resumen de compactación y 0 imágenes");
  });

  it("con --json, el informe tal cual; y con --sesion, otro id (la carpeta de la salida se crea si no está)", () => {
    const salida = en("nueva/carpeta/importada-json.jsonl");
    const r = corre("importar", CLAUDE_CODE, salida, "--de", "movil", "--sesion", "otra", "--json");
    expect(r.codigo).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ sesion: "otra", salida, informe: IMPORTADA.informe });
    expect(estadoDe(leer(readFileSync(salida, "utf8")))).toMatchObject({ sesion: "otra", dueno: "movil" });
  });

  it("no pisa lo que ya existe, y pide el aparato que escribe", () => {
    const salida = registro("ya-existe.jsonl", "lo de antes\n");
    const r = corre("importar", CLAUDE_CODE, salida, "--de", "pc");
    expect(r.codigo).toBe(1);
    expect(r.err).toContain("ya existe: no lo piso");
    expect(readFileSync(salida, "utf8")).toBe("lo de antes\n");
    const sinDe = corre("importar", CLAUDE_CODE, en("sin-de.jsonl"));
    expect(sinDe.codigo).toBe(2);
    expect(sinDe.err).toContain("(--de)");
    expect(existsSync(en("sin-de.jsonl"))).toBe(false);
  });
});

describe("ver y verificar", () => {
  it("ver cuenta la sesión en turnos: lo que se pidió, lo que se respondió y cómo acabó", () => {
    const r = corre("ver", registro("ver.jsonl", IMPORTADA.texto));
    expect(r.codigo).toBe(0);
    expect(r.out.split("\n")).toEqual([
      `Sesión ${IMPORTADA.sesion} · formato 2 · 18 eventos · de pc, época 1`,
      "Gastado: 327 de entrada, 78 de salida (0 pensando).",
      "2 turnos:",
      "  1. «Ordena las fotos por fecha.»",
      "     → «Listo: ordenadas por fecha y sin la repetida.» · 2 herramientas · acabó en 12,0 s",
      "  2. «Súbelas a la nube.»",
      "     1 herramienta (1 con error) · lo pararon en 5,0 s",
    ]);
  });

  it("con --en, como estaba tras el evento n; con --json, el estado entero", () => {
    const r = registro("ver-en.jsonl", IMPORTADA.texto);
    const l = leer(IMPORTADA.texto);
    expect(JSON.parse(corre("ver", r, "--json").out)).toEqual(JSON.parse(JSON.stringify(estadoDe(l))));
    const tras5 = corre("ver", r, "--en", "5", "--json");
    expect(JSON.parse(tras5.out)).toEqual(JSON.parse(JSON.stringify(estadoEn(l, 5))));
    expect(corre("ver", r, "--en", "5").out).toContain("· 6 eventos · de pc, época 1 · tras el evento 5");
  });

  it("verificar: si verifica sale con 0; si no, con 1, y dice hasta dónde es de fiar", () => {
    expect(corre("verificar", registro("bueno.jsonl", IMPORTADA.texto))).toMatchObject({ codigo: 0, out: "bueno.jsonl verifica: formato 2, 18 líneas, todas de fiar." });
    const lineas = IMPORTADA.texto.split("\n");
    lineas[5] = lineas[5].replace("Y quita las repetidas.", "Y quita las fotos.");
    const r = corre("verificar", registro("tocado.jsonl", lineas.join("\n")));
    expect(r.codigo).toBe(1);
    expect(r.out).toContain("tocado.jsonl NO verifica: formato 2, 18 líneas aceptadas; son de fiar las 5 primeras (se puede bifurcar hasta la 4).");
    expect(r.out).toContain("línea 6: la huella no casa");
    expect(corre("verificar", en("tocado.jsonl"), "--json").codigo).toBe(1);
    // ver lo enseña igual, y avisa; abrirlo sale con 1
    expect(corre("ver", en("tocado.jsonl")).err).toContain("No verifica (1 problema)");
    expect(corre("abrir", en("tocado.jsonl"))).toMatchObject({ codigo: 1, out: expect.stringContaining("18 eventos, y no verifica.") });
  });

  it("verificar --json: la lectura sin sus eventos ni sus líneas", () => {
    const r = corre("verificar", registro("json.jsonl", IMPORTADA.texto), "--json");
    const { eventos: _e, lineas: _l, ...resto } = leer(IMPORTADA.texto);
    expect(JSON.parse(r.out)).toEqual(JSON.parse(JSON.stringify(resto)));
  });

  it("un registro del Taller de hoy (formato 1) se lee entero, y no se dice que verifica: no lleva huellas", () => {
    const { taller } = formasDe(tallerSintetico({ semilla: 3, eventos: 200 }), { de: "pc", sesion: "s" });
    const r = corre("verificar", registro("taller.jsonl", taller));
    expect(r).toMatchObject({ codigo: 0, out: "taller.jsonl se lee entero: formato 1 (el del Taller de hoy, sin sobre: no lleva huellas que comprobar), 200 líneas." });
  });
});

describe("compactar y bifurcar", () => {
  it("compactar escribe otro registro, que verifica y se reproduce igual; el original no se toca", () => {
    const { juntado } = formasDe(tallerSintetico({ semilla: 2, eventos: 3000 }), { de: "pc", sesion: "s" });
    const origen = registro("largo.jsonl", juntado);
    const r = corre("compactar", origen, en("largo-compacto.jsonl"));
    expect(r.codigo).toBe(0);
    expect(readFileSync(origen, "utf8")).toBe(juntado);
    const c = leer(readFileSync(en("largo-compacto.jsonl"), "utf8"));
    expect(c.valida).toBe(true);
    expect(c.lineas.length).toBeLessThan(leer(juntado).lineas.length);
    expect(estadoDe(c).turnos.map((t) => [t.pedido, t.respuesta])).toEqual(estadoDe(leer(juntado)).turnos.map((t) => [t.pedido, t.respuesta]));
    expect(r.out).toMatch(/^Compactado en .+: de [\d.]+ eventos \(\d+ kB\) a [\d.]+ \(\d+ kB\)\. El original no se ha tocado\.$/);
  });

  it("compactar solo compacta un registro que verifica", () => {
    const lineas = IMPORTADA.texto.split("\n");
    lineas[5] = lineas[5].replace("Y quita las repetidas.", "Y quita las fotos.");
    const r = corre("compactar", registro("roto.jsonl", lineas.join("\n")), en("roto-compacto.jsonl"));
    expect(r).toMatchObject({ codigo: 1, err: "Solo se compacta un registro que verifica." });
    expect(existsSync(en("roto-compacto.jsonl"))).toBe(false);
  });

  it("compactar y bifurcar no escriben sobre el original", () => {
    const origen = registro("mismo.jsonl", IMPORTADA.texto);
    expect(corre("compactar", origen, origen).codigo).toBe(2);
    expect(corre("bifurcar", origen, "3", origen, "--de", "pc", "--sesion", "b").codigo).toBe(2);
    expect(readFileSync(origen, "utf8")).toBe(IMPORTADA.texto);
  });

  it("bifurcar abre una sesión nueva con los eventos 0..n de la otra, y dice de dónde sale", () => {
    const origen = registro("tronco.jsonl", IMPORTADA.texto);
    const r = corre("bifurcar", origen, "8", en("rama.jsonl"), "--de", "movil", "--sesion", "rama");
    expect(r.codigo).toBe(0);
    expect(r.out).toContain(`la sesión rama sale de ${IMPORTADA.sesion} en su evento 8 (10 líneas)`);
    const s = estadoDe(leer(readFileSync(en("rama.jsonl"), "utf8")));
    expect(s).toMatchObject({ sesion: "rama", bifurca: { sesion: IMPORTADA.sesion, n: 8 } });
    expect(corre("ver", en("rama.jsonl")).out).toContain(`Sale de la sesión ${IMPORTADA.sesion}, en su evento 8.`);
  });

  it("un registro del Taller de hoy no dice de qué sesión es: hay que darla (--desde)", () => {
    const { taller } = formasDe(tallerSintetico({ semilla: 4, eventos: 50 }), { de: "pc", sesion: "s" });
    const origen = registro("taller-sin-id.jsonl", taller);
    const sin = corre("bifurcar", origen, "10", en("t1.jsonl"), "--de", "pc", "--sesion", "t1");
    expect(sin.codigo).toBe(1);
    expect(sin.err).toContain("«desde»");
    expect(corre("bifurcar", origen, "10", en("t2.jsonl"), "--de", "pc", "--sesion", "t2", "--desde", "tarea-7").codigo).toBe(0);
    expect(estadoDe(leer(readFileSync(en("t2.jsonl"), "utf8")))).toMatchObject({ sesion: "t2", bifurca: { sesion: "tarea-7", n: 10 } });
  });

  it("bifurcar pide el aparato y la sesión nueva, y solo bifurca por un sitio de fiar", () => {
    const origen = registro("tronco-2.jsonl", IMPORTADA.texto);
    expect(corre("bifurcar", origen, "3", en("r1.jsonl"), "--de", "pc").codigo).toBe(2);
    const fuera = corre("bifurcar", origen, "99", en("r2.jsonl"), "--de", "pc", "--sesion", "r2");
    expect(fuera.codigo).toBe(1);
    expect(fuera.err).toContain("no tiene la línea 99");
    expect(existsSync(en("r2.jsonl"))).toBe(false);
  });
});

describe("abrir y medir", () => {
  it("abrir dice lo que costó leerlo, verificarlo y reproducirlo", () => {
    const r = corre("abrir", registro("abrir.jsonl", IMPORTADA.texto), "--json");
    expect(r.codigo).toBe(0);
    const j = JSON.parse(r.out) as { ms: number; eventos: number; valida: boolean };
    expect(j).toMatchObject({ eventos: 18, valida: true });
    expect(j.ms).toBeGreaterThanOrEqual(0);
  });

  it("medir abre las tres formas de la tarea en procesos nuevos y ya en marcha, y juzga lo que pide la regla 10", () => {
    const r = corre("medir", "--eventos", "300", "--vueltas", "1", "--json");
    const j = JSON.parse(r.out) as {
      eventos: number;
      limite: number;
      cumple: boolean;
      filas: { forma: string; lineas: number; primera: number; marcha: number; pide: { primera: boolean; marcha: boolean }; cumple: boolean }[];
    };
    expect(j).toMatchObject({ eventos: 300, vueltas: 1, limite: 200 });
    expect(j.filas.map((f) => [f.forma, f.pide])).toEqual([
      ["como la escribe hoy el Taller", { primera: false, marcha: true }],
      ["con sobre, juntando por latido", { primera: true, marcha: true }],
      ["compactada", { primera: false, marcha: false }],
    ]);
    expect(j.filas[0].lineas).toBe(300);
    for (const f of j.filas) {
      expect(f.primera).toBeGreaterThan(0);
      expect(f.marcha).toBeGreaterThan(0);
      expect(f.cumple).toBe((!f.pide.primera || f.primera <= j.limite) && (!f.pide.marcha || f.marcha <= j.limite));
    }
    expect(j.cumple).toBe(j.filas.every((f) => f.cumple));
    expect(r.codigo).toBe(j.cumple ? 0 : 1);
  }, 60_000);

  it("con --limite juzga contra otro límite: a 0 ms no llega nada de lo que se juzga, y sale con 1", () => {
    const r = corre("medir", "--eventos", "100", "--vueltas", "1", "--limite", "0");
    expect(r.codigo).toBe(1);
    const filas = r.out.split("\n").filter((l) => /^ {2}(como|con|compactada)/.test(l));
    // lo que pide la regla 10, cada cosa en su celda: la compactada no se juzga
    expect(filas.map((l) => (l.match(/[✓✗]/g) ?? []).join(""))).toEqual(["✗", "✗✗", ""]);
    expect(r.out).toContain("(límite: 0 ms)");
    expect(r.out).toContain("NO llega en 0 ms en esta máquina (✗).");
  }, 60_000);
});
