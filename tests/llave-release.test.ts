// La llave de release: la que firma en la CI. Dos cosas tienen que ser verdad
// a la vez, y basta con que una falle para que la tienda quede sin confianza:
//   1. la llave está AVALADA por la raíz congelada (por la estirpe), y
//   2. el índice firmado dice QUIÉN firmó (su huella), para que el
//      consumidor pueda encontrarla y caminar la estirpe.
//
// El segundo se rompió de verdad: `firma:index` firmaba con una etiqueta
// ("clave del mantenedor") en vez de la huella, así que el índice que publica
// la release no lo reconocía NADIE. Aquí se ata.
import { describe, expect, it } from "vitest";
import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { firmaIndice, verificarIndex } from "../tienda/firma.ts";
import { crearCertificado, huellaDePub, leerLedger, llevaDeRaiz } from "../tienda/rotacion.ts";

const raizKit = resolve(import.meta.dirname, "..");
const pubRaiz = (): string =>
  createPublicKey(
    // la raíz congelada que viaja en el repo
    readFileSync(join(raizKit, "tienda", "raiz.pub.pem"), "utf8")
  )
    .export({ type: "spki", format: "pem" })
    .toString();

const pubDe = (priv: string): string =>
  createPublicKey(priv).export({ type: "spki", format: "pem" }).toString();

describe("la llave de release", () => {
  it("el índice firmado por la release lo reconoce la estirpe (por su huella)", () => {
    const raiz = pubRaiz();
    // la dev key (la que ya está en la estirpe) avala a la de release
    const dev = generateKeyPairSync("ed25519");
    const privDev = dev.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pubDev = pubDe(privDev);
    const rel = generateKeyPairSync("ed25519");
    const privRel = rel.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pubRel = pubDe(privRel);

    const cert = crearCertificado(
      huellaDePub(pubDev),
      pubDev,
      huellaDePub(pubRel),
      pubRel,
      privDev,
      privRel,
      "prueba: la release"
    );
    const dir = mkdtempSync(join(tmpdir(), "esme-ledger-"));
    const rutaLedger = join(dir, "rotaciones.json");
    writeFileSync(rutaLedger, JSON.stringify({ sucesiones: [cert] }, null, 2));

    // el índice, firmado por la llave de release
    const indice = firmaIndice({ schema_version: 1, modulos: [] }, privRel);
    const firma = indice.signature as { signed_by: string };
    expect(firma.signed_by).toBe(huellaDePub(pubRel));
    // y la clave está declarada DENTRO del cuerpo firmado
    const claves = indice.claves as Record<string, string>;
    expect(claves[huellaDePub(pubRel)]).toBe(pubRel);

    // el consumidor: busca la clave por la huella y camina la estirpe
    const pubFirmante = claves[firma.signed_by];
    expect(pubFirmante).toBeTruthy();
    // la caminata: de la dev (que la raíz avala) hasta la release
    const paseoDev = llevaDeRaiz(
      huellaDePub(pubDev),
      firma.signed_by,
      leerLedger(rutaLedger).sucesiones,
      pubDev
    );
    expect(paseoDev.ok).toBe(true);
    expect(paseoDev.pasos.length).toBe(1);
    // y la firma del índice, verificada con la clave que el índice declara
    expect(verificarIndex(indice, pubFirmante).ok).toBe(true);
  });

  it("el índice del repo lo verifica la raíz congelada (y no se rompe al re-firmar)", () => {
    // el índice que se publica hoy, con la llave de la dev
    const indice = JSON.parse(
      readFileSync(join(raizKit, "tienda", "index.json"), "utf8")
    ) as Record<string, unknown>;
    const firma = indice.signature as { signed_by: string };
    const claves = indice.claves as Record<string, string>;
    expect(claves[firma.signed_by]).toBeTruthy();
    expect(verificarIndex(indice, claves[firma.signed_by]).ok).toBe(true);
  });
});
