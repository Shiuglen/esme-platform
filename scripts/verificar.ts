// verificar — el consumidor de la tienda: no confía, verifica.
//   npm run verificar
// Toma el índice firmado + la clave pública y comprueba:
//   1. la firma del índice vale, y
//   2. cada artefacto coincide byte a byte con su tar firmado y con el hash
//      que anuncia el índice.
// Es el mismo código que correrá alguien que descargue la tienda desde fuera.
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash, createPublicKey } from "node:crypto";
import { verificarIndex, verificarBytes, type FirmaBytes } from "../tienda/firma.ts";

const raiz = resolve(import.meta.dirname, "..");
const indice = JSON.parse(
  readFileSync(join(raiz, "tienda", "index.json"), "utf8")
) as Record<string, unknown> & {
  modulos: Array<{
    id: string;
    version?: string;
    artefacto?: { tar?: string; bytes?: number };
  }>;
};

// la clave pública: env, o la de desarrollo del repo (lo asumible en local)
const pubKey =
  process.env.ESME_PUB_KEY ??
  (() => {
    try {
      return createPublicKey(
        readFileSync(join(raiz, ".keys", "index-dev.pem"), "utf8")
      )
        .export({ type: "spki", format: "pem" })
        .toString();
    } catch {
      return null;
    }
  })();

let fallos = 0;

// 1. la firma del índice
if (!pubKey) {
  console.log("índice    : sin clave pública → no verificable (pon ESME_PUB_KEY)");
  fallos++;
} else {
  const r = verificarIndex(indice, pubKey);
  const razon = !r.ok && "razon" in r ? ` (${r.razon})` : "";
  console.log(`índice    : ${r.ok ? "firma verificada ✓" : `FALLA ✗${razon}`}`);
  if (!r.ok) fallos++;
}

// 2. los artefactos: tar firmado == tar publicado == hash del índice
for (const m of indice.modulos) {
  const dirMod = `ejemplo-${m.id.split(".").slice(-1)[0]}`;
  const rutaArtefacto = join(raiz, "tienda", "firmas", `${m.id}.artefacto.json`);
  if (!existsSync(rutaArtefacto)) {
    console.log(`${m.id.padEnd(28)}: sin artefacto firmado → no verificable`);
    fallos++;
    continue;
  }
  const art = JSON.parse(readFileSync(rutaArtefacto, "utf8")) as {
    modulo: string;
    version: string;
    tar: string;
    bytes: number;
    firma: FirmaBytes;
  };
  const rutaTar = join(
    raiz,
    "tienda",
    "paquetes",
    `${art.modulo.replace(/\./g, "-")}-${art.version}.tgz`
  );
  if (!existsSync(rutaTar)) {
    console.log(`${m.id.padEnd(28)}: el tarball no está en tienda/paquetes`);
    fallos++;
    continue;
  }
  const bytes = readFileSync(rutaTar);
  const hashLocal = createHash("sha256").update(bytes).digest("hex");
  const cuadraEnIndice = art.tar === m.artefacto?.tar;
  const firmaVale = pubKey ? verificarBytes(bytes, art.firma, pubKey).ok : false;
  const ok = firmaVale && cuadraEnIndice && hashLocal === art.tar;
  console.log(
    `${m.id.padEnd(28)}: ${ok ? "artefacto verificado ✓" : "NO CUADRA ✗"} (${art.bytes} bytes, sha256 ${art.tar.slice(0, 12)}…)`
  );
  if (!ok) fallos++;
}

if (fallos) {
  console.log(`\n${fallos} fallo(s): la tienda NO es confiable hoy.`);
  process.exit(1);
}
console.log("\ntienda verificada: índice + artefactos, todo cuadra.");
