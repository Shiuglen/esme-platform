/**
 * LO COMÚN DE LOS IMPORTADORES — lo de otros, como paquete de Esme, sin perder nada en silencio.
 *
 * Un importador lee lo que otro ecosistema ya publica (un plugin de Claude
 * Code, una skill suelta, un `server.json` del registro MCP, una receta de
 * goose) y da un paquete v2. Tres reglas valen para todos:
 *
 *   - LO ESCRITO MANDA, y las opciones rellenan lo que falta: el autor y la
 *     licencia salen de lo que el original dice; `--autor` y `--licencia`
 *     ponen lo que no dice (y si dicen otra cosa, se avisa). Una licencia
 *     escrita que no es de las de un paquete es un error aunque digas otra:
 *     a nadie se le cambia la licencia al importarlo.
 *   - NADA SE PIERDE EN SILENCIO: lo que no puede viajar (un hook, un
 *     enlace, un check de shell) va a `descartado`, con su motivo; lo que
 *     viaja con una pega, a `avisos`.
 *   - LOS VALORES NO VIAJAN: de una variable de entorno o de una cabecera
 *     viaja el nombre, nunca el valor (ni en un aviso). Y los ficheros que
 *     suelen guardar secretos (`.env`, `.npmrc`, llaves) no viajan nunca.
 *
 * Lo que sale pasa por `validaPaqueteDatos`: si no da un paquete válido, el
 * importe es un error, no un paquete roto.
 *
 * Referencia: core/paquetes/manifiesto.ts, core/paquetes/adaptadores/comun.ts,
 * docs/PAQUETES.md.
 */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import * as yaml from "js-yaml";
import {
  LICENCIAS_PAQUETE,
  PUNTOS,
  programaDe,
  validaPaqueteDatos,
  type PaqueteDatos,
  type Punto,
} from "../core/paquetes/manifiesto.ts";
import { rutaDentro } from "../core/paquetes/permisos.ts";
import { esObjeto, esTexto, slug } from "../core/paquetes/adaptadores/comun.ts";
import { cabeceraDe } from "./skill-md.ts";

/** Lo que no viaja, y por qué. */
export interface Descartado {
  que: string;
  motivo: string;
}

/** Lo que sale de importar: el paquete (con sus pegas y lo que se quedó fuera), o por qué no sale. */
export type Importe =
  | { ok: true; paquete: PaqueteDatos; avisos: string[]; descartado: Descartado[] }
  | { ok: false; errores: string[] };

/** Lo que pone quien importa, para lo que el original no dice. */
export interface OpcionesImporte {
  autor?: string;
  licencia?: string;
}

/** Los motivos que se repiten (la doc y las pruebas los citan tal cual). */
export const MOTIVOS = {
  hooks: "un hook corre código en cada paso sin pasar por los permisos",
  bin: "pone programas en el PATH sin pedir permiso",
  monitors: "un proceso que corre siempre; en Esme es una rutina con permisos",
  userConfig: "llega con las llaves de Esme, en la Fase 2",
  sinPunto: "sin punto en Esme todavía",
  dependencies: "no traen huella: se instalan aparte y se fijan al resolver",
  enlace: "un enlace simbólico no viaja: copia el fichero de verdad",
  nodeModules: "las dependencias de npm no viajan: se instalan donde corre",
  secreto: "suele guardar secretos (llaves, tokens): no viaja nunca",
  manifiesto: "el manifiesto es el que sale de importar",
  otraForma: "otra forma de llegar al mismo servidor",
} as const;

export const falla = (...errores: string[]): Importe => ({ ok: false, errores });

/** ¿`ruta` está dentro de `raiz` (o es ella)? Por piezas, no por texto. */
export function dentroDe(raiz: string, ruta: string): boolean {
  const r = relative(raiz, ruta);
  return r === "" || (r.split(sep)[0] !== ".." && !isAbsolute(r));
}

/** ¿Es un fichero de verdad (no un enlace)? */
export function esFichero(ruta: string): boolean {
  try {
    return lstatSync(ruta).isFile();
  } catch {
    return false;
  }
}

/** ¿Es una carpeta de verdad (no un enlace)? */
export function esCarpeta(ruta: string): boolean {
  try {
    return lstatSync(ruta).isDirectory();
  } catch {
    return false;
  }
}

