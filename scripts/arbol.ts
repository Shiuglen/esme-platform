/**
 * arbol — el árbol de tus ficheros, medido.
 *   npm run arbol [-- --ruta src] [--salto node_modules --salto dist] [--json] [--alfabeto]
 *
 * La carpeta no es una lista con sangría: es un árbol, y el peso no se
 * reparte a partes iguales. Aquí se mide (stat de verdad, como los puntos)
 * y sale el dato: cada nodo con su papa, su altura y su peso real, y la
 * rama que más pesa arriba — Así se sabe de dónde SALE el peso.
 *
 * Lo que NO se puede mirar se dice («a ciegas»), no se disimula con cero.
 * Los saltos por defecto NO existen: tú los pides (–salto .git), y ahí se
 * ven (porque los pediste tú, no es silencio).
 *
 * Referencia: docs/ARBOLES.md, estandar/arbol.spec.yaml.
 */
import { arbolFicheros, renderArbolFicheros } from "../core/ficheros.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
  };
  const saltos: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === "--salto" && process.argv[i + 1]) saltos.push(process.argv[i + 1]);
  });
  const arbol = arbolFicheros({
    ruta: arg("--ruta") ?? ".",
    ...(saltos.length ? { saltos } : {}),
    ...(process.argv.includes("--alfabeto") ? { orden: "alfabeto" as const } : {}),
  });

  if (process.argv.includes("--json")) console.log(JSON.stringify(arbol, null, 2));
  else console.log(renderArbolFicheros(arbol));
  process.exit(0);
}
