/**
 * LOS PRODUCTOS DE LA TIENDA, COMO PAQUETES — `productos.json` de la app.
 *
 *   - un producto de tipo PIEL es una piel de la Tienda: la app lo genera
 *     de `PIELES_TIENDA`, y su paquete es el mismo, byte a byte (también su
 *     origen: `app:pieles-tienda`). Si el nombre del producto y el de su
 *     piel no coinciden, las dos listas ya no son una: va fuera, y se dice;
 *   - un producto de tipo AGENTE es `esme.tienda.agente-<id>`: un agente de
 *     formato `comando`, cuya receta (`agente.json`) es el contenido del
 *     producto tal cual, y que pide lanzar el programa de su comando;
 *   - `herramienta` y `app` aún no tienen forma de paquete: van fuera, con
 *     su motivo (las herramientas MCP llegan por su propia lista).
 *
 * Referencia: estandar/catalogo-productos.spec.yaml, core/paquetes/adaptadores/pieles.ts.
 */
import { programaDe } from "../manifiesto.ts";
import { adaptaLista, esObjeto, esTexto, jsonDe, paquete, slug, versionDe, type Adaptados } from "./comun.ts";
import { pielDeTienda, type PielTienda } from "./pieles.ts";

/** Los productos de la Tienda (`productos.json`, su lista `productos`). */
export function paquetesDeProductos(datos: unknown[]): Adaptados {
  return adaptaLista("productos", datos, (x) => {
    if (!esTexto(x.id)) return { motivo: "un producto sin id" };
    if (!esTexto(x.nombre)) return { motivo: "un producto sin nombre" };

    if (x.tipo === "piel") {
      if (!esObjeto(x.contenido)) return { motivo: "un producto de tipo piel sin su piel" };
      if (x.contenido.nombre !== x.nombre)
        return {
          motivo: `el producto se llama «${x.nombre}» y su piel «${String(x.contenido.nombre)}»: la lista y PIELES_TIENDA ya no son una`,
        };
      const t = { id: x.id, piel: x.contenido, descripcion: x.descripcion, etiquetas: x.etiquetas, autor: x.autor };
      return pielDeTienda(t as PielTienda, x.version);
    }

    if (x.tipo === "agente") {
      const c = x.contenido;
      if (!esObjeto(c) || !esTexto(c.comando)) return { motivo: "un agente sin comando" };
      if (!esTexto(x.descripcion) || !esTexto(x.autor)) return { motivo: "un agente sin descripción o sin autor" };
      const programa = programaDe(c.comando.trim().split(/\s+/)[0]);
      const s = slug(x.id);
      return {
        paquete: paquete(
          {
            id: `esme.tienda.agente-${s}`,
            version: versionDe(x.version),
            name: x.nombre,
            description: x.descripcion,
            author: x.autor,
            license: "MIT",
            keywords: Array.isArray(x.etiquetas) ? (x.etiquetas as string[]) : undefined,
            source: { from: "app:productos", ref: x.id },
          },
          { agents: [{ id: s, recipe: "agente.json", format: "comando" }] },
          [{ kind: "proc:spawn", programs: [programa] }],
          { "agente.json": jsonDe(c) }
        ),
      };
    }

    if (x.tipo === "herramienta")
      return { motivo: "un producto de tipo «herramienta» aún no tiene forma de paquete: las herramientas MCP llegan por su lista (app:herramientas)" };
    return { motivo: `un producto de tipo «${String(x.tipo)}» aún no es un paquete: una app no es ninguno de los doce puntos` };
  });
}
