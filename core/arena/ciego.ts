/**
 * EL CIEGO — el compromiso, la sal y la huella.
 *
 * La parte difícil de una cata a ciegas no es esconder los nombres: es que el
 * que organiza la carrera no pueda hacer trampas DESPUÉS de ver los
 * resultados. Si puede, la cata no mide nada: mide suLuck.
 *
 * La solución es el compromiso y la revelación, los dos tricks de las subastas
 * ciegas buenas:
 *
 *   1. **ANTES de la carrera**, el organizador elige una SAL al azar y
 *      publica el COMPROMISO: el hash del mapa (etiqueta → motor) con esa
 *      sal dentro. Publicar un hash no dice nada del mapa (no se puede
 *      deshacer), pero ata el mapa a la sal.
 *   2. **La carrera ocurre** y la persona elige sin ver nombres.
 *   3. **DESPUÉS del veredicto**, el organizador publica la SAL. Con la sal
 *      se rehace el hash del mapa: si el mapa se cambió por el camino, el
 *      hash no cuadra y la arena queda CONTAMINADA.
 *
 * Y por encima, la HUELLA: el hash de toda la parte ciega. Esa huella se
 * entrega a la persona ANTES de revelar, así que también se puede comprobar
 * que las mediciones no se cambiaron a posteriori.
 *
 * Lo que aquí NO se hace (y por qué): no se guarda nada de más. La parte
 * ciega no lleva ni motor, ni modelo, ni coste: eso lo decide el documento
 * (core/arena/arena.ts), no la vista.
 *
 * Referencia: estandar/arena.spec.yaml, core/arena/arena.ts, docs/ARENA.md.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** El algoritmo del compromiso. */
export const ALGORITMO_COMPROMISO = "sha256";

/** Las etiquetas de una carrera: A, B, C… (hasta 26 participantes). */
export const ETIQUETAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * El JSON canónico: las claves siempre en el mismo orden.
 *
 * Sin esto, el hash dependería de en qué orden se construyó el objeto, y el
 * compromiso no serviría para nada (dos procesos iguales darían dos hashes).
 */
export function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  const obj = valor as Record<string, unknown>;
  const claves = Object.keys(obj).sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico(obj[k])}`).join(",")}}`;
}

/** El hash de algo, en hexadecimal. */
export function huellaDe(valor: unknown): string {
  return createHash(ALGORITMO_COMPROMISO).update(canonico(valor)).digest("hex");
}

/** Una sal nueva: 32 bytes de azar. */
export function salAleatoria(): string {
  return randomBytes(32).toString("hex");
}

/** Las primeras `n` etiquetas (A, B, C…). */
export function etiquetasDe(n: number): string[] {
  if (n <= 0) return [];
  if (n > ETIQUETAS.length) {
    throw new Error(`una carrera no admite más de ${ETIQUETAS.length} participantes`);
  }
  return ETIQUETAS.slice(0, n).split("");
}

/**
 * La huella de un participante con la sal: el número que ordena el reparto.
 *
 * No es un número aleatorio: es la sal mezclada con el nombre del motor. Por
 * eso el reparto es IMPREVISIBLE sin la sal (nadie puede adivinar qué
 * etiqueta le toca) y REPETIBLE con ella (la misma carrera, aunque se repita,
 * reparte igual).
 */
function huellaDeParticipante(motor: string, sal: string): string {
  return createHash(ALGORITMO_COMPROMISO).update(`${sal}|${motor}`).digest("hex");
}

/**
 * EL REPARTO CIEGO: qué etiqueta le toca a cada participante.
 *
 * El reparto se hace por el hash (no por el orden de llegada): así el
 * etiqueta «A» no delata nada del motor que la lleva (ni su precio, ni su
 * nombre, ni su velocidad: el reparto no mira las medidas).
 *
 * Devuelve el mapa etiqueta → motor, que es el secreto de la carrera.
 */
export function reparteCiego(motores: readonly string[], sal: string): Record<string, string> {
  if (new Set(motores).size !== motores.length) {
    throw new Error("los participantes de una carrera tienen que ser distintos");
  }
  const orden = [...motores].sort((a, b) => {
    const ha = huellaDeParticipante(a, sal);
    const hb = huellaDeParticipante(b, sal);
    return ha < hb ? -1 : ha > hb ? 1 : 0;
  });
  const etiquetas = etiquetasDe(orden.length);
  const mapa: Record<string, string> = {};
  orden.forEach((motor, i) => {
    mapa[etiquetas[i]] = motor;
  });
  return mapa;
}

/** El compromiso: el hash del mapa con su sal. */
export function compromisoDe(mapa: Record<string, string>, sal: string): string {
  return huellaDe({ mapa, sal });
}

/**
 * La huella de la parte ciega: lo que se entrega ANTES de la revelación.
 *
 * Si al revelar la huella no coincide con la que se entregó, alguien cambió
 * las mediciones (o las etiquetas) después de que la persona eligiera.
 */
export function huellaCiega(ciega: unknown): string {
  return huellaDe(ciega);
}

/** Dos huellas son la misma (sin que el tiempo de la comparación la delate). */
export function mismaHuella(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