/** Las contribuciones en el orden de los doce puntos, sin las vacías. */
export function contribuciones(c: Partial<Record<Punto, unknown[]>>): Record<string, unknown[]> {
  return Object.fromEntries((Object.keys(PUNTOS) as Punto[]).filter((p) => c[p]?.length).map((p) => [p, c[p]!]));
}

// --- Las variables de Claude Code ---

/**
 * Las variables de Claude Code, a las de Esme: `${CLAUDE_PLUGIN_ROOT}` es
 * `${ESME_PAQUETE}` y `${CLAUDE_PLUGIN_DATA}` es `${ESME_DATOS}`. En una
 * skill, `${CLAUDE_SKILL_DIR}` es su carpeta dentro del paquete
 * (`carpetaSkill`; «.» si es la raíz).
 */
export function aEsme(texto: string, carpetaSkill?: string): string {
  let t = texto
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, () => "${ESME_PAQUETE}")
    .replace(/\$\{CLAUDE_PLUGIN_DATA\}/g, () => "${ESME_DATOS}");
  if (carpetaSkill !== undefined) {
    const suya = carpetaSkill === "." || carpetaSkill === "" ? "${ESME_PAQUETE}" : `\${ESME_PAQUETE}/${carpetaSkill}`;
    t = t.replace(/\$\{CLAUDE_SKILL_DIR\}/g, () => suya);
  }
  return t;
}

/** Lo que Claude Code sustituye en un texto y Esme no: un aviso por cada una. */
export function sinSustituir(texto: string): string[] {
  const vistas = new Set(texto.match(/\$\{CLAUDE_[A-Z_]+\}|\$\{user_config\.[^}\s]*\}|(?<!\\)\$ARGUMENTS\b/g) ?? []);
  return [...vistas].map((v) =>
    v.startsWith("${user_config.")
      ? `usa ${v}, que llega con las llaves de Esme, en la Fase 2`
      : `usa ${v}, que en Esme no se sustituye`
  );
}

// --- La licencia ---

const LISTA = LICENCIAS_PAQUETE.join(", ");

/** Una licencia escrita (un id SPDX o su nombre) como una de las de un paquete; null si no es ninguna. */
export function licenciaCanonica(texto: string): string | null {
  const t = texto.trim().replace(/^the\s+/i, "").replace(/\s+licen[cs]e$/i, "").trim();
  if (/^apache([\s,-]+licen[cs]e)?[\s,-]*(version\s*|v)?2(\.0)?$/i.test(t)) return "Apache-2.0";
  const clave = t.replace(/\s+/g, "-").toLowerCase();
  return LICENCIAS_PAQUETE.find((l) => l.toLowerCase() === clave) ?? null;
}

/** Lo que suena a licencia cerrada. */
const CERRADA =
  /propriet|privativ|all rights reserved|todos los derechos reservados|source[- ]available|commercial|comercial|confidential/i;

/** Lo que dice una licencia escrita: una de las nuestras, una ajena, o un texto que no es un id. */
export function leeLicenciaEscrita(escrita: string): { licencia: string; nota?: string } | { ajena: string } | { texto: string } {
  const t = escrita.trim().replace(/^\((.*)\)$/, "$1").trim();
  const directa = licenciaCanonica(t);
  if (directa) return { licencia: directa };
  const ids = /^[A-Za-z0-9.+-]+$/;
  const opciones = t.split(/\s+OR\s+/i).map((x) => x.replace(/[()]/g, "").trim());
  if (opciones.length > 1 && opciones.every((x) => ids.test(x))) {
    const nuestra = opciones.map(licenciaCanonica).find((x): x is string => x !== null);
    return nuestra
      ? { licencia: nuestra, nota: `su licencia es «${t}»: se elige ${nuestra}, que es una de las que deja elegir` }
      : { ajena: t };
  }
  if (CERRADA.test(t) || /\s(AND|WITH)\s/.test(t) || ids.test(t)) return { ajena: t };
  return { texto: t };
}

