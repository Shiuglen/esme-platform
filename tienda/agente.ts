/**
 * EL AGENTE — la receta, juzgada.
 *
 * Un agente es un motor con un encargo, un presupuesto y (si puede) la
 * memoria de la casa. Se publica una RECETA (un documento), no un programa:
 * el motor corre sin modificar en la terminal de la persona.
 *
 * Lo que el juez comprueba:
 *
 *   1. la FORMA: los campos son los de la spec (estandar/agente.spec.yaml);
 *   2. el MOTOR EXISTE: un agente con un motor inventado no arranca, y quien
 *      lo instala se entera en su casa en vez de aquí;
 *   3. la MEMORIA: los motores que no hablan MCP no pueden prometer la
 *      memoria de la casa;
 *   4. el PRESUPUESTO tiene techo: un agente sin límite es un agujero de
 *      tokens (y de dinero).
 *
 * Referencia: estandar/agente.spec.yaml, docs/MOTORES.md, docs/TIENDA.md.
 */
import { cargaMotorCached, type CognitionMotor } from "../motores/laya-adapter.ts";

/** La receta de un agente. */
export interface RecetaAgente {
  version: number;
  id: string;
  nombre: string;
  motor: string;
  descripcion: string;
  memoria: boolean;
  herramientas: string[];
  presupuesto: { tokens: number; segundos: number };
  encargo: string;
}

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** El veredicto del juez de agentes. */
export interface VeredictoAgente {
  ok: boolean;
  /** La receta completa (con lo que faltaba, rellenado). */
  agente: RecetaAgente | null;
  /** Los errores (qué arreglar). */
  errores: string[];
}

/**
 * La receta por defecto: el motor por defecto (opencode) con la memoria de la
 * casa y un presupuesto con techo.
 */
export function recetaBase(id: string, nombre: string): RecetaAgente {
  return {
    version: 1,
    id,
    nombre,
    motor: "opencode",
    descripcion: "Un agente que piensa con el motor de la casa y recuerda lo que la mente sabe.",
    memoria: true,
    herramientas: [],
    presupuesto: { tokens: 32_000, segundos: 600 },
    encargo: "Piensa lo que te pidan y responde. Sin salir de la máquina.",
  };
}

/**
 * Juzga una receta de agente.
 *
 * `motores` es la spec de motores (lo que la casa conoce): un agente con un
 * motor que no está ahí no entra.
 */
export function validaAgente(
  x: unknown,
  motores: CognitionMotor[],
  idEsperado?: string
): VeredictoAgente {
  const errores: string[] = [];
  if (!objeto(x)) return { ok: false, agente: null, errores: ["un agente es un objeto"] };

  const id = typeof x.id === "string" ? x.id : (idEsperado ?? "");
  const receta = recetaBase(id, typeof x.nombre === "string" ? x.nombre : "Agente");

  if (!/^esme\.[a-z0-9-]+\.[a-z0-9-]+$/.test(receta.id)) {
    errores.push(`id: «${receta.id}» no es esme.<autor>.<slug>`);
  }
  if (typeof x.nombre === "string" && x.nombre.trim()) receta.nombre = x.nombre.trim().slice(0, 60);
  else if (x.nombre !== undefined) errores.push("nombre: no es texto");

  if (typeof x.descripcion === "string" && x.descripcion.trim().length >= 10) {
    receta.descripcion = x.descripcion.trim();
  } else {
    errores.push("descripcion: tiene que decir qué hace (mínimo 10 letras)");
  }

  // 2. el motor tiene que existir
  if (typeof x.motor === "string" && x.motor.trim()) {
    receta.motor = x.motor.trim();
    const conocido = motores.find((m) => m.id === receta.motor);
    if (!conocido) {
      errores.push(`motor: «${receta.motor}» no está en la spec de motores`);
    } else if (!conocido.capabilities.mcp) {
      // 3. la memoria es un sí o un no
      if (x.memoria === true) {
        errores.push(`memoria: el motor ${receta.motor} no habla MCP: no puede prometer la memoria de la casa`);
      }
    }
  } else {
    errores.push("motor: falta (uno de la spec de motores)");
  }

  if (typeof x.memoria === "boolean") receta.memoria = x.memoria;

  if (x.herramientas !== undefined) {
    if (!Array.isArray(x.herramientas)) errores.push("herramientas: tiene que ser una lista");
    else {
      const ids = x.herramientas.filter((h): h is string => typeof h === "string");
      if (ids.length !== x.herramientas.length) errores.push("herramientas: hay algo que no es un id");
      receta.herramientas = ids;
    }
  }

  // 4. el presupuesto con techo
  const p = objeto(x.presupuesto) ? x.presupuesto : {};
  const tokens = Number(p.tokens);
  const segundos = Number(p.segundos);
  if (!Number.isFinite(tokens) || tokens <= 0) {
    errores.push("presupuesto.tokens: tiene que ser un número (> 0)");
  } else {
    receta.presupuesto.tokens = Math.floor(tokens);
  }
  if (!Number.isFinite(segundos) || segundos <= 0) {
    errores.push("presupuesto.segundos: tiene que ser un número (> 0)");
  } else {
    receta.presupuesto.segundos = Math.floor(segundos);
  }

  if (typeof x.encargo === "string" && x.encargo.trim()) {
    receta.encargo = x.encargo.trim().slice(0, 2000);
  } else {
    errores.push("encargo: falta (qué tiene que hacer)");
  }

  return { ok: errores.length === 0, agente: receta, errores };
}
