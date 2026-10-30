/**
 * IMPORTAR UNA RECETA DE GOOSE — una receta (YAML o JSON) como paquete de Esme con una tarea.
 *
 * Lo que la receta pide es una tarea: su `prompt` junta `instructions` y
 * `prompt`, y sus `inputs` salen de `parameters` (los `{{ clave }}` se
 * quedan como están). Sus extensiones son herramientas: una `stdio` lanza
 * su `cmd` (y lo pide: `proc:spawn`), una `streamable_http` habla con su
 * host (`net:fetch`). El esquema de su respuesta (`response.json_schema`)
 * viaja dentro, como el `check` de `success`.
 *
 * Lo demás se descarta con su motivo: las extensiones de goose por dentro
 * (`builtin`, `platform`), los `settings` (el motor lo eligen Esme y la
 * persona), las `activities` (sugerencias de su interfaz), las
 * `sub_recipes` (una ruta no trae huella) y los checks de shell de `retry`.
 *
 * La `version` de una receta es la de su formato, no la suya: el paquete
 * sale como 0.0.0.
 *
 * Referencia: https://block.github.io/goose/docs/guides/recipes/recipe-reference,
 * tienda/importa-comun.ts.
 */
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import * as yaml from "js-yaml";
import { esObjeto, esTexto, esTextos, jsonDe, paquete, slug } from "../core/paquetes/adaptadores/comun.ts";
import { herramientaMcp, type EntradaMcp } from "../core/paquetes/adaptadores/herramientas.ts";
import type { PaqueteDatos } from "../core/paquetes/manifiesto.ts";
import type { Permiso } from "../core/paquetes/permisos.ts";
import {
  avisaSinFijar,
  cierra,
  contribuciones,
  descripcionDe,
  eligeAutor,
  eligeLicencia,
  falla,
  idDe,
  nombreDeAutor,
  partida,
  type Descartado,
  type Importe,
  type OpcionesImporte,
} from "./importa-comun.ts";

/** Las claves de una receta que se leen (o se descartan a sabiendas). */
const CLAVES_RECETA = [
  "version",
  "title",
  "description",
  "author",
  "instructions",
  "prompt",
  "parameters",
  "extensions",
  "settings",
  "activities",
  "sub_recipes",
  "response",
  "retry",
];

const ESQUEMA = "schemas/respuesta.json";

/** Un valor por defecto como texto: una fecha (YAML la leería como fecha), en AAAA-MM-DD. */
const textoDe = (v: unknown): string | undefined =>
  v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;

/** Los parámetros de la receta, como entradas de la tarea. */
function entradasDe(parametros: unknown, avisos: string[]): Array<Record<string, unknown>> {
  const entradas: Array<Record<string, unknown>> = [];
  for (const [i, p] of (Array.isArray(parametros) ? parametros : []).entries()) {
    if (!esObjeto(p) || !esTexto(p.key)) {
      avisos.push(`parameters[${i}]: sin «key»: se deja fuera`);
      continue;
    }
    const opciones = p.input_type === "select" && esTextos(p.options) ? ` (una de: ${p.options.join(", ")})` : "";
    const descripcion = `${esTexto(p.description) ? p.description.trim() : ""}${opciones}`.trim();
    if (p.input_type === "file") avisos.push(`parameters.${p.key}: es un fichero (input_type: file): en Esme se pide como texto`);
    const defecto = textoDe(p.default);
    entradas.push({
      key: p.key,
      ...(descripcion ? { description: descripcion } : {}),
      required: p.requirement === "required" || p.requirement === "user_prompt",
      ...(defecto !== undefined ? { default: defecto } : {}),
    });
  }
  return entradas;
}

