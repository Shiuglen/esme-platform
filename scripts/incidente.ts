// incidente — el pánico ordenado en un comando:
//   npm run incidente "sospecha de fuga de la llave de release"
// Secuencia: (1) la útil actual rota de inmediato (par nuevo + papel dual),
// (2) la huella muerta queda REVOCADA en el libro (anotada por la útil viva),
// (3) el índice se re-firma, (4) se verifica de punta a punta.
// La tienda que DESPIERTA al pánico sigue confiable: los consumidores de las
// raíces viejas siguen por la estirpe; los comprometedores se quedan fuera.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createPublicKey } from "node:crypto";
import { resolve, join } from "node:path";
import { rotarYCertificar, huellaDePub } from "../tienda/rotacion.ts";
import { anotarRevocacion, estaRevocada } from "../tienda/revocacion.ts";

const raiz = resolve(import.meta.dirname, "..");
const rutaPem = join(raiz, ".keys", "index-dev.pem");
if (!existsSync(rutaPem)) {
  console.error("no hay llave mandante que blindar (.keys/index-dev.pem)");
  process.exit(1);
}
const motivo = process.argv[2] ?? "incidente sin declarar";

// 1. ROTAR primero: la solución nueva toma el mando con papel dual
const pemVieja = readFileSync(rutaPem, "utf8");
const { par } = rotarYCertificar(
  pemVieja,
  join(raiz, "tienda", "rotaciones.json"),
  `incidente: ${motivo}`
);
writeFileSync(rutaPem, par.priv);
const huellaVieja = huellaDePub(
  createPublicKey(pemVieja).export({ type: "spki", format: "pem" }).toString()
);
console.log(`1. ROTADA : ${huellaVieja.slice(0, 8)} → ${par.huella.slice(0, 8)} (${motivo})`);

// 2. REVOCAR la huella muerta, firmado por la llave ya viva
const revocada = anotarRevocacion(
  huellaVieja,
  `incidente: ${motivo}`,
  par.priv,
  join(raiz, "tienda", "revocaciones.json")
);
const consolida = estaRevocada(
  revocada.huella,
  join(raiz, "tienda", "revocaciones.json"),
  par.pub
);
console.log(`2. REVOCADA: ${revocada.huella.slice(0, 8)} — el libro la valida: ${consolida}`);

// 3. RE-FIRMAR el índice con la llave nueva (y el panel con el veredicto)
execFileSync("npx", ["tsx", "scripts/bench.ts"], { stdio: "inherit", cwd: raiz });
console.log("3. REFIRMADA: índice firmado por la llave nueva y panel publicado");

// 4. VERIFICAR de punta a punta con la llave viva
execFileSync("npx", ["tsx", "scripts/verificar.ts"], { stdio: "inherit", cwd: raiz });
console.log("\nincidente cerrado: la tienda sigue viva y confiable para quien confía en la estirpe.");
