/**
 * Permisos del extension host: deny-all por defecto, siempre declarativos.
 * Referencia: docs/ARQUITECTURA.md §2. Laya opina; esto aplica.
 */
import type { Capability } from "../extension-host/capability.ts";

export interface PeticionPermisos {
  id: string;                       // id del módulo
  pide: Capability[];
  razon: string;
}

export type EstadoPermisos = "concedido" | "pendiente-consentimiento" | "denegado";

const CAPS_VALIDAS = new Set<string>([
  "mind:read",
  "mind:write",
  "ipc:emit",
  "fs:project",
  "net:fetch",
  "ui:render",
]);

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
