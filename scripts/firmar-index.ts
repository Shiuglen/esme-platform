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
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createPublicKey } from "node:crypto";
import { firmarIndex, generarPar, verificarIndex } from "../tienda/firma.ts";
import { puedePublicar } from "../tienda/claves.ts";

const raiz = resolve(import.meta.dirname, "..");
const ruta = join(raiz, "tienda", "index.json");

const indice = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;

let privPem: string;
let deQuien: string;
const env = process.env.ESME_PRIV_KEY;
if (env && existsSync(env)) {
  privPem = readFileSync(env, "utf8");
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

const firmado = firmarIndex(indice, privPem, deQuien);
const r = verificarIndex(firmado, pub);
writeFileSync(ruta, JSON.stringify(firmado, null, 2) + "\n");
console.log(`✓ índice firmado (${deQuien}), verificación local: ${r.ok ? "ok" : r.razon}`);
if (!r.ok) process.exit(1);
