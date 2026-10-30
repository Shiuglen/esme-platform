/**
 * LO COMÚN DE LOS ADAPTADORES — de una lista de la app a paquetes, sin perder nada en silencio.
 *
 * Cada lista instalable de la app (pieles, productos, skills, herramientas,
 * tareas, motores) tiene su forma. Un adaptador la lee elemento a elemento
 * y da un paquete v2 por cada uno. Lo que no se puede adaptar no se tira:
 * va a `fuera`, con su motivo; y lo que se adapta con una pega va a
 * `avisos`. Un elemento roto nunca hace lanzar a la lista entera.
 *
 * Los adaptadores no tocan disco ni YAML: reciben la lista ya leída
 * (`unknown[]`) y devuelven `PaqueteDatos`, que valida `validaPaqueteDatos`.
 *
 * Referencia: core/paquetes/manifiesto.ts, docs/PAQUETES.md.
 */
import { validaPaqueteDatos, type PaqueteDatos } from "../manifiesto.ts";
import { unePermisos, type Permiso } from "../permisos.ts";

/** Lo que sale de adaptar una lista. */
export interface Adaptados {
  paquetes: PaqueteDatos[];
  /** Lo que no se adaptó, con su motivo. */
  fuera: { origen: string; motivo: string }[];
  /** Lo que se adaptó con una pega (cada uno empieza por su origen). */
  avisos: string[];
}

/** Un nombre como pieza de id: minúsculas, sin tildes, y todo lo demás a guiones. */
export const slug = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Una versión de la app, en semver: un número n es `n.0.0`; un semver se queda; lo demás, `0.0.0`. */
export const versionDe = (v: unknown): string =>
  typeof v === "number" && Number.isInteger(v) && v >= 0
    ? `${v}.0.0`
    : typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v)
      ? v
      : "0.0.0";

export const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

export const esTexto = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;

export const esTextos = (x: unknown): x is string[] => Array.isArray(x) && x.every((t) => typeof t === "string");

/** Un fichero JSON del paquete: el objeto tal cual, legible y con su salto de línea final. */
export const jsonDe = (x: unknown): string => `${JSON.stringify(x, null, 2)}\n`;

/** La cabecera de un paquete adaptado. */
export interface Cabecera {
  id: string;
  version: string;
  name: string;
  description: string;
  author: string;
  license: string;
  keywords?: string[];
  homepage?: string;
  source: { from: string; ref: string; commit?: string };
}

/**
 * Un paquete adaptado: siempre `kind: package`, con las claves en el mismo
 * orden (dos listas que dicen lo mismo dan los mismos bytes). `extra` son
 * las claves de más que alguno trae (el `success` de una receta), y van
 * justo antes de `source`.
 */
export function paquete(
  c: Cabecera,
  contributes: Record<string, unknown[]>,
  permisos: Permiso[] = [],
  ficheros: PaqueteDatos["ficheros"] = {},
  extra: Record<string, unknown> = {}
): PaqueteDatos {
  const permissions = unePermisos(permisos);
  return {
    manifiesto: {
      schema_version: 2,
      id: c.id,
      version: c.version,
      name: c.name,
      kind: "package",
      description: c.description,
      author: c.author,
      license: c.license,
      ...(c.keywords?.length ? { keywords: c.keywords } : {}),
      ...(c.homepage ? { homepage: c.homepage } : {}),
      contributes,
      ...(permissions.length ? { permissions } : {}),
      ...extra,
      source: c.source,
    },
    ficheros,
  };
}

/** Lo que un adaptador hace con un elemento: su paquete (y sus pegas), o el motivo por el que no lo da. */
export type Adapta = (x: Record<string, unknown>) => { paquete: PaqueteDatos; avisos?: string[] } | { motivo: string };

/**
 * Recorre una lista con su adaptador. Un elemento que no es un objeto, que
 * el adaptador rechaza, que lo hace lanzar o cuyo paquete no vale va a
 * `fuera`, con su motivo. Nunca lanza.
 */
export function adaptaLista(lista: string, datos: unknown[], adapta: Adapta): Adaptados {
  const r: Adaptados = { paquetes: [], fuera: [], avisos: [] };
  datos.forEach((x, i) => {
    const nombre = esObjeto(x) ? [x.id, x.nombre, x.titulo].find(esTexto) : undefined;
    const origen = `app:${lista}#${nombre ?? i}`;
    if (!esObjeto(x)) {
      r.fuera.push({ origen, motivo: "no es un objeto" });
      return;
    }
    let hecho: ReturnType<Adapta>;
    try {
      hecho = adapta(x);
    } catch (e) {
      r.fuera.push({ origen, motivo: `no se pudo adaptar: ${(e as Error).message}` });
      return;
    }
    if ("motivo" in hecho) {
      r.fuera.push({ origen, motivo: hecho.motivo });
      return;
    }
    const v = validaPaqueteDatos(hecho.paquete);
    if (!v.ok) {
      r.fuera.push({ origen, motivo: `el paquete no vale: ${v.errores.join("; ")}` });
      return;
    }
    r.paquetes.push(hecho.paquete);
    for (const a of [...(hecho.avisos ?? []), ...v.avisos]) r.avisos.push(`${origen}: ${a}`);
  });
  return r;
}
