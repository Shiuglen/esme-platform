/**
 * LA ORDEN DE LOS PAQUETES — qué aporta un paquete, qué pide y dónde corre;
 * de dónde se importa; y el candado de una plantilla.
 *
 *   npm run paquete -- <carpeta>
 *   npm run paquete -- importar <skill|claude|marketplace|mcp|goose> <ruta> [--salida <carpeta>] [--autor <nombre>] [--licencia <spdx>]
 *   npm run paquete -- resolver <plantilla> --en <carpeta de paquetes> [--lock <ruta>] [--aceptar]
 *
 * Nada se escribe sin pedirlo: `importar` sin `--salida` enseña lo que
 * saldría, y `resolver` solo escribe el candado con `--aceptar`, que es el
 * sí de la persona. El candado va, si no se dice otro sitio, al lado de la
 * plantilla (`<plantilla>.lock.json`): dentro cambiaría la huella de su árbol.
 *
 * Código: 0 bien; 1 no vale o no se pudo; 2 mal dicho (y el uso).
 *
 * Referencia: docs/PAQUETES.md, core/paquetes/, tienda/paquete-disco.ts,
 * tienda/importa-*.ts.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  NIVELES,
  PUNTOS,
  leePaquete,
  nivelDe,
  rutasDe,
  type DondeCorre,
  type ManifiestoV2,
  type Nivel,
  type Punto,
} from "../core/paquetes/manifiesto.ts";
import { INVISIBLES, type Permiso } from "../core/paquetes/permisos.ts";
import { resuelve } from "../core/paquetes/resolver.ts";
import { cambiosDesde, escribeLock, leeLock } from "../core/paquetes/lock.ts";
import { conocidoDeCarpeta, escribePaquete, leePaqueteDeCarpeta } from "../tienda/paquete-disco.ts";
import { importaCarpetaSkill } from "../tienda/importa-skill.ts";
import { importaMarketplaceClaude, importaPluginClaude } from "../tienda/importa-claude.ts";
import { importaServidorMcp } from "../tienda/importa-mcp.ts";
import { importaRecetaGoose } from "../tienda/importa-goose.ts";
import type { Importe, OpcionesImporte } from "../tienda/importa-comun.ts";

export interface Salida {
  code: number;
  lineas: string[];
}

const USO = [
  "uso:",
  "  npm run paquete -- <carpeta>",
  "      qué aporta (punto, id y dónde corre), qué pide, su nivel y sus avisos",
  "  npm run paquete -- importar <skill|claude|marketplace|mcp|goose> <ruta> [--salida <carpeta>] [--autor <nombre>] [--licencia <spdx>]",
  "      sin --salida enseña lo que saldría y no escribe nada",
  "  npm run paquete -- resolver <plantilla> --en <carpeta de paquetes> [--lock <ruta>] [--aceptar]",
  "      el candado va en <plantilla>.lock.json si no dices otro sitio, y solo se escribe con --aceptar",
];

const mal = (...motivo: string[]): Salida => ({ code: 2, lineas: [...motivo, ...USO] });
const falla = (...lineas: string[]): Salida => ({ code: 1, lineas });
const sangra = (lista: string[]): string[] => lista.map((l) => `  ${l}`);
const avisos = (lista: string[]): string[] => (lista.length ? ["Avisos:", ...sangra(lista)] : []);

/** Los argumentos de un verbo: los sueltos y las opciones (con valor o de marca). */
function partes(
  args: string[],
  conValor: readonly string[],
  marcas: readonly string[] = []
): { sueltos: string[]; opciones: Map<string, string | true> } | { error: string } {
  const sueltos: string[] = [];
  const opciones = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) {
      sueltos.push(a);
      continue;
    }
    const igual = a.indexOf("=");
    const nombre = igual > 0 ? a.slice(0, igual) : a;
    if (opciones.has(nombre)) return { error: `«${nombre}» va una sola vez` };
    if (marcas.includes(nombre)) {
      if (igual > 0) return { error: `«${nombre}» no lleva valor` };
      opciones.set(nombre, true);
    } else if (conValor.includes(nombre)) {
      const valor = igual > 0 ? a.slice(igual + 1) : args[++i];
      if (valor === undefined || valor === "" || (igual < 0 && valor.startsWith("--")))
        return { error: `«${nombre}» necesita un valor` };
      opciones.set(nombre, valor);
    } else return { error: `«${nombre}» no es una opción de este verbo` };
  }
  return { sueltos, opciones };
}

