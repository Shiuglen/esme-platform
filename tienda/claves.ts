// claves.ts — la llave con la que firma esta copia del kit.
// Regla (docs/TIENDA.md): la llave de release NUNCA vive en el repo. En local, la dev key
// nace sola si falta y se queda en .keys/ (ignorada por git). Quien quiera verificar
// necesita el PEM público, que sí puede ir en el repo.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, createPublicKey } from "node:crypto";
import { generarPar } from "./firma.ts";

const raiz = resolve(import.meta.dirname, "..");

export interface ClaveFirma {
  priv: string; // PEM pkcs8 (nunca sale del repo ni del disco del usuario)
  pub: string; // PEM spki (puede ir en el repo)
  huella: string; // 16 hex: la raíz de confianza
  ruta: string;
}

/** El PEM público de una llave privada. */
export function pubDe(privPem: string): string {
  return createPublicKey(privPem).export({ type: "spki", format: "pem" }).toString();
}

/** La huella de la raíz: 16 hex del sha256 del PEM público. */
export function huellaDe(pubPem: string): string {
  return createHash("sha256").update(pubPem).digest("hex").slice(0, 16);
}

/**
 * La llave de firma de esta copia: la de release si el entorno la apunta, si no la dev
 * key local (que nace aquí mismo si no existe). Misma cuenta de huella que firma.ts.
 */
export function claveDeFirma(): ClaveFirma {
  const env = process.env.ESME_PRIV_KEY;
  if (env && existsSync(env)) {
    const priv = readFileSync(env, "utf8");
    const pub = pubDe(priv);
    return { priv, pub, huella: huellaDe(pub), ruta: env };
  }
  const ruta = join(raiz, ".keys", "index-dev.pem");
  if (existsSync(ruta)) {
    const priv = readFileSync(ruta, "utf8");
    const pub = pubDe(priv);
    return { priv, pub, huella: huellaDe(pub), ruta };
  }
  const par = generarPar();
  mkdirSync(join(raiz, ".keys"), { recursive: true });
  writeFileSync(ruta, par.priv, { mode: 0o600 });
  return { priv: par.priv, pub: par.pub, huella: par.huella, ruta };
}
