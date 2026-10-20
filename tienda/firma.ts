/**
 * Firma del índice de la tienda — Ed25519 sobre bytes canónicos.
 * docs/TIENDA.md: build → scan → firma → índice. La firma cubre TODO el índice
 * menos el propio campo `signature` (si no, no hay forma de verificar).
 *
 * Formato "firma esme v1": JSON canónico (claves ordenadas, sin espacios) +
 * Ed25519. Si el binario `minisign` está presente, `scripts/firmar-index.ts`
 * también deja su trazo compatible; la verificación del runtime siempre usa
 * esto (node:crypto, cero dependencias).
 */
import {
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  createHash,
} from "node:crypto";

export interface FirmaIndice {
  algorithm: "ed25519-sha512";
  signature: string; // base64
  signed_at: string; // ISO
  signed_by: string; // huella de la clave pública
  hash: string; // sha256 base64 de los bytes canónicos sin firma
}

/** Stringify estable: claves ordenadas recursivo, separadores sin espacios. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v))
    return "[" + v.map((x) => canonical(x)).join(",") + "]";
  const o = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(o)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(o[k]))
      .join(",") +
    "}"
  );
}

export function generarPar(): { priv: string; pub: string; huella: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const huella = createHash("sha256").update(pubPem).digest("hex").slice(0, 16);
  return {
    priv: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    pub: pubPem,
    huella,
  };
}

/** Quita la firma (para calcular el hash sobre el cuerpo). */
function cuerpo(indice: Record<string, unknown>): unknown {
  const { signature: _s, ...resto } = indice;
  return resto;
}

export function firmarIndex(
  indice: Record<string, unknown>,
  privPem: string,
  signedBy: string
): Record<string, unknown> {
  const bytes = Buffer.from(canonical(cuerpo(indice)), "utf8");
  const firma: FirmaIndice = {
    algorithm: "ed25519-sha512",
    signature: sign(null, bytes, privPem).toString("base64"),
    signed_at: new Date().toISOString(),
    signed_by: signedBy,
    hash: createHash("sha256").update(bytes).digest("base64"),
  };
  return { ...indice, signature: firma };
}

export type Veredicto =
  | { ok: true; hash: string }
  | { ok: false; razon: string };

export function verificarIndex(
  indice: Record<string, unknown>,
  pubPem: string
): Veredicto {
  const s = indice.signature as FirmaIndice | undefined;
  if (!s || !s.signature || !s.hash)
    return { ok: false, razon: "sin campo signature" };
  const bytes = Buffer.from(canonical(cuerpo(indice)), "utf8");
  const hashActual = createHash("sha256").update(bytes).digest("base64");
  if (hashActual !== s.hash)
    return { ok: false, razon: "el cuerpo cambió respecto al hash firmado" };
  const ok = verify(null, bytes, createPublicKey(pubPem), Buffer.from(s.signature, "base64"));
  return ok
    ? { ok: true, hash: s.hash }
    : { ok: false, razon: "firma Ed25519 inválida" };
}