const DONDE: Record<DondeCorre, string> = {
  ventana: "corre en la ventana",
  sesión: "corre en la sesión",
  siempre: "corre siempre, sin sesión",
  mente: "corre en la mente",
};

/** Un permiso en una línea: la capacidad y, si lo tiene, su límite. */
function permisoEnTexto(p: Permiso): string {
  if (typeof p === "string") return p;
  const limites = (["hosts", "paths", "programs"] as const).flatMap((k) => (p[k] ? [`${k}: ${p[k]!.join(", ")}`] : []));
  return limites.length ? `${p.kind} (${limites.join("; ")})` : p.kind;
}

/** Lo que dice de sí una contribución, según su punto. */
function detalle(punto: Punto, e: Record<string, unknown>): string | undefined {
  const mcp = e.mcp as { command?: string; args?: string[]; url?: string } | undefined;
  switch (punto) {
    case "tools":
      if (mcp?.command) return `servidor MCP local: ${[mcp.command, ...(mcp.args ?? [])].join(" ")}`;
      if (mcp?.url) return `servidor MCP remoto: ${mcp.url}`;
      return `${e.runtime}: ${e.entry}`;
    case "memory":
      return `${e.runtime}: ${e.entry}`;
    case "views":
      return String(e.entry);
    case "skills":
      return e.remote ? `remota: ${e.remote}` : `${e.path}${e.scripts ? ", con scripts" : ""}`;
    case "agents":
      return `${e.format ?? "receta"}: ${e.recipe}`;
    case "tasks":
      return `«${e.title}»`;
    case "channels":
      return `por la herramienta ${e.tool}`;
    case "commands":
      return `lanza la tarea ${e.task}`;
    default:
      return undefined;
  }
}

/** Qué es, qué aporta (punto, id y dónde corre), qué usa, qué pide y su nivel. */
function describe(m: ManifiestoV2, version: 1 | 2 | null): string[] {
  const lineas = [
    `${m.id} ${m.version} · ${m.name} · ${m.kind === "template" ? "plantilla" : "paquete"}${version === 1 ? " (module.yaml v1)" : ""}`,
    `  ${m.description}`,
  ];
  if (m.source) lineas.push(`  viene de ${m.source.from} «${m.source.ref}»`);
  const aporta = (Object.keys(PUNTOS) as Punto[]).flatMap((punto) =>
    ((m.contributes[punto] ?? []) as Array<Record<string, unknown>>).map((e) => {
      const d = detalle(punto, e);
      return `  ${punto} · ${e.id} · ${PUNTOS[punto].naturaleza}, ${DONDE[PUNTOS[punto].corre]}${d ? ` · ${d}` : ""}`;
    })
  );
  lineas.push(aporta.length ? "Qué aporta:" : "Qué aporta: nada suyo", ...aporta);
  if (m.uses.length) lineas.push("Qué usa:", ...m.uses.map((u) => `  ${u.id} ${u.version} · huella ${u.sha256.slice(0, 12)}…`));
  if (m.oficio)
    lineas.push(
      "Qué monta al abrirla:",
      ...(m.oficio.piel ? [`  piel: ${m.oficio.piel}`] : []),
      ...m.oficio.secciones.map((s) => `  sección ${[s.id, s.nombre, s.vista, s.filtro].filter(Boolean).join(" · ")}`),
      `  órdenes: ${m.oficio.ordenes.join(", ") || "ninguna"}`
    );
  lineas.push(m.permissions.length ? "Qué pide:" : "Qué pide: nada", ...sangra(m.permissions.map(permisoEnTexto)));
  const n = nivelDe(m);
  lineas.push(`Aislamiento: nivel ${n} (${NIVELES[n]})`);
  return lineas;
}

