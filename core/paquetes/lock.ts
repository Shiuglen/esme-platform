/**
 * EL CANDADO — lo que se resolvió y lo que la persona consintió, escrito.
 *
 * Una plantilla fija cada paquete por su huella; el candado guarda el
 * resultado de resolverla entera (qué paquetes, en qué versión, con qué
 * huella y qué permisos pidió cada uno) para que la próxima vez se compare
 * con lo de ahora: si algo cambia, se vuelve a pedir permiso.
 *
 * Referencia: estandar/paquete.spec.yaml (sección `lock`), core/paquetes/resolver.ts.
 */

/** Las claves de arriba del todo de un candado. */
export const CLAVES_LOCK = ["lock_version", "raiz", "paquetes", "permisos"] as const;

/** Las claves de cada paquete del candado. */
export const CLAVES_ENTRADA_LOCK = ["id", "version", "sha256", "permisos"] as const;
