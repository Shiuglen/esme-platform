/**
 * UNA SESIÓN DESDE LA TERMINAL — su registro (`eventos.jsonl`), a mano.
 *
 *   npm run sesion -- ver <registro> [--en <n>] [--json]
 *       la sesión en turnos: lo que se pidió, lo que se respondió, lo que se
 *       hizo y cómo acabó. Con --en, como estaba tras el evento n (rebobinar
 *       es leer: el registro no se toca).
 *   npm run sesion -- verificar <registro> [--json]
 *       si verifica, hasta dónde es de fiar y lo que no cuadra. Sale con 1 si
 *       no verifica.
 *   npm run sesion -- compactar <registro> <salida>
 *       otro registro, más pequeño, que se reproduce igual.
 *   npm run sesion -- importar <sesión de Claude Code> <salida> --de <aparato> [--sesion <id>] [--json]
 *       una sesión de Claude Code (su `.jsonl`) hecha registro de Esme, con
 *       la cuenta de lo que entró y lo que no.
 *   npm run sesion -- bifurcar <registro> <n> <salida> --de <aparato> --sesion <id> [--desde <id>]
 *       una sesión nueva que empieza con los eventos 0..n de otra.
 *   npm run sesion -- medir [--eventos <N>] [--vueltas <V>] [--limite <ms>] [--json]
 *       lo que tarda abrir la tarea más larga de hoy (sintética) en sus tres
 *       formas, en esta máquina: la primera vez (en un proceso nuevo) y ya en
 *       marcha. Es la regla 10 de la spec: sale con 1 si no llega (al límite
 *       de la spec, o al que se le dé).
 *   npm run sesion -- abrir <registro> [--json]
 *       lo que tarda abrirlo en este proceso: leerlo, verificarlo y
 *       reproducir su estado y su traza (medir lo usa para la primera vez).
 *
 * Nada se pisa: lo que se escribe va a un fichero nuevo, y si ya existe se
 * dice y no se escribe. `--de` es el aparato que escribe el registro nuevo:
 * su dueño (el de la app, si la sesión va a seguir allí).
 *
 * Referencia: estandar/sesion.spec.yaml, docs/SESIONES.md.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as yaml from "js-yaml";
import { bifurcar } from "../core/sesiones/bifurcar.ts";
import { importarClaudeCode, type InformeImportar } from "../core/sesiones/claude-code.ts";
import { compactar } from "../core/sesiones/compactar.ts";
import { formasDe } from "../core/sesiones/formas.ts";
import { estadoDe, estadoEn, type Estado, type TurnoEstado } from "../core/sesiones/reductor.ts";
import { leer, type Lectura } from "../core/sesiones/registro.ts";
import { tallerSintetico } from "../core/sesiones/sintetico.ts";
import { trazaDe } from "../core/sesiones/traza.ts";

/** Por dónde sale lo que se dice (en las pruebas, a una lista). */
export interface Salida {
  out(linea: string): void;
  err(linea: string): void;
}

const CONSOLA: Salida = { out: (l) => console.log(l), err: (l) => console.error(l) };

/** Un error de uso: sale con 2 y recuerda cómo se usa. */
class Uso extends Error {}

const USO = `Uso: npm run sesion -- <orden> …
  ver <registro> [--en <n>] [--json]
  verificar <registro> [--json]
  compactar <registro> <salida>
  importar <sesión de Claude Code> <salida> --de <aparato> [--sesion <id>] [--json]
  bifurcar <registro> <n> <salida> --de <aparato> --sesion <id> [--desde <id>]
  medir [--eventos <N>] [--vueltas <V>] [--limite <ms>] [--json]
  abrir <registro> [--json]`;

interface Argumentos {
  orden: string;
  pos: string[];
  op: Record<string, string>;
  json: boolean;
}

/** Cada orden: cuántos ficheros lleva, qué opciones (las que no llevan valor, aparte) y qué hace. */
const ORDENES: Record<string, { posiciones: number; opciones: string[]; banderas?: string[]; correr: (a: Argumentos, io: Salida) => number }> = {
  ver: { posiciones: 1, opciones: ["en"], banderas: ["json"], correr: ver },
  verificar: { posiciones: 1, opciones: [], banderas: ["json"], correr: verificar },
  compactar: { posiciones: 2, opciones: [], correr: compactarOrden },
  importar: { posiciones: 2, opciones: ["de", "sesion"], banderas: ["json"], correr: importar },
  bifurcar: { posiciones: 3, opciones: ["de", "sesion", "desde"], correr: bifurcarOrden },
  medir: { posiciones: 0, opciones: ["eventos", "vueltas", "limite"], banderas: ["json"], correr: medir },
  abrir: { posiciones: 1, opciones: [], banderas: ["json"], correr: abrir },
};

