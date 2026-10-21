/**
 * delegar — la raíz da derecho a publicar a otra llave.
 *   npm run delegar -- <pub.pem> [--motivo "..."] [--ambito publicar]
 *
 * Qué es esto: la tienda federada. La raíz (o quien la tenga) dice «esta llave
 * publica en mi tienda», lo firma, y a partir de ahí ese publicador puede:
 *
 *   - firmar su artefacto (el paquete de su módulo) con SU llave;
 *   - meter su módulo en el índice firmado y firmarlo con SU llave;
 *   - y quien instale desde la red lo verifica igual que siempre: la raíz lo
 *     avala, transitivamente.
 *
 * Por qué hace falta: sin esto, publicar un módulo de un tercero exige que
 * el mantenedor firme CADA vez. Con esto, se delega una vez y el mantenedor
 * sigue teniendo la llave de revocar.
 *
 * Lo que la delegación NO da: la raíz. Quien tiene la raíz sigue siendo la
 * raíz, y la delegación se puede revocar (npm run revocar).
 *
 * Referencia: tienda/rotacion.ts, docs/TIENDA.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createPublicKey } from "node:crypto";
import {
  crearDelegacion,
  leerLedger,
  guardarLedger,
  rutaRotaciones,
  huellaDePub,
  type CertDelegacion,
} from "../tienda/rotacion.ts";
import { claveDeFirma, puedePublicar } from "../tienda/claves.ts";

const raizKit = resolve(import.meta.dirname, "..");
const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
};
const tiene = (flag: string): boolean => process.argv.includes(flag);

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const ruta = arg("--pub") ?? process.argv[2];
  if (!ruta || ruta.startsWith("--")) {
    console.error(
      'uso: npm run delegar -- <pub.pem> [--motivo "por qué"] [--ambito publicar]'
    );
    process.exit(2);
  }
  const rutaPem = resolve(ruta);
  if (!existsSync(rutaPem)) {
    console.error(`no encuentro la clave pública: ${rutaPem}`);
    process.exit(1);
  }
  let pubDelegado: string;
  try {
    pubDelegado = createPublicKey(readFileSync(rutaPem, "utf8"))
      .export({ type: "spki", format: "pem" })
      .toString();
  } catch (e) {
    console.error(`esa no es una clave pública: ${String((e as Error).message)}`);
    process.exit(1);
  }

  const clave = claveDeFirma();
  // delega quien tiene derecho a publicar: si no, la delegación no la avala
  // nadie
  const derecho = puedePublicar(clave, raizKit);
  if (!derecho.ok) {
    console.error(`no puedo delegar con esta llave: ${derecho.razon}`);
    process.exit(1);
  }

  const motivo = arg("--motivo") ?? "publicador de confianza";
  const ambito = (arg("--ambito") ?? "publicar") as CertDelegacion["ambito"];
  if (ambito !== "publicar") {
    console.error(`ámbito desconocido: ${ambito} (sólo «publicar»)`);
    process.exit(2);
  }

  const cert = crearDelegacion(clave.pub, pubDelegado, clave.priv, motivo, ambito);
  const rutaLedger = rutaRotaciones(raizKit);
  const ledger = leerLedger(rutaLedger);
  const yaEsta = (ledger.delegaciones ?? []).some(
    (d) => d.delegado.huella === cert.delegado.huella && d.mandante.huella === cert.mandante.huella
  );
  if (yaEsta) {
    console.error(`esta llave ya está delegada (${cert.delegado.huella})`);
    process.exit(1);
  }
  guardarLedger(rutaLedger, {
    sucesiones: ledger.sucesiones,
    delegaciones: [...(ledger.delegaciones ?? []), cert],
  });

  console.log(`delegación: ${cert.mandante.huella} → ${cert.delegado.huella}`);
  console.log(`motivo    : ${motivo}`);
  console.log(`ámbito    : ${ambito}`);
  console.log(`ledger    : ${rutaLedger}`);
  console.log("");
  console.log("Ahora esa llave puede publicar: npm run publicar:modulo -- <módulo>");
  console.log("Y quien instala lo verifica igual: la raíz lo avala, transitivamente.");
}
