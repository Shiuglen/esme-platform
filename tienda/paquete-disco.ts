/**
 * EL PAQUETE EN DISCO — leerlo, escribirlo y que no se salga de su carpeta.
 *
 * La forma vive en `core/paquetes/manifiesto.ts`; esta capa sabe de disco y
 * de YAML, y por eso no vive en el núcleo (como `tienda/modulo-manifiesto.ts`
 * con la v1).
 *
 * Lo que añade de verdad: **ningún fichero se sale del paquete**. Una ruta
 * con `..` ya la rechaza la forma, pero la trampa de siempre no lleva `..`:
 * es un `piel.json` que es un ENLACE a un fichero de otro sitio (o una
 * carpeta del camino que lo es). Por eso cada ruta se resuelve con
 * `realpathSync` y se compara, por piezas, con la carpeta del paquete; y se
 * recorre el árbol entero, porque un enlace que se sale es un problema
 * aunque el manifiesto no lo nombre (quien instala el paquete lo copiaría).
 * Al escribir, más aún: nada se escribe a través de un enlace (uno roto
 * crearía el fichero allí adonde apunte).
 *
 * Y lo que el manifiesto no ve: la cabecera de una skill o de un agente de
 * Claude Code no puede llevar hooks ni darse permisos (`allowed-tools`,
 * `permissionMode`, `mcpServers`). El importador lo quita; aquí se mira
 * igual, porque un paquete también se escribe a mano.
 *
 * Referencia: estandar/paquete.spec.yaml, core/modulos/rutas.ts, tienda/empaque.ts.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import * as yaml from "js-yaml";
import {
  compruebaFicheros,
  leePaquete,
  rutasDe,
  type ManifiestoV2,
  type PaqueteConocido,
  type PaqueteDatos,
} from "../core/paquetes/manifiesto.ts";
import { rutaDentro } from "../core/paquetes/permisos.ts";
import { confinaRuta } from "../core/modulos/rutas.ts";
import { arbolSha256 } from "./empaque.ts";
import { MOTIVOS, clavesDeCabecera } from "./importa-comun.ts";

/** Lo que la cabecera de una skill no puede llevar en un paquete, y por qué. */
const PROHIBIDAS_SKILL: Record<string, string> = {
  hooks: MOTIVOS.hooks,
  "allowed-tools": "da permisos sin pasar por los del paquete",
};

/** Lo que la cabecera de un agente de Claude Code (`claude-md`) no puede llevar, y por qué. */
const PROHIBIDAS_AGENTE: Record<string, string> = {
  hooks: MOTIVOS.hooks,
  mcpServers: "trae servidores MCP sin pasar por los permisos (van en tools)",
  permissionMode: "cambia los permisos sin pasar por los del paquete",
};

/** Lo que se dictamina de la carpeta de un paquete. */
export interface DictamenPaquete {
  dir: string;
  id: string;
  ok: boolean;
  version: 1 | 2 | null;
  paquete?: ManifiestoV2;
  errores: string[];
  avisos: string[];
}

/** ¿`ruta` está dentro de `raiz` (o es ella)? Por piezas, no por texto. */
function dentroDe(raiz: string, ruta: string): boolean {
  const r = relative(raiz, ruta);
  return r === "" || (r.split(sep)[0] !== ".." && !isAbsolute(r));
}

/**
 * El texto de una ruta del paquete, sin salirse de él (ni por un enlace):
 * null si no está, o el motivo si no se puede leer.
 */
function leeDentro(raizReal: string, dir: string, ruta: string): string | null | { error: string } {
  const c = confinaRuta(dir, ruta);
  if ("error" in c) return { error: `«${ruta}» se sale del paquete` };
  let real: string;
  try {
    lstatSync(c.ruta);
    real = realpathSync(c.ruta);
  } catch {
    return null; // no está (o es un enlace roto: el recorrido del árbol lo dice)
  }
  if (!dentroDe(raizReal, real)) return { error: `«${ruta}» se sale del paquete (lleva a ${real})` };
  if (!statSync(real).isFile()) return { error: `«${ruta}» no es un fichero` };
  try {
    return readFileSync(real, "utf8");
  } catch (e) {
    return { error: `«${ruta}» no se puede leer: ${(e as Error).message}` };
  }
}