/** Las firmas de las licencias: la que aparece antes en el texto es la del fichero. */
const FIRMAS: Array<[RegExp, string]> = [
  [/MIT No Attribution/i, "MIT-0"],
  [/\bMIT License\b|Permission is hereby granted, free of charge/i, "MIT"],
  [/Apache License/i, "Apache"],
  [/\bBSD Zero Clause\b|\bZero-Clause BSD\b/i, "0BSD"],
  [/\bBSD [23]-Clause\b|Redistribution and use in source and binary forms/i, "BSD"],
  [/\bISC License\b|Permission to use, copy, modify, and\/?or distribute this software for any purpose/i, "ISC"],
  [/This is free and unencumbered software released into the public domain/i, "Unlicense"],
  [/GNU AFFERO GENERAL PUBLIC LICENSE/i, "AGPL"],
  [/GNU (LESSER|LIBRARY) GENERAL PUBLIC LICENSE/i, "LGPL"],
  [/GNU GENERAL PUBLIC LICENSE/i, "GPL"],
  [/Mozilla Public License/i, "MPL"],
  [/Eclipse Public License/i, "EPL"],
  [/Creative Commons|Attribution-(NonCommercial|ShareAlike|NoDerivatives)/i, "Creative Commons"],
  [/Business Source License/i, "BUSL"],
  [/Server Side Public License/i, "SSPL"],
  [/Elastic License/i, "Elastic"],
  [/PolyForm/i, "PolyForm"],
];

/**
 * De qué licencia es el texto de un LICENSE: una de las de un paquete, una
 * ajena que se reconoce, o null. Manda la que se nombra ANTES (un Apache con
 * avisos de terceros en MIT al final es Apache), y se mira la variante: un
 * Apache que no es la 2.0, un BSD con la cláusula de publicidad o un MIT sin
 * la de atribución no son los nuestros.
 */
export function licenciaDeTexto(texto: string): { licencia: string } | { ajena: string } | null {
  const t = texto.slice(0, 8000).replace(/\s+/g, " ");
  let primera: { familia: string; donde: number } | null = null;
  for (const [firma, familia] of FIRMAS) {
    const donde = t.search(firma);
    if (donde >= 0 && (!primera || donde < primera.donde)) primera = { familia, donde };
  }
  if (!primera) return CERRADA.test(t) ? { ajena: "cerrada (todos los derechos reservados)" } : null;
  switch (primera.familia) {
    case "MIT":
      return /\bMIT License\b|shall be included in all copies/i.test(t) ? { licencia: "MIT" } : { ajena: "MIT-0" };
    case "Apache":
      return /Version 2\.0/i.test(t) ? { licencia: "Apache-2.0" } : { ajena: "Apache (no la 2.0)" };
    case "BSD":
      if (/advertising materials/i.test(t)) return { ajena: "BSD-4-Clause" };
      return /\bBSD 3-Clause\b|endorse or promote products/i.test(t) ? { licencia: "BSD-3-Clause" } : { licencia: "BSD-2-Clause" };
    case "ISC":
      return /\bISC License\b|this permission notice appear in all copies/i.test(t) ? { licencia: "ISC" } : { ajena: "0BSD" };
    case "Unlicense":
      return { licencia: "Unlicense" };
    default:
      return { ajena: primera.familia };
  }
}

/** Los ficheros de licencia: LICENSE (o LICENCE, o COPYING), con .md o .txt o sin nada. */
const FICHERO_LICENCIA = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

/** El LICENSE de una carpeta y lo que dice; null si no lo trae. */
export function licenciaDeCarpeta(dir: string): { fichero: string; licencia?: string; ajena?: string } | null {
  let nombres: string[];
  try {
    nombres = readdirSync(dir).filter((n) => FICHERO_LICENCIA.test(n));
  } catch {
    return null;
  }
  const orden = (n: string): [number, number, string] => [/^copying/i.test(n) ? 1 : 0, n.length, n];
  nombres.sort((a, b) => {
    const [x, y] = [orden(a), orden(b)];
    return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
  });
  for (const n of nombres) {
    if (!esFichero(join(dir, n))) continue;
    return { fichero: n, ...(licenciaDeTexto(readFileSync(join(dir, n), "utf8")) ?? {}) };
  }
  return null;
}

/**
 * La licencia del paquete: la escrita (`license` del manifiesto o de la
 * cabecera); si no, la de su LICENSE; y si no, la que digas (`--licencia`),
 * con aviso. Una escrita, o un LICENSE, de una licencia que no es de las de
 * un paquete es un error aunque digas otra; y si lo escrito y el LICENSE no
 * cuadran, el LICENSE ajeno también lo es (no se sabe cuál vale).
 */
