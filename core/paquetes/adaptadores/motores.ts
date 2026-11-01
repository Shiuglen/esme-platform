/**
 * LOS MOTORES, COMO PAQUETES — los de casa (`MOTORES_ACP`) y el espejo del registro ACP.
 *
 *   - un motor de CASA es `esme.casa.motor-<id>`: un motor (`engines`) con
 *     sus binarios, sus argumentos, cómo se entra, su cumplimiento y cuándo
 *     se verificó; y pide lanzar sus binarios (`proc:spawn`, solo esos). La
 *     nota de casa es su descripción;
 *   - uno del ESPEJO es `esme.acp.<id>`: informativo. Lleva su repo y su
 *     línea de instalación como texto, y no pide nada, porque no lanza
 *     nada: instalarlo es cosa de la persona.
 *
 * Referencia: core/paquetes/manifiesto.ts (punto `engines`), estandar/motor-capability.spec.yaml.
 */
import { adaptaLista, esTexto, esTextos, paquete, slug, type Adaptados } from "./comun.ts";

/** Los motores ACP de casa. */
export function paquetesDeMotoresAcp(datos: unknown[]): Adaptados {
  return adaptaLista("motores-acp", datos, (x) => {
    if (!esTexto(x.id)) return { motivo: "un motor sin id" };
    if (!esTexto(x.nombre)) return { motivo: "un motor sin nombre" };
    if (!esTextos(x.binarios) || !x.binarios.length) return { motivo: "un motor sin binarios que lanzar" };
    if (x.args !== undefined && !esTextos(x.args)) return { motivo: "unos argumentos que no son una lista de textos" };
    const s = slug(x.id);
    const motor = {
      id: s,
      name: x.nombre,
      binaries: x.binarios,
      args: x.args ?? [],
      ...(esTexto(x.login) ? { login: x.login } : {}),
      ...(esTexto(x.cumplimiento) ? { compliance: x.cumplimiento } : {}),
      ...(esTexto(x.verificado) ? { verified: x.verificado } : {}),
    };
    return {
      paquete: paquete(
        {
          id: `esme.casa.motor-${s}`,
          version: "0.0.0",
          name: x.nombre,
          description: esTexto(x.nota) ? x.nota : `El motor ${x.nombre}, por ACP.`,
          author: "Esme",
          license: "MIT",
          source: { from: "app:motores-acp", ref: x.id },
        },
        { engines: [motor] },
        [{ kind: "proc:spawn", programs: x.binarios }]
      ),
    };
  });
}

/** El espejo del registro ACP (informativo: nada que lanzar). */
export function paquetesDelEspejoAcp(datos: unknown[]): Adaptados {
  return adaptaLista("espejo-acp", datos, (x) => {
    if (!esTexto(x.id)) return { motivo: "un motor del registro sin id" };
    if (!esTexto(x.nombre)) return { motivo: "un motor del registro sin nombre" };
    if (!esTexto(x.descripcion)) return { motivo: "un motor del registro sin descripción" };
    const s = slug(x.id);
    const motor = {
      id: s,
      name: x.nombre,
      ...(esTexto(x.repo) ? { repo: x.repo } : {}),
      ...(esTexto(x.instalacion) ? { install: x.instalacion } : {}),
    };
    return {
      paquete: paquete(
        {
          id: `esme.acp.${s}`,
          version: "0.0.0",
          name: x.nombre,
          description: x.descripcion,
          author: "Esme",
          license: "MIT",
          source: { from: "app:espejo-acp", ref: x.id },
        },
        { engines: [motor] }
      ),
    };
  });
}
