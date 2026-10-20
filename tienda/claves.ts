// claves.ts — la llave con la que firma esta copia del kit.
// Regla (docs/TIENDA.md): la llave de release NUNCA vive en el repo. En local, la dev key
// nace sola si falta y se queda en .keys/ (ignorada por git). Quien quiera verificar
// necesita el PEM público, que sí puede ir en el repo.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, createPublicKey } from "node:crypto";
import { generarPar } from "./firma.ts";
import { leeRaiz } from "./raiz.ts";
import { huellaDePub, leerLedger, llevaDeRaiz, rutaRotaciones } from "./rotacion.ts";

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

/**
 * ¿Esta llave puede firmar la tienda? Solo si la raíz congelada la avala:
 * ella misma o su estirpe (la cadena de rotaciones).
 *
 * Por qué: una llave nueva, sin certificado, firmaría un índice que NADIE
 * podría verificar (la raíz no la avala) y dejaría la tienda en estado de
 * "no confiable" sin que nadie lo pidiera. Publicar sin derecho no es
 * publicar: es romper la confianza en silencio.
 */
export function puedePublicar(
  clave: { pub: string; huella?: string },
  raizRepo: string = raiz
): { ok: boolean; razon: string } {
  const pubRaiz = leeRaiz(raizRepo);
  if (!pubRaiz)
    return { ok: true, razon: "el repo no trae raíz congelada: esta llave es la raíz" };
  const huellaRaiz = huellaDePub(pubRaiz);
  const huella = huellaDePub(clave.pub);
  if (huella === huellaRaiz) return { ok: true, razon: "esta llave es la raíz" };
  const paseo = llevaDeRaiz(
    huellaRaiz,
    huella,
    leerLedger(rutaRotaciones(raizRepo)).sucesiones,
    pubRaiz
  );
  return paseo.ok
    ? { ok: true, razon: `la estirpe la avala (${paseo.pasos.join(" → ")})` }
    : {
        ok: false,
        razon:
          `esta llave (${huella}) no está en la estirpe de la raíz congelada (${huellaRaiz}): ` +
          "publica desde la máquina que tiene la llave de la raíz, o certifícala con `npm run rotar`",
      };
}