/** `<carpeta>`: el dictamen antes de construir; el código que aún no está es un aviso. */
function enseña(dir: string): Salida {
  const d = leePaqueteDeCarpeta(dir, { exigirEntrada: false });
  if (!d.ok) return falla(`${d.id}: no vale`, ...sangra(d.errores), ...avisos(d.avisos));
  const m = d.paquete!;
  const existe = (ruta: string): boolean => {
    try {
      lstatSync(join(dir, ruta));
      return true;
    } catch {
      return false;
    }
  };
  const sinConstruir = rutasDe(m)
    .filter((r) => r.codigo && !existe(r.ruta))
    .map((r) => `${r.punto}.${r.id}: «${r.ruta}» aún no está construido (sin él no se instala)`);
  return { code: 0, lineas: [...describe(m, d.version), ...avisos([...d.avisos, ...sinConstruir])] };
}

type ImporteBueno = Extract<Importe, { ok: true }>;

/** Lo que saldría de importar: el paquete, lo que se descarta y por qué, y los avisos. */
function enseñaImporte(r: ImporteBueno): string[] {
  const l = leePaquete(r.paquete.manifiesto);
  return [
    ...(l.paquete ? describe(l.paquete, 2) : []),
    ...(r.descartado.length ? ["Se descarta:", ...sangra(r.descartado.map((x) => `${x.que}: ${x.motivo}`))] : []),
    ...avisos(r.avisos),
  ];
}

/** Por qué no se puede escribir en `dir` (null: se puede). Lo que sobrara entraría en la huella. */
function noLibre(dir: string): string | null {
  if (!existsSync(dir)) return null;
  if (!statSync(dir).isDirectory()) return `«${dir}» no es una carpeta`;
  if (readdirSync(dir).length)
    return `«${dir}» ya tiene ficheros: elige una carpeta nueva o vacía (lo que sobrara entraría en la huella del paquete)`;
  return null;
}

/** Escribe el paquete y lo relee de disco: lo que no vale al leerlo, se dice. */
function escribe(r: ImporteBueno, dir: string): string[] {
  const motivo = noLibre(dir);
  if (motivo) return [motivo];
  try {
    escribePaquete(r.paquete, dir);
  } catch (e) {
    return [`no se pudo escribir en «${dir}»: ${(e as Error).message}`];
  }
  const d = leePaqueteDeCarpeta(dir);
  return d.ok ? [] : [`se escribió en «${dir}», pero al leerlo no vale:`, ...sangra(d.errores)];
}

const FUENTES = ["skill", "claude", "marketplace", "mcp", "goose"] as const;
type Fuente = (typeof FUENTES)[number];

function importar(args: string[]): Salida {
  const a = partes(args, ["--salida", "--autor", "--licencia"]);
  if ("error" in a) return mal(a.error);
  const [fuente, ruta, ...sobra] = a.sueltos;
  if (!fuente || !ruta || sobra.length || !FUENTES.includes(fuente as Fuente))
    return mal(`importar: ${fuente && !FUENTES.includes(fuente as Fuente) ? `«${fuente}» no es una fuente` : "falta qué y de dónde"}`);
  if (!existsSync(ruta)) return falla(`«${ruta}» no está`);
  const opts: OpcionesImporte = {};
  const autor = a.opciones.get("--autor");
  const licencia = a.opciones.get("--licencia");
  if (typeof autor === "string") opts.autor = autor;
  if (typeof licencia === "string") opts.licencia = licencia;
  const salida = a.opciones.get("--salida") as string | undefined;
  if (fuente === "marketplace") return importarMarketplace(ruta, opts, salida);
  if (salida) {
    const motivo = noLibre(salida);
    if (motivo) return falla(motivo);
  }

  let r: Importe;
  if (fuente === "skill") r = importaCarpetaSkill(ruta, opts);
  else if (fuente === "claude") r = importaPluginClaude(ruta, opts);
  else if (fuente === "goose") r = importaRecetaGoose(ruta, opts);
  else {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(ruta, "utf8"));
    } catch (e) {
      return falla(`«${ruta}» no se puede leer: ${(e as Error).message}`);
    }
    r = importaServidorMcp(json);
    if (r.ok && (opts.autor || opts.licencia))
      r = { ...r, avisos: [...r.avisos, "--autor y --licencia no cuentan aquí: el paquete es un puntero al servidor, de Esme y con licencia MIT"] };
  }
  if (!r.ok) return falla(`«${ruta}» no se puede importar:`, ...sangra(r.errores));

  const lineas = enseñaImporte(r);
  if (!salida) return { code: 0, lineas: [...lineas, "No se escribe nada: para escribirlo, --salida <carpeta>."] };
  const errores = escribe(r, salida);
  return errores.length ? falla(...lineas, ...errores) : { code: 0, lineas: [...lineas, `Escrito en ${salida}.`] };
}

