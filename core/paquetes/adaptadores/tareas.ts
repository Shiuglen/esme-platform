/**
 * LAS TAREAS DEL TALLER, COMO PAQUETES — `PLANTILLAS_CASA` de la app.
 *
 * Una tarea del Taller es un encargo listo para lanzar (y a veces un flujo
 * de pasos con sus oficios). Su paquete es `esme.casa.tarea-<id>`, con una
 * tarea (`tasks`): el encargo es su `prompt`, y los pasos, los oficios, la
 * categoría y el icono van tal cual. Su descripción es la del paquete.
 *
 * Referencia: core/paquetes/manifiesto.ts (punto `tasks`).
 */
import { adaptaLista, esTexto, esTextos, paquete, slug, type Adaptados } from "./comun.ts";

/** Las tareas de casa del Taller. */
export function paquetesDeTareas(datos: unknown[]): Adaptados {
  return adaptaLista("tareas", datos, (x) => {
    if (!esTexto(x.id)) return { motivo: "una tarea sin id" };
    if (!esTexto(x.titulo)) return { motivo: "una tarea sin título" };
    if (!esTexto(x.encargo)) return { motivo: "una tarea sin encargo" };
    if (!esTexto(x.descripcion)) return { motivo: "una tarea sin descripción" };
    for (const k of ["pasos", "oficios"] as const)
      if (x[k] !== undefined && !esTextos(x[k])) return { motivo: `«${k}» no es una lista de textos` };
    const s = slug(x.id);
    const tarea = {
      id: s,
      title: x.titulo,
      prompt: x.encargo,
      ...(x.pasos ? { steps: x.pasos } : {}),
      ...(x.oficios ? { roles: x.oficios } : {}),
      ...(esTexto(x.categoria) ? { category: x.categoria } : {}),
      ...(esTexto(x.icono) ? { icon: x.icono } : {}),
    };
    return {
      paquete: paquete(
        {
          id: `esme.casa.tarea-${s}`,
          version: "0.0.0",
          name: x.titulo,
          description: x.descripcion,
          author: "Esme",
          license: "MIT",
          source: { from: "app:tareas", ref: x.id },
        },
        { tasks: [tarea] }
      ),
    };
  });
}
