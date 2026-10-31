/**
 * LOS PERMISOS CON ALCANCE — lo que un paquete pide, dicho con límites.
 *
 * La v1 pedía capacidades a secas: `net:fetch` era «toda la red». Un paquete
 * que solo habla con su servidor no necesita toda la red, y si la pide, la
 * persona no puede distinguirlo de uno que manda sus datos a cualquier
 * parte. Por eso un permiso tiene ahora dos formas:
 *
 *   - la CORTA, la capacidad sola (`mind:read`, `net:fetch`): sin límite;
 *   - la LARGA, con su alcance: `{ kind: net:fetch, hosts: [api.x.com] }`.
 *
 * Cada capacidad admite un alcance o ninguno (`ALCANCES`), y el alcance se
 * compara por piezas, nunca por texto: `*.example.com` cubre
 * `a.example.com` y no cubre `evil-example.com` (con un `endsWith` de texto
 * lo cubriría, y esa sería la puerta de atrás).
 *
 * Aquí no entra zod: lo que dice si un permiso vale son funciones sueltas,
 * y su forma (`PermisoSchema`) vive en el contrato, `manifiesto.ts`. Así
 * quien compara permisos no carga el validador.
 *
 * Referencia: estandar/paquete.spec.yaml, core/extension-host/capability.ts,
 * core/modulos/rutas.ts (la misma idea, para las rutas).
 */
import { CAPABILITIES, type Capability } from "../extension-host/capability.ts";

/** Las tres clases de límite que puede llevar un permiso. */
export type Alcance = "hosts" | "paths" | "programs";

/** Qué alcance admite cada capacidad (las que no admiten ninguno, `[]`). */
export const ALCANCES: Record<Capability, readonly Alcance[]> = {
  "mind:read": [],
  "mind:write": [],
  "ipc:emit": [],
  "fs:project": ["paths"],
  "net:fetch": ["hosts"],
  "ui:render": [],
  "proc:spawn": ["programs"],
};

/** Un permiso con su límite. Sin clave de alcance, no hay límite. */
export interface PermisoConAlcance {
  kind: Capability;
  hosts?: string[];
  paths?: string[];
  programs?: string[];
}

/** Un permiso: la forma corta (sin límite) o la larga (con límite). */
export type Permiso = Capability | PermisoConAlcance;

const ALCANCES_TODOS: readonly Alcance[] = ["hosts", "paths", "programs"];