/** Un marketplace: cada plugin local, en `<salida>/<su id>`; los remotos quedan pendientes. */
function importarMarketplace(ruta: string, opts: OpcionesImporte, salida: string | undefined): Salida {
  const r = importaMarketplaceClaude(ruta, opts);
  const lineas: string[] = [];
  let code = r.errores.length ? 1 : 0;
  lineas.push(...r.errores);
  for (const i of r.importados) {
    if (!i.ok) {
      code = 1;
      lineas.push("No se puede importar:", ...sangra(i.errores), "");
      continue;
    }
    lineas.push(...enseñaImporte(i));
    if (salida) {
      const dir = join(salida, String(i.paquete.manifiesto.id));
      const errores = escribe(i, dir);
      if (errores.length) code = 1;
      lineas.push(...(errores.length ? errores : [`Escrito en ${dir}.`]));
    }
    lineas.push("");
  }
  if (r.pendientes.length)
    lineas.push("Pendientes (no se importan ahora):", ...sangra(r.pendientes.map((p) => `${p.nombre}: ${p.motivo}`)));
  if (!salida && r.importados.some((i) => i.ok))
    lineas.push("No se escribe nada: para escribirlos, --salida <carpeta> (cada uno en su carpeta, por su id).");
  return { code, lineas };
}

