/**
 * LAS SKILLS DE LA TIENDA, COMO PAQUETES — `skills/catalogo.json` de la app.
 *
 * Cada skill del catálogo ya está fijada: su repo, su ruta, su commit y la
 * huella de su árbol (la que el juez de la app midió). El paquete es una
 * skill REMOTA con esos cuatro datos: quien la instala baja ese commit y
 * comprueba esa huella, o no la instala.
 *
 *   - id: `esme.<colección>.<nombre>`, con la colección del id de la app
 *     (`superpowers/test-driven-development` → `esme.superpowers.…`). El
 *     `grupo` de la app (Diseño, Código…) es una etiqueta de la ventana y
 *     se repite: va en `keywords`, no en el id;
 *   - autor: el dueño del repo; licencia: la de la skill;
 *   - sin versión: 0.0.0, con el commit en `source.commit`;
 *   - `scripts`: si la skill trae scripts (sube el nivel de aislamiento a 3).
 *
 * Lo que no viaja: `ficheros` y `bytes` (se miden del árbol), `revisadoEl`
 * (es del juez de la app) y la descripción en inglés (va la de casa).
 *
 * Referencia: tienda/skills.ts, estandar/skill-veredicto.spec.yaml.
 */
import { LICENCIAS_PAQUETE } from "../manifiesto.ts";
import { adaptaLista, esTexto, paquete, slug, type Adaptados } from "./comun.ts";

/** Las skills del catálogo de la app. */
export function paquetesDeSkills(datos: unknown[]): Adaptados {
  return adaptaLista("skills", datos, (x) => {
    if (!esTexto(x.id) || !x.id.includes("/")) return { motivo: "una skill sin id «colección/nombre»" };
    if (!esTexto(x.nombre)) return { motivo: "una skill sin nombre" };
    if (![x.repo, x.ruta, x.commit, x.arbolSha256].every(esTexto))
      return { motivo: "una skill sin su origen fijado (repo, ruta, commit y arbolSha256)" };
    if (!LICENCIAS_PAQUETE.includes(String(x.licencia)))
      return { motivo: `la licencia «${String(x.licencia)}» no está entre las de un paquete` };
    const descripcion = [x.descripcionEs, x.descripcion].find(esTexto);
    if (!descripcion) return { motivo: "una skill sin descripción" };

    const coleccion = slug(x.id.split("/")[0]);
    const nombre = slug(x.nombre);
    const repo = String(x.repo);
    const commit = String(x.commit);
    return {
      paquete: paquete(
        {
          id: `esme.${coleccion}.${nombre}`,
          version: "0.0.0",
          name: x.nombre,
          description: descripcion,
          author: repo.split("/")[0],
          license: String(x.licencia),
          keywords: esTexto(x.grupo) ? [x.grupo] : undefined,
          source: { from: "app:skills", ref: x.id, commit },
        },
        {
          skills: [
            {
              id: nombre,
              remote: { repo, commit, path: String(x.ruta), sha256: String(x.arbolSha256) },
              scripts: x.tieneScripts === true,
            },
          ],
        }
      ),
    };
  });
}
