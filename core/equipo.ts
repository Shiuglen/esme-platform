/**
 * EL EQUIPO — varios agentes, un presupuesto.
 *
 * Un equipo es un arquitecto y sus trabajadores. Lo que lo hace un EQUIPO (y
 * no un montón de agentes sueltos) es que hay UN presupuesto repartido, y el
 * reparto se respeta.
 *
 * Por qué importa, y por qué aquí: treinta agentes en paralelo son treinta
 * bocas comiendo RAM y tokens a la vez. La forma de que eso no pase es que
 * el equipo tenga un techo Y que el reparto sea explícito (nadie se lo queda
 * todo, sin que nadie tenga que pedirlo).
 *
 * Las reglas (todas medibles):
 *
 *   1. **un arquitecto**: exactamente uno. Sin arquitecto, el equipo no sabe
 *      hacia dónde va; con dos, nadie decide.
 *   2. **el presupuesto se reparte**: la suma de las partes es el total del
 *      equipo, y el total tiene un techo.
 *   3. **el equipo no gasta más que su cap**: aunque cada uno vaya dentro de
 *      su parte, el conjunto no puede pasar del cap (es el tope del motor).
 *   4. **los roles son cerrados**: arquitecto, trabajador, crítico. Un rol
 *      inventado no se puede medir ni repartir.
 *
 * Referencia: estandar/equipo.spec.yaml, core/turno.ts.
 */
import type { ModoContexto } from "./talamus/modos.ts";

/** Los roles del equipo (cerrados: un rol nuevo es una spec nueva). */
export const ROLES = ["arquitecto", "trabajador", "critico"] as const;
export type Rol = (typeof ROLES)[number];

/** Un miembro del equipo. */
export interface Miembro {
  /** El rol (cerrado). */
  rol: Rol;
  /** El motor que usa. */
  motor: string;
  /** Lo que hace (el encargo). */
  encargo: string;
  /** Su parte del presupuesto. */
  presupuesto: { tokens: number; segundos: number };
}

/** Un equipo. */
export interface Equipo {
  /** El id estable. */
  id: string;
  /** El nombre que ve la persona. */
  nombre: string;
  /** Los miembros. */
  miembros: Miembro[];
  /** El modo del contexto que usa el equipo. */
  modo: ModoContexto;
  /** El techo del EQUIPO (la suma de sus partes no puede pasar de aquí). */
  cap: { tokens: number; segundos: number };
}

/** La receta de un equipo, antes de juzgarla. */
export interface RecetaEquipo {
  id: string;
  nombre: string;
  miembros: Miembro[];
  modo?: ModoContexto;
  cap?: { tokens: number; segundos: number };
}

/** El veredicto del juez de equipos. */
export interface VeredictoEquipo {
  ok: boolean;
  /** El equipo (completo, con lo que faltaba rellenado). */
  equipo: Equipo | null;
  /** Los errores. */
  errores: string[];
  /** El reparto: cuánto tokens lleva cada miembro. */
  reparto: Array<{ rol: Rol; motor: string; tokens: number }>;
  /** Los tokens del equipo entero. */
  total_tokens: number;
}

/**
 * El reparto por defecto: el arquitecto se queda con la mitad y los
 * trabajadores se reparten el resto a partes iguales.
 *
 * No es capricho: el arquitecto decide (lee más), los trabajadores hacen
 * (escriben más). Un reparto escrito evita la pregunta de siempre («¿y
 * ahora quién usa el contexto?») y el reparto injusto.
 */
export function repartoPorDefecto(
  miembros: Miembro[],
  cap: { tokens: number; segundos: number }
): Miembro[] {
  if (!miembros.length) return miembros;
  const arquitecto = miembros.find((m) => m.rol === "arquitecto");
  const otros = miembros.filter((m) => m.rol !== "arquitecto");
  const mitad = Math.floor(cap.tokens / 2);
  const parte = otros.length ? Math.floor((cap.tokens - mitad) / otros.length) : 0;
  return miembros.map((m) => ({
    ...m,
    presupuesto: {
      tokens: m.rol === "arquitecto" ? mitad : parte,
      segundos: m.rol === "arquitecto" ? Math.floor(cap.segundos / 2) : Math.floor(cap.segundos / Math.max(1, otros.length)),
    },
  }));
}

/**
 * Juzga un equipo: la forma, el arquitecto, el reparto y el cap.
 *
 * Lo que no se comprueba aquí: que los motores existan (eso lo sabe la spec
 * de motores, y el compat-check lo dice) ni que el equipo sea el adecuado
 * para un trabajo (eso lo decide la persona).
 */