function partir(argv: readonly string[]): Argumentos {
  const [orden, ...resto] = argv;
  if (!Object.hasOwn(ORDENES, orden)) throw new Uso(orden ? `No conozco la orden «${orden}».` : "Falta la orden.");
  const forma = ORDENES[orden];
  const pos: string[] = [];
  const op: Record<string, string> = {};
  let json = false;
  for (let i = 0; i < resto.length; i++) {
    const a = resto[i];
    if (!a.startsWith("--")) pos.push(a);
    else if (forma.banderas?.includes(a.slice(2))) json = true;
    else if (forma.opciones.includes(a.slice(2))) {
      const v = resto[++i];
      if (v === undefined || v.startsWith("--")) throw new Uso(`Falta el valor de ${a}.`);
      op[a.slice(2)] = v;
    } else throw new Uso(`«${orden}» no admite ${a}.`);
  }
  if (pos.length !== forma.posiciones) throw new Uso(`«${orden}» lleva ${forma.posiciones === 1 ? "un fichero" : `${forma.posiciones} cosas`}, y van ${pos.length}.`);
  return { orden, pos, op, json };
}

/** Un número entero de los argumentos. */
function entero(v: string, que: string, minimo = 0): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < minimo) throw new Uso(`${que} tiene que ser un número entero${minimo > 0 ? ` de ${minimo} o más` : ""}: «${v}».`);
  return n;
}

function leerTexto(ruta: string): string {
  try {
    return readFileSync(ruta, "utf8");
  } catch {
    throw new Error(`No puedo leer «${ruta}».`);
  }
}