export function eligeLicencia(o: {
  escrita?: unknown;
  carpeta?: string;
  opcion?: string;
  quien: string;
}): { licencia: string; avisos: string[] } | { error: string } {
  const avisos: string[] = [];
  let opcion: string | undefined;
  if (o.opcion !== undefined) {
    const c = licenciaCanonica(o.opcion);
    if (!c) return { error: `--licencia «${o.opcion}» no es de las de un paquete (una de: ${LISTA})` };
    opcion = c;
  }
  const suya = (licencia: string, de: string) => {
    if (opcion && opcion !== licencia)
      avisos.push(`${o.quien}: su licencia es ${licencia} (${de}): se queda la suya (dijiste ${opcion})`);
    return { licencia, avisos };
  };
  const ajena = (l: string) => ({
    error: `${o.quien}: su licencia es «${l}», y un paquete solo puede llevar una de estas: ${LISTA}`,
  });

  const f = o.carpeta ? licenciaDeCarpeta(o.carpeta) : null;
  let nota = f ? `trae un ${f.fichero} que no se reconoce` : "no dice su licencia (ni trae LICENSE)";
  if (esTexto(o.escrita)) {
    const e = leeLicenciaEscrita(o.escrita);
    if ("ajena" in e) return ajena(e.ajena);
    if ("licencia" in e) {
      if (f?.ajena)
        return { error: `${o.quien}: dice ${e.licencia}, pero su ${f.fichero} es «${f.ajena}»: no se sabe cuál vale` };
      if (e.nota) avisos.push(`${o.quien}: ${e.nota}`);
      if (f?.licencia && f.licencia !== e.licencia)
        avisos.push(`${o.quien}: dice ${e.licencia}, y su ${f.fichero} es ${f.licencia}: va la que dice`);
      return suya(e.licencia, "la que está escrita");
    }
    nota = `su licencia dice «${e.texto}», y no se reconoce`;
  }
  if (f?.licencia) return suya(f.licencia, `la de su ${f.fichero}`);
  if (f?.ajena) return ajena(f.ajena);
  if (opcion) {
    avisos.push(`${o.quien}: ${nota}: la licencia la pones tú (${opcion}); asegúrate de que es la suya`);
    return { licencia: opcion, avisos };
  }
  return { error: `${o.quien}: ${nota}: mira cuál es y dila con --licencia (una de: ${LISTA})` };
}

// --- El autor, el id, la versión y la descripción ---

/**
 * Un autor como nombre: sin su correo ni su web («Ana <ana@x.com> (https://…)»
 * es «Ana»), y de un objeto, su `name`. Un correo solo no es un nombre (no
 * se publica): undefined.
 */
export function nombreDeAutor(a: unknown): string | undefined {
  const n = esObjeto(a) ? a.name : a;
  if (!esTexto(n)) return undefined;
  const limpio = n.replace(/<[^>]*>|\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (!limpio || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) return undefined;
  return limpio.replace(/^@/, "") || undefined;
}

/** El autor: el escrito; si no, el que digas (y si dices otro, se avisa). */
export function eligeAutor(escrito: string | undefined, opcion: string | undefined, quien: string, avisos: string[]): string | null {
  const dicho = opcion?.trim() || undefined;
  if (escrito) {
    if (dicho && dicho !== escrito) avisos.push(`${quien}: su autor es «${escrito}»: se queda el suyo (dijiste «${dicho}»)`);
    return escrito;
  }
  return dicho ?? null;
}

/** El id de un paquete importado: `esme.<autor>.<nombre>`, en slug (null si alguno no da nada). */
export function idDe(autor: string, nombre: string): string | null {
  const [a, n] = [slug(autor), slug(nombre)];
  return a && n ? `esme.${a}.${n}` : null;
}

/** La versión, en semver estricto: «1.2» es 1.2.0, «v3» es 3.0.0, y sin versión, 0.0.0 (con aviso si cambia). */
export function versionImportada(v: unknown, quien: string, avisos: string[]): string {
  if (typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v)) return v;
  const m = typeof v === "string" ? /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v.trim()) : null;
  const sale = m ? `${Number(m[1])}.${Number(m[2] ?? 0)}.${Number(m[3] ?? 0)}` : "0.0.0";
  avisos.push(v === undefined ? `${quien}: no dice su versión: va como ${sale}` : `${quien}: su versión «${String(v)}» va como ${sale}`);
  return sale;
}

/** La descripción: la suya si dice algo (diez letras o más); si no, una genérica, con aviso. */
export function descripcionDe(d: unknown, generica: string, quien: string, avisos: string[]): string {
  if (esTexto(d) && d.trim().length >= 10) return d.trim();
  avisos.push(`${quien}: ${esTexto(d) ? "su descripción es muy corta" : "no trae descripción"}: va «${generica}»`);
  return generica;
}

