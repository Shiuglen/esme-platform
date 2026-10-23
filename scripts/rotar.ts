// rotar — la llave muere y la tienda sigue viva:
//   npm run rotar "por qué muere la llave"
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

// Esta ceremonia es IRREVERSIBLE: la privada vieja se reescribe y el certificado
// entra en el ledger para siempre. Por eso el motivo se exige (una llave no
// muere sin decir por qué) y los args que parecen flags se rechazan — no se
// ejecuta una sucesión porque a alguien le falló un flag (`rotar --ayuda`
// dictó motivó "--ayuda" y la ceremonia corrió igual).
const desconocidas = process.argv.slice(2).filter((a) => a.startsWith("--"));
if (desconocidas.length > 0) {
  console.error(
    `rotar no entiende flags (${desconocidas.join(", ")}). Se usa así:\n` +
      `  npm run rotar "por qué muere la llave"\n` +
      `Nada se ha rotado.`
  );
  process.exit(2);
}
const motivo = process.argv.slice(2)[0];
if (!motivo) {
  console.error(`falta el motivo (rotación es un evento del ledger: queda por escrito):\n  npm run rotar "por qué muere la llave"`);
  process.exit(2);
}

const privVieja = readFileSync(rutaPem, "utf8");

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
