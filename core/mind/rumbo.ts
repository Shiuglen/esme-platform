/**
 * El rumbo: para qué trabaja la mente. Pilares (las estrellas fijas) y
 * objetivos (lo que va cambiando).
 *
 * ESPEJO de `daimon/rumbo.py` (el Python es el dueño del dato). Entre dos
 * lenguas solo sobrevive lo que está escrito: las reglas de este fichero son
 * las de aquel, y los bytes que sale de aquí son los mismos que salen de
 * allí (mismo orden de claves, mismo `indent=1`, mismo salto final).
 *
 * Dos papeles distintos, y no se mezclan:
 *   - `normalizaRumbo`: el que ESCRIBE. Lo que no vale se cae, lo demás se
 *     queda, y lo que queda es sano por construcción.
 *   - `validaRumbo`: el que VERIFICA. Si el rumbo está, tiene que valer; si
 *     no vale, no vale la mente entera. Un verificador no perdona.
 */

import { redacta } from "./redaction.ts";

export const RUMBO_VERSION = 1;
export const MAX_PILARES = 7;
export const MAX_OBJETIVOS = 60;
export const ESTADOS_RUMBO = ["activo", "hecho", "pausado"] as const;

export type EstadoRumbo = (typeof ESTADOS_RUMBO)[number];

export interface Pilar {
  id: string;
  texto: string;
  creado: number;
}

export interface Objetivo {
  id: string;
  texto: string;
  estado: EstadoRumbo;
  creado: number;
  cerrado: number | null;
  pilar: string | null;
}

export interface Rumbo {
  version: typeof RUMBO_VERSION;
  pilares: Pilar[];
  objetivos: Objetivo[];
}

/** El texto de un rumbo: espacios colapsados y 200 caracteres de tope. */
export function textoRumbo(x: unknown, maximo = 200): string {
  const bruto = x ? String(x) : ""; // como el `x or ""` de Python
  if (!bruto) return "";
  return bruto.trim().split(/\s+/).filter(Boolean).join(" ").slice(0, maximo);
}

/** El id que se inventa cuando no viene: del texto, con la marca del tiempo. */
export function idRumbo(texto: string, creado: number): string {
  const base =
    textoRumbo(texto, 40)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28) || "x";
  const marca = ((creado % 100000) + 100000) % 100000; // el módulo de Python da positivo
  return `${base}-${marca}`;
}

export function rumboVacio(): Rumbo {
  return { version: RUMBO_VERSION, pilares: [], objetivos: [] };
}

const entero = (x: unknown): number =>
  typeof x === "number" && Number.isInteger(x) ? x : 0;

/**
 * Normaliza un rumbo de cualquier forma y devuelve uno sano: lo que no vale
 * se cae, lo demás se queda. Espejo exacto de `normaliza` en Python.
 */
export function normalizaRumbo(bruto: unknown): Rumbo {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return rumboVacio();
  const b = bruto as Record<string, unknown>;

  const pilares: Pilar[] = [];
  const vistosPilar = new Set<string>();
  const brutosPilares = Array.isArray(b.pilares) ? b.pilares : [];
  for (const p of brutosPilares.slice(0, MAX_PILARES)) {
    if (!p || typeof p !== "object" || Array.isArray(p)) continue;
    const x = p as Record<string, unknown>;
    const texto = textoRumbo(x.texto);
    if (!texto || vistosPilar.has(texto)) continue;
    vistosPilar.add(texto);
    const creado = entero(x.creado);
    const id = x.id ? String(x.id) : idRumbo(texto, creado);
    pilares.push({ id, texto, creado });
  }
  const ids = new Set(pilares.map((p) => p.id));

  const objetivos: Objetivo[] = [];
  const vistosObjetivo = new Set<string>();
  const brutosObjetivos = Array.isArray(b.objetivos) ? b.objetivos : [];
  for (const o of brutosObjetivos.slice(0, MAX_OBJETIVOS)) {
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    const x = o as Record<string, unknown>;
    const texto = textoRumbo(x.texto);
    if (!texto || vistosObjetivo.has(texto)) continue;
    vistosObjetivo.add(texto);
    const creado = entero(x.creado);
    const estado = (ESTADOS_RUMBO as readonly string[]).includes(String(x.estado))
      ? (String(x.estado) as EstadoRumbo)
      : "activo";
    const pilar = typeof x.pilar === "string" && ids.has(x.pilar) ? x.pilar : null;
    const cerrado = typeof x.cerrado === "number" && Number.isInteger(x.cerrado) ? x.cerrado : null;
    const id = x.id ? String(x.id) : idRumbo(texto, creado);
    objetivos.push({ id, texto, estado, creado, cerrado, pilar });
  }
  return { version: RUMBO_VERSION, pilares, objetivos };
}

