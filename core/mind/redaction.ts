/**
 * Redacción de secretos y exclusión de rutas — el escudo de `.mind`.
 * Regla inviolable de la Prueba 0 (docs/PRUEBA-0.md): se redactan secretos,
 * se excluyen datos de empresa y de terceros. Nada es opcional.
 *
 * Por qué esto existe: la mente absorbió el repo entero el 12-oct y el hallazgo
 * fue que la portable necesita reglas duras, no criterios de la Lente.
 * Referencia: docs/SYNC.md y docs/ARQUITECTURA.md §7.
 */

/** Patrones de secretos conocidos: redacción total (no se guarda el partido). */
const PATRONES_SECRETO: { nombre: string; re: RegExp }[] = [
  { nombre: "openai-sk", re: /sk-[A-Za-z0-9_-]{20,}/g },
  { nombre: "github-ghp", re: /ghp_[A-Za-z0-9]{36,}/g },
  { nombre: "aws-access-key", re: /AKIA[0-9A-Z]{16}/g },
  { nombre: "slack-xox", re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { nombre: "jwt", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g },
  {
    nombre: "pem-clave-privada",
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
];

export interface Redaccion {
  texto: string;
  hallazgos: string[]; // nombres de patrón y cuántas veces (NUNCA el contenido)
}

/** Redacta secretos: devuelve el texto con cada secreto bajo [SECRET:<tipo>]. */
export function redacta(texto: string): Redaccion {
  const hallazgos: string[] = [];
  let salida = texto;
  for (const { nombre, re } of PATRONES_SECRETO) {
    salida = salida.replace(re, () => {
      hallazgos.push(nombre);
      return `[SECRET:${nombre}]`;
    });
  }
  return { texto: salida, hallazgos };
}

/** Glob simple de exclusión con profundidad y prefijos, sin depender del shell. */
export function globARegex(g: string): RegExp {
  const escapado = g
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // escapes de regex (mantener * y /)
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escapado}$`);
}

/** ¿La ruta queda excluida del export (la lista del manifiesto de `.mind`)? */
export function excluido(ruta: string, lista: readonly string[]): boolean {
  const base = ruta.split("/").pop() as string;
  return lista.some((g) => {
    const re = globARegex(g);
    // tres modos: la ruta entera (`company/**`), el prefijo directo (`work/**`
    // también cubre lo interior) y el nombre base (`*.pem` a cualquier profundidad)
    return (
      re.test(ruta) ||
      re.test(ruta.replace(/\/.*$/, "/**")) ||
      re.test(base)
    );
  });
}

/** La lista mínima inviolable, ya vale sola si el módulo no declara más. */
export const EXCLUSION_MINIMA = [
  "work/**",
  "company/**",
  ".env*",
  "*.pem",
  "*.key",
  "*.env",
] as const;
