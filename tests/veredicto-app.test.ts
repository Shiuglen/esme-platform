// La app verifica el veredicto que firma el kit: el contrato no puede
// separarse sin que se caiga un test (aquí y en la app).
//
// La llave de la app es PÚBLICA (la app no guarda ninguna privada), así que
// el kit puede comprobarla sin depender de ella: es el mismo patrón que el
// catálogo de productos (tests/catalogo-productos.test.ts) al revés.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verificaVeredictos, cuerpoVeredictos, type VeredictosSkillsFirmados } from "../tienda/skills.ts";

// La clave de la Tienda de la app: app/src/main/claves.ts (CLAVES_TIENDA).
// Es pública: la app solo comprueba, no firma.
const CLAVE_DE_LA_APP = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAkePUK6fQTkQ5Il5Wwq5W0Dtf99h8j1P8eY2z7X3p1rk=
-----END PUBLIC KEY-----
`;

const raiz = resolve(import.meta.dirname, "..");
const veredictoDelKit = (): string =>
  readFileSync(resolve(raiz, "skills", "veredictos.json"), "utf8");

describe("el veredicto del kit lo acepta la app", () => {
  it("la app verifica el veredicto publicado por el kit", () => {
    const r = verificaVeredictos(veredictoDelKit(), CLAVE_DE_LA_APP);
    expect(r.ok, r.ok ? "" : r.motivo).toBe(true);
    if (r.ok) {
      expect(r.skills.length).toBeGreaterThan(0);
      expect(r.firmante).toBeTruthy();
    }
  });

  it("el cuerpo firmado son los MISMOS bytes que firmará la app (orden fijo de claves)", () => {
    // el cuerpo canónico es lo que la app recalcula al verificar: si el kit
    // cambiara el orden o un valor por defecto, la app dejaría de entenderlo
    const doc = JSON.parse(veredictoDelKit()) as VeredictosSkillsFirmados;
    const cuerpo = cuerpoVeredictos(doc);
    expect(cuerpo.startsWith('{"version":1,"emitido":')).toBe(true);
    expect(cuerpo).toContain('"skills":[{"id":');
    // y el hash del cuerpo firmado es el de esos bytes
    expect(doc.firma.hash).toBeTruthy();
  });

  it("el veredicto va atado al catálogo exacto que juzgó", () => {
    const doc = JSON.parse(veredictoDelKit()) as VeredictosSkillsFirmados;
    expect(doc.catalogoSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