/** Un host o un patrón de hosts: `a.b.com`, `*.b.com` o `*` (todos). */
const HOST = /^(\*|(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*)$/;
/** Un host concreto (lo que llega a `permiteHost`, ya normalizado). */
const HOST_CONCRETO = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;
/** Un programa por su nombre lógico: el anfitrión decide dónde está. */
const PROGRAMA = /^[A-Za-z0-9._+-]+$/;

/**
 * Los caracteres que no se ven y mandan: los de control (un ESC escribe en
 * la terminal de quien lee) y los que dan la vuelta al texto (con uno, «txt.exe»
 * se lee «exe.txt»).
 */
export const INVISIBLES = /[\p{Cc}\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;

/** Una ruta dentro del proyecto: relativa, sin `..`, con barras `/` y sin caracteres que no se ven. */
export const rutaDentro = (r: string): boolean =>
  r.length > 0 &&
  !r.startsWith("/") &&
  !r.includes("\\") &&
  !/^[A-Za-z]:/.test(r) &&
  !INVISIBLES.test(r) &&
  !r.split("/").includes("..");

/** Los motivos por los que una pieza de un permiso no vale (los dice el esquema del contrato). */
export const MOTIVOS_PERMISO = {
  host: "un host va en minúsculas, sin esquema, sin puerto y sin ruta (a.com, *.a.com o *)",
  ruta: "una ruta del proyecto es relativa, no sale con «..» y no lleva caracteres de control",
  programa: "un programa va por su nombre (npx, node), no por su ruta",
  vacio: "un alcance vacío no deja nada: quítalo o pon algo",
} as const;

/** ¿Es un host o un patrón de hosts que un permiso puede llevar? */
export const esHost = (h: string): boolean => HOST.test(h);

/** ¿Es un programa por su nombre lógico (nunca una ruta, ni `.` ni `..`)? */
export const esPrograma = (p: string): boolean => PROGRAMA.test(p) && p !== "." && p !== "..";

/**
 * Lo que no vale del alcance de un permiso en su forma larga: que no lleve
 * ninguno (entonces es la forma corta escrita de otra manera) o que lleve
 * uno que su capacidad no admite. Vacío: vale.
 */
export function problemasDeAlcance(p: { kind: Capability } & Partial<Record<Alcance, unknown>>): Array<{ alcance?: Alcance; motivo: string }> {
  const puestos = ALCANCES_TODOS.filter((k) => p[k] !== undefined);
  if (!puestos.length) return [{ motivo: `«${p.kind}» sin alcance es «${p.kind}» sin límite: usa la forma corta` }];
  const suyo = ALCANCES[p.kind];
  return puestos
    .filter((k) => !suyo.includes(k))
    .map((k) => ({
      alcance: k,
      motivo: suyo.length
        ? `«${k}» no es un alcance de «${p.kind}» (el suyo es «${suyo.join(", ")}»)`
        : `«${p.kind}» no admite alcance: va en su forma corta`,
    }));
}

/** Cualquier permiso en su forma larga (sin clave de alcance = sin límite). */
const larga = (p: Permiso): PermisoConAlcance => (typeof p === "string" ? { kind: p } : p);

/** El alcance que lleva un permiso, o null si no tiene límite. */
const alcanceDe = (p: PermisoConAlcance): Alcance | null =>
  ALCANCES_TODOS.find((k) => p[k] !== undefined) ?? null;

/** La forma canónica: corta si no hay límite, larga con su lista si lo hay. */
const canonica = (kind: Capability, alcance: Alcance | null, valores: string[]): Permiso =>
  alcance === null ? kind : { kind, [alcance]: valores };

/**
 * ¿El patrón cubre el valor? Por piezas.
 *
 *   - hosts: `*` cubre todo; `*.d` cubre los subdominios de `d` (y los
 *     patrones más estrechos, `*.x.d`), nunca `d` mismo; un host cubre solo
 *     a sí mismo;
 *   - paths: igualdad, o `**` (todo el proyecto);
 *   - programs: igualdad.
 */
function cubreValor(alcance: Alcance, patron: string, valor: string): boolean {
  if (patron === valor) return true;
  if (alcance === "paths") return patron === "**";
  if (alcance === "programs") return false;
  if (patron === "*") return true;
  if (!patron.startsWith("*.") || valor === "*") return false;
  const dominio = patron.slice(2);
  if (valor.startsWith("*.")) {
    const otro = valor.slice(2);
    return otro === dominio || otro.endsWith(`.${dominio}`);
  }
  return valor.endsWith(`.${dominio}`);
}

/**
 * La suma de varias listas de permisos, en forma canónica.
 *
 * En el orden de la lista cerrada (`CAPABILITIES`), con cada alcance sin
 * duplicados y ordenado. Sin límite gana a con límite: si alguien pidió
 * toda la red, la suma es toda la red.
 */
export function unePermisos(...listas: Permiso[][]): Permiso[] {
  const porKind = new Map<Capability, { libre: boolean; alcance: Alcance | null; valores: Set<string> }>();
  for (const p of listas.flat()) {
    const l = larga(p);
    const a = alcanceDe(l);
    const e = porKind.get(l.kind) ?? { libre: false, alcance: null, valores: new Set<string>() };
    if (a === null) e.libre = true;
    else {
      e.alcance = a;
      for (const v of l[a] ?? []) e.valores.add(v);
    }
    porKind.set(l.kind, e);
  }
  return CAPABILITIES.filter((k) => porKind.has(k)).map((k) => {
    const e = porKind.get(k)!;
    return canonica(k, e.libre ? null : e.alcance, [...e.valores].sort());
  });
}

/**
 * Lo que `ahora` pide y `antes` no cubría: lo que la persona tiene que
 * volver a mirar. Una capacidad nueva entra entera; una conocida, solo con
 * la parte de su alcance que se sale de lo concedido.
 */
export function permisosNuevos(antes: Permiso[], ahora: Permiso[]): Permiso[] {
  const previos = unePermisos(antes).map(larga);
  const nuevos: Permiso[] = [];
  for (const p of unePermisos(ahora).map(larga)) {
    const prev = previos.find((x) => x.kind === p.kind);
    const alc = alcanceDe(p);
    if (!prev) {
      nuevos.push(canonica(p.kind, alc, alc ? (p[alc] ?? []) : []));
      continue;
    }
    const alcPrev = alcanceDe(prev);
    if (alcPrev === null) continue; // antes no había límite: lo cubre todo
    if (alc === null) {
      nuevos.push(p.kind); // de un límite a ninguno: se pide entero
      continue;
    }
    const patrones = prev[alcPrev] ?? [];
    const faltan = (p[alc] ?? []).filter((v) => !patrones.some((pat) => cubreValor(alc, pat, v)));
    if (faltan.length) nuevos.push(canonica(p.kind, alc, faltan));
  }
  return nuevos;
}

/**
 * Un host tal y como se compara: minúsculas y sin el punto final. Lo que no
 * es un host (una URL, un puerto, espacios, nada) da null.
 */
function normalizaHost(host: string): string | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  return HOST_CONCRETO.test(h) ? h : null;
}

/** ¿Estos permisos dejan hablar con este host? */
export function permiteHost(permisos: Permiso[], host: string): boolean {
  const h = normalizaHost(host);
  if (!h) return false;
  return permisos.map(larga).some((p) => {
    if (p.kind !== "net:fetch") return false;
    if (!p.hosts) return true;
    return p.hosts.some((patron) => cubreValor("hosts", patron, h));
  });
}

/** ¿Estos permisos dejan lanzar este programa (por su nombre lógico)? */
export function permitePrograma(permisos: Permiso[], programa: string): boolean {
  return permisos.map(larga).some((p) => p.kind === "proc:spawn" && (!p.programs || p.programs.includes(programa)));
}