// --- Los ficheros ---

/** Lo que nunca viaja ni se dice: lo que dejan por ahí el sistema y las herramientas. */
const NUNCA = new Set([".git", ".DS_Store", "Thumbs.db", "__pycache__", ".mcpb-cache"]);

/** Los ficheros que suelen guardar secretos (llaves, tokens). Un `.env.example` sí viaja. */
const SECRETO =
  /^(\.env(\.(?!(example|sample|template|dist)$)[^/]+)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials|id_(rsa|dsa|ecdsa|ed25519)|.+\.(key|p12|pfx))$/i;

/** ¿Es algo que nunca viaja ni se dice? */
export const nuncaViaja = (nombre: string): boolean => NUNCA.has(nombre);

/**
 * Los ficheros de una carpeta para el paquete, en orden. No viajan, y se
 * dice: un enlace (copia el fichero de verdad), `node_modules`, un fichero
 * de secretos, un nombre que no vale como ruta ni un `module.yaml` (el
 * manifiesto es el que sale de importar). `salta` deja fuera, sin decir
 * nada, lo que el importador ya convirtió o ya descartó con su motivo.
 */
export function ficherosDe(
  dir: string,
  salta: (rel: string) => boolean = () => false
): { ficheros: Record<string, Uint8Array>; descartado: Descartado[] } {
  const ficheros: Record<string, Uint8Array> = {};
  const descartado: Descartado[] = [];
  const recorre = (rel: string): void => {
    for (const nombre of readdirSync(rel ? join(dir, rel) : dir).sort()) {
      const r = rel ? `${rel}/${nombre}` : nombre;
      if (NUNCA.has(nombre) || salta(r)) continue;
      const st = lstatSync(join(dir, r));
      if (st.isSymbolicLink()) descartado.push({ que: r, motivo: MOTIVOS.enlace });
      else if (st.isDirectory()) {
        if (nombre === "node_modules") descartado.push({ que: `${r}/`, motivo: MOTIVOS.nodeModules });
        else recorre(r);
      } else if (!st.isFile()) descartado.push({ que: r, motivo: "no es un fichero ni una carpeta" });
      else if (!rutaDentro(r)) descartado.push({ que: r, motivo: "su nombre no vale como ruta de un paquete" });
      else if (SECRETO.test(nombre)) descartado.push({ que: r, motivo: MOTIVOS.secreto });
      else if (r === "module.yaml") descartado.push({ que: r, motivo: MOTIVOS.manifiesto });
      else ficheros[r] = readFileSync(join(dir, r));
    }
  };
  recorre("");
  return { ficheros, descartado };
}

// --- El Markdown con cabecera (SKILL.md, comandos, agentes) ---

const CABECERA = /^(﻿?---\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))([\s\S]*)$/;

/**
 * La cabecera (YAML) y el cuerpo de un Markdown; sin cabecera, todo es
 * cuerpo. Si la cabecera no es YAML estricto (una descripción con «: »
 * sin comillas, que Claude Code sí lee), se lee con el lector mínimo.
 */
export function partesMd(texto: string): { cabecera: Record<string, unknown>; cuerpo: string } {
  const m = CABECERA.exec(texto);
  if (!m) return { cabecera: {}, cuerpo: texto };
  let cabecera: Record<string, unknown>;
  try {
    const c = yaml.load(m[2], { schema: yaml.CORE_SCHEMA });
    cabecera = esObjeto(c) ? c : {};
  } catch {
    cabecera = cabeceraDe(m[2].replace(/\r/g, ""));
  }
  return { cabecera, cuerpo: m[4] };
}

/**
 * Quita claves de primer nivel de la cabecera de un Markdown (con sus
 * líneas de continuación) sin tocar nada más del texto. Devuelve el texto y
 * las claves que estaban.
 */
export function quitaClaves(texto: string, claves: readonly string[]): { texto: string; quitadas: string[] } {
  const m = CABECERA.exec(texto);
  if (!m) return { texto, quitadas: [] };
  const quitadas: string[] = [];
  const quedan: string[] = [];
  let quitando = false;
  for (const linea of m[2].split("\n")) {
    const clave = /^([A-Za-z0-9_-]+)\s*:/.exec(linea)?.[1];
    if (clave !== undefined) {
      quitando = claves.includes(clave);
      if (quitando) quitadas.push(clave);
    } else if (quitando && !/^([ \t]|-|\r?$)/.test(linea)) quitando = false;
    if (!quitando) quedan.push(linea);
  }
  return { texto: m[1] + quedan.join("\n") + m[3] + m[4], quitadas };
}

