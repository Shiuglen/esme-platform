/**
 * LAS PIELES, COMO PAQUETES — las de casa y las de la Tienda.
 *
 * Una piel es un paquete de un solo punto: `themes`, con su `piel.json`, que
 * es el objeto de la app tal cual (ni una clave cambiada: la piel la valida
 * la ventana al vestirla).
 *
 *   - las de CASA (`PIELES_CASA`) son `esme.casa.piel-<nombre>`. No traen
 *     descripción: la suya dice de dónde es;
 *   - las de la TIENDA (`PIELES_TIENDA`) son `esme.tienda.piel-<id>`, con
 *     su descripción, su autor y sus etiquetas (en `keywords`).
 *
 * Los dos espacios de nombres existen por una razón con nombre: «Boreal» de
 * casa y `boreal` de la Tienda son pieles distintas, y con un solo espacio
 * chocarían.
 *
 * La versión de una piel es la que ella misma lleva (`version: 1` → 1.0.0).
 * Los productos de tipo piel salen de `PIELES_TIENDA` (la app los genera
 * con `scripts/catalogo-productos.mjs`) y su paquete es el MISMO, byte a
 * byte: `pielDeTienda` es la única forma de hacerlo.
 *
 * Referencia: core/paquetes/adaptadores/productos.ts, estandar/piel.spec.yaml.
 */
import { adaptaLista, esObjeto, esTexto, esTextos, jsonDe, paquete, slug, versionDe, type Adaptados, type Adapta } from "./comun.ts";

/** Una piel de la Tienda, como la escribe la app. */
export interface PielTienda {
  id: string;
  piel: Record<string, unknown>;
  descripcion: string;
  etiquetas: string[];
  autor: string;
}

/** El paquete de una piel de la Tienda (lo usan las pieles de la Tienda y los productos de tipo piel). */
export function pielDeTienda(t: PielTienda, version: unknown): ReturnType<Adapta> {
  if (!esTexto(t.id)) return { motivo: "una piel de la Tienda sin id" };
  if (!esObjeto(t.piel) || !esTexto(t.piel.nombre)) return { motivo: "una piel sin su objeto (o sin nombre)" };
  if (!esTexto(t.descripcion)) return { motivo: "una piel de la Tienda sin descripción" };
  if (!esTexto(t.autor)) return { motivo: "una piel de la Tienda sin autor" };
  if (t.etiquetas !== undefined && !esTextos(t.etiquetas)) return { motivo: "unas etiquetas que no son una lista de palabras" };
  const s = slug(t.id);
  return {
    paquete: paquete(
      {
        id: `esme.tienda.piel-${s}`,
        version: versionDe(version),
        name: t.piel.nombre,
        description: t.descripcion,
        author: t.autor,
        license: "MIT",
        keywords: t.etiquetas,
        source: { from: "app:pieles-tienda", ref: t.id },
      },
      { themes: [{ id: s, file: "piel.json" }] },
      [],
      { "piel.json": jsonDe(t.piel) }
    ),
  };
}

/** Las pieles de casa (`PIELES_CASA`): una piel, un paquete. */
export function paquetesDePielesCasa(datos: unknown[]): Adaptados {
  return adaptaLista("pieles-casa", datos, (x) => {
    if (!esTexto(x.nombre)) return { motivo: "una piel sin nombre" };
    const s = slug(x.nombre);
    return {
      paquete: paquete(
        {
          id: `esme.casa.piel-${s}`,
          version: versionDe(x.version),
          name: x.nombre,
          description: `«${x.nombre}», una de las pieles de casa de Esme.`,
          author: "Esme",
          license: "MIT",
          source: { from: "app:pieles-casa", ref: x.nombre },
        },
        { themes: [{ id: s, file: "piel.json" }] },
        [],
        { "piel.json": jsonDe(x) }
      ),
    };
  });
}

/** Las pieles de la Tienda (`PIELES_TIENDA`). */
export function paquetesDePielesTienda(datos: unknown[]): Adaptados {
  return adaptaLista("pieles-tienda", datos, (x) =>
    pielDeTienda(x as unknown as PielTienda, esObjeto(x.piel) ? x.piel.version : undefined)
  );
}
