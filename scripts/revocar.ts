// revocar — mata una clave para todo el mundo:
//   npm run revocar 62304bfd9e441c73 "comprometida por demostración"
// La anotación queda firmada por la clave mandante; desde ahí el índice
// firmado por esa huella ya NO es confiable (verificar.ts lo grita).
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createPublicKey, createHash } from "node:crypto";
import { anotarRevocacion, estaRevocada } from "../tienda/revocacion.ts";

const raiz = resolve(import.meta.dirname, "..");
const [huella, motivo = "sin motivo"] = process.argv.slice(2);
if (!huella) {
  console.error("uso: npm run revocar <huella-de-16-hex> [motivo]");
  process.exit(1);
}

if (!existsSync(join(raiz, ".keys", "index-dev.pem"))) {
  console.error("no hay clave mandante (.keys/index-dev.pem) para firmar la anotación");
  process.exit(1);
}
const priv = readFileSync(join(raiz, ".keys", "index-dev.pem"), "utf8");
const anotada = anotarRevocacion(huella, motivo, priv, join(raiz, "tienda", "revocaciones.json"));
console.log(`revocada: ${anotada.huella} — ${anotada.motivo} (${anotada.fecha})`);

const pubRaiz = createPublicKey(priv).export({ type: "spki", format: "pem" }).toString();
const propiaHuella = createHash("sha256").update(pubRaiz).digest("hex").slice(0, 16);
if (estaRevocada(propiaHuella, join(raiz, "tienda", "revocaciones.json"), pubRaiz)) {
  console.log(`aviso    : acabas de revocar TU clave mandante (${propiaHuella}) —`);
  console.log("           la tienda queda sin confianza hasta que se rote la clave y se re-firme todo.");
}
console.log("verifica ahora: npm run verificar — debe caer con causa trazada.");