/** Los enlaces del árbol que se salen del paquete o no llevan a ningún sitio. */
function enlacesMalos(raizReal: string, dir: string, prefijo = ""): Array<{ rel: string; problema: string }> {
  const malos: Array<{ rel: string; problema: string }> = [];
  for (const e of readdirSync(join(dir, prefijo), { withFileTypes: true })) {
    const rel = prefijo ? `${prefijo}/${e.name}` : e.name;
    if (e.isSymbolicLink()) {
      let real: string;
      try {
        real = realpathSync(join(dir, rel));
      } catch {
        malos.push({ rel, problema: `el enlace «${rel}» no lleva a ningún sitio` });
        continue;
      }
      if (!dentroDe(raizReal, real)) malos.push({ rel, problema: `el enlace «${rel}» se sale del paquete` });
    } else if (e.isDirectory()) {
      malos.push(...enlacesMalos(raizReal, dir, rel));
    }
  }
  return malos;
}

/**
 * Lee y dictamina la carpeta de un paquete (su `module.yaml`, v1 o v2, y
 * los ficheros que nombra). Nunca lanza: lo que falla va en `errores`.
 *
 * Las reglas del índice son las de la v1: ESME-CL exige firma, y la tienda
 * puede exigir benchmarks y firma (`exigirBenchmarks`, `exigirFirma`).
 * `exigirEntrada: false` dictamina la forma antes de construir el código.
 */
export function leePaqueteDeCarpeta(
  dir: string,
  opts: { exigirEntrada?: boolean; exigirBenchmarks?: boolean; exigirFirma?: boolean } = {}
): DictamenPaquete {
  const fallo = (errores: string[], id = "<sin id>"): DictamenPaquete => ({
    dir,
    id,
    ok: false,
    version: null,
    errores,
    avisos: [],
  });

  let raizReal: string;
  try {
    raizReal = realpathSync(dir);
  } catch {
    return fallo([`la carpeta «${dir}» no está`]);
  }
  const texto = leeDentro(raizReal, dir, "module.yaml");
  if (texto === null) return fallo(["no hay module.yaml"]);
  if (typeof texto !== "string") return fallo([`module.yaml: ${texto.error}`]);

  let raw: unknown;
  try {
    raw = yaml.load(texto);
  } catch (e) {
    return fallo([`el manifiesto no se puede leer: ${(e as Error).message}`]);
  }
  const r = leePaquete(raw);
  if (!r.ok) {
    const id = raw && typeof raw === "object" && "id" in raw ? String((raw as { id: unknown }).id) : "<sin id>";
    return { ...fallo(r.errores, id), version: r.version, avisos: r.avisos };
  }

  const m = r.paquete!;
  const errores = compruebaFicheros(m, (ruta) => leeDentro(raizReal, dir, ruta), {
    exigirEntrada: opts.exigirEntrada,
  });
  // los enlaces que el manifiesto no nombra (los que nombra ya tienen su error)
  const nombradas = new Set(rutasDe(m).map((x) => x.ruta));
  for (const { rel, problema } of enlacesMalos(raizReal, dir)) if (!nombradas.has(rel)) errores.push(problema);
  // lo que la cabecera de una skill o de un agente no puede llevar
  for (const r of rutasDe(m)) {
    const agente = r.punto === "agents" && m.contributes.agents?.find((a) => a.id === r.id)?.format === "claude-md";
    const prohibidas = r.punto === "skills" ? PROHIBIDAS_SKILL : agente ? PROHIBIDAS_AGENTE : null;
    if (!prohibidas) continue;
    const texto = leeDentro(raizReal, dir, r.ruta);
    if (typeof texto !== "string") continue; // ya dicho arriba
    for (const k of clavesDeCabecera(texto, Object.keys(prohibidas)))
      errores.push(
        r.punto === "skills"
          ? `skills.${r.id}: su SKILL.md lleva «${k}»: ${prohibidas[k]}`
          : `agents.${r.id}: «${r.ruta}» lleva «${k}»: ${prohibidas[k]}`
      );
  }

  if (m.license === "ESME-CL" && !m.signatures) errores.push("ESME-CL exige firma (licencia comunitaria, no anónima)");
  if (opts.exigirBenchmarks && !m.benchmarks) errores.push("la tienda exige benchmarks de la Prueba 0 en el manifiesto");
  if (opts.exigirFirma && !m.signatures) errores.push("el índice firmado exige signatures");

  return { dir, id: m.id, ok: errores.length === 0, version: r.version, paquete: m, errores, avisos: r.avisos };
}

