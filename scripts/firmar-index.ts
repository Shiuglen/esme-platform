/**
 * Firma del índice de la tienda — CLI del mantenedor.
 *   ESME_PRIV_KEY=/ruta/pem npm run firma:index
 * Sin clave en el env genera una dev y la guarda en .keys/ (solo pruebas);
 * la clave de release nunca vive en el repo.
 *
 * Y una regla dura: solo se firma con una llave que la raíz congelada avale
 * (ella misma o su estirpe). Firmar con una llave sin derecho dejaría el
 * índice publicado en estado de "no confiable" para todo el mundo.
 */
import { escribeAtomico, escribeJsonAtomico } from "../core/escribe.ts";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createPublicKey } from "node:crypto";
import { firmaIndice, generarPar, verificarIndex } from "../tienda/firma.ts";
import { llaveDelEntorno, puedePublicar } from "../tienda/claves.ts";
import { huellaDePub } from "../tienda/rotacion.ts";

const raiz = resolve(import.meta.dirname, "..");
const ruta = join(raiz, "tienda", "index.json");

const indice = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;

let privPem: string;
let deQuien: string;
// Si el entorno apunta a una llave, ESA es la que firma. Si apunta a algo
// que no es una llave, se para aquí: caer de lado a la dev key firmaría con
// una llave que nadie avala (y la tienda quedaría sin confianza).
if (process.env.ESME_PRIV_KEY) {
  const llave = llaveDelEntorno();
  if (!llave) {
    console.error("✗ el entorno apunta a una llave que no sirve — no firmo nada");
    process.exit(1);
  }
  privPem = llave.priv;
  deQuien = "clave del mantenedor";
} else {
  mkdirSync(join(raiz, ".keys"), { recursive: true });
  const outFile = join(raiz, ".keys", "index-dev.pem");
  if (!existsSync(outFile)) {
    writeFileSync(outFile, generarPar().priv, { mode: 0o600 });
    console.log("⚠ clave dev generada en .keys/index-dev.pem (no es la de release)");
  }
  privPem = readFileSync(outFile, "utf8");
  deQuien = "clave dev";
}

const pub = createPublicKey(privPem).export({ type: "spki", format: "pem" }).toString();
const derecho = puedePublicar({ pub }, raiz);
if (!derecho.ok) {
  console.error(`✗ NO FIRMO — ${derecho.razon}`);
  console.error("  el índice publicado se queda como está (no lo dejo sin confianza).");
  process.exit(1);
}

const firmado = firmaIndice(indice, privPem);
const r = verificarIndex(firmado, pub);
escribeJsonAtomico(ruta, firmado);
console.log(`✓ índice firmado (${deQuien} · ${huellaDePub(pub)}), verificación local: ${r.ok ? "ok" : r.razon}`);
if (!r.ok) process.exit(1);
