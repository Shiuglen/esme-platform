// rotar — la llave muere y la tienda sigue viva:
//   npm run rotar [motivo]
// 1. par nuevo + certificado de sucesión dual-firmado en tienda/rotaciones.json
// 2. la nueva clave toma el puesto: .keys/index-dev.pem se reescribe
// 3. el índice se re-firma (la próxima corrida de bench) y el consumidor
//    que fijó la VIEJA raíz sigue verificando por la cadena de sucesiones.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { rotarYCertificar, huellaDePub } from "../tienda/rotacion.ts";
import { createPublicKey } from "node:crypto";

const raiz = resolve(import.meta.dirname, "..");
const rutaPem = join(raiz, ".keys", "index-dev.pem");
if (!existsSync(rutaPem)) {
  console.error("no hay clave que rotar (.keys/index-dev.pem)");
  process.exit(1);
}
const privVieja = readFileSync(rutaPem, "utf8");
const motivo = process.argv[2] ?? "rotación programada";

const { par, cert } = rotarYCertificar(privVieja, join(raiz, "tienda", "rotaciones.json"), motivo);
writeFileSync(rutaPem, par.priv);

const huellaVieja = huellaDePub(
  createPublicKey(privVieja).export({ type: "spki", format: "pem" }).toString()
);
console.log(`sucesión  : ${huellaVieja.slice(0, 8)} → ${par.huella.slice(0, 8)} — ${motivo}`);
console.log(`doble firma: la vieja ATESTIGUA (${cert.firmaVieja.slice(0, 12)}…) la nueva CONFIRMA (${cert.firmaNueva.slice(0, 12)}…)`);
console.log(`ledger    : tienda/rotaciones.json (${cert.fecha})`);
console.log(`clave     : .keys/index-dev.pem ya es la nueva — re-firma el índice con npm run bench`);
console.log(`consumidor: quien fijó la vieja sigue verificando por la cadena de sucesiones.`);
