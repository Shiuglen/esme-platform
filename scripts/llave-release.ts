/**
 * llave-release.ts — la llave con la que la CI firma las releases.
 *   npm run llave:release
 *
 * Qué hace, y por qué:
 *
 * La release se firma en GitHub Actions, así que la llave tiene que estar en
 * los secretos de GitHub. Y la llave que firma la tienda tiene que estar
 * AVALADA por la raíz congelada: si no, cualquiera con una llave propia
 * podría firmar un índice y hacerse pasar por la Tienda.
 *
 * Así que la llave de release no nace sola: la avala la llave de desarrollo
 * (que ya está en la estirpe de la raíz) con una **doble firma**: las dos
 * firman el papel. A partir de ahí, la raíz → … → dev → release es un camino
 * que cualquiera puede comprobar sin Geophysical:
 *
 *   raíz congelada → d9978d32 → adaaf799 (dev) → <release> (nueva)
 *
 * La privada se guarda FUERA del repo (por defecto
 * `~/.config/esme-tienda/release.pem`, con permiso 600): al repo sólo llega
 * la pública y el certificado. La copia que usa la CI es el secreto
 * `ESME_RELEASE_KEY_PEM` de GitHub.
 *
 * Referencia: tienda/rotacion.ts, docs/INCIDENTE.md.
 */
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { crearCertificado, huellaDePub, leerLedger, type CertRotacion } from "../tienda/rotacion.ts";

const raiz = resolve(import.meta.dirname, "..");
const rutaLedger = join(raiz, "tienda", "rotaciones.json");
const rutaDev = join(raiz, ".keys", "index-dev.pem");
const rutaPriv = process.env.ESME_RELEASE_KEY ?? join(homedir(), ".config", "esme-tienda", "release.pem");
const motivo = process.argv[2] ?? "la llave con la que la CI firma las releases";

if (!existsSync(rutaDev)) {
  console.error("no hay llave de desarrollo (.keys/index-dev.pem): no se puede avalar nada");
  process.exit(1);
}

// 1. la llave de release (si ya existe, se usa: no se regenera por despiste)
mkdirSync(resolve(rutaPriv, ".."), { recursive: true });
let priv: string;
let pub: string;
if (existsSync(rutaPriv)) {
  priv = readFileSync(rutaPriv, "utf8");
  pub = createPublicKey(priv).export({ type: "spki", format: "pem" }).toString();
  console.log(`llave      : ya existía (${rutaPriv}) — no se toca`);
} else {
  const par = generateKeyPairSync("ed25519");
  priv = par.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  pub = par.publicKey.export({ type: "spki", format: "pem" }).toString();
  writeFileSync(rutaPriv, priv, { mode: 0o600 });
  chmodSync(rutaPriv, 0o600);
  console.log(`llave      : creada (${rutaPriv}, 600) — fuera del repo, a propósito`);
}

// 2. la dev key la avala (doble firma)
const privDev = readFileSync(rutaDev, "utf8");
const pubDev = createPublicKey(privDev).export({ type: "spki", format: "pem" }).toString();
const huellaDev = huellaDePub(pubDev);
const huellaRelease = huellaDePub(pub);

// 3. el ledger: si el certificado ya está, no se duplica
const ledger = leerLedger(rutaLedger);
const yaEsta = ledger.sucesiones.some((c) => c.nueva.huella === huellaRelease);
let cert: CertRotacion | null = null;
if (yaEsta) {
  console.log(`certificado: ya estaba en el ledger (${huellaRelease.slice(0, 8)}…)`);
} else {
  cert = crearCertificado(huellaDev, pubDev, huellaRelease, pub, privDev, priv, motivo);
  ledger.sucesiones.push(cert);
  writeFileSync(rutaLedger, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`certificado: ${huellaDev.slice(0, 8)} → ${huellaRelease.slice(0, 8)} (doble firma) — escrito en ${rutaLedger}`);
}

// 4. qué hacer ahora (esto sí es de una persona)
console.log("");
console.log("siguiente paso (uno solo):");
console.log(`  gh secret set ESME_RELEASE_KEY_PEM --repo Shiuglen/esme-platform < ${rutaPriv}`);
console.log("");
console.log("y para que la CI pueda firmar, la raíz tiene que avalar la cadena. Comprueba:");
console.log(`  npm run verificar`);
