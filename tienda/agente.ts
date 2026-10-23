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
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { raizDelPaquete } from "../core/paquete.ts";

/** La receta de un agente. */
/**
 * Las claves de la receta (la forma que declara estandar/agente.spec.yaml).
 *
 * Se declaran a mano porque los tipos no existen en runtime, y la conformidad
 * (scripts/estandar/conformidad.ts) las compara con la spec: si una de las
 * dos se mueve, se nota.
 */
export const CLAVES_RECETA_AGENTE = [
  "version",
  "id",
  "nombre",
  "motor",
  "descripcion",
  "memoria",
  "herramientas",
  "presupuesto",
  "encargo",
] as const;

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
 * EL JUEZ DEL AGENTE — ¿esta receta de agente puede entrar en la tienda?
 *
 * El tercer producto de la tienda con forma propia: una piel (un documento),
 * una herramienta (un módulo) y un AGENTE (una receta: motor + encargo +
 * presupuesto + memoria).
 *
 * Lo que comprueba: la forma, que el motor exista en la spec de motores, que
 * la memoria sea posible (los motores que no hablan MCP no pueden prometerla)
 * y que el presupuesto tenga techo. Un agente sin límite es un agujero de
 * tokens.
 *
 * POR QUÉ VIVE AQUÍ Y NO EN `scripts/`: porque el juez de un agente es del
 * que el agente habla — y el módulo que trae una receta lo verifica al
 * entrar. Un tercero que publica su módulo desde el kit instalado tiene que
 * poder ser juzgado por las mismas reglas que la casa.
 *
 * Referencia: estandar/agente.spec.yaml, docs/TIENDA.md.
 */
export interface ResultadoAgente extends VeredictoAgente {
  /** La ruta de la spec de motores usada. */
  spec: string;
}

/** La spec de motores (la casa). */
export function motoresDe(ruta?: string): CognitionMotor[] {
  return cargaMotorCached(ruta ?? join(raizDelPaquete(), "estandar", "motor-capability.spec.yaml"));
}

/** El juez: una receta, con su veredicto. */
export function juzgaAgente(x: unknown, idEsperado?: string): VeredictoAgente {
  return validaAgente(x, motoresDe(), idEsperado);
}

/**
 * El juez sobre el MÓDULO: un módulo de categoría `agent` tiene que traer su
 * receta (`agente.json`).
 */
export function juzgaAgenteDeModulo(dirModulo: string, categoria: string): VeredictoAgente {
  const dir = resolve(dirModulo);
  if (categoria !== "agent") {
    return { ok: true, agente: null, errores: [] };
  }
  const ruta = join(dir, "agente.json");
  if (!existsSync(ruta)) {
    return {
      ok: false,
      agente: null,
      errores: ["es un módulo de agente y no trae agente.json (la receta es un documento, no una promesa)"],
    };
  }
  try {
    return juzgaAgente(JSON.parse(readFileSync(ruta, "utf8")));
  } catch (e) {
    return {
      ok: false,
      agente: null,
      errores: [`la receta no se puede leer: ${String((e as Error)?.message || e)}`],
    };
  }
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
