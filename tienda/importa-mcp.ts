/**
 * IMPORTAR DEL REGISTRO MCP — un `server.json` como paquete de Esme con una herramienta.
 *
 * Un `server.json` (https://registry.modelcontextprotocol.io) dice cómo
 * llegar a un servidor: por `remotes` (una URL) o por `packages` (npm,
 * PyPI, OCI…). Esme elige UNA forma, la mejor que sabe usar: un remoto
 * streamable-http, luego SSE, luego npm (`npx`) y luego PyPI (`uvx`). Las
 * otras formas se descartan («otra forma de llegar al mismo servidor») y las
 * que no sabe usar, con su motivo.
 *
 * El paquete es el PUNTERO, no el servidor: su autor es el espacio del
 * registro de quien lo publica (`io.github.ana`, que el registro verifica),
 * y va con licencia MIT; el servidor sigue con la suya (su nombre está en
 * `source.ref`). El espacio `mcp` no vale: es el de las herramientas
 * destacadas de Esme (`esme.mcp.…`), y así se haría pasar por una.
 *
 * Referencia: core/paquetes/adaptadores/herramientas.ts, tienda/importa-comun.ts.
 */
import { esObjeto, esTexto, paquete, slug } from "../core/paquetes/adaptadores/comun.ts";
import { herramientaMcp, type ConexionMcp, type VariableMcp } from "../core/paquetes/adaptadores/herramientas.ts";
import {
  MOTIVOS,
  cierra,
  credencialEn,
  descripcionDe,
  falla,
  idDe,
  versionImportada,
  type Descartado,
  type Importe,
} from "./importa-comun.ts";

/** Una forma de llegar al servidor: la conexión y su prioridad, o por qué no vale. */
type Forma = { que: string; prioridad: number; conexion: ConexionMcp; avisos: string[] } | { que: string; motivo: string };

const MOTIVO_VARIABLES = "la URL lleva variables ({…}): se rellenan al instalar, en la Fase 2";
/** Un nombre de paquete de npm (con su ámbito, si lo tiene); nunca empieza por «-», que npx leería como una opción. */
const NPM = /^(@[a-z0-9~][a-z0-9-._~]*\/)?[a-z0-9~][a-z0-9-._~]*$/;
/** Un nombre de paquete de PyPI (PEP 508). */
const PYPI = /^([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9])$/;
/** Una versión fija: ni empieza por «-» ni lleva espacios. */
const VERSION_PAQUETE = /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/;
const MOTIVO_ARGUMENTOS = "necesita argumentos que pone quien lo instala: en la Fase 2";

/** Las variables de un remoto (sus cabeceras) o de un paquete (su entorno): el nombre, nunca el valor. */
function variablesDe(lista: unknown, donde: "cabecera" | "entorno"): VariableMcp[] {
  return (Array.isArray(lista) ? lista : []).filter(esObjeto).flatMap((v) =>
    esTexto(v.name)
      ? [
          {
            nombre: v.name,
            ...(esTexto(v.description) ? { descripcion: v.description } : {}),
            secreta: v.isSecret === true,
            requerida: v.isRequired === true,
            donde,
          },
        ]
      : []
  );
}