/** ¿Lleva órdenes que Claude Code corre al leerlo (`` !`orden` `` o un bloque ```!)? */
export const correOrdenes = (texto: string): boolean => /(^|[ \t])!`[^`\n]+`/m.test(texto) || /^```!/m.test(texto);

const CODIGO = /\.(py|sh|bash|zsh|fish|js|mjs|cjs|ts|mts|cts|rb|pl|php|ps1|psm1|bat|cmd|exe|dll|so|dylib|jar|wasm)$/i;

/**
 * ¿Una skill trae scripts? Una carpeta `scripts/`, un fichero de código o
 * que empieza por `#!`, u órdenes que corren al leer su SKILL.md. Las rutas
 * de `ficheros` van relativas a la carpeta de la skill.
 */
export function traeScripts(ficheros: Record<string, string | Uint8Array>, skillMd: string): boolean {
  if (correOrdenes(skillMd)) return true;
  return Object.entries(ficheros).some(
    ([r, f]) =>
      r.split("/")[0] === "scripts" ||
      CODIGO.test(r) ||
      (typeof f === "string" ? f.startsWith("#!") : f[0] === 0x23 && f[1] === 0x21)
  );
}

// --- Los programas que lanza un servidor MCP local ---

const PROGRAMA = /^[A-Za-z0-9._+-]+$/;

/**
 * Un programa con sus argumentos. Un `command` con espacios y sin `args`
 * («node servidor.js») se parte; uno con comillas no se sabe partir, y uno
 * cuyo nombre no vale como programa tampoco. Lanzar por una ruta absoluta
 * vale, con aviso: en otra máquina puede no estar ahí.
 */
export function partida(
  comando: string,
  args: string[],
  quien: string,
  avisos: string[]
): { comando: string; args: string[] } | { motivo: string } {
  let c = comando.trim();
  let a = args;
  if (/["'`]/.test(c)) return { motivo: "su orden lleva comillas: dila como programa (command) y argumentos (args)" };
  if (/\s/.test(c)) {
    if (args.length || c.includes("\\")) return { motivo: "su programa lleva espacios: dilo por su nombre, y lo demás en args" };
    const [p, ...resto] = c.split(/\s+/);
    avisos.push(`${quien}: «${c}» va partido en programa (${p}) y argumentos`);
    [c, a] = [p, resto];
  }
  const programa = programaDe(c);
  if (!PROGRAMA.test(programa) || programa === "." || programa === "..")
    return { motivo: `«${programa}» no vale como nombre de programa` };
  if (/^([\\/]|[A-Za-z]:)/.test(c)) avisos.push(`${quien}: lanza «${c}» por su ruta: en otra máquina puede no estar ahí`);
  return { comando: c, args: a };
}

/** npx o uvx (y sus primos) sin versión fija bajan la última cada vez: se avisa. */
export function avisaSinFijar(comando: string, args: string[], quien: string, avisos: string[]): void {
  const p = programaDe(comando);
  if (!["npx", "pnpx", "bunx", "uvx"].includes(p)) return;
  const pkg = args.find((x) => !x.startsWith("-"));
  if (!pkg) return;
  const fijo = p === "uvx" ? /==|@/.test(pkg) : pkg.lastIndexOf("@") > 0;
  if (!fijo) avisos.push(`${quien}: ${p} lanza «${pkg}» sin versión fija: bajaría la última cada vez`);
}

// --- El final ---

/**
 * El paquete importado, si vale; si no, por qué no. Un paquete sin nada
 * que aportar (porque todo se descartó) es un error que dice qué se
 * descartó.
 */
export function cierra(p: PaqueteDatos, avisos: string[], descartado: Descartado[]): Importe {
  const c = (p.manifiesto.contributes ?? {}) as Record<string, unknown[]>;
  if (!Object.values(c).some((l) => l.length))
    return falla(`no queda nada que traer${descartado.length ? ` (se descartó: ${descartado.map((d) => d.que).join(", ")})` : ""}`);
  const v = validaPaqueteDatos(p);
  if (!v.ok) return falla(...v.errores.map((e) => `el paquete que sale no vale: ${e}`));
  return { ok: true, paquete: p, avisos: [...avisos, ...v.avisos], descartado };
}
