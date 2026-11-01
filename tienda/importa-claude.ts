/**
 * IMPORTAR DE CLAUDE CODE — un plugin (o un marketplace entero) como paquetes de Esme.
 *
 * Un plugin de Claude Code es una carpeta con `.claude-plugin/plugin.json`
 * (o sin él: entonces su entrada del marketplace hace de manifiesto) y sus
 * piezas en sus carpetas de siempre. Cada pieza va a su punto:
 *
 *   - `skills/<x>/SKILL.md` → `skills` (sin `allowed-tools` ni `hooks`);
 *   - `commands/*.md` → una tarea (`tasks`) y su comando (`commands`):
 *     `$ARGUMENTS` pasa a `{{argumentos}}`, y `$0`, `$1`… a
 *     `{{argumento-1}}`, `{{argumento-2}}`…;
 *   - `agents/*.md` → `agents`, en formato `claude-md`;
 *   - `.mcp.json` y `mcpServers` → `tools` con su `mcp`, y el permiso que
 *     eso pide (lanzar su programa, o hablar con su host);
 *   - `channels` → `channels`, si su servidor viaja.
 *
 * Lo demás se descarta con su motivo: los hooks, `bin/`, los monitores,
 * `userConfig` (llega con las llaves, en la Fase 2), las dependencias (no
 * traen huella) y lo que aún no tiene punto en Esme (LSP, estilos de
 * salida, temas de terminal, workflows y settings).
 *
 * `${CLAUDE_PLUGIN_ROOT}` pasa a `${ESME_PAQUETE}` y `${CLAUDE_PLUGIN_DATA}`
 * a `${ESME_DATOS}`, también en lo que lee el modelo (SKILL.md, agentes y
 * prompts de las tareas).
 *
 * Referencia: tienda/importa-comun.ts, docs/PAQUETES.md,
 * https://code.claude.com/docs/en/plugins-reference.
 */
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { esObjeto, esTexto, esTextos, paquete, slug } from "../core/paquetes/adaptadores/comun.ts";
import { herramientaMcp, type EntradaMcp } from "../core/paquetes/adaptadores/herramientas.ts";
import type { PaqueteDatos } from "../core/paquetes/manifiesto.ts";
import { rutaDentro, type Permiso } from "../core/paquetes/permisos.ts";
import { leerSkillMd } from "./skill-md.ts";
import {
  MOTIVOS,
  aEsme,
  avisaSinFijar,
  cierra,
  contribuciones,
  correOrdenes,
  credencialEn,
  dentroDe,
  descripcionDe,
  eligeAutor,
  eligeLicencia,
  esCarpeta,
  esFichero,
  falla,
  ficherosDe,
  idDe,
  leeLicenciaEscrita,
  licenciaCanonica,
  licenciaDeCarpeta,
  noSeQuita,
  nombreDeAutor,
  nuncaViaja,
  partesMd,
  partida,
  quitaClaves,
  sinSustituir,
  traeScripts,
  versionImportada,
  type Descartado,
  type Importe,
  type OpcionesImporte,
} from "./importa-comun.ts";

/** Lo que va juntando la importación de un plugin. */
interface Contexto {
  /** La carpeta del plugin, real (sin enlaces). */
  raiz: string;
  avisos: string[];
  descartado: Descartado[];
  /** Lo que no viaja como fichero (ya convertido, o ya descartado con su motivo). */
  saltar: Set<string>;
  /** Los ficheros que viajan cambiados (SKILL.md y agentes, con las variables de Esme). */
  textos: Map<string, string>;
}

/** La entrada de un plugin en su marketplace. */
interface Entrada {
  json: Record<string, unknown>;
  /** El dueño del marketplace: el autor si nadie más lo dice. */
  dueño?: string;
  /** La fuente es la raíz del marketplace («./»). */
  esRaiz: boolean;
}

/**
 * Lo de la entrada del marketplace que es presentación: si está, manda sobre
 * el plugin.json. Salvo quién lo hizo y con qué licencia (`DEL_PLUGIN`): eso
 * lo dice el plugin, y la entrada solo lo rellena si el plugin no lo dice.
 */
const PRESENTACION = ["displayName", "description", "author", "homepage", "repository", "license", "keywords"];
const DEL_PLUGIN = ["author", "license"];

/** Lo que dice qué piezas trae un plugin. */
const PIEZAS = [
  "commands",
  "agents",
  "skills",
  "hooks",
  "mcpServers",
  "outputStyles",
  "lspServers",
  "channels",
  "monitors",
  "themes",
  "workflows",
  "settings",
  "userConfig",
  "dependencies",
  "experimental",
];

const descarta = (cx: Contexto, que: string, motivo: string): undefined => {
  cx.descartado.push({ que, motivo });
  return undefined;
};

const saltada = (cx: Contexto, rel: string): boolean => {
  for (const s of cx.saltar) if (rel === s || rel.startsWith(`${s}/`)) return true;
  return false;
};

