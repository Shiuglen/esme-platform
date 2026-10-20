// El veredicto de los módulos, firmado: lo firma el kit y lo verifica la app.
// La app no guarda ninguna clave privada: sólo la pública de la Tienda, que
// es la MISMA que firma en local el kit. Si el kit cambiara el orden de las
// claves o un valor por defecto, la app dejaría de entenderlo y caería este
// test (aquí y en la app).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  cuerpoVeredictosModulos,
  firmaVeredictosModulos,
  medidasVacias,
  verificaVeredictosModulos,
  veredictoDeModulo,
  catalogoModulosSha256,
  proyeccionCatalogo,
  VEREDICTO_MODULOS_VERSION,
  type VeredictosModulos,
} from "../tienda/veredictos-modulos.ts";
import { arbolSha256 } from "../tienda/empaque.ts";

// La clave de la Tienda de la app: app/src/main/claves.ts (CLAVES_TIENDA).
// Es pública: la app solo comprueba, no firma. (Es la dev key del kit.)
const CLAVE_DE_LA_APP = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAkePUK6fQTkQ5Il5Wwq5W0Dtf99h8j1P8eY2z7X3p1rk=
-----END PUBLIC KEY-----
`;

const raiz = resolve(import.meta.dirname, "..");
const veredictoPublicado = (): string =>
  readFileSync(resolve(raiz, "modulos", "veredictos.json"), "utf8");

/** Un veredicto de mentira, con la forma exacta. */
const veredictoDePrueba = (): VeredictosModulos => ({
  version: VEREDICTO_MODULOS_VERSION,
  emitido: 1_700_000_000_000,
  firmante: "cafe1234cafe1234",
  catalogoSha256: "a".repeat(64),
  modulos: [
    {
      id: "esme.nucleo.hola-mundo",
      version: "0.1.0",
      arbolSha256: "b".repeat(64),
      entra: true,
      nivel: "ok",
      causa: "el ciclo funciona",
      medidas: { ...medidasVacias(), carga: true, forma: "ciclo", cicloOk: true, casos: 3 },
    },
  ],
});

describe("el veredicto de los módulos", () => {
  it("la app verifica el veredicto publicado por el kit", () => {
    const r = verificaVeredictosModulos(veredictoPublicado(), CLAVE_DE_LA_APP);
    expect(r.ok, r.ok ? "" : r.motivo).toBe(true);
    if (r.ok) {
      expect(r.modulos.length).toBeGreaterThan(0);
      expect(r.firmante).toBeTruthy();
      expect(r.catalogoSha256).toMatch(/^[0-9a-f]{64}$/);
      for (const m of r.modulos) expect(m.arbolSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("el cuerpo firmado son los MISMOS bytes que firmará la app (orden fijo)", () => {
    const doc = JSON.parse(veredictoPublicado()) as {
      firma: { hash: string };
    };
    const cuerpo = cuerpoVeredictosModulos(JSON.parse(veredictoPublicado()));
    expect(cuerpo.startsWith('{"version":1,"emitido":')).toBe(true);
    expect(cuerpo).toContain('"modulos":[{"id":');
    expect(doc.firma.hash).toBeTruthy();
  });

  it("firma y verifica: el mismo documento, los mismos bytes", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
    const doc = firmaVeredictosModulos(veredictoDePrueba(), priv);
    const r = verificaVeredictosModulos(JSON.stringify(doc), pub);
    expect(r.ok, r.ok ? "" : r.motivo).toBe(true);
    if (r.ok) {
      expect(r.modulos).toHaveLength(1);
      expect(r.modulos[0].id).toBe("esme.nucleo.hola-mundo");
      expect(veredictoDeModulo(r, "esme.nucleo.hola-mundo")?.entra).toBe(true);
      expect(veredictoDeModulo(r, "esme.nucleo.otro")).toBeNull();
    }
  });

  it("el cuerpo se modifica → la firma no vale", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
    const doc = firmaVeredictosModulos(veredictoDePrueba(), priv);
    const manoseado = JSON.parse(JSON.stringify(doc)) as typeof doc;
    manoseado.modulos[0].entra = false; // alguien maquina el dictamen
    manoseado.modulos[0].causa = "entra porque sí";
    const r = verificaVeredictosModulos(JSON.stringify(manoseado), pub);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("cuerpo");
  });

  it("otra clave → no vale", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const doc = firmaVeredictosModulos(veredictoDePrueba(), priv);
    const otro = generateKeyPairSync("ed25519").publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const r = verificaVeredictosModulos(JSON.stringify(doc), otro);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("firma");
  });

  it("la firma no es de quien dice firmar → no vale", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
    const doc = firmaVeredictosModulos(veredictoDePrueba(), priv);
    const mentiroso = JSON.parse(JSON.stringify(doc)) as typeof doc;
    mentiroso.firmante = "otra9999otra9999";
    const r = verificaVeredictosModulos(JSON.stringify(mentiroso), pub);
    expect(r.ok).toBe(false);
  });

  it("el veredicto está atado a los artefactos, no a los números del bench", () => {
    // el mismo catálogo con números distintos (el bench se vuelve a medir)
    // tiene la MISMA huella: el veredicto no caduca por que se mida otra vez
    const a = [{ id: "esme.nucleo.x", version: "0.1.0", artefacto: { tar: "aa" }, bench: { recall: 0.5 } }];
    const b = [{ id: "esme.nucleo.x", version: "0.1.0", artefacto: { tar: "aa" }, bench: { recall: 0.9 } }];
    expect(catalogoModulosSha256(proyeccionCatalogo(a))).toBe(
      catalogoModulosSha256(proyeccionCatalogo(b))
    );
    // y si cambia el artefacto, la huella cambia: otro árbol, otro veredicto
    const c = [{ id: "esme.nucleo.x", version: "0.1.0", artefacto: { tar: "bb" } }];
    expect(catalogoModulosSha256(proyeccionCatalogo(c))).not.toBe(
      catalogoModulosSha256(proyeccionCatalogo(a))
    );
  });

  it("la huella del árbol: mismos bytes → misma huella; un byte de más → otra", () => {
    const dir = resolve(raiz, "modulos", "ejemplo-puerta");
    const antes = arbolSha256(dir);
    expect(antes).toMatch(/^[0-9a-f]{64}$/);
    expect(arbolSha256(dir)).toBe(antes); // es estable
    expect(arbolSha256(resolve(raiz, "modulos", "ejemplo-hola-mundo"))).not.toBe(antes);
  });

  it("sin firma no se aplica: la app no bloquea, pero lo dice", () => {
    const doc = veredictoDePrueba() as unknown as Record<string, unknown>;
    const r = verificaVeredictosModulos(JSON.stringify(doc), CLAVE_DE_LA_APP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("forma");
  });

  it("el hash del cuerpo firmado es el de esos bytes", () => {
    const doc = JSON.parse(veredictoPublicado()) as {
      firma: { hash: string };
    };
    const bytes = Buffer.from(
      cuerpoVeredictosModulos(JSON.parse(veredictoPublicado())),
      "utf8"
    );
    expect(createHash("sha256").update(bytes).digest("base64")).toBe(doc.firma.hash);
  });
});
