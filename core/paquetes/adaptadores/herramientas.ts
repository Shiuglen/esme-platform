/**
 * LAS HERRAMIENTAS MCP, COMO PAQUETES — `herramientas/destacadas.json` de la app.
 *
 * Una herramienta destacada es un servidor MCP, remoto o de npm. Su paquete
 * es `esme.mcp.<slug>`, con una herramienta (`tools`) que dice cómo
 * conectarse, y los permisos que eso pide (lo que lanzas o con quien
 * hablas, lo pides):
 *
 *   - REMOTO: `mcp.url`, con sus cabeceras (las secretas, marcadas), y
 *     `net:fetch` con el host de la URL, solo ese;
 *   - NPM: `npx -y <paquete>@<versión>` con sus argumentos, sus variables de
 *     entorno en `env_keys` y `proc:spawn` con `npx`, solo ese.
 *
 * El paquete es el PUNTERO (de casa, MIT), no el servidor: el servidor
 * sigue siendo de quien lo publica (está en `source.ref`).
 *
 * `herramientaMcp` es la pieza que lo hace, y la usa también el importador
 * de un `server.json` del registro MCP (tienda/importa-mcp.ts).
 *
 * Referencia: core/paquetes/permisos.ts, estandar/paquete.spec.yaml.
 */
import type { Permiso } from "../permisos.ts";
import { adaptaLista, esObjeto, esTexto, paquete, slug, versionDe, type Adaptados } from "./comun.ts";

/** Una variable que el servidor necesita: una cabecera (remoto) o una variable de entorno (local). */
export interface VariableMcp {
  nombre: string;
  descripcion?: string;
  secreta?: boolean;
  requerida?: boolean;
  /** `cabecera` o `entorno`; si no se dice, lo natural de la conexión. */
  donde?: string;
}

/** Cómo se llega a un servidor MCP. */
export type ConexionMcp =
  | { tipo: "remoto"; url: string; variables?: VariableMcp[] }
  | { tipo: "npm"; paquete: string; version?: string; args?: string[]; variables?: VariableMcp[] };

/** Una entrada de `contributes.tools` que es un servidor MCP. */
export interface EntradaMcp {
  id: string;
  mcp:
    | { url: string; headers?: { name: string; description?: string; secret: boolean; required: boolean }[] }
    | { command: string; args: string[]; env_keys?: string[] };
}

/** Una conexión MCP como herramienta del paquete: la entrada, lo que pide y sus pegas. */
export function herramientaMcp(
  nombre: string,
  conexion: ConexionMcp
): { entrada: EntradaMcp; permisos: Permiso[]; avisos: string[] } {
  const avisos: string[] = [];
  const variables = conexion.variables ?? [];

  if (conexion.tipo === "remoto") {
    const url = new URL(conexion.url);
    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1")
      avisos.push(`${nombre}: habla con ${url.hostname} por http, sin cifrar`);
    const headers = [];
    for (const v of variables) {
      if ((v.donde ?? "cabecera") !== "cabecera") {
        avisos.push(`${nombre}: «${v.nombre}» va en ${v.donde}, y a un servidor remoto solo le llegan cabeceras: se deja fuera`);
        continue;
      }
      headers.push({
        name: v.nombre,
        ...(v.descripcion ? { description: v.descripcion } : {}),
        secret: v.secreta === true,
        required: v.requerida === true,
      });
    }
    return {
      entrada: { id: nombre, mcp: { url: conexion.url, ...(headers.length ? { headers } : {}) } },
      permisos: [{ kind: "net:fetch", hosts: [url.hostname] }],
      avisos,
    };
  }

  if (!conexion.version) avisos.push(`${nombre}: «${conexion.paquete}» sin versión fija: npx bajaría la última cada vez`);
  const fijado = conexion.version ? `${conexion.paquete}@${conexion.version}` : conexion.paquete;
  const entorno: string[] = [];
  for (const v of variables) {
    if ((v.donde ?? "entorno") !== "entorno") {
      avisos.push(`${nombre}: «${v.nombre}» es una cabecera, y a un servidor local no le llegan: se deja fuera`);
      continue;
    }
    entorno.push(v.nombre);
  }
  return {
    entrada: {
      id: nombre,
      mcp: { command: "npx", args: ["-y", fijado, ...(conexion.args ?? [])], ...(entorno.length ? { env_keys: entorno } : {}) },
    },
    permisos: [{ kind: "proc:spawn", programs: ["npx"] }],
    avisos,
  };
}

/** Las herramientas destacadas de la app. */
export function paquetesDeHerramientas(datos: unknown[]): Adaptados {
  return adaptaLista("herramientas", datos, (x) => {
    if (!esTexto(x.id)) return { motivo: "una herramienta sin id" };
    if (!esTexto(x.titulo)) return { motivo: "una herramienta sin título" };
    if (!esTexto(x.slug)) return { motivo: "una herramienta sin slug" };
    if (!esTexto(x.descripcion)) return { motivo: "una herramienta sin descripción" };
    const c = x.conexion;
    if (!esObjeto(c)) return { motivo: "una herramienta sin conexión" };
    if (c.tipo === "remoto" ? !esTexto(c.url) : c.tipo === "npm" ? !esTexto(c.paquete) : true)
      return { motivo: `una conexión «${String(c.tipo)}» que no se sabe adaptar (remoto con url, o npm con paquete)` };
    const variables = Array.isArray(x.variables) ? (x.variables as VariableMcp[]) : [];
    const s = slug(x.slug);
    const h = herramientaMcp(s, { ...c, variables } as ConexionMcp);
    return {
      paquete: paquete(
        {
          id: `esme.mcp.${s}`,
          version: versionDe(x.version),
          name: x.titulo,
          description: x.descripcion,
          author: "Esme",
          license: "MIT",
          ...(esTexto(x.web) ? { homepage: x.web } : {}),
          source: { from: "app:herramientas", ref: x.id },
        },
        { tools: [h.entrada] },
        h.permisos
      ),
      avisos: h.avisos,
    };
  });
}