/** El sitio más hondo de `ruta` que ya existe (ella misma, o una carpeta de su camino). */
function existente(ruta: string): string {
  let a = ruta;
  while (!existsSync(a) && dirname(a) !== a) a = dirname(a);
  return a;
}

/** El primer trozo de `ruta` (dentro de `dir`) que es un enlace, aunque esté roto; null si ninguno. */
function enlaceEnCamino(dir: string, ruta: string): string | null {
  const piezas = ruta.split("/").filter((x) => x !== "" && x !== ".");
  for (let i = 1; i <= piezas.length; i++) {
    const rel = piezas.slice(0, i).join("/");
    try {
      if (lstatSync(join(dir, rel)).isSymbolicLink()) return rel;
    } catch {
      return null; // no está: lo de debajo tampoco
    }
  }
  return null;
}

/**
 * Escribe un paquete en una carpeta: `module.yaml` (con `yaml.dump`) y luego
 * sus ficheros. Antes de escribir nada mira que ninguna ruta se salga, ni
 * por `..` ni a través de un enlace que ya esté en la carpeta, y que nada
 * se escriba a través de un enlace (ni el manifiesto, ni uno roto): si no,
 * lanza y no escribe.
 */
export function escribePaquete(p: PaqueteDatos, dir: string): void {
  for (const ruta of Object.keys(p.ficheros)) {
    if (!rutaDentro(ruta)) throw new Error(`«${ruta}» se sale del paquete`);
    if (ruta === "module.yaml") throw new Error("module.yaml lo escribe el manifiesto, no va en los ficheros");
  }
  mkdirSync(dir, { recursive: true });
  const raizReal = realpathSync(dir);
  for (const ruta of Object.keys(p.ficheros)) {
    const c = confinaRuta(dir, ruta);
    if ("error" in c || !dentroDe(raizReal, realpathSync(existente(c.ruta))))
      throw new Error(`«${ruta}» se sale del paquete`);
  }
  for (const ruta of ["module.yaml", ...Object.keys(p.ficheros)]) {
    const enlace = enlaceEnCamino(dir, ruta);
    if (enlace !== null) throw new Error(`«${ruta}» pasa por un enlace («${enlace}»): a través de un enlace no se escribe`);
  }

  writeFileSync(join(dir, "module.yaml"), yaml.dump(p.manifiesto, { lineWidth: -1, noRefs: true }));
  for (const [ruta, contenido] of Object.entries(p.ficheros)) {
    const destino = join(dir, ruta);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, contenido);
  }
}

/**
 * Un paquete de una carpeta, con la huella de su árbol (la de
 * `tienda/empaque.ts`, la misma que firma un veredicto). Si no vale, o si
 * su árbol no se puede medir, su dictamen.
 */
export function conocidoDeCarpeta(dir: string): PaqueteConocido | DictamenPaquete {
  const d = leePaqueteDeCarpeta(dir);
  if (!d.ok) return d;
  try {
    return { manifiesto: d.paquete!, sha256: arbolSha256(dir) };
  } catch (e) {
    return { ...d, ok: false, errores: [`no se puede calcular la huella del árbol: ${(e as Error).message}`] };
  }
}