/** Los paquetes de una carpeta (uno por subcarpeta con module.yaml), y los que no valen, con su motivo. */
function conocidosDe(en: string) {
  const conocidos = [];
  const noValen: string[] = [];
  for (const e of readdirSync(en, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const dir = join(en, e.name);
    if (!e.isDirectory() || !existsSync(join(dir, "module.yaml"))) continue;
    const c = conocidoDeCarpeta(dir);
    if ("sha256" in c) conocidos.push(c);
    else noValen.push(`${e.name}: no vale, no cuenta (${c.errores.join("; ")})`);
  }
  return { conocidos, noValen };
}

function resolver(args: string[]): Salida {
  const a = partes(args, ["--en", "--lock"], ["--aceptar"]);
  if ("error" in a) return mal(a.error);
  const [plantilla, ...sobra] = a.sueltos;
  const en = a.opciones.get("--en") as string | undefined;
  if (!plantilla || sobra.length || !en) return mal("resolver: falta la plantilla o --en <carpeta de paquetes>");
  if (!existsSync(en) || !statSync(en).isDirectory()) return falla(`«${en}» no es una carpeta`);

  const raiz = conocidoDeCarpeta(plantilla);
  if (!("sha256" in raiz)) return falla(`${raiz.id}: no vale`, ...sangra(raiz.errores));
  const { conocidos, noValen } = conocidosDe(en);
  const r = resuelve(raiz.manifiesto, conocidos, { sha256Raiz: raiz.sha256 });
  if (!r.ok || !r.lock) return falla(`${raiz.manifiesto.id}: no se puede resolver`, ...sangra(r.errores), ...avisos(noValen));

  const ruta = (a.opciones.get("--lock") as string | undefined) ?? `${resolve(plantilla)}.lock.json`;
  const cambios = cambiosDesde(leeLock(ruta), r.lock);
  const nivel = Math.max(...[raiz, ...r.paquetes].map((p) => nivelDe(p.manifiesto))) as Nivel;
  const lineas = [
    `${raiz.manifiesto.id} ${raiz.manifiesto.version}: ${r.paquetes.length} paquete${r.paquetes.length === 1 ? "" : "s"}`,
    ...sangra(
      r.paquetes.map((p) => `${p.manifiesto.id} ${p.manifiesto.version} · huella ${p.sha256.slice(0, 12)}… · nivel ${nivelDe(p.manifiesto)}`)
    ),
    r.permisos.length ? "Entre todos piden:" : "Entre todos piden: nada",
    ...sangra(r.permisos.map(permisoEnTexto)),
    `Aislamiento: hasta el nivel ${nivel} (${NIVELES[nivel]})`,
    ...avisos(noValen),
  ];
  if (cambios.quitados.length) lineas.push(`Ya no están: ${cambios.quitados.join(", ")}`);

  if (cambios.pideConsentimiento) {
    lineas.push("Lo nuevo desde el candado:");
    if (cambios.nuevos.length) lineas.push(`  paquetes nuevos: ${cambios.nuevos.join(", ")}`);
    for (const h of cambios.huellas) lineas.push(`  ${h.id} cambió de huella: ${h.antes.slice(0, 12)}… → ${h.despues.slice(0, 12)}…`);
    if (cambios.permisosNuevos.length)
      lineas.push("  permisos nuevos:", ...sangra(sangra(cambios.permisosNuevos.map(permisoEnTexto))));
  } else lineas.push("El candado ya lo cubre todo: no hay nada nuevo que consentir.");

  if (!a.opciones.has("--aceptar")) {
    if (cambios.pideConsentimiento) lineas.push(`Esto pide tu permiso: si estás de acuerdo, repítelo con --aceptar y se escribe en ${ruta}.`);
    else if (cambios.quitados.length) lineas.push(`Con --aceptar se reescribe ${ruta} sin lo que ya no está.`);
    return { code: 0, lineas };
  }
  try {
    escribeLock(ruta, r.lock);
  } catch (e) {
    return falla(...lineas, `el candado no se pudo escribir en ${ruta}: ${(e as Error).message}`);
  }
  return { code: 0, lineas: [...lineas, `Candado escrito en ${ruta}.`] };
}

const INVISIBLES_TODOS = new RegExp(INVISIBLES.source, "gu");

/**
 * Una línea que se puede enseñar tal cual: un salto de línea o un tabulador
 * es un espacio (un salto inventaría otra línea, como «Qué pide: nada»), y
 * lo demás que no se ve y manda (un ESC que escribe en tu terminal, un
 * carácter que da la vuelta al texto) sale escrito como \uXXXX.
 */
const visible = (l: string): string =>
  l.replace(INVISIBLES_TODOS, (c) => (/[\t\n\r]/.test(c) ? " " : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`));

/** La orden entera: lo que sale, siempre visible (lo que enseña viene de paquetes de otros). */
export function cli(argv: string[]): Salida {
  const s = orden(argv);
  return { ...s, lineas: s.lineas.map(visible) };
}

function orden(argv: string[]): Salida {
  const [verbo, ...args] = argv;
  if (verbo === "importar") return importar(args);
  if (verbo === "resolver") return resolver(args);
  if (verbo === "ayuda" || verbo === "--help" || verbo === "-h") return { code: 0, lineas: USO };
  if (!verbo) return mal();
  if (args.length === 0 && existsSync(verbo) && statSync(verbo).isDirectory()) return enseña(verbo);
  return mal(`«${verbo}» no es un verbo ni la carpeta de un paquete`);
}

if (import.meta.url === new URL(`file://${process.argv[1]}`, "file:///").href) {
  const s = cli(process.argv.slice(2));
  console.log(s.lineas.join("\n"));
  process.exit(s.code);
}