/** Escribe un fichero nuevo; si ya existe, no lo pisa. */
function escribirNuevo(ruta: string, texto: string) {
  mkdirSync(dirname(resolve(ruta)), { recursive: true });
  try {
    writeFileSync(ruta, texto, { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`«${ruta}» ya existe: no lo piso. Elige otra salida.`);
    throw e;
  }
}

const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
/** Un tamaño en bytes, kB o MB (de mil en mil, como los cuenta el disco). */
const tamano = (bytes: number) => {
  if (bytes < 1e3) return `${bytes} B`;
  if (bytes < 1e6) return `${Math.round(bytes / 1e3)} kB`;
  return `${(bytes / 1e6).toFixed(1).replace(".", ",")} MB`;
};
const plural = (n: number, una: string, varias: string) => `${miles(n)} ${n === 1 ? una : varias}`;
/** La primera línea de un texto, recortada. */
const corto = (s: string, max = 72) => {
  const linea = s.trim().split("\n")[0].replace(/\s+/g, " ");
  return linea.length > max ? `${linea.slice(0, max - 1)}…` : linea;
};

// ---- ver ----

/** Cómo acabó un turno, por su motivo (el de ACP). */
const CIERRES: Readonly<Record<string, string>> = { end_turn: "acabó", cancelled: "lo pararon", max_tokens: "se quedó sin tokens", refusal: "se negó" };

function cierreDe(t: TurnoEstado): string {
  if (t.fin) return `${CIERRES[t.fin.motivo] ?? `acabó (${t.fin.motivo})`} en ${(t.fin.ms / 1000).toFixed(1).replace(".", ",")} s`;
  return t.error ? `falló: ${corto(t.error, 60)}` : "sin acabar";
}

function ver(a: Argumentos, io: Salida): number {
  const l = leer(leerTexto(a.pos[0]));
  const s: Estado = a.op.en !== undefined ? estadoEn(l, entero(a.op.en, "--en")) : estadoDe(l);
  if (a.json) {
    io.out(JSON.stringify(s, null, 2));
    return 0;
  }
  const quien = s.dueno ? ` · de ${s.dueno}, época ${s.epoca}` : "";
  const en = a.op.en !== undefined ? ` · tras el evento ${a.op.en}` : "";
  io.out(`Sesión ${s.sesion ?? "sin id"} · formato ${s.formato ?? "-"} · ${plural(s.eventos, "evento", "eventos")}${quien}${s.cerrada ? " · cerrada" : ""}${en}`);
  if (s.bifurca) io.out(`Sale de la sesión ${s.bifurca.sesion}, en su evento ${s.bifurca.n}.`);
  if (!l.valida) io.err(`No verifica (${plural(l.problemas.length, "problema", "problemas")}): npm run sesion -- verificar ${a.pos[0]}`);
  io.out(`Gastado: ${miles(s.uso.entrada)} de entrada, ${miles(s.uso.salida)} de salida (${miles(s.uso.pensamiento)} pensando).`);
  io.out(`${plural(s.turnos.length, "turno", "turnos")}${s.turnos.length ? ":" : "."}`);
  for (const t of s.turnos) {
    const fallidas = t.pasos.filter((p) => p.estado === "failed").length;
    const hizo = [
      t.pasos.length ? `${plural(t.pasos.length, "herramienta", "herramientas")}${fallidas ? ` (${miles(fallidas)} con error)` : ""}` : "",
      t.plan ? `plan de ${plural(t.plan.length, "paso", "pasos")}` : "",
      cierreDe(t),
    ].filter(Boolean);
    io.out(`  ${t.n}. «${corto(t.pedido)}»`);
    io.out(`     ${t.respuesta.trim() ? `→ «${corto(t.respuesta)}» · ` : ""}${hizo.join(" · ")}`);
  }
  if (s.permisos.length) io.out(`Esperan respuesta: ${plural(s.permisos.length, "permiso", "permisos")}.`);
  return 0;
}

// ---- verificar ----

function verificar(a: Argumentos, io: Salida): number {
  const l = leer(leerTexto(a.pos[0]));
  const n = l.cadena.n;
  if (a.json) {
    const { eventos: _e, lineas: _l, ...resto } = l;
    io.out(JSON.stringify(resto, null, 2));
    return l.valida ? 0 : 1;
  }
  const nombre = basename(a.pos[0]);
  if (l.valida && l.formato === 1) io.out(`${nombre} se lee entero: formato 1 (el del Taller de hoy, sin sobre: no lleva huellas que comprobar), ${plural(n, "línea", "líneas")}.`);
  else if (l.valida) io.out(`${nombre} verifica: formato ${l.formato ?? "-"}, ${plural(n, "línea", "líneas")}, todas de fiar.`);
  else {
    const fiar = l.fiables === 0 ? "ninguna es de fiar" : `son de fiar las ${miles(l.fiables)} primeras (se puede bifurcar hasta la ${miles(l.fiables - 1)})`;
    io.out(`${nombre} NO verifica: formato ${l.formato ?? "-"}, ${plural(l.eventos.length, "línea aceptada", "líneas aceptadas")}; ${fiar}.`);
    for (const p of l.problemas.slice(0, 20)) io.out(`  línea ${miles(p.linea)}: ${p.problema}`);
    if (l.problemas.length > 20) io.out(`  … y ${plural(l.problemas.length - 20, "problema más", "problemas más")}.`);
  }
  if (l.cortada) io.out("La última línea estaba cortada a medias (un apagón): se deja fuera, y su dueño la quitará al seguir.");
  else if (l.sinSalto) io.out("A la última línea le falta su salto final: su dueño lo pondrá al seguir.");
  return l.valida ? 0 : 1;
}

// ---- compactar ----

function compactarOrden(a: Argumentos, io: Salida): number {
  const [origen, salida] = a.pos;
  if (resolve(origen) === resolve(salida)) throw new Uso("Compactar escribe OTRO registro: la salida no puede ser el original.");
  const c = compactar(leer(leerTexto(origen)));
  escribirNuevo(salida, c.texto);
  io.out(`Compactado en ${salida}: de ${plural(c.antes.eventos, "evento", "eventos")} (${tamano(c.antes.bytes)}) a ${miles(c.despues.eventos)} (${tamano(c.despues.bytes)}). El original no se ha tocado.`);
  return 0;
}

// ---- importar ----

function informeEnFrases(i: InformeImportar): string[] {
  const frases = [
    `Del fichero (${plural(i.lineas, "línea", "líneas")}): ${miles(i.hilo)} en el hilo, ${miles(i.fueraDelHilo)} fuera (lo que se dejó al rebobinar), ${miles(i.laterales)} de subagentes, ${plural(i.repetidos, "repetida", "repetidas")} y ${plural(i.rotas, "rota", "rotas")}.`,
  ];
  if (i.empalmes) frases.push(`${plural(i.empalmes, "compactación tenía", "compactaciones tenían")} su enlace fuera del fichero: el hilo sigue por la línea de antes.`);
  if (i.aMedias) frases.push("El hilo empieza a medias: su primera línea apunta a otra que no está en el fichero.");
  frases.push(
    `No entran: ${plural(i.meta, "oculta o de nadie", "ocultas o de nadie")}, ${plural(i.resumenes, "resumen", "resúmenes")} de compactación y ${plural(i.imagenes, "imagen", "imágenes")} (se dice que estaban).`,
  );
  if (i.sinResultado) frases.push(`${plural(i.sinResultado, "herramienta se quedó", "herramientas se quedaron")} sin resultado.`);
  const otros = Object.entries(i.otros).sort((x, y) => y[1] - x[1]);
  if (otros.length) frases.push(`Lo demás, contado: ${otros.map(([k, n]) => `${k} ${miles(n)}`).join(", ")}.`);
  return frases;
}

function importar(a: Argumentos, io: Salida): number {
  const [origen, salida] = a.pos;
  if (!a.op.de) throw new Uso("Importar escribe un registro nuevo: di qué aparato lo escribe (--de).");
  const imp = importarClaudeCode(leerTexto(origen), { de: a.op.de, ...(a.op.sesion ? { sesion: a.op.sesion } : {}) });
  escribirNuevo(salida, imp.texto);
  if (a.json) {
    io.out(JSON.stringify({ sesion: imp.sesion, salida, informe: imp.informe }, null, 2));
    return 0;
  }
  const s = estadoDe(leer(imp.texto));
  io.out(`Importada la sesión ${imp.sesion} de Claude Code en ${salida}: ${plural(s.turnos.length, "turno", "turnos")}, ${plural(imp.informe.herramientas, "herramienta", "herramientas")}, ${plural(s.eventos, "evento", "eventos")}.`);
  for (const f of informeEnFrases(imp.informe)) io.out(f);
  return 0;
}

// ---- bifurcar ----

function bifurcarOrden(a: Argumentos, io: Salida): number {
  const [origen, n, salida] = a.pos;
  if (!a.op.de || !a.op.sesion) throw new Uso("Bifurcar abre una sesión nueva: di qué aparato la escribe (--de) y su id (--sesion).");
  if (resolve(origen) === resolve(salida)) throw new Uso("Bifurcar escribe OTRO registro: la salida no puede ser el original.");
  const b = bifurcar(leer(leerTexto(origen)), entero(n, "El evento"), { de: a.op.de, sesion: a.op.sesion, ...(a.op.desde ? { desde: a.op.desde } : {}) });
  escribirNuevo(salida, b.texto);
  io.out(`Bifurcada en ${salida}: la sesión ${a.op.sesion} sale de ${b.dueno.bifurca.sesion} en su evento ${b.dueno.bifurca.n} (${plural(b.cadena.n, "línea", "líneas")}).`);
  return 0;
}

// ---- abrir y medir ----

/** Lo que cuesta abrir un registro: leerlo del disco, verificarlo y reproducir su estado y su traza. */
function abrirRuta(ruta: string): { ms: number; eventos: number; valida: boolean } {
  const a = performance.now();
  const l = leer(leerTexto(ruta));
  estadoDe(l);
  trazaDe(l);
  return { ms: performance.now() - a, eventos: l.eventos.length, valida: l.valida };
}

function abrir(a: Argumentos, io: Salida): number {
  const r = abrirRuta(a.pos[0]);
  if (a.json) io.out(JSON.stringify(r));
  else io.out(`Abrirlo costó ${Math.round(r.ms)} ms (leerlo del disco, verificarlo y reproducir su estado y su traza): ${plural(r.eventos, "evento", "eventos")}${r.valida ? "" : ", y no verifica"}.`);
  return r.valida ? 0 : 1;
}

const mediana = (xs: number[]) => [...xs].sort((x, y) => x - y)[xs.length >> 1];

/** El cargador de TypeScript para el proceso nuevo: el mismo tsx que corre `npm run sesion`. */
const cargadorTs = () => pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

/** La primera vez: en un proceso nuevo, que no ha calentado nada (la mediana de unas cuantas). */
function primeraVez(ruta: string, veces: number): number {
  const tsx = cargadorTs();
  const ms: number[] = [];
  for (let i = 0; i < veces; i++) {
    const r = spawnSync(process.execPath, ["--import", tsx, fileURLToPath(import.meta.url), "abrir", "--json", ruta], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`No pude abrirlo en un proceso nuevo: ${(r.stderr || r.stdout).trim().split("\n").slice(-3).join(" ")}`);
    ms.push((JSON.parse(r.stdout.trim().split("\n").at(-1)!) as { ms: number }).ms);
  }
  return mediana(ms);
}

/** Ya en marcha: la mediana de unas vueltas en este proceso, después de una que solo calienta. */
function enMarcha(ruta: string, vueltas: number): number {
  abrirRuta(ruta);
  return mediana(Array.from({ length: vueltas }, () => abrirRuta(ruta).ms));
}

interface Reglas {
  eventos_referencia: number;
  reproducir_ms: number;
}

function reglas(): Reglas {
  const spec = yaml.load(readFileSync(new URL("../estandar/sesion.spec.yaml", import.meta.url), "utf8")) as { reglas: Reglas };
  return spec.reglas;
}

function medir(a: Argumentos, io: Salida): number {
  const r = reglas();
  const n = a.op.eventos !== undefined ? entero(a.op.eventos, "--eventos", 1) : r.eventos_referencia;
  const vueltas = a.op.vueltas !== undefined ? entero(a.op.vueltas, "--vueltas", 1) : 5;
  const limite = a.op.limite !== undefined ? entero(a.op.limite, "--limite") : r.reproducir_ms;
  const formas = formasDe(tallerSintetico({ semilla: 1, eventos: n }), { de: "medir", sesion: "medir" });
  // lo que pide la regla 10: con sobre, también la primera vez; como la escribe hoy el Taller, ya en marcha
  const casos = [
    { forma: "como la escribe hoy el Taller", texto: formas.taller, pide: { primera: false, marcha: true } },
    { forma: "con sobre, juntando por latido", texto: formas.juntado, pide: { primera: true, marcha: true } },
    { forma: "compactada", texto: formas.compactado, pide: { primera: false, marcha: false } },
  ];
  const dir = mkdtempSync(join(tmpdir(), "esme-medir-"));
  try {
    const filas = casos.map((c, i) => {
      const ruta = join(dir, `forma-${i}.jsonl`);
      writeFileSync(ruta, c.texto);
      const primera = primeraVez(ruta, 3);
      const marcha = enMarcha(ruta, vueltas);
      const cumple = (!c.pide.primera || primera <= limite) && (!c.pide.marcha || marcha <= limite);
      return { forma: c.forma, lineas: leer(c.texto).lineas.length, bytes: Buffer.byteLength(c.texto), primera, marcha, pide: c.pide, cumple };
    });
    const cumple = filas.every((f) => f.cumple);
    if (a.json) io.out(JSON.stringify({ eventos: n, vueltas, limite, filas, cumple }, null, 2));
    else {
      io.out(`La tarea más larga de hoy, sintética: ${plural(n, "evento", "eventos")}. En esta máquina (límite${a.op.limite === undefined ? " de la regla 10" : ""}: ${limite} ms):`);
      io.out("");
      io.out(`  ${"".padEnd(32)}${"líneas".padStart(9)}${"tamaño".padStart(10)}${"la primera vez".padStart(17)}${"en marcha".padStart(14)}`);
      const celda = (ms: number, pide: boolean) => `${Math.round(ms)} ms ${pide ? (ms <= limite ? "✓" : "✗") : " "}`;
      for (const f of filas) io.out(`  ${f.forma.padEnd(32)}${miles(f.lineas).padStart(9)}${tamano(f.bytes).padStart(10)}${celda(f.primera, f.pide.primera).padStart(17)}${celda(f.marcha, f.pide.marcha).padStart(14)}`);
      io.out("");
      io.out(cumple ? `Cumple: llega en ${limite} ms.` : `NO llega en ${limite} ms en esta máquina (✗).`);
    }
    return cumple ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- la entrada ----

/** Corre una orden; devuelve con qué sale (0 bien, 1 lo que se comprueba no cuadra o falló, 2 mal usada). */
export function sesion(argv: readonly string[], io: Salida = CONSOLA): number {
  if (argv.length === 0 || argv[0] === "--ayuda" || argv[0] === "-h" || argv[0] === "--help") {
    (argv.length === 0 ? io.err : io.out)(USO);
    return argv.length === 0 ? 2 : 0;
  }
  try {
    const a = partir(argv);
    return ORDENES[a.orden].correr(a, io);
  } catch (e) {
    if (e instanceof Uso) {
      io.err(e.message);
      io.err(USO);
      return 2;
    }
    io.err(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) process.exit(sesion(process.argv.slice(2)));
