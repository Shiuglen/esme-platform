/**
 * Permisos del extension host: deny-all por defecto, siempre declarativos.
 * Referencia: docs/ARQUITECTURA.md §2. Laya opina; esto aplica.
 */
import { CAPABILITIES, type Capability } from "../extension-host/capability.ts";

export interface PeticionPermisos {
  id: string;                       // id del módulo
  pide: Capability[];
  razon: string;
}

export type EstadoPermisos = "concedido" | "pendiente-consentimiento" | "denegado";

/**
 * La lista válida es LA MISMA que la del manifiesto: una sola verdad.
 * (Antes estaba duplicada aquí, y una capability nueva llegaba a la puerta
 * sin llegar a la matriz.)
 */
const CAPS_VALIDAS = new Set<string>(CAPABILITIES);

/**
 * La matriz: lo que el módulo DECLARA se puede conceder; lo que NO declaró,
 * nunca. Deny-all cuando no se pidió nada.
 */
export function estadoPeticion(
  declarados: readonly string[],
  pide: string
): EstadoPermisos {
  if (!CAPS_VALIDAS.has(pide)) return "denegado";          // capacidad inexistente
  if (declarados.includes(pide)) return "pendiente-consentimiento";
  return "denegado";
}

export function permisosEfectivosPreflight(m: {
  permissions: readonly string[];
}, uso: readonly string[]): { ok: true } | { ok: false; ilegales: string[] } {
  const ilegales = uso.filter((c) => !m.permissions.includes(c));
  return ilegales.length ? { ok: false, ilegales } : { ok: true };
}
