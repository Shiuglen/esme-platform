/**
 * EJECUTAR UN TURNO — la puerta, de verdad, y el turno medido.
 *
 * Aquí se juntan las piezas que hasta ahora vivían sueltas: se abre un
 * MÓDULO (con su cápsula y su puerta), se le hace una consulta, se mide lo
 * que ha pasado (los tokens, los ficheros que tocó, la limpieza del chat) y se
 * escribe un TURNO.
 *
 * Por qué en el kit y no sólo en la app: porque así los contratos se EJERCITAN
 * (un contrato que nadie ejecuta se va de casa sin que nadie lo note), y
 * porque el motor puede ser cualquiera —incluido el `local`— sin depender de
 * ninguna API.
 *
 * Y una regla que se respeta aquí porque es de la casa: **lo concedido manda**.
 * El módulo DECLARA lo que quiere; sólo se le monta lo que la persona
 * concedió (core/modulos/consentimiento.ts). Un módulo que pide `mind:read` y
 * no tiene permiso, corre sin puerta: y el turno lo dice.
 *
 * Referencia: core/turnos/turno.ts, core/turnos/cambios.ts,
 * core/bench/ciclo.ts, core/modulos/consentimiento.ts.
 */
import { join } from "node:path";
import { abreHost } from "../extension-host/host.ts";
import { menteDePrueba, tokensDe } from "../bench/ciclo.ts";
import type { MenteViva } from "../ipc/mind-schema-types.ts";
import { leeManifiesto } from "../../tienda/modulo-manifiesto.ts";
import { Consentimientos } from "../modulos/consentimiento.ts";
import { FN_TROCEA } from "../bench/memoria.ts";
import { armaTurno, limpiezaDelTurno, type Turno } from "./turno.ts";
import { compara, instantanea, type ResultadoCambios } from "./cambios.ts";
import type { ModoContexto } from "../talamus/modos.ts";
import { empaquetaEn } from "../talamus/modos.ts";
import { planDeEmpaquete, resumenPlan } from "../talamus/plan.ts";

/** Lo que hay que saber para ejecutar un turno. */
export interface OpcionesEjecutar {
  /** La carpeta del módulo. */
  dirModulo: string;
  /** La consulta. */
  consulta: string;
  /** El motor (para el turno; si no, «local»). */
  motor?: string;
  /** El modo del contexto. */
  modo?: ModoContexto;
  /** La mente que se le monta (si no, una de juguete). */
  mente?: MenteViva;
  /** El libro de permisos (si no, se concede lo declarado: es una ejecución de prueba). */
  consentimientos?: Consentimientos;
  /** La función que se llama en el módulo. */
  fn?: string;
  /**
   * El ESPACIO DE TRABAJO: la carpeta donde el agente trabaja y cuyos
   * cambios se miden.
   *
   * No es la carpeta del módulo (ésa es el código del agente, y no cambia):
   * es el proyecto. Un módulo que escribe, escribe por la puerta
   * (`fs:project`), y lo que cambia es el proyecto.
   */
  espacio?: string;
}

/** Lo que devuelve la ejecución. */
export interface ResultadoEjecutar {
  /** El turno (medido). */
  turno: Turno;
  /** Los ficheros que tocó. */
  cambios: ResultadoCambios;
  /** La limpieza del chat (0-1). */
  limpieza: number;
  /** Los permisos que se le montaron (lo concedido, no lo pedido). */
  concedidos: string[];
  /** Los que pidió y no tenía. */
  pendientes: string[];
  /** Si el módulo falló, el motivo. */
  error?: string;
}

/**
 * Ejecuta un turno: abre el módulo, le pregunta, y mide lo que pasó.
 *
 * El paso que no se salta: los permisos. Se le monta lo CONCEDIDO (y si no
 * hay libro, se concede lo declarado — porque esto es una ejecución de
 * prueba, no la puerta de la persona).
 */