/**
 * Verifica un rumbo SIN perdonar: si está, tiene que valer. Devuelve los
 * errores (vacío = vale). El que escribe normaliza antes; el que verifica
 * exige el contrato, porque su trabajo es no dejar pasar una mente rota.
 */
export function validaRumbo(bruto: unknown): string[] {
  const errores: string[] = [];
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
    return ["rumbo.json: tiene que ser un objeto con pilares[] y objetivos[]"];
  }
  const b = bruto as Record<string, unknown>;
  const pilares = b.pilares;
  const objetivos = b.objetivos;
  if (!Array.isArray(pilares) || !Array.isArray(objetivos)) {
    return ["rumbo.json: tiene que tener pilares[] y objetivos[]"];
  }
  if (pilares.length > MAX_PILARES)
    errores.push(`rumbo.json: ${pilares.length} pilares (el tope son ${MAX_PILARES})`);
  if (objetivos.length > MAX_OBJETIVOS)
    errores.push(`rumbo.json: ${objetivos.length} objetivos (el tope son ${MAX_OBJETIVOS})`);
  for (const p of pilares) {
    const x = (p ?? {}) as Record<string, unknown>;
    if (typeof x.id !== "string" || !x.id.trim() || typeof x.texto !== "string" || !x.texto.trim())
      errores.push("rumbo.json: un pilar sin id o sin texto");
  }
  for (const o of objetivos) {
    const x = (o ?? {}) as Record<string, unknown>;
    if (typeof x.id !== "string" || !x.id.trim() || typeof x.texto !== "string" || !x.texto.trim())
      errores.push("rumbo.json: un objetivo sin id o sin texto");
    else if (!(ESTADOS_RUMBO as readonly string[]).includes(String(x.estado)))
      errores.push(`rumbo.json: el objetivo «${x.texto}» tiene un estado raro`);
  }
  return errores;
}

/**
 * Los bytes del rumbo: los mismos que escribe Python
 * (`json.dumps(sano, ensure_ascii=False, indent=1) + "\n"`). El orden de las
 * claves es parte del contrato.
 */
export function rumboAPng(rumbo: Rumbo): string {
  return JSON.stringify(rumbo, null, 1) + "\n";
}

/**
 * Redacta el rumbo antes de que salga del equipo: ningún texto se exporta sin
 * pasar por la redacción (misma regla que los recuerdos). Redacta primero y
 * normaliza después, para que el tope de 200 caracteres caiga sobre el texto
 * ya limpio.
 */
export function redactaRumbo(bruto: unknown, cuenta?: (secretos: number) => void): Rumbo {
  const limpio = (texto: unknown): string => {
    const r = redacta(typeof texto === "string" ? texto : String(texto ?? ""));
    if (r.hallazgos.length) cuenta?.(r.hallazgos.length);
    return r.texto;
  };
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const pilares = Array.isArray(b.pilares)
    ? b.pilares.map((p) => ({ ...(p as Record<string, unknown>), texto: limpio((p as Record<string, unknown>)?.texto) }))
    : [];
  const objetivos = Array.isArray(b.objetivos)
    ? b.objetivos.map((o) => ({ ...(o as Record<string, unknown>), texto: limpio((o as Record<string, unknown>)?.texto) }))
    : [];
  return normalizaRumbo({ ...b, pilares, objetivos });
}
