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
import { estaRevocada } from "../tienda/revocacion.ts";
import { confiaIndexChain } from "../tienda/rotacion.ts";

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
let pubActiva: string | null = null;

// 0. el libro de revocaciones: si el firmante del índice está revocado,
//    TODA la tienda cae — ni artefactos ni veredictos valen nada
const firmaIndice = indice.signature as { signed_by?: string } | undefined;
if (
  pubKey &&
  firmaIndice?.signed_by &&
  estaRevocada(firmaIndice.signed_by, join(raiz, "tienda", "revocaciones.json"), pubKey)
) {
  console.log(`índice    : FALLIDO ✗ — la clave ${firmaIndice.signed_by} está REVOCADA`);
  console.log("           ninguna entrada de esta tienda es confiable hasta rotar la clave y re-firmar todo.");
  process.exit(1);
}

// 1. la firma del índice — directa, o vía la estirpe de rotaciones
if (!pubKey) {
  console.log("índice    : sin clave pública → no verificable (pon ESME_PUB_KEY)");
  fallos++;
} else {
  const confianza = confiaIndexChain(
    indice,
    pubKey,
    join(raiz, "tienda", "rotaciones.json")
  );
  if (confianza.ok) {
    const etiqueta = confianza.via === "directa" ? "" : " — la raíz congelada lo avala por la estirpe";
    console.log(`índice    : firma verificada ✓ (${confianza.via})${etiqueta}`);
    pubActiva = confianza.pubActiva ?? null;
  } else {
    console.log("índice    : FALLA ✗ — no viene de la raíz ni de su estirpe");
    fallos++;
  }
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
  // la pub del firmante del artefacto sale del índice CONFIADO (claves declaradas)
  const pubFirmante = (indice.claves as Record<string, string> | undefined)?.[
    art.firma.signed_by
  ];
  const firmaVale = pubFirmante ? verificarBytes(bytes, art.firma, pubFirmante).ok : false;
  const firmanteRevocado =
    pubActiva && art.firma.signed_by
      ? estaRevocada(art.firma.signed_by, join(raiz, "tienda", "revocaciones.json"), pubActiva)
      : false;
  const ok = firmaVale && cuadraEnIndice && hashLocal === art.tar && !firmanteRevocado;
  console.log(
    `${m.id.padEnd(28)}: ${ok ? "artefacto verificado ✓" : firmanteRevocado ? "FIRMANTE REVOCADO ✗" : "NO CUADRA ✗"} (${art.bytes} bytes, sha256 ${art.tar.slice(0, 12)}…)`
  );
  if (!ok) fallos++;
}

if (fallos) {
  console.log(`\n${fallos} fallo(s): la tienda NO es confiable hoy.`);
  process.exit(1);
}
console.log("\ntienda verificada: índice + artefactos, todo cuadra.");
