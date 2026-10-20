// La llave del entorno: una RUTA o el PEM EN SÍ MISMO. Las dos hacen falta:
// en local se apunta a un fichero, y en la CI lo que llega es el contenido del
// secreto de GitHub (un secreto es un texto, no una ruta).
//
// Cuando no se aceptaba el PEM suelto, la CI firmaba con una dev key
// autogenerada y se paraba al final (la tienda no publicaba nada, menos mal).
// Ahora: si el entorno apunta a algo que no es una llave, se dice y se para.
import { describe, expect, it, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { llaveDelEntorno } from "../tienda/claves.ts";

const par = () => {
  const p = generateKeyPairSync("ed25519");
  return {
    priv: p.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    pub: p.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
};

const envOriginal = process.env.ESME_PRIV_KEY;

afterEach(() => {
  if (envOriginal === undefined) delete process.env.ESME_PRIV_KEY;
  else process.env.ESME_PRIV_KEY = envOriginal;
});

describe("la llave que el entorno apunta", () => {
  it("si es una ruta, se lee el fichero", () => {
    const k = par();
    const ruta = join(mkdtempSync(join(tmpdir(), "esme-clave-")), "llave.pem");
    writeFileSync(ruta, k.priv);
    process.env.ESME_PRIV_KEY = ruta;
    const l = llaveDelEntorno();
    expect(l).toBeTruthy();
    expect(l!.priv).toBe(k.priv);
    expect(l!.pub.trim()).toBe(k.pub.trim());
  });

  it("si es el PEM en sí mismo (así llega el secreto de la CI), también vale", () => {
    const k = par();
    process.env.ESME_PRIV_KEY = k.priv;
    const l = llaveDelEntorno();
    expect(l).toBeTruthy();
    expect(l!.priv).toBe(k.priv);
    expect(l!.origen).toContain("PEM");
  });

  it("si no hay entorno, no hay llave (y no se inventa ninguna)", () => {
    delete process.env.ESME_PRIV_KEY;
    expect(llaveDelEntorno()).toBeNull();
  });

  it("si apunta a un fichero que no existe, no hay llave (y lo dice)", () => {
    process.env.ESME_PRIV_KEY = "/tmp/no-existe-esta-llave.pem";
    expect(llaveDelEntorno()).toBeNull();
  });

  it("si el PEM del entorno está roto, no hay llave (y no lo imprime)", () => {
    process.env.ESME_PRIV_KEY = "-----BEGIN PRIVATE KEY-----\nno soy una llave\n-----END PRIVATE KEY-----";
    expect(llaveDelEntorno()).toBeNull();
  });
});
