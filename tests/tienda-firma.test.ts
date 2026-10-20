import { describe, expect, it } from "vitest";
import {
  canonical,
  declaraClave,
  firmarIndex,
  generarPar,
  verificarIndex,
} from "../tienda/firma.ts";
import { huellaDePub } from "../tienda/rotacion.ts";

const indiceBase = {
  schema_version: 1,
  modulos: [
    {
      id: "esme.nucleo.hola-mundo",
      version: "0.1.0",
      hash: null,
      bench: null,
      pubkey: null,
      published_at: null,
    },
  ],
};

describe("firma del índice (la puerta de la tienda)", () => {
  it("canónico es estable ante el orden de claves", () => {
    expect(canonical({ b: 1, a: [2, { z: 0, y: 1 }] })).toBe(
      canonical({ a: [2, { y: 1, z: 0 }], b: 1 })
    );
  });

  it("firma y verifica con ida y vuelta sana", () => {
    const { priv, pub } = generarPar();
    const firmado = firmarIndex(indiceBase, priv, "esme@nucleo") as Record<string, unknown>;
    const r = verificarIndex(firmado, pub);
    expect(r.ok).toBe(true);
  });

  it("un byte cambiado (hash falsificado) se detecta", () => {
    const { priv, pub } = generarPar();
    const firmado = firmarIndex(indiceBase, priv, "esme@nucleo") as Record<string, unknown>;
    const adulterado = {
      ...firmado,
      modulos: [
        { id: "esme.nucleo.hola-mundo", version: "9.9.9", hash: null, bench: null },
      ],
    };
    const r = verificarIndex(adulterado, pub);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.razon).toContain("cambió");
  });

  it("otra clave pública no verifica", () => {
    const { priv } = generarPar();
    const { pub: otraPub } = generarPar();
    const firmado = firmarIndex(indiceBase, priv, "x") as Record<string, unknown>;
    expect(verificarIndex(firmado, otraPub).ok).toBe(false);
  });

  it("sin firma → rechazo con razón clara", () => {
    const r = verificarIndex({ ...indiceBase }, "no-hace-falta");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.razon).toContain("sin campo");
  });

  it("el firmante se declara en el cuerpo firmado (si no, el consumidor no puede caminar)", () => {
    const { priv, pub } = generarPar();
    const huella = huellaDePub(pub);
    const conClave = declaraClave(indiceBase, pub, huella);
    const claves = (conClave.claves ?? {}) as Record<string, string>;
    expect(claves[huella]).toBe(pub);
    // y la declaración va DENTRO de lo firmado: no se puede añadir después
    const firmado = firmarIndex(conClave, priv, huella) as Record<string, unknown>;
    expect((firmado.claves as Record<string, string>)[huella]).toBe(pub);
    expect(verificarIndex(firmado, pub).ok).toBe(true);
    // quitar la declaración rompe la firma (el cuerpo cambió)
    const sinClave = { ...firmado, claves: {} };
    expect(verificarIndex(sinClave, pub).ok).toBe(false);
  });
});