export function validaEquipo(x: unknown): VeredictoEquipo {
  const errores: string[] = [];
  if (typeof x !== "object" || x === null || Array.isArray(x)) {
    return { ok: false, equipo: null, errores: ["un equipo es un objeto"], reparto: [], total_tokens: 0 };
  }
  const r = x as Record<string, unknown>;

  const id = typeof r.id === "string" ? r.id : "";
  if (!/^esme\.[a-z0-9-]+\.[a-z0-9-]+$/.test(id)) {
    errores.push(`id: «${id}» no es esme.<autor>.<slug>`);
  }
  const nombre = typeof r.nombre === "string" && r.nombre.trim() ? r.nombre.trim().slice(0, 60) : "";
  if (!nombre) errores.push("nombre: falta");

  if (!Array.isArray(r.miembros) || r.miembros.length === 0) {
    errores.push("miembros: el equipo no tiene a nadie");
    return { ok: false, equipo: null, errores, reparto: [], total_tokens: 0 };
  }

  const miembros: Miembro[] = [];
  for (const [i, m] of (r.miembros as unknown[]).entries()) {
    if (typeof m !== "object" || m === null) {
      errores.push(`miembros.${i}: no es un objeto`);
      continue;
    }
    const mm = m as Record<string, unknown>;
    const rol = String(mm.rol ?? "");
    if (!(ROLES as readonly string[]).includes(rol)) {
      errores.push(`miembros.${i}.rol: «${rol}» no es un rol (valen: ${ROLES.join(", ")})`);
      continue;
    }
    if (typeof mm.motor !== "string" || !mm.motor.trim()) {
      errores.push(`miembros.${i}.motor: falta`);
    }
    if (typeof mm.encargo !== "string" || mm.encargo.trim().length < 3) {
      errores.push(`miembros.${i}.encargo: falta (qué hace este miembro)`);
    }
    const p = (mm.presupuesto ?? {}) as Record<string, unknown>;
    const tokens = Number(p.tokens);
    const segundos = Number(p.segundos);
    if (!Number.isFinite(tokens) || tokens <= 0) {
      errores.push(`miembros.${i}.presupuesto.tokens: tiene que ser un número (> 0)`);
    }
    if (!Number.isFinite(segundos) || segundos <= 0) {
      errores.push(`miembros.${i}.presupuesto.segundos: tiene que ser un número (> 0)`);
    }
    miembros.push({
      rol: rol as Rol,
      motor: String(mm.motor ?? ""),
      encargo: String(mm.encargo ?? ""),
      presupuesto: {
        tokens: Number.isFinite(tokens) ? Math.floor(tokens) : 0,
        segundos: Number.isFinite(segundos) ? Math.floor(segundos) : 0,
      },
    });
  }

  // 1. exactamente un arquitecto
  const arquitectos = miembros.filter((m) => m.rol === "arquitecto");
  if (arquitectos.length === 0) errores.push("arquitecto: el equipo no tiene ninguno");
  if (arquitectos.length > 1) errores.push(`arquitecto: hay ${arquitectos.length} (sólo uno decide)`);

  // el cap: si no viene, se calcula con el reparto por defecto
  const capBruto = (r.cap ?? {}) as Record<string, unknown>;
  let cap = {
    tokens: Number(capBruto.tokens),
    segundos: Number(capBruto.segundos),
  };
  const conCap = Number.isFinite(cap.tokens) && cap.tokens > 0;
  if (!conCap) {
    const repartido = repartoPorDefecto(miembros, {
      tokens: miembros.reduce((n, m) => n + m.presupuesto.tokens, 0),
      segundos: miembros.reduce((n, m) => n + m.presupuesto.segundos, 0),
    });
    cap = {
      tokens: repartido.reduce((n, m) => n + m.presupuesto.tokens, 0),
      segundos: repartido.reduce((n, m) => n + m.presupuesto.segundos, 0),
    };
  }

  // 2. el reparto: la suma de las partes es el total
  const total = miembros.reduce((n, m) => n + m.presupuesto.tokens, 0);
  if (total > cap.tokens) {
    errores.push(
      `presupuesto: las partes suman ${total} tokens y el cap del equipo es ${cap.tokens}`
    );
  }

  // 3. el equipo entero no pasa del cap
  if (total > cap.tokens) {
    errores.push(`cap: el equipo se pasa (${total} > ${cap.tokens})`);
  }

  const equipo: Equipo = {
    id,
    nombre,
    miembros,
    modo: (r.modo as ModoContexto) ?? "estandar",
    cap,
  };
  const reparto = miembros.map((m) => ({ rol: m.rol, motor: m.motor, tokens: m.presupuesto.tokens }));

  return { ok: errores.length === 0, equipo, errores, reparto, total_tokens: total };
}