export async function ejecutaTurno(opts: OpcionesEjecutar): Promise<ResultadoEjecutar> {
  const dir = opts.dirModulo;
  const dictamen = leeManifiesto(dir, { exigirEntrada: false });
  if (!dictamen.ok || !dictamen.manifest) {
    throw new Error(`el módulo no vale: ${dictamen.errores.join("; ")}`);
  }
  const manifiesto = dictamen.manifest;

  // 1. lo concedido manda
  const libro = opts.consentimientos;
  const declaradas = [...manifiesto.permissions];
  const concedidas = libro ? libro.concedidasDe(manifiesto.id) : declaradas;
  const pendientes = declaradas.filter((p) => !concedidas.includes(p));

  // 2. la puerta: sólo con lo concedido. El espacio de trabajo es donde el
  //    agente trabaja (y lo que se mide); la puerta de ficheros apunta ahí.
  const espacio = opts.espacio ?? dir;
  const antes = instantanea(espacio);
  const { mente } = opts.mente ? { mente: opts.mente } : menteDePrueba();
  // el nombre de la función: el que se dice, o el primero de la convención
  // que el módulo exporte de verdad (un módulo de casa puede llamarlo
  // `troceaConFilas`: es lo mismo).
  const buscar = async (host: ReturnType<typeof abreHost>): Promise<string | null> => {
    if (opts.fn) return opts.fn;
    for (const nombre of esMemoria ? FN_TROCEA : ["ciclo"]) {
      try {
        await host.call(nombre, "doc", ""); // ¿existe?
        return nombre;
      } catch {
        // no es esa: la siguiente
      }
    }
    return null;
  };
  const host = abreHost(join(dir, manifiesto.entry), {
    permisos: declaradas,
    concedidas,
    mente,
    ...(concedidas.includes("fs:project") ? { proyecto: espacio } : {}),
    id: manifiesto.id,
    version: manifiesto.version,
  });

  // 3. la llamada: cada forma con su convención.
  //    - herramienta: `ciclo(consulta)`;
  //    - memoria: `trocea(fuente, texto)` (el módulo corta el texto).
  const esMemoria = manifiesto.category === "memory";
  let error: string | undefined;
  const fn = await buscar(host);
  if (!fn) {
    await host.cerrar();
    error = `el módulo no exporta ${esMemoria ? FN_TROCEA.join(" ni ") : "ciclo"}`;
  }
  let respuesta = "";
  const inicio = Date.now();
  if (fn) {
    try {
      const r = esMemoria
        ? await host.call(fn, "doc", opts.consulta)
        : await host.call(fn, opts.consulta);
      respuesta = typeof r === "string" ? r : JSON.stringify(r ?? "");
    } catch (e) {
      error = String((e as Error)?.message || e);
    }
  }
  const usadas = host.usadas();
  await host.cerrar();
  const ms = Date.now() - inicio;

  // 4. lo que tocó (en el espacio de trabajo)
  const despues = instantanea(espacio);
  const cambios = compara(antes, despues);

  // 5. el turno, medido. Los pasos del Tálamo también son pasos: lo que se
  //    quedó fuera del contexto, con su motivo, es parte del turno (un
  //    recorte en silencio no se puede revisar).
  const pasos = usadas.map((u) => ({ paso: `usa ${u}`, estado: "ok" as const }));
  const plan = planDeEmpaquete(opts.consulta, [], opts.modo === "ahorrador" ? 150 : 400);
  if (plan.quedan.length) {
    pasos.push({ paso: `talamo: ${resumenPlan(plan)}`, estado: "ok" as const });
  }
  const turno = armaTurno({
    id: `${manifiesto.id}@${manifiesto.version}`,
    motor: opts.motor ?? "local",
    modo: opts.modo ?? "estandar",
    pregunta: opts.consulta,
    respuesta,
    actividad: pasos,
    cambios: cambios.ficheros.map((f) => ({
      ruta: f.ruta,
      anadidos: f.anadidos,
      borrados: f.borrados,
    })),
    tokens_contexto: tokensDe(opts.consulta),
    presupuesto: { tokens: 200_000, segundos: 900 },
  });

  return {
    turno,
    cambios,
    limpieza: limpiezaDelTurno(turno),
    concedidos: concedidas,
    pendientes,
    ...(error ? { error } : {}),
  };
}

/**
 * El contexto que vería el turno: los recuerdos que el Tálamo le daría.
 *
 * Es la pieza que faltaba para que el modo de contexto sea REAL: el modo no
 * es una etiqueta, es lo que el módulo recibe.
 */
export function contextoDelTurno(
  consulta: string,
  recuerdos: Array<{ id: string; texto: string; tokens: number; score: number }>,
  modo: ModoContexto
): { seleccionados: number; tokens: number } {
  const paquete = empaquetaEn(consulta, recuerdos, modo);
  return { seleccionados: paquete.seleccionados.length, tokens: paquete.tokens_gastados };
}