function formaRemota(r: unknown, i: number): Forma {
  const que = `remotes[${i}]`;
  if (!esObjeto(r)) return { que, motivo: "no es un objeto" };
  const prioridad = r.type === "streamable-http" ? 0 : r.type === "sse" ? 1 : -1;
  if (prioridad < 0) return { que, motivo: `un transporte que Esme no conoce («${String(r.type)}»)` };
  if (!esTexto(r.url)) return { que, motivo: "no dice su URL" };
  if (/[{}]/.test(r.url)) return { que, motivo: MOTIVO_VARIABLES };
  if (!/^https?:\/\//i.test(r.url) || !URL.canParse(r.url)) return { que, motivo: "no es una URL http(s)" };
  if (credencialEn(r.url, [])) return { que, motivo: MOTIVOS.credencial };
  return {
    que,
    prioridad,
    conexion: { tipo: "remoto", url: r.url, variables: variablesDe(r.headers, "cabecera") },
    avisos: prioridad === 1 ? [`${que}: usa SSE, que el estándar MCP ya da por viejo`] : [],
  };
}

/** Los argumentos fijos de un paquete; si alguno lo tiene que poner quien instala, no vale aún. */
function argumentosDe(lista: unknown): string[] | null {
  const args: string[] = [];
  for (const a of Array.isArray(lista) ? lista.filter(esObjeto) : []) {
    const valor = esTexto(a.value) ? a.value : esTexto(a.default) ? a.default : undefined;
    if (valor === undefined || /[{}]/.test(valor)) {
      if (a.isRequired === true || valor !== undefined) return null;
      continue;
    }
    if (a.type === "named" && esTexto(a.name)) args.push(a.name, valor);
    else args.push(valor);
  }
  return args;
}

function formaPaquete(p: unknown, i: number): Forma {
  const que = `packages[${i}]`;
  if (!esObjeto(p) || !esTexto(p.identifier)) return { que, motivo: "no dice qué paquete es (identifier)" };
  const tipo = String(p.registryType ?? p.registry_type ?? "");
  if (tipo !== "npm" && tipo !== "pypi") return { que, motivo: `${tipo || "sin registryType"}: aún no se sabe lanzar` };
  const transporte = esObjeto(p.transport) ? p.transport.type : undefined;
  if (transporte !== undefined && transporte !== "stdio") return { que, motivo: "se lanza como servidor HTTP local: aún no" };
  if (!(tipo === "npm" ? NPM : PYPI).test(p.identifier))
    return { que, motivo: `«${p.identifier}» no es un nombre de paquete de ${tipo === "npm" ? "npm" : "PyPI"}` };
  if (esTexto(p.version) && !VERSION_PAQUETE.test(p.version.trim())) return { que, motivo: `su versión «${p.version}» no vale` };
  const args = argumentosDe(p.packageArguments);
  if (!args) return { que, motivo: MOTIVO_ARGUMENTOS };
  if (credencialEn(undefined, args)) return { que, motivo: MOTIVOS.credencial };
  const avisos: string[] = [];
  if (p.runtimeArguments !== undefined) avisos.push(`${que}: trae argumentos para el lanzador (runtimeArguments): no viajan`);
  const variables = variablesDe(p.environmentVariables, "entorno");
  const version = esTexto(p.version) ? p.version.trim() : undefined;
  if (tipo === "npm")
    return { que, prioridad: 2, conexion: { tipo: "npm", paquete: p.identifier, ...(version ? { version } : {}), args, variables }, avisos };
  if (!version) avisos.push(`${que}: uvx con «${p.identifier}» sin versión fija: bajaría la última cada vez`);
  return {
    que,
    prioridad: 3,
    conexion: { tipo: "local", comando: "uvx", args: [version ? `${p.identifier}==${version}` : p.identifier, ...args], variables },
    avisos,
  };
}

/** Un `server.json` del registro MCP, como paquete. Nunca lanza. */
export function importaServidorMcp(json: unknown): Importe {
  if (!esObjeto(json)) return falla("no es un server.json: se espera un objeto");
  if (!esTexto(json.name) || !json.name.includes("/"))
    return falla("server.json: «name» tiene que ser «espacio/nombre» (io.github.dueño/servidor)");
  const nombre = json.name.trim();
  const corto = nombre.split("/").pop()!;
  const espacio = nombre.slice(0, nombre.lastIndexOf("/"));
  const herramienta = slug(corto) || slug(nombre);
  if (slug(espacio) === "mcp")
    return falla(`server.json: su espacio «${espacio}» es «mcp», el de las herramientas de Esme: así se haría pasar por una de ellas`);
  const id = idDe(espacio, corto);
  if (!id) return falla(`server.json: «${nombre}» no da un id (esme.<espacio>.<nombre>)`);

  const formas = [
    ...(Array.isArray(json.remotes) ? json.remotes : []).map(formaRemota),
    ...(Array.isArray(json.packages) ? json.packages : []).map(formaPaquete),
  ];
  const validas = formas.filter((f): f is Extract<Forma, { conexion: ConexionMcp }> => "conexion" in f);
  if (!validas.length)
    return falla(
      `no hay forma de llegar a este servidor que Esme sepa usar${formas.length ? `: ${formas.map((f) => `${f.que}: ${"motivo" in f ? f.motivo : ""}`).join("; ")}` : " (ni remotes ni packages)"}`
    );
  const elegida = validas.reduce((a, b) => (b.prioridad < a.prioridad ? b : a));
  const descartado: Descartado[] = formas
    .filter((f) => f !== elegida)
    .map((f) => ({ que: f.que, motivo: "motivo" in f ? f.motivo : MOTIVOS.otraForma }));

  const avisos = [
    `el paquete es un puntero al servidor, que sigue siendo de quien lo publica (${nombre}) y con su licencia: el puntero va con licencia MIT`,
    ...elegida.avisos,
  ];
  const h = herramientaMcp(herramienta, elegida.conexion);
  avisos.push(...h.avisos);
  const repositorio = esObjeto(json.repository) ? json.repository.url : undefined;
  const homepage = [json.websiteUrl, repositorio].find((u): u is string => esTexto(u) && /^https?:\/\//i.test(u) && URL.canParse(u));
  const p = paquete(
    {
      id,
      version: versionImportada(json.version, "server.json", avisos),
      name: esTexto(json.title) ? json.title.trim() : corto,
      description: descripcionDe(json.description, `El servidor MCP ${nombre}.`, "server.json", avisos),
      author: espacio,
      license: "MIT",
      ...(homepage ? { homepage } : {}),
      source: { from: "mcp-registry", ref: nombre },
    },
    { tools: [h.entrada] },
    h.permisos
  );
  return cierra(p, avisos, descartado);
}