/** Las extensiones de la receta, como herramientas (lo de goose por dentro se descarta). */
function herramientasDe(
  extensiones: unknown,
  avisos: string[],
  descartado: Descartado[]
): { herramientas: EntradaMcp[]; permisos: Permiso[] } {
  const herramientas: EntradaMcp[] = [];
  const permisos: Permiso[] = [];
  const fuera = (que: string, motivo: string) => descartado.push({ que, motivo });
  for (const [i, e] of (Array.isArray(extensiones) ? extensiones : []).entries()) {
    const nombre = esObjeto(e) && esTexto(e.name) ? e.name.trim() : undefined;
    const que = `extensions.${nombre ?? i}`;
    if (!esObjeto(e) || !nombre) {
      fuera(que, "sin nombre");
      continue;
    }
    const id = slug(nombre);
    if (!id || herramientas.some((h) => h.id === id)) {
      fuera(que, id ? `su id «${id}» ya lo usa otra extensión` : "su nombre no da un id");
      continue;
    }
    let h: ReturnType<typeof herramientaMcp>;
    switch (e.type) {
      case "builtin":
      case "platform":
        fuera(que, "es parte de goose por dentro: en Esme, lo que haga lo trae el motor o un paquete");
        continue;
      case "frontend":
        fuera(que, "la pone la interfaz de goose");
        continue;
      case "inline_python":
        fuera(que, "es código Python dentro de la receta: en Esme, el código va en un paquete con su runtime");
        continue;
      case "stdio": {
        if (!esTexto(e.cmd)) {
          fuera(que, "no dice qué programa lanza (cmd)");
          continue;
        }
        const p = partida(e.cmd, esTextos(e.args) ? e.args : [], que, avisos);
        if ("motivo" in p) {
          fuera(que, p.motivo);
          continue;
        }
        avisaSinFijar(p.comando, p.args, que, avisos);
        const claves = esTextos(e.env_keys) ? [...e.env_keys] : [];
        for (const k of Object.keys(esObjeto(e.envs) ? e.envs : {})) {
          avisos.push(`${que}: la variable «${k}» trae un valor escrito, y no viaja: va en env_keys, y la pone quien instala`);
          if (!claves.includes(k)) claves.push(k);
        }
        if (e.cwd !== undefined) avisos.push(`${que}: «cwd» no viaja: el servidor arranca donde diga Esme`);
        if (e.available_tools !== undefined)
          avisos.push(`${que}: «available_tools» (las herramientas que deja usar) no viaja: llegan todas las del servidor`);
        h = herramientaMcp(id, {
          tipo: "local",
          comando: p.comando,
          args: p.args,
          variables: claves.map((k) => ({ nombre: k, donde: "entorno" })),
        });
        break;
      }
      case "streamable_http":
      case "sse": {
        const url = esTexto(e.uri) ? e.uri.trim() : esTexto(e.url) ? e.url.trim() : undefined;
        if (!url) {
          fuera(que, "no dice su URL (uri)");
          continue;
        }
        if (/[$}{]/.test(url)) {
          fuera(que, "la URL lleva variables: se rellenan al instalar, en la Fase 2");
          continue;
        }
        if (!/^https?:\/\//i.test(url) || !URL.canParse(url)) {
          fuera(que, "no es una URL http(s)");
          continue;
        }
        if (e.type === "sse") avisos.push(`${que}: usa SSE, que el estándar MCP ya da por viejo`);
        if (esTextos(e.env_keys) && e.env_keys.length)
          avisos.push(`${que}: sus env_keys (${e.env_keys.join(", ")}) rellenan sus cabeceras: las cabeceras van marcadas secretas, y las pone quien instala`);
        if (e.available_tools !== undefined)
          avisos.push(`${que}: «available_tools» (las herramientas que deja usar) no viaja: llegan todas las del servidor`);
        const cabeceras = Object.keys(esObjeto(e.headers) ? e.headers : {});
        h = herramientaMcp(id, {
          tipo: "remoto",
          url,
          variables: cabeceras.map((nombre) => ({ nombre, secreta: true, requerida: true, donde: "cabecera" })),
        });
        break;
      }
      default:
        fuera(que, `un tipo de extensión que Esme no conoce («${String(e.type)}»)`);
        continue;
    }
    herramientas.push(h.entrada);
    permisos.push(...h.permisos);
    avisos.push(...h.avisos);
  }
  return { herramientas, permisos };
}

