/**
 * EL CANDADO — lo que se resolvió y lo que la persona consintió, escrito.
 *
 * Una plantilla fija cada paquete por su huella; el candado guarda el
 * resultado de resolverla entera (qué paquetes, en qué versión, con qué
 * huella y qué permisos pidió cada uno) para que la próxima vez se compare
 * con lo de ahora: si algo cambia, se vuelve a pedir permiso.
 *
 *   - se vuelve a pedir si hay un paquete NUEVO, una HUELLA cambiada (aunque
 *     pida los mismos permisos: unos bytes nuevos con los permisos de antes
 *     son justo lo que haría una actualización envenenada) o un PERMISO nuevo;
 *   - quitar no lo pide: lo que se va ya no puede nada;
 *   - los permisos se comparan paquete a paquete: que otro ya hablara con
 *     un host no le da ese host a uno que antes no lo pedía. Los de la raíz,
 *     que el candado no guarda aparte, se comparan con la suma;
 *   - un candado roto, ajeno (de otra plantilla) o que no está equivale a
 *     «nada consentido»: equivocarse aquí es preguntar de más, nunca de menos.
 *
 * Se escribe siempre igual (los paquetes por id, las claves en su orden,
 * dos espacios y un salto de línea al final), para que un diff del candado
 * diga solo lo que cambió, y sin quedarse a medias (`core/escribe.ts`).
 * Su forma (`LockSchema`) es contrato y vive en `manifiesto.ts`.
 *
 * Referencia: estandar/paquete.spec.yaml (sección `lock`), core/paquetes/resolver.ts.
 */
import { readFileSync } from "node:fs";
import { escribeAtomico } from "../escribe.ts";
import { LockSchema } from "./manifiesto.ts";
import { permisosNuevos, unePermisos, type Permiso } from "./permisos.ts";

/** Las claves de arriba del todo de un candado. */
export const CLAVES_LOCK = ["lock_version", "raiz", "paquetes", "permisos"] as const;

/** Las claves de cada paquete del candado. */
export const CLAVES_ENTRADA_LOCK = ["id", "version", "sha256", "permisos"] as const;

/** Un paquete del candado: cuál, en qué versión, con qué huella y qué pidió. */
export interface EntradaLock {
  id: string;
  version: string;
  sha256: string;
  permisos: Permiso[];
}

/** El candado de una plantilla. */
export interface Lock {
  lock_version: 1;
  raiz: { id: string; version: string; sha256?: string };
  paquetes: EntradaLock[];
  /** La suma: los de la raíz y los de todos sus paquetes. */
  permisos: Permiso[];
}

/** Lo que cambió entre dos candados, y si hay que volver a preguntar. */
export interface CambiosLock {
  nuevos: string[];
  quitados: string[];
  huellas: { id: string; antes: string; despues: string }[];
  permisosNuevos: Permiso[];
  pideConsentimiento: boolean;
}

/** Por id, por unidades de código: el mismo orden en cualquier máquina (sin el idioma de por medio). */
const porId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** El candado en su forma de siempre: paquetes por id y las claves en el orden de la spec. */
export function canonicoLock(lock: Lock): Lock {
  return {
    lock_version: lock.lock_version,
    raiz: {
      id: lock.raiz.id,
      version: lock.raiz.version,
      ...(lock.raiz.sha256 !== undefined ? { sha256: lock.raiz.sha256 } : {}),
    },
    paquetes: [...lock.paquetes]
      .sort(porId)
      .map((p) => ({ id: p.id, version: p.version, sha256: p.sha256, permisos: p.permisos })),
    permisos: lock.permisos,
  };
}

/** Escribe el candado (atómico). Uno roto no se escribe: lanza. */
export function escribeLock(ruta: string, lock: Lock): void {
  const r = LockSchema.safeParse(lock);
  if (!r.success) {
    const motivo = r.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ");
    throw new Error(`el candado no se escribe, está roto: ${motivo}`);
  }
  escribeAtomico(ruta, `${JSON.stringify(canonicoLock(lock), null, 2)}\n`);
}

/** Lee el candado. Roto o ausente: null («nada consentido»). */
export function leeLock(ruta: string): Lock | null {
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return null;
  }
  const r = LockSchema.safeParse(json);
  return r.success ? canonicoLock(r.data as Lock) : null;
}

/**
 * Lo que cambió desde el candado de antes (null: no había, o estaba roto).
 * Un candado de otra plantilla no cuenta: es como si no hubiera.
 */
export function cambiosDesde(antes: Lock | null, ahora: Lock): CambiosLock {
  const base = antes && antes.raiz.id === ahora.raiz.id ? antes : null;
  const previos = new Map((base?.paquetes ?? []).map((p) => [p.id, p]));
  const actuales = new Set(ahora.paquetes.map((p) => p.id));

  const nuevos = ahora.paquetes.filter((p) => !previos.has(p.id)).map((p) => p.id).sort();
  const quitados = [...previos.keys()].filter((id) => !actuales.has(id)).sort();
  const huellas = [...ahora.paquetes]
    .sort(porId)
    .flatMap((p) => {
      const prev = previos.get(p.id);
      return prev && prev.sha256 !== p.sha256 ? [{ id: p.id, antes: prev.sha256, despues: p.sha256 }] : [];
    });
  const permisos = unePermisos(
    permisosNuevos(base?.permisos ?? [], ahora.permisos),
    ...ahora.paquetes.map((p) => permisosNuevos(previos.get(p.id)?.permisos ?? [], p.permisos))
  );

  return {
    nuevos,
    quitados,
    huellas,
    permisosNuevos: permisos,
    pideConsentimiento: base === null || nuevos.length > 0 || huellas.length > 0 || permisos.length > 0,
  };
}
