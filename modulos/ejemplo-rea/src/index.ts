/**
 * esme.nucleo.rea — mirar dentro de un programa, por la puerta.
 *
 * Qué demuestra. La séptima pieza de la puerta: `esme.proc`. El módulo NO
 * importa `node:child_process` (no puede: la cápsula lo cierra) y NO sabe
 * la ruta de REA. Pide al anfitrión que lance el programa por su NOMBRE
 * LÓGICO, con argumentos en array, y recibe su salida.
 *
 * Lo que ve el módulo:
 *   - la salida del programa (stdout), que es lo que se pidió;
 *   - nada más: ni el entorno, ni las llaves de la persona, ni el disco.
 *
 * Lo que NO hace. No ejecuta el análisis (eso es REA, y tarda): esto enseña
 * cómo se habla con un programa por la puerta. El módulo que de verdad
 * analiza, se apoya en el importador del kit (`core/mind/importers/rea.ts`).
 *
 * Referencia: docs/REA.md, docs/ENTRADA.md, core/extension-host/proc.ts.
 */
export const MODULO_ID = "esme.nucleo.rea";

/** Lo que el módulo devuelve (la convención de la casa: `ciclo`). */
export interface RespuestaRea {
  /** La respuesta, en castellano. */
  respuesta: string;
}

/** Una operación del catálogo de REA, en la forma que el módulo necesita. */
interface OperacionRea {
  operacion: string;
  disponible: boolean;
  efectos: string[];
}

/**
 * El ciclo: la convención que mide el juez.
 *
 * Pregunta a REA qué sabe hacer en esta máquina y cuenta las operaciones. Es
 * barato (un segundo), y demuestra la puerta sin analyze nada pesado.
 */
export async function ciclo(consulta: string): Promise<RespuestaRea> {
  const puerta = globalThis.esme;
  if (!puerta?.proc) {
    return {
      respuesta:
        "este módulo necesita la puerta de los programas (`proc:spawn`) " +
        "y que REA esté en el libro de los programas",
    };
  }
  try {
    const r = await puerta.proc.ejecutar({
      programa: "rea",
      args: ["capabilities", "--format", "json"],
    });
    const operaciones = operacionesDe(r.stdout);
    const disponibles = operaciones.filter((o) => o.disponible).length;
    return {
      respuesta:
        `REA declara ${operaciones.length} operaciones en esta máquina ` +
        `(${disponibles} disponibles).`,
    };
  } catch (e) {
    return { respuesta: `no se pudo hablar con REA: ${motivo(e)}` };
  }
}

/**
 * El catálogo completo: qué sabe hacer REA, y qué efectos tiene cada cosa.
 *
 * Los efectos importan: son lo que decide si hace falta pedir permiso de
 * red, de disco o de interfaz.
 */
export async function catalogo(): Promise<{
  ok: boolean;
  operaciones: OperacionRea[];
  respuesta: string;
}> {
  const puerta = globalThis.esme;
  if (!puerta?.proc) {
    return { ok: false, operaciones: [], respuesta: "sin puerta a los programas" };
  }
  try {
    const r = await puerta.proc.ejecutar({
      programa: "rea",
      args: ["capabilities", "--format", "json"],
    });
    const operaciones = operacionesDe(r.stdout);
    return {
      ok: true,
      operaciones,
      respuesta: `${operaciones.length} operaciones declaradas`,
    };
  } catch (e) {
    return { ok: false, operaciones: [], respuesta: `no se pudo hablar con REA: ${motivo(e)}` };
  }
}

/**
 * Analiza un programa y devuelve lo esencial de la evidencia.
 *
 * Lo esencial son tres cosas: QUÉ se miró, QUÉ NO se pudo ver (las
 * limitaciones que declara el propio análisis) y la cobertura. Lo otro
 * (33.000 nodos) no lo devuelve nadie: para eso está el importador del kit,
 * que lo convierte en decenas de hechos.
 */
export async function analiza(ruta: string): Promise<{
  ok: boolean;
  respuesta: string;
  sujeto?: string;
  limitaciones?: string[];
  cobertura?: string;
}> {
  const puerta = globalThis.esme;
  if (!puerta?.proc) {
    return { ok: false, respuesta: "sin puerta a los programas" };
  }
  try {
    const r = await puerta.proc.ejecutar({
      programa: "rea",
      args: ["analyze", ruta, "--format", "json"],
      timeoutMs: 600_000,
    });
    const ev = JSON.parse(r.stdout) as {
      subject?: { name?: string };
      limitations?: string[];
      normalized_result?: { semantic_graph?: { coverage?: { status?: string } } };
    };
    const limitaciones = ev.limitations ?? [];
    const cobertura = ev.normalized_result?.semantic_graph?.coverage?.status ?? "desconocida";
    return {
      ok: true,
      sujeto: ev.subject?.name,
      limitaciones,
      cobertura,
      respuesta:
        `«${ev.subject?.name ?? "?"}»: ${limitaciones.length} limitación(es) declarada(s), ` +
        `cobertura «${cobertura}». Lo que el análisis no vio, no se afirma.`,
    };
  } catch (e) {
    return { ok: false, respuesta: `el análisis falló: ${motivo(e)}` };
  }
}

/* ------------------------------------------------------------------ *
 * Lo de dentro: leer el catálogo de REA sin nada del kit.               *
 * (un módulo no importa el kit: va con lo suyo)                        *
 * ------------------------------------------------------------------ */

function operacionesDe(json: string): OperacionRea[] {
  const salida: OperacionRea[] = [];
  let crudo: {
    capabilities?: Array<{
      provider?: { id?: string };
      groups?: Array<{ operations?: string[]; effects?: string[]; available?: boolean }>;
    }>;
  };
  try {
    crudo = JSON.parse(json);
  } catch {
    return salida;
  }
  for (const proveedor of crudo.capabilities ?? []) {
    for (const grupo of proveedor.groups ?? []) {
      for (const operacion of grupo.operations ?? []) {
        salida.push({
          operacion,
          disponible: grupo.available === true,
          efectos: grupo.effects ?? [],
        });
      }
    }
  }
  return salida;
}

const motivo = (e: unknown): string => String((e as Error)?.message ?? e);
