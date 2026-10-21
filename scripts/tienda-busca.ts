/**
 * tienda — lo que hay en la tienda, y lo que mejor mide.
 *   npm run tienda -- busca [texto] [--top] [--json]
 *
 * Buscar en la tienda es leer el índice firmado: los números que escribió el
 * juez son el orden (el que más recall mejora, primero; y los de herramienta,
 * por los tokens que gastan).
 *
 * Referencia: tienda/busca.ts.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { buscaEnTienda, renderBusqueda, type IndiceTienda } from "../tienda/busca.ts";

const raizKit = resolve(import.meta.dirname, "..");
const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
};
const tiene = (flag: string): boolean => process.argv.includes(flag);

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [comando, ...resto] = process.argv.slice(2);
  if (comando !== "busca") {
    console.error("uso: tienda busca [texto] [--top] [--json]");
    process.exit(2);
  }
  const texto = resto.find((r) => !r.startsWith("--")) ?? "";
  const rutaIndice = resolve(arg("--indice") ?? join(raizKit, "tienda", "index.json"));
  if (!existsSync(rutaIndice)) {
    console.error(`no encuentro el índice: ${rutaIndice}`);
    process.exit(1);
  }
  const indice = JSON.parse(readFileSync(rutaIndice, "utf8")) as IndiceTienda;
  const lista = buscaEnTienda(indice, texto, {
    soloEntran: tiene("--top"),
    ...(tiene("--top") ? { limite: 10 } : {}),
  });
  if (tiene("--json")) console.log(JSON.stringify(lista, null, 2));
  else console.log(renderBusqueda(lista));
  process.exit(0);
}
