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
  /** El id del miembro (único en el equipo: las dependencias apuntan aquí). */
  id: string;
  /** El rol (cerrado). */
  rol: Rol;
  /** El motor que usa. */
  motor: string;
  /** Lo que hace (el encargo). */
  encargo: string;
  /** Su parte del presupuesto. */
  presupuesto: { tokens: number; segundos: number };
  /** Los ficheros que toca (si los toca): dos miembros en el mismo fichero es un conflicto. */
  ficheros?: string[];
  /** ¿Sólo lee? (un crítico sólo lee). */
  solo_lectura?: boolean;
  /** De qué miembros depende (por id). */
  depende_de?: string[];
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
  /**
   * Cuántos miembros trabajan A LA VEZ.
   *
   * Este es el guardián de la RAM: treinta agentes en paralelo son treinta
   * bocas comiendo memoria a la vez. El número lo pone la persona (y 0
   * significa «los que quepan», como en PandaCode).
   */
  max_paralelo: number;
  /** Cuántas rondas puede dar el equipo (el bucle tiene que acabar). */
  max_rondas: number;
  /** Cuántas tareas puede repartir el arquitecto (el bucle también). */
  max_asignaciones: number;
}

/** La receta de un equipo, antes de juzgarla. */
export interface RecetaEquipo {
  id: string;
  nombre: string;
  miembros: Miembro[];
  modo?: ModoContexto;
  cap?: { tokens: number; segundos: number };
  max_paralelo?: number;
  max_rondas?: number;
  max_asignaciones?: number;
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
 * Busca un ciclo en las dependencias de los miembros.
 *
 * Devuelve el ciclo (o null). Un ciclo de dependencias es un equipo que se
 * espera a sí mismo para siempre: el bucle no acaba nunca.
 */
export function buscaCiclo(miembros: Miembro[]): string[] | null {
  const ids = new Set(miembros.map((m) => m.id));
  const depende = new Map<string, string[]>();
  for (const m of miembros) {
    depende.set(
      m.id,
      (m.depende_de ?? []).filter((d) => ids.has(d))
    );
  }
  const viendo = new Set<string>();
  const hecho = new Set<string>();
  const camino: string[] = [];

  const visita = (n: string): string[] | null => {
    if (hecho.has(n)) return null;
    if (viendo.has(n)) return [...camino.slice(camino.indexOf(n)), n];
    viendo.add(n);
    camino.push(n);
    for (const d of depende.get(n) ?? []) {
      const c = visita(d);
      if (c) return c;
    }
    camino.pop();
    viendo.delete(n);
    hecho.add(n);
    return null;
  };

  for (const n of depende.keys()) {
    const c = visita(n);
    if (c) return c;
  }
  return null;
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
  const vistos = new Set<string>();
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
    const id = typeof mm.id === "string" && mm.id.trim() ? mm.id.trim() : `${rol}-${i}`;
    if (vistos.has(id)) {
      errores.push(`miembros.${i}.id: «${id}» está repetido (las dependencias apuntan por id)`);
    }
    vistos.add(id);
    miembros.push({
      id,
      rol: rol as Rol,
      motor: String(mm.motor ?? ""),
      encargo: String(mm.encargo ?? ""),
      presupuesto: {
        tokens: Number.isFinite(tokens) ? Math.floor(tokens) : 0,
        segundos: Number.isFinite(segundos) ? Math.floor(segundos) : 0,
      },
      ...(Array.isArray(mm.ficheros)
        ? { ficheros: mm.ficheros.filter((f): f is string => typeof f === "string") }
        : {}),
      ...(typeof mm.solo_lectura === "boolean" ? { solo_lectura: mm.solo_lectura } : {}),
      ...(Array.isArray(mm.depende_de)
        ? { depende_de: mm.depende_de.filter((d): d is string => typeof d === "string") }
        : {}),
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

  // 4. el paralelismo: cuántos a la vez (el guardián de la RAM)
  const maxParalelo = Number(r.max_paralelo);
  const maxParaleloOk = Number.isFinite(maxParalelo) && maxParalelo >= 0;
  if (!maxParaleloOk) errores.push("max_paralelo: tiene que ser un número (0 = los que quepan)");
  if (maxParaleloOk && maxParalelo > 0 && maxParalelo > miembros.length) {
    errores.push(
      `max_paralelo: ${maxParalelo} y sólo hay ${miembros.length} miembros (no se puede paralelizar más de los que hay)`
    );
  }

  // 5. los rondas y asignaciones: el bucle tiene que acabar
  const maxRondas = Number(r.max_rondas ?? 3);
  const maxAsignaciones = Number(r.max_asignaciones ?? miembros.length * 2);
  if (!Number.isFinite(maxRondas) || maxRondas <= 0) {
    errores.push("max_rondas: tiene que ser un número (> 0): el bucle tiene que acabar");
  }
  if (!Number.isFinite(maxAsignaciones) || maxAsignaciones <= 0) {
    errores.push("max_asignaciones: tiene que ser un número (> 0)");
  }

  // 6. el conflicto de ficheros: dos miembros en el mismo fichero
  const porFichero = new Map<string, string[]>();
  for (const m of miembros) {
    for (const f of m.ficheros ?? []) {
      porFichero.set(f, [...(porFichero.get(f) ?? []), m.id]);
    }
  }
  for (const [fichero, duenos] of porFichero) {
    if (duenos.length > 1) {
      errores.push(
        `ficheros: «${fichero}» lo tocan ${duenos.length} miembros (${duenos.join(", ")}) — dos agentes en el mismo fichero es un conflicto`
      );
    }
  }

  // 7. las dependencias: sin ciclos
  const ciclo = buscaCiclo(miembros);
  if (ciclo) {
    errores.push(`dependencias: hay un ciclo (${ciclo.join(" → ")})`);
  }

  const equipo: Equipo = {
    id,
    nombre,
    miembros,
    modo: (r.modo as ModoContexto) ?? "estandar",
    cap,
    max_paralelo: maxParaleloOk ? Math.floor(maxParalelo) : 1,
    max_rondas: Number.isFinite(maxRondas) ? Math.floor(maxRondas) : 3,
    max_asignaciones: Number.isFinite(maxAsignaciones) ? Math.floor(maxAsignaciones) : miembros.length * 2,
  };
  const reparto = miembros.map((m) => ({ rol: m.rol, motor: m.motor, tokens: m.presupuesto.tokens }));

  return { ok: errores.length === 0, equipo, errores, reparto, total_tokens: total };
}
