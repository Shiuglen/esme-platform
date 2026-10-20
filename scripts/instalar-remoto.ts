/**
 * instalar-remoto — instala un módulo de una tienda PÚBLICA, verificando
 * antes de creerse nada.
 *
 *   npm run instalar:remoto -- esme.nucleo.troceo-pro --url https://raw.githubusercontent.com/Shiuglen/esme-tienda/main
 *
 * La confianza no se negocia: el índice firmado, la estirpe de rotaciones
 * (desde la raíz congelada) y la firma de cada paquete. Lo que no trae una
 * firma válida no se instala.
 *
 * Referencia: tienda/cliente.ts, docs/TIENDA.md.
 */
import { createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { instalarRemoto } from "../tienda/cliente.ts";
import { leeRaiz } from "../tienda/raiz.ts";

const raiz = resolve(import.meta.dirname, "..");
const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

const id = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
const url =
  arg("--url") ??
  process.env.ESME_TIENDA_URL ??
  "https://raw.githubusercontent.com/Shiuglen/esme-tienda/main";
const destino = arg("--destino") ?? join(homedir(), ".esme", "modulos");

if (!id) {
  console.error("uso: npm run instalar:remoto -- <id-del-módulo> [--url <base>] [--destino <carpeta>]");
  process.exit(1);
}

// la raíz congelada: el ancla de la confianza (sin ella, no se instala nada)
const pubRaiz = process.env.ESME_PUB_KEY ?? leeRaiz(raiz);
if (!pubRaiz) {
  console.error("no encuentro la raíz de confianza (pon ESME_PUB_KEY o deja tienda/raiz.pub.pem en el repo)");
  process.exit(1);
}
const pub = pubRaiz.includes("BEGIN")
  ? createPublicKey(pubRaiz).export({ type: "spki", format: "pem" }).toString()
  : pubRaiz;

const instalacion = await instalarRemoto(url, id, pub, destino);
console.log(`✓ ${instalacion.id} v${instalacion.version} instalado (vía ${instalacion.via})`);
console.log(`  ${join(destino, instalacion.id.replace(/\./g, "__"))}`);
console.log(`  entrada: ${instalacion.entrada}`);
