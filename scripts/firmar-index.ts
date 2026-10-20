/**
 * Firma del índice de la tienda — CLI del mantenedor.
 *   ESME_PRIV_KEY=/ruta/pem npm run firma:index
 * Sin clave en el env genera una dev y la guarda en .keys/ (solo pruebas);
 * la clave de release nunca vive en el repo.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createPublicKey } from "node:crypto";
import { firmarIndex, generarPar, verificarIndex } from "../tienda/firma.ts";

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

const firmado = firmarIndex(indice, privPem, deQuien);
const pub = createPublicKey(privPem).export({ type: "spki", format: "pem" }).toString();
const r = verificarIndex(firmado, pub);
writeFileSync(ruta, JSON.stringify(firmado, null, 2) + "\n");
console.log(`✓ índice firmado (${deQuien}), verificación local: ${r.ok ? "ok" : r.razon}`);
if (!r.ok) process.exit(1);