/** Un campo del manifiesto como lista: una ruta sola es una lista de una. */
const listaDe = (x: unknown): unknown[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/** ¿Trae algo? Una lista, un objeto o un texto que no estén vacíos. */
const lleno = (x: unknown): boolean =>
  Array.isArray(x) ? x.length > 0 : esObjeto(x) ? Object.keys(x).length > 0 : esTexto(x);

/** Una ruta limpia: sin `./` ni barras de más («.» es la raíz, ""). */
const limpia = (r: string): string =>
  r
    .split("/")
    .filter((s) => s !== "" && s !== ".")
    .join("/");

/** Las subcarpetas de verdad de una carpeta, en orden. */
function subcarpetas(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !nuncaViaja(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Los .md de verdad de una carpeta (y de las de dentro), en orden, como rutas del plugin. */
function mdsDe(raiz: string, rel: string): string[] {
  const salida: string[] = [];
  let entradas;
  try {
    entradas = readdirSync(rel ? join(raiz, rel) : raiz, { withFileTypes: true });
  } catch {
    return salida;
  }
  for (const e of entradas.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (nuncaViaja(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) salida.push(...mdsDe(raiz, r));
    else if (e.isFile() && /\.md$/i.test(e.name)) salida.push(r);
  }
  return salida;
}

/**
 * Una ruta del manifiesto, dentro del plugin: la relativa (limpia; "" es la
 * raíz), o null, y se dice por qué (se sale, no está, es un enlace).
 */
function rutaDelPlugin(cx: Contexto, r: unknown, campo: string): string | null {
  if (!esTexto(r)) {
    descarta(cx, `${campo}: ${JSON.stringify(r)}`, "no es una ruta");
    return null;
  }
  const t = r.trim();
  const que = `${campo}: ${t}`;
  if (!rutaDentro(t)) {
    descarta(cx, que, "se sale del plugin");
    return null;
  }
  if (t !== "." && !t.startsWith("./")) cx.avisos.push(`${que}: sin «./» delante (Claude Code lo pide así): se lee igual`);
  const rel = limpia(t);
  const abs = join(cx.raiz, rel);
  let enlace: boolean;
  try {
    enlace = lstatSync(abs).isSymbolicLink();
  } catch {
    descarta(cx, que, "no está");
    return null;
  }
  if (enlace) {
    descarta(cx, que, MOTIVOS.enlace);
    return null;
  }
  if (!dentroDe(cx.raiz, realpathSync(abs))) {
    descarta(cx, que, "se sale del plugin (por un enlace)");
    return null;
  }
  return rel;
}

// --- Lo que no viaja ---

/** Las rutas que nombra un campo (una, una lista, o las de dentro de un objeto), limpias. */
function rutasNombradas(x: unknown): string[] {
  const textos = esTexto(x) ? [x] : Array.isArray(x) ? x.filter(esTexto) : [];
  return textos.map((t) => t.trim()).filter(rutaDentro).map(limpia).filter(Boolean);
}

/**
 * Lo que un plugin trae y en Esme no viaja: cada cosa una vez, con su
 * motivo, y sus ficheros fuera del paquete.
 */
function descartaLoQueNoViaja(cx: Contexto, m: Record<string, unknown>): void {
  const exp = esObjeto(m.experimental) ? m.experimental : {};
  const fuera = (que: string, motivo: string, rutas: string[]) => {
    descarta(cx, que, motivo);
    for (const r of rutas) cx.saltar.add(r);
  };
  const hay = (rel: string) => esFichero(join(cx.raiz, rel)) || esCarpeta(join(cx.raiz, rel));

  cx.saltar.add("hooks/hooks.json");
  if (m.hooks !== undefined || hay("hooks/hooks.json")) fuera("hooks", MOTIVOS.hooks, rutasNombradas(m.hooks));
  if (esCarpeta(join(cx.raiz, "bin"))) fuera("bin/", MOTIVOS.bin, ["bin"]);
  if (m.monitors !== undefined || exp.monitors !== undefined || hay("monitors/monitors.json"))
    fuera("monitors", MOTIVOS.monitors, ["monitors/monitors.json", ...rutasNombradas(m.monitors), ...rutasNombradas(exp.monitors)]);
  if (lleno(m.userConfig)) descarta(cx, "userConfig", MOTIVOS.userConfig);
  if (lleno(m.dependencies)) descarta(cx, "dependencies", MOTIVOS.dependencies);
  if (m.lspServers !== undefined || hay(".lsp.json")) fuera("lspServers", MOTIVOS.sinPunto, [".lsp.json", ...rutasNombradas(m.lspServers)]);
  if (m.outputStyles !== undefined || hay("output-styles"))
    fuera("outputStyles", MOTIVOS.sinPunto, ["output-styles", ...rutasNombradas(m.outputStyles)]);
  if (m.themes !== undefined || exp.themes !== undefined || hay("themes"))
    fuera("themes", MOTIVOS.sinPunto, ["themes", ...rutasNombradas(m.themes), ...rutasNombradas(exp.themes)]);
  if (m.workflows !== undefined || hay("workflows")) fuera("workflows", MOTIVOS.sinPunto, ["workflows", ...rutasNombradas(m.workflows)]);
  if (m.settings !== undefined || hay("settings.json")) fuera("settings", MOTIVOS.sinPunto, ["settings.json"]);
}

// --- Las skills ---

/** Las carpetas de skills que carga el plugin (rutas del plugin; "" es la raíz). */
function carpetasDeSkills(cx: Contexto, m: Record<string, unknown>, soloLasSuyas: boolean): string[] {
  const carpetas: string[] = [];
  const pon = (rel: string) => {
    if (!carpetas.includes(rel)) carpetas.push(rel);
  };
  const conSkill = (rel: string) => esFichero(join(cx.raiz, rel, "SKILL.md"));
  const hijas = (rel: string) => subcarpetas(join(cx.raiz, rel)).map((n) => (rel ? `${rel}/${n}` : n)).filter(conSkill);

  if (!soloLasSuyas && esCarpeta(join(cx.raiz, "skills"))) hijas("skills").forEach(pon);
  for (const r of listaDe(m.skills)) {
    const rel = rutaDelPlugin(cx, r, "skills");
    if (rel === null) continue;
    if (conSkill(rel)) pon(rel);
    else if (esCarpeta(join(cx.raiz, rel))) {
      const hs = hijas(rel);
      if (hs.length) hs.forEach(pon);
      else descarta(cx, `skills: ${String(r)}`, "no hay ninguna skill (SKILL.md) ahí");
    } else if (basename(rel) === "SKILL.md") pon(dirname(rel) === "." ? "" : dirname(rel));
    else descarta(cx, `skills: ${String(r)}`, "no es una carpeta de skills");
  }
  if (!carpetas.length && m.skills === undefined && conSkill("")) pon("");
  return carpetas;
}

/**
 * La licencia propia de una skill del plugin (la de su cabecera, o un
 * LICENSE en su carpeta). Si no es de las de un paquete, o trae un LICENSE
 * que no se reconoce, la skill no viaja; si es otra de las nuestras, viaja
 * con aviso (su licencia va dentro, con ella). En la raíz, una ajena para
 * todo el importe: ahí la skill es el plugin.
 */
function licenciaDeSkill(cx: Contexto, rel: string, escrita: unknown, delPaquete: string): "sigue" | "fuera" | { error: string } {
  const donde = rel || ".";
  const e = esTexto(escrita) ? leeLicenciaEscrita(escrita) : null;
  const fichero = rel ? licenciaDeCarpeta(join(cx.raiz, rel)) : null;
  const ajena = (e && "ajena" in e ? e.ajena : undefined) ?? fichero?.ajena;
  if (ajena !== undefined) {
    const motivo = `su licencia es «${ajena}», y un paquete no puede llevarla`;
    if (!rel) return { error: `la skill de la raíz del plugin: ${motivo}` };
    descarta(cx, donde, motivo);
    cx.saltar.add(rel);
    return "fuera";
  }
  if (fichero && !fichero.licencia) {
    descarta(cx, donde, `trae su propio ${fichero.fichero}, y no se reconoce: no viaja sin saber si se puede redistribuir`);
    cx.saltar.add(rel);
    return "fuera";
  }
  const suya = (e && "licencia" in e ? e.licencia : undefined) ?? fichero?.licencia;
  if (suya && suya !== delPaquete) cx.avisos.push(`${donde}: su licencia es ${suya}, y la del paquete ${delPaquete}: la suya va dentro, con ella`);
  else if (!suya && e && "texto" in e) cx.avisos.push(`${donde}: su licencia dice «${e.texto}»: va con la del paquete (${delPaquete})`);
  return "sigue";
}

interface SkillLeida {
  id: string;
  rel: string;
  original: string;
}

/** Una skill del plugin: su entrada, con su SKILL.md ya en las variables de Esme. */
function skillDelPlugin(cx: Contexto, rel: string, plugin: string, licencia: string, ids: Set<string>): SkillLeida | null | { error: string } {
  const donde = rel || ".";
  const ruta = rel ? `${rel}/SKILL.md` : "SKILL.md";
  const original = readFileSync(join(cx.raiz, ruta), "utf8");
  const l = leerSkillMd(original, rel ? basename(rel) : "");
  if (!l.ok) {
    descarta(cx, ruta, `no se puede leer: ${l.error}`);
    if (rel) cx.saltar.add(rel);
    return null;
  }
  for (const a of l.avisos) cx.avisos.push(`${ruta}: ${a}`);
  const { cabecera } = partesMd(original);
  const lic = licenciaDeSkill(cx, rel, cabecera.license ?? l.skill.licencia, licencia);
  if (lic !== "sigue") return lic === "fuera" ? null : lic;

  const id = slug(l.skill.name) || slug(rel ? basename(rel) : plugin);
  if (!id || ids.has(id)) {
    descarta(cx, donde, id ? `su id «${id}» ya lo usa otra skill del plugin` : "su nombre no da un id");
    if (rel) cx.saltar.add(rel);
    return null;
  }
  ids.add(id);

  const q = quitaClaves(original, ["allowed-tools", "hooks"]);
  if (q.quedan.length) {
    descarta(cx, donde, noSeQuita(q.quedan));
    cx.saltar.add(rel || ruta);
    return null;
  }
  for (const k of q.quitadas) {
    if (k === "hooks") descarta(cx, `${ruta}: hooks`, MOTIVOS.hooks);
    else cx.avisos.push(`${ruta}: «${k}» no viaja: da permisos sin pasar por los del paquete`);
  }
  const texto = aEsme(q.texto, donde);
  for (const v of sinSustituir(texto)) cx.avisos.push(`${ruta}: ${v}`);
  cx.textos.set(ruta, texto);
  return { id, rel, original };
}

/**
 * Las carpetas con un SKILL.md que el plugin NO carga (Claude Code no las
 * ve: anidadas, o fuera de la lista de la entrada) no viajan, y se dice.
 */
function descartaSkillsSueltas(cx: Contexto, cargadas: string[], rel = ""): void {
  for (const n of subcarpetas(rel ? join(cx.raiz, rel) : cx.raiz)) {
    const r = rel ? `${rel}/${n}` : n;
    if (n === "node_modules" || saltada(cx, r)) continue;
    const dentro = cargadas.some((c) => c === r || c.startsWith(`${r}/`));
    if (!dentro && esFichero(join(cx.raiz, r, "SKILL.md"))) {
      descarta(cx, r, "una skill que este plugin no carga: no viaja");
      cx.saltar.add(r);
    } else if (!cargadas.includes(r)) descartaSkillsSueltas(cx, cargadas, r);
  }
}

// --- Los comandos, como tareas ---

interface Comando {
  id: string;
  texto: string;
  /** Lo que dice la entrada del mapa de `commands` (description, argumentHint, model, allowedTools). */
  extra: Record<string, unknown>;
  donde: string;
}

/** Los comandos del plugin: los de `commands/`, o los que diga su manifiesto (que los reemplaza). */
function comandosDelPlugin(cx: Contexto, m: Record<string, unknown>): Comando[] {
  const lista: Comando[] = [];
  const deFichero = (rel: string, id: string) => {
    cx.saltar.add(rel);
    lista.push({ id, texto: readFileSync(join(cx.raiz, rel), "utf8"), extra: {}, donde: rel });
  };
  const deCarpeta = (rel: string) => {
    for (const f of mdsDe(cx.raiz, rel))
      deFichero(f, slug((rel ? f.slice(rel.length + 1) : f).replace(/\.md$/i, "").replace(/\//g, "-")));
  };

  const c = m.commands;
  if (c === undefined) {
    if (esCarpeta(join(cx.raiz, "commands"))) deCarpeta("commands");
  } else if (esObjeto(c)) {
    for (const [nombre, def] of Object.entries(c)) {
      const que = `commands.${nombre}`;
      if (!esObjeto(def)) {
        descarta(cx, que, "no es un objeto");
        continue;
      }
      let texto: string;
      if (esTexto(def.content)) texto = def.content;
      else if (def.source !== undefined) {
        const rel = rutaDelPlugin(cx, def.source, que);
        if (rel === null) continue;
        if (!esFichero(join(cx.raiz, rel))) {
          descarta(cx, que, "su source no es un fichero");
          continue;
        }
        cx.saltar.add(rel);
        texto = readFileSync(join(cx.raiz, rel), "utf8");
      } else {
        descarta(cx, que, "no trae ni source ni content");
        continue;
      }
      lista.push({ id: slug(nombre), texto, extra: def, donde: que });
    }
  } else {
    for (const r of listaDe(c)) {
      const rel = rutaDelPlugin(cx, r, "commands");
      if (rel === null) continue;
      if (esCarpeta(join(cx.raiz, rel))) deCarpeta(rel);
      else if (/\.md$/i.test(rel)) deFichero(rel, slug(basename(rel).replace(/\.md$/i, "")));
      else descarta(cx, `commands: ${String(r)}`, "no es un .md ni una carpeta");
    }
  }
  return lista;
}

/** La pista de los argumentos: un texto («[tema]»), o la lista que YAML leyó de `[tema]` sin comillas. */
const pistaDe = (x: unknown): string | undefined =>
  esTexto(x) ? x.trim() : Array.isArray(x) && x.length ? `[${x.map(String).join(", ")}]` : undefined;

type EntradaTarea = { key: string; description?: string; required: boolean };

/**
 * Los argumentos de un comando, como entradas de la tarea: `$ARGUMENTS` es
 * `{{argumentos}}`; `$ARGUMENTS[0]` y `$0` son `{{argumento-1}}` (Claude
 * Code cuenta desde 0; las entradas, desde 1); y uno con nombre
 * (`arguments: [tema]`), `$tema`, es `{{tema}}`. La descripción de cada
 * una sale de su pieza de la pista (`argument-hint`). Un `\$` se queda.
 * Si el texto no usa ninguno pero la pista dice que los hay, van al final,
 * como hace Claude Code.
 */
function huecos(texto: string, pista: string | undefined, nombres: unknown): { prompt: string; inputs: EntradaTarea[] } {
  const piezas = pista?.match(/\[[^\]]*\]|<[^>]*>|\S+/g) ?? [];
  const usadas = new Map<string, { orden: number; description?: string }>();
  const usa = (key: string, orden: number, description?: string) => {
    if (!usadas.has(key)) usadas.set(key, { orden, ...(description ? { description } : {}) });
    return `{{${key}}}`;
  };
  let t = texto.replace(/(?<!\\)\$ARGUMENTS\[(\d+)\]|(?<!\\)\$(\d+)(?!\d)/g, (_, a?: string, b?: string) => {
    const n = Number(a ?? b);
    return usa(`argumento-${n + 1}`, 1 + n, piezas[n]);
  });
  t = t.replace(/(?<!\\)\$ARGUMENTS\b(?!\[)/g, () => usa("argumentos", 0, pista));
  const declarados = Array.isArray(nombres) ? nombres.map((n) => (esObjeto(n) ? n.name : n)).filter(esTexto) : [];
  declarados.forEach((n, i) => {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(n)) return;
    t = t.replace(new RegExp(`(?<!\\\\)\\$${n}(?![A-Za-z0-9_-])`, "g"), () => usa(n, 1000 + i, piezas[i]));
  });
  if (!usadas.size && pista) t = `${t}\n\n${usa("argumentos", 0, pista)}`;
  const inputs = [...usadas.entries()]
    .sort((a, b) => a[1].orden - b[1].orden)
    .map(([key, u]) => ({ key, ...(u.description ? { description: u.description } : {}), required: false }));
  return { prompt: t, inputs };
}

/** Un comando como tarea de Esme (y su comando, que la lanza). */
function tareaDeComando(cx: Contexto, c: Comando, ids: Set<string>): { tarea: Record<string, unknown>; comando: Record<string, unknown> } | null {
  if (!c.id || ids.has(c.id)) {
    descarta(cx, c.donde, c.id ? `su id «${c.id}» ya lo usa otro comando del plugin` : "su nombre no da un id");
    return null;
  }
  const { cabecera, cuerpo } = partesMd(c.texto);
  const de = (clave: string, enMapa: string) => (c.extra[enMapa] !== undefined ? c.extra[enMapa] : cabecera[clave]);
  if (de("allowed-tools", "allowedTools") !== undefined)
    cx.avisos.push(`${c.donde}: «allowed-tools» no viaja: da permisos sin pasar por los del paquete`);
  if (cabecera.hooks !== undefined) descarta(cx, `${c.donde}: hooks`, MOTIVOS.hooks);
  for (const k of ["model", "effort"])
    if (de(k, k) !== undefined) cx.avisos.push(`${c.donde}: «${k}» no viaja: el motor y el modelo los eligen Esme y la persona`);
  for (const k of ["context", "agent"])
    if (cabecera[k] !== undefined) cx.avisos.push(`${c.donde}: «${k}» no viaja: en Esme, una tarea corre en la sesión de quien la lanza`);

  const cuerpoEsme = aEsme(cuerpo).trim();
  if (!cuerpoEsme) {
    descarta(cx, c.donde, "un comando sin texto: no hay tarea que hacer");
    return null;
  }
  ids.add(c.id);
  if (correOrdenes(cuerpoEsme))
    cx.avisos.push(`${c.donde}: lleva órdenes («!\`…\`») que Claude Code corre al leerlo: en una tarea de Esme son texto y no se ejecutan`);
  const { prompt, inputs } = huecos(cuerpoEsme, pistaDe(de("argument-hint", "argumentHint")), cabecera.arguments);
  for (const v of sinSustituir(prompt)) cx.avisos.push(`${c.donde}: ${v}`);

  const descripcion = de("description", "description");
  const primera = prompt
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  const title = esTexto(descripcion) ? descripcion.trim() : (primera?.slice(0, 80) ?? c.id);
  return {
    tarea: { id: c.id, title, prompt, ...(inputs.length ? { inputs } : {}) },
    comando: { id: c.id, title, task: c.id },
  };
}

// --- Los agentes ---

/** Los agentes del plugin: los de `agents/` (con sus subcarpetas en el id), o los .md que diga su manifiesto. */
function agentesDelPlugin(cx: Contexto, m: Record<string, unknown>): Array<{ id: string; recipe: string; format: "claude-md" }> {
  const ficheros: Array<{ rel: string; sub: string[] }> = [];
  if (m.agents === undefined) {
    for (const f of esCarpeta(join(cx.raiz, "agents")) ? mdsDe(cx.raiz, "agents") : [])
      ficheros.push({ rel: f, sub: f.split("/").slice(1, -1) });
  } else {
    for (const r of listaDe(m.agents)) {
      const rel = rutaDelPlugin(cx, r, "agents");
      if (rel === null) continue;
      if (esCarpeta(join(cx.raiz, rel))) descarta(cx, `agents: ${String(r)}`, "una carpeta: aquí Claude Code solo admite ficheros .md");
      else if (/\.md$/i.test(rel)) ficheros.push({ rel, sub: [] });
      else descarta(cx, `agents: ${String(r)}`, "no es un .md");
    }
  }

  const agentes: Array<{ id: string; recipe: string; format: "claude-md" }> = [];
  const ids = new Set<string>();
  for (const { rel, sub } of ficheros) {
    const original = readFileSync(join(cx.raiz, rel), "utf8");
    const { cabecera } = partesMd(original);
    const nombre = esTexto(cabecera.name) ? cabecera.name : basename(rel).replace(/\.md$/i, "");
    const id = slug([...sub, nombre].join("-"));
    if (!id || ids.has(id)) {
      descarta(cx, rel, id ? `su id «${id}» ya lo usa otro agente del plugin` : "su nombre no da un id");
      cx.saltar.add(rel);
      continue;
    }
    ids.add(id);
    const q = quitaClaves(original, ["hooks", "mcpServers", "permissionMode", "initialPrompt"]);
    if (q.quedan.length) {
      descarta(cx, rel, noSeQuita(q.quedan));
      cx.saltar.add(rel);
      continue;
    }
    for (const k of q.quitadas) cx.avisos.push(`${rel}: «${k}» se quita: Claude Code no lo lee en el agente de un plugin`);
    const texto = aEsme(q.texto);
    for (const v of sinSustituir(texto)) cx.avisos.push(`${rel}: ${v}`);
    cx.textos.set(rel, texto);
    agentes.push({ id, recipe: rel, format: "claude-md" });
  }
  return agentes;
}

// --- Los servidores MCP ---

/** Los servidores del plugin: los de `.mcp.json` y luego los de `mcpServers` (un nombre repetido reemplaza). */
function servidoresDelPlugin(cx: Contexto, m: Record<string, unknown>): Map<string, unknown> {
  const servidores = new Map<string, unknown>();
  const desdeMapa = (x: Record<string, unknown>) => {
    for (const [n, s] of Object.entries(esObjeto(x.mcpServers) ? x.mcpServers : x)) servidores.set(n, s);
  };
  const lee = (rel: string, que: string) => {
    cx.saltar.add(rel);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(join(cx.raiz, rel), "utf8"));
    } catch (e) {
      descarta(cx, que, `no se puede leer: ${(e as Error).message}`);
      return;
    }
    if (esObjeto(json)) desdeMapa(json);
    else descarta(cx, que, "no es un mapa de servidores");
  };

  if (esFichero(join(cx.raiz, ".mcp.json"))) lee(".mcp.json", ".mcp.json");
  for (const r of esObjeto(m.mcpServers) ? [m.mcpServers] : listaDe(m.mcpServers)) {
    if (esObjeto(r)) {
      desdeMapa(r);
      continue;
    }
    const que = `mcpServers: ${String(r)}`;
    if (esTexto(r) && /^[a-z]+:\/\//i.test(r.trim())) {
      descarta(cx, que, "se trae de fuera al cargarlo: no trae huella");
      continue;
    }
    if (esTexto(r) && /\.(mcpb|dxt)$/i.test(r.trim())) {
      if (rutaDentro(r.trim())) cx.saltar.add(limpia(r.trim()));
      descarta(cx, que, "un servidor empaquetado (.mcpb) aún no se abre: en la Fase 2");
      continue;
    }
    const rel = rutaDelPlugin(cx, r, "mcpServers");
    if (rel === null) continue;
    if (esFichero(join(cx.raiz, rel))) lee(rel, que);
    else descarta(cx, que, "no es un fichero .json");
  }
  return servidores;
}

/** Un servidor remoto (http, sse): su URL fija, y sus cabeceras, por su nombre y nunca con su valor. */
function servidorRemoto(cx: Contexto, que: string, id: string, tipo: string, s: Record<string, unknown>) {
  const url = s.url;
  if (!esTexto(url)) return descarta(cx, que, "no dice su URL");
  if (url.includes("${user_config.")) return descarta(cx, que, "usa ${user_config.…} en su URL, y eso llega con las llaves de Esme, en la Fase 2");
  if (url.includes("${")) return descarta(cx, que, "la URL lleva variables (${…}): se rellenan al instalar, en la Fase 2");
  if (!/^https?:\/\//i.test(url) || !URL.canParse(url)) return descarta(cx, que, "no es una URL http(s)");
  if (credencialEn(url, [])) return descarta(cx, que, MOTIVOS.credencial);
  if (s.headersHelper !== undefined) return descarta(cx, que, "saca sus cabeceras con un programa (headersHelper): eso es código sin permisos");
  if (s.oauth !== undefined) cx.avisos.push(`${que}: entra con OAuth: la sesión la abre quien instala, al conectarse`);
  if (tipo === "sse") cx.avisos.push(`${que}: usa SSE, que el estándar MCP ya da por viejo`);
  const cabeceras = esObjeto(s.headers) ? Object.entries(s.headers) : [];
  for (const [n, v] of cabeceras)
    if (!esTexto(v) || !/\$\{[^}]+\}/.test(v)) cx.avisos.push(`${que}: la cabecera «${n}» trae un valor escrito, y no viaja: la pone quien instala`);
  return herramientaMcp(id, {
    tipo: "remoto",
    url,
    variables: cabeceras.map(([nombre]) => ({ nombre, secreta: true, requerida: true, donde: "cabecera" })),
  });
}

/**
 * Un servidor local (stdio): su programa, con `${ESME_PAQUETE}` donde decía
 * `${CLAUDE_PLUGIN_ROOT}`, y sus variables de entorno por su nombre
 * (`env_keys`): el valor, si lo trae escrito, no viaja.
 */
function servidorLocal(cx: Contexto, que: string, id: string, s: Record<string, unknown>) {
  if (!esTexto(s.command)) return descarta(cx, que, "no dice qué programa lanza (command)");
  if (s.args !== undefined && !esTextos(s.args)) return descarta(cx, que, "sus args no son una lista de textos");
  const crudos = [s.command, ...((s.args as string[] | undefined) ?? [])];
  if (crudos.some((x) => x.includes("${user_config.")))
    return descarta(cx, que, "usa ${user_config.…} en sus argumentos, y eso llega con las llaves de Esme, en la Fase 2");
  const [comando, ...args] = crudos.map((x) => aEsme(x));
  const suelta = [comando, ...args].join(" ").match(/\$\{(?!ESME_PAQUETE\}|ESME_DATOS\})[^}]*\}/);
  if (suelta) return descarta(cx, que, `usa ${suelta[0]} en sus argumentos, y Esme solo pone \${ESME_PAQUETE} y \${ESME_DATOS}`);
  if (credencialEn(undefined, [...comando.trim().split(/\s+/), ...args])) return descarta(cx, que, MOTIVOS.credencial);
  const p = partida(comando, args, que, cx.avisos);
  if ("motivo" in p) return descarta(cx, que, p.motivo);
  avisaSinFijar(p.comando, p.args, que, cx.avisos);

  const claves: string[] = [];
  for (const [k, v] of Object.entries(esObjeto(s.env) ? s.env : {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
      cx.avisos.push(`${que}: la variable «${k}» no tiene un nombre que valga: se deja fuera`);
      continue;
    }
    if (esTexto(v) && /\$\{CLAUDE_PLUGIN_(ROOT|DATA)\}/.test(v)) {
      cx.avisos.push(`${que}: la variable «${k}» es una carpeta del plugin y no se puede fijar: el servidor la tiene en \${ESME_PAQUETE} o \${ESME_DATOS}`);
      continue;
    }
    claves.push(k);
    if (v === `\${${k}}`) continue;
    if (esTexto(v) && v.includes("${user_config."))
      cx.avisos.push(`${que}: la variable «${k}» sale de \${user_config.…}: va en env_keys, y la pone quien instala (las llaves llegan en la Fase 2)`);
    else if (esTexto(v) && /\$\{[^}]+\}/.test(v)) cx.avisos.push(`${que}: la variable «${k}» sale de otra: va en env_keys, y la pone quien instala`);
    else cx.avisos.push(`${que}: la variable «${k}» trae un valor escrito, y no viaja: va en env_keys, y la pone quien instala`);
  }
  if (s.cwd !== undefined) cx.avisos.push(`${que}: «cwd» no viaja: el servidor arranca donde diga Esme`);
  return herramientaMcp(id, {
    tipo: "local",
    comando: p.comando,
    args: p.args,
    variables: claves.map((nombre) => ({ nombre, donde: "entorno" })),
  });
}

/** Un servidor MCP del plugin como herramienta (o nada, con su motivo). */
function herramientaDeServidor(cx: Contexto, nombre: string, s: unknown): ReturnType<typeof herramientaMcp> | undefined {
  const que = `mcpServers.${nombre}`;
  const id = slug(nombre);
  if (!id) return descarta(cx, que, "su nombre no da un id");
  if (!esObjeto(s)) return descarta(cx, que, "no es un objeto");
  const tipo = esTexto(s.type) ? s.type.trim() : esTexto(s.url) ? "http" : "stdio";
  if (tipo === "http" || tipo === "sse" || tipo === "streamable-http") {
    const h = servidorRemoto(cx, que, id, tipo, s);
    if (h) cx.avisos.push(...h.avisos);
    return h;
  }
  if (tipo === "stdio") {
    const h = servidorLocal(cx, que, id, s);
    if (h) cx.avisos.push(...h.avisos);
    return h;
  }
  if (tipo === "ws") return descarta(cx, que, "por websocket: Esme aún no habla así con un servidor MCP");
  return descarta(cx, que, `un tipo de servidor que Esme no conoce («${tipo}»)`);
}

// --- El plugin ---

/** Un plugin de Claude Code, de su carpeta. */
export function importaPluginClaude(dir: string, opts: OpcionesImporte = {}): Importe {
  return importaPlugin(dir, opts);
}

function importaPlugin(dir: string, opts: OpcionesImporte, entrada?: Entrada): Importe {
  let raiz: string;
  try {
    raiz = realpathSync(dir);
  } catch {
    return falla(`la carpeta «${dir}» no está`);
  }
  if (!esCarpeta(raiz)) return falla(`«${dir}» no es una carpeta`);

  const cx: Contexto = { raiz, avisos: [], descartado: [], saltar: new Set([".claude-plugin", ".mcp.json"]), textos: new Map() };
  const deEntrada = entrada?.json ?? {};
  const rutaJson = join(raiz, ".claude-plugin", "plugin.json");
  let propio: Record<string, unknown> | undefined;
  try {
    lstatSync(rutaJson);
    if (!esFichero(rutaJson)) return falla(".claude-plugin/plugin.json no es un fichero de verdad (un enlace no viaja)");
    const json: unknown = JSON.parse(readFileSync(rutaJson, "utf8"));
    if (!esObjeto(json)) return falla(".claude-plugin/plugin.json no es un objeto");
    propio = json;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") return falla(`.claude-plugin/plugin.json no se puede leer: ${(e as Error).message}`);
  }

  // m: lo que trae; vista: cómo se presenta (la entrada del marketplace manda en eso)
  let m = deEntrada;
  let vista = deEntrada;
  if (propio) {
    m = propio;
    const suyo = propio;
    vista = {
      ...propio,
      ...Object.fromEntries(
        PRESENTACION.filter((k) => deEntrada[k] !== undefined && !(DEL_PLUGIN.includes(k) && suyo[k] !== undefined)).map((k) => [k, deEntrada[k]])
      ),
    };
    const extra = PIEZAS.filter((k) => deEntrada[k] !== undefined);
    if (extra.length && deEntrada.strict === false)
      return falla(`el plugin y su entrada del marketplace dicen los dos qué trae (${extra.join(", ")}), con strict: false: así ni Claude Code lo carga`);
    for (const k of extra) descarta(cx, `marketplace: ${k}`, "lo que la entrada del marketplace añade al plugin aún no se lee: ponlo en su plugin.json");
  }
  const nombre = esTexto(m.name) ? m.name.trim() : esTexto(deEntrada.name) ? deEntrada.name.trim() : basename(raiz);
  const quien = `el plugin «${nombre}»`;
  if (propio && esTexto(propio.license) && esTexto(deEntrada.license)) {
    const [suya, dicha] = [propio.license, deEntrada.license].map((l) => licenciaCanonica(l) ?? l.trim());
    if (suya !== dicha)
      return falla(`${quien}: su plugin.json dice «${suya}» y su entrada del marketplace «${dicha}»: no se sabe cuál vale`);
  }
  const [autorSuyo, autorDicho] = [nombreDeAutor(propio?.author), nombreDeAutor(deEntrada.author)];
  if (propio && autorSuyo && autorDicho && autorSuyo !== autorDicho)
    cx.avisos.push(`${quien}: su autor es «${autorSuyo}» (su plugin.json); la entrada del marketplace dice «${autorDicho}»: se queda el suyo`);

  const errores: string[] = [];
  let autor = eligeAutor(nombreDeAutor(vista.author), opts.autor, quien, cx.avisos);
  if (!autor && entrada?.dueño) {
    autor = entrada.dueño;
    cx.avisos.push(`${quien}: no dice su autor: va el dueño del marketplace («${autor}»)`);
  }
  if (!autor) errores.push(`${quien} no dice su autor: dalo con --autor «Tu Nombre»`);
  const lic = eligeLicencia({ escrita: vista.license, carpeta: raiz, opcion: opts.licencia, quien });
  if ("error" in lic) errores.push(lic.error);
  if (!autor || "error" in lic) return falla(...errores);
  const id = idDe(autor, nombre);
  if (!id) return falla(`${quien}: «${autor}» y «${nombre}» no dan un id (esme.<autor>.<nombre>)`);

  descartaLoQueNoViaja(cx, m);

  // las skills
  const skills: SkillLeida[] = [];
  const idsSkill = new Set<string>();
  const cargadas = carpetasDeSkills(cx, m, entrada?.esRaiz === true && !propio && m.skills !== undefined);
  for (const rel of cargadas) {
    const s = skillDelPlugin(cx, rel, nombre, lic.licencia, idsSkill);
    if (s && "error" in s) return falla(`${quien}: ${s.error}`);
    if (s) skills.push(s);
  }
  if (!cargadas.includes("")) descartaSkillsSueltas(cx, cargadas);

  // los comandos, como tareas
  const tareas: Record<string, unknown>[] = [];
  const comandos: Record<string, unknown>[] = [];
  const idsTarea = new Set<string>();
  for (const c of comandosDelPlugin(cx, m)) {
    const t = tareaDeComando(cx, c, idsTarea);
    if (t) {
      tareas.push(t.tarea);
      comandos.push(t.comando);
    }
  }

  const agentes = agentesDelPlugin(cx, m);

  // los servidores MCP, como herramientas
  const herramientas: EntradaMcp[] = [];
  const permisos: Permiso[] = [];
  for (const [n, s] of servidoresDelPlugin(cx, m)) {
    const h = herramientaDeServidor(cx, n, s);
    if (!h) continue;
    herramientas.push(h.entrada);
    permisos.push(...h.permisos);
  }

  // los canales, si su servidor viaja
  const canales: Array<{ id: string; tool: string }> = [];
  listaDe(m.channels).forEach((ch, i) => {
    const servidor = esObjeto(ch) && esTexto(ch.server) ? ch.server : undefined;
    const que = `channels.${servidor ?? i}`;
    const tool = servidor ? slug(servidor) : "";
    if (!servidor) return descarta(cx, que, "no dice su servidor");
    if (!herramientas.some((h) => h.id === tool)) return descarta(cx, que, "su servidor no viaja");
    if (canales.some((c) => c.id === tool)) return descarta(cx, que, "ese servidor ya tiene su canal");
    if (esObjeto(ch) && ch.userConfig !== undefined) cx.avisos.push(`${que}: «userConfig» llega con las llaves de Esme, en la Fase 2`);
    canales.push({ id: tool, tool });
  });

  // los ficheros: los de verdad, con los que viajan cambiados
  const f = ficherosDe(raiz, (rel) => saltada(cx, rel));
  cx.descartado.push(...f.descartado);
  const ficheros: PaqueteDatos["ficheros"] = { ...f.ficheros };
  for (const [rel, texto] of cx.textos) if (rel in ficheros) ficheros[rel] = texto;
  for (const [rel, contenido] of Object.entries(f.ficheros))
    if (!cx.textos.has(rel) && Buffer.from(contenido).includes("CLAUDE_PLUGIN_"))
      cx.avisos.push(`${rel}: nombra CLAUDE_PLUGIN_…, y no se toca: en Esme, la carpeta del paquete es ESME_PAQUETE (y la de sus datos, ESME_DATOS)`);

  // lo que se nombra y no viaja (un enlace por el camino) se cae, y se dice.
  // Una skill puede correr cualquier código del paquete (`${ESME_PAQUETE}/…`):
  // si el paquete trae código, todas sus skills traen scripts.
  const codigoEnPaquete = traeScripts(ficheros, "");
  const entradasSkill = skills
    .filter((s) => {
      const ruta = s.rel ? `${s.rel}/SKILL.md` : "SKILL.md";
      if (ruta in ficheros) return true;
      descarta(cx, s.rel || ".", "su SKILL.md no viaja (¿un enlace por el camino?)");
      return false;
    })
    .map((s) => {
      const suyos = Object.fromEntries(
        Object.entries(ficheros)
          .filter(([r]) => !s.rel || r.startsWith(`${s.rel}/`))
          .map(([r, x]) => [s.rel ? r.slice(s.rel.length + 1) : r, x])
      );
      return { id: s.id, path: s.rel || ".", scripts: codigoEnPaquete || traeScripts(suyos, s.original) };
    });
  const entradasAgente = agentes.filter((a) => {
    if (a.recipe in ficheros) return true;
    descarta(cx, a.recipe, "no viaja (¿un enlace por el camino?)");
    return false;
  });

  const homepage = [vista.homepage, vista.repository].find(
    (u): u is string => esTexto(u) && /^https?:\/\//i.test(u.trim()) && URL.canParse(u.trim())
  );
  const keywords = esTextos(vista.keywords) ? vista.keywords.map((k) => k.trim()).filter(Boolean) : undefined;
  const p = paquete(
    {
      id,
      version: versionImportada(propio ? propio.version : deEntrada.version, quien, cx.avisos),
      name: esTexto(vista.displayName) ? vista.displayName.trim() : nombre,
      description: descripcionDe(vista.description, `Plugin de Claude Code «${nombre}».`, quien, cx.avisos),
      author: autor,
      license: lic.licencia,
      ...(keywords?.length ? { keywords } : {}),
      ...(homepage ? { homepage: homepage.trim() } : {}),
      source: { from: "claude-plugin", ref: nombre },
    },
    contribuciones({
      skills: entradasSkill,
      tools: herramientas,
      agents: entradasAgente,
      tasks: tareas,
      channels: canales,
      commands: comandos,
    }),
    permisos,
    ficheros
  );
  return cierra(p, [...lic.avisos, ...cx.avisos], cx.descartado);
}

// --- El marketplace ---

/** Lo que sale de importar un marketplace: los plugins de aquí, los que se traen al instalar, y lo que no se pudo leer. */
export interface ImporteMarketplace {
  importados: Importe[];
  pendientes: Array<{ nombre: string; motivo: string }>;
  errores: string[];
}

/** Por qué una fuente remota no se importa ahora, y cómo se traerá. */
function motivoRemoto(s: Record<string, unknown>): string {
  const tipo = String(s.source ?? s.type ?? "");
  if (["github", "git", "url", "git-subdir"].includes(tipo))
    return esTexto(s.sha) && /^[0-9a-f]{40}$/i.test(s.sha)
      ? "fuente remota: se trae al instalar, fijada por su sha"
      : "fuente remota sin fijar (sin sha): se trae al instalar y se fija entonces";
  if (tipo === "npm") return "paquete de npm: se trae al instalar, fijado por su versión";
  if (tipo === "archive")
    return esTexto(s.sha256)
      ? "un archivo remoto: se trae al instalar, fijado por su sha256"
      : "un archivo remoto sin huella (sin sha256): se trae al instalar y se fija entonces";
  if (tipo === "command") return "la saca un programa que corre en tu máquina: eso es código, y no se corre para importar";
  return `una fuente que Esme no conoce («${tipo || "sin tipo"}»)`;
}

/** La carpeta de una fuente local («./x», «.», o un nombre suelto bajo `metadata.pluginRoot`), sin salirse del marketplace. */
function carpetaDeEntrada(raiz: string, s: string, base?: string): { dir: string } | { error: string } {
  const relativa = s === "." || s.startsWith("./");
  const suelta = !relativa && !/[/\\]/.test(s) && base !== undefined;
  if (!relativa && !suelta) return { error: `«${s}» no empieza por «./»: una fuente local va relativa a la raíz del marketplace` };
  const ruta = suelta ? `${base}/${s}` : s;
  if (!rutaDentro(ruta)) return { error: `«${s}» se sale del marketplace` };
  let real: string;
  try {
    real = realpathSync(join(raiz, limpia(ruta)));
  } catch {
    return { error: `«${s}» no está` };
  }
  if (!dentroDe(raiz, real)) return { error: `«${s}» se sale del marketplace (por un enlace)` };
  if (!esCarpeta(real)) return { error: `«${s}» no es una carpeta` };
  return { dir: real };
}

/**
 * Un marketplace de Claude Code (su `marketplace.json`, o la carpeta que lo
 * trae en `.claude-plugin/`): cada plugin con fuente local se importa; los
 * de fuente remota (github, git, npm, un archivo) quedan pendientes, con
 * cómo se traerán. Nunca lanza.
 */
export function importaMarketplaceClaude(ruta: string, opts: OpcionesImporte = {}): ImporteMarketplace {
  const r: ImporteMarketplace = { importados: [], pendientes: [], errores: [] };
  const fichero = esCarpeta(ruta)
    ? ([join(ruta, ".claude-plugin", "marketplace.json"), join(ruta, "marketplace.json")].find(esFichero) ??
      join(ruta, ".claude-plugin", "marketplace.json"))
    : ruta;
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(fichero, "utf8"));
  } catch (e) {
    r.errores.push(`«${fichero}» no se puede leer: ${(e as Error).message}`);
    return r;
  }
  if (!esObjeto(json) || !Array.isArray(json.plugins)) {
    r.errores.push(`«${fichero}» no es un marketplace: le falta su lista de plugins`);
    return r;
  }
  const padre = dirname(resolve(fichero));
  const raiz = realpathSync(basename(padre) === ".claude-plugin" ? dirname(padre) : padre);
  const dueño = nombreDeAutor(json.owner);
  const base = esObjeto(json.metadata) && esTexto(json.metadata.pluginRoot) ? json.metadata.pluginRoot.trim() : undefined;

  json.plugins.forEach((e: unknown, i: number) => {
    if (!esObjeto(e) || !esTexto(e.name)) {
      r.importados.push(falla(`la entrada ${i} del marketplace no dice su nombre`));
      return;
    }
    const nombre = e.name.trim();
    if (esObjeto(e.source)) {
      r.pendientes.push({ nombre, motivo: motivoRemoto(e.source) });
      return;
    }
    if (!esTexto(e.source)) {
      r.importados.push(falla(`${nombre}: no dice de dónde sale (source)`));
      return;
    }
    const d = carpetaDeEntrada(raiz, e.source.trim(), base);
    if ("error" in d) {
      r.importados.push(falla(`${nombre}: ${d.error}`));
      return;
    }
    r.importados.push(importaPlugin(d.dir, opts, { json: e, ...(dueño ? { dueño } : {}), esRaiz: d.dir === raiz }));
  });
  return r;
}