/** Una receta de goose (su fichero), como paquete. Nunca lanza. */
export function importaRecetaGoose(ruta: string, opts: OpcionesImporte = {}): Importe {
  let crudo: unknown;
  try {
    crudo = yaml.load(readFileSync(ruta, "utf8"), { schema: yaml.CORE_SCHEMA });
  } catch (e) {
    return falla(`«${ruta}» no se puede leer como receta: ${(e as Error).message.split("\n")[0]}`);
  }
  if (!esObjeto(crudo)) return falla(`«${ruta}» no es una receta: se espera un objeto con title e instructions o prompt`);
  const r = crudo;
  if (!esTexto(r.title)) return falla("la receta no tiene title");
  if (!esTexto(r.instructions) && !esTexto(r.prompt)) return falla("la receta no tiene ni instructions ni prompt: no hay tarea que hacer");
  const titulo = r.title.trim();

  const avisos: string[] = [];
  const descartado: Descartado[] = [];
  const errores: string[] = [];
  const contacto = esObjeto(r.author) ? r.author.contact : r.author;
  const autor = eligeAutor(nombreDeAutor(contacto), opts.autor, "la receta", avisos);
  if (!autor)
    errores.push(
      `la receta no dice su autor${esTexto(contacto) ? " (su contacto es un correo, y no se publica)" : ""}: dalo con --autor «Tu Nombre»`
    );
  const lic = eligeLicencia({ carpeta: dirname(ruta), opcion: opts.licencia, quien: "la receta" });
  if ("error" in lic) errores.push(lic.error);
  if (!autor || "error" in lic) return falla(...errores);
  const id = idDe(autor, titulo);
  const tarea = slug(titulo);
  if (!id || !tarea) return falla(`«${autor}» y «${titulo}» no dan un id (esme.<autor>.<nombre>)`);

  for (const k of Object.keys(r)) if (!CLAVES_RECETA.includes(k)) avisos.push(`la receta trae «${k}», que Esme no conoce: se ignora`);
  avisos.push("la «version» de una receta es la de su formato, no la suya: el paquete va como 0.0.0");

  const prompt = [r.instructions, r.prompt]
    .filter(esTexto)
    .map((t) => t.trim())
    .join("\n\n");
  if (/\{%/.test(prompt)) avisos.push("la receta usa bloques de plantilla ({% … %}): en Esme, la tarea solo rellena los {{ … }}");
  const inputs = entradasDe(r.parameters, avisos);
  const { herramientas, permisos } = herramientasDe(r.extensions, avisos, descartado);

  if (r.settings !== undefined) descartado.push({ que: "settings", motivo: "el motor lo eligen Esme y la persona" });
  if (r.activities !== undefined) descartado.push({ que: "activities", motivo: "las sugerencias son de su interfaz" });
  if (r.sub_recipes !== undefined) descartado.push({ que: "sub_recipes", motivo: "una sub-receta por ruta no trae huella" });
  if (esObjeto(r.retry)) {
    if (r.retry.checks !== undefined) descartado.push({ que: "retry.checks", motivo: "un check de shell es código" });
    if (r.retry.on_failure !== undefined) descartado.push({ que: "retry.on_failure", motivo: "una orden de shell es código" });
    if (r.retry.max_retries !== undefined) avisos.push("retry.max_retries: Esme no reintenta la tarea por su cuenta");
  }

  const ficheros: PaqueteDatos["ficheros"] = {};
  const extra: Record<string, unknown> = {};
  const esquema = esObjeto(r.response) ? r.response.json_schema : undefined;
  if (esObjeto(esquema)) {
    ficheros[ESQUEMA] = jsonDe(esquema);
    extra.success = { task: prompt, check: ESQUEMA };
  } else if (r.response !== undefined) avisos.push("response: sin un json_schema que se pueda leer: se ignora");

  const p = paquete(
    {
      id,
      version: "0.0.0",
      name: titulo,
      description: descripcionDe(r.description, `Receta de goose «${titulo}».`, "la receta", avisos),
      author: autor,
      license: lic.licencia,
      source: { from: "goose-recipe", ref: basename(ruta) },
    },
    contribuciones({
      tools: herramientas,
      tasks: [{ id: tarea, title: titulo, prompt, ...(inputs.length ? { inputs } : {}) }],
    }),
    permisos,
    ficheros,
    extra
  );
  return cierra(p, [...lic.avisos, ...avisos], descartado);
}
