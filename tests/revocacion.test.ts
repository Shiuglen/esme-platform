import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  anotarRevocacion,
  estaRevocada,
  leerRevocaciones,
  quitarRevocacion,
} from "../tienda/revocacion.ts";
import { generarPar } from "../tienda/firma.ts";

const raiz = resolve(import.meta.dirname, "..");
const LIBRO = (nombre: string) =>
  join(mkdtempSync(join(tmpdir(), "rev-")), nombre);

describe("el libro de las claves caídas", () => {
  it("anota una revocación y la huella queda apuntada", () => {
    const ruta = LIBRO("revocaciones.json");
    anotarRevocacion(
      "cafebabe0000abcd",
      "prueba de revocación",
      generarPar().priv,
      ruta
    );
    const libro = leerRevocaciones(ruta);
    expect(libro.revocaciones).toHaveLength(1);
    expect(libro.revocaciones[0].motivo).toBe("prueba de revocación");
    expect(libro.revocaciones[0].huella).toBe("cafebabe0000abcd");
  });

  it("huella inválida → rechazo en la puerta", () => {
    expect(() =>
      anotarRevocacion("no-es-huella", "motivo", generarPar().priv, LIBRO("x.json"))
    ).toThrow(/huella inválida/);
  });

  it("doble revocación → rechazo (una vez ya está anotada)", () => {
    const ruta = LIBRO("x.json");
    const par = generarPar();
    anotarRevocacion(par.huella, "primera", par.priv, ruta);
    expect(() => anotarRevocacion(par.huella, "otra", par.priv, ruta)).toThrow(
      /ya está revocada/
    );
  });

  it("solo la clave mandante valida su anotación", () => {
    const ruta = LIBRO("rev.json");
    const mandante = generarPar();
    const extraña = generarPar();
    anotarRevocacion(mandante.huella, "firmada de verdad", mandante.priv, ruta);
    expect(estaRevocada(mandante.huella, ruta, mandante.pub)).toBe(true);
    expect(estaRevocada(mandante.huella, ruta, extraña.pub)).toBe(false);
  });

  it("una anotación falsificada (firma ajena) no revoca nada", () => {
    const ruta = LIBRO("x.json");
    const mentiroso = generarPar();
    anotarRevocacion("1111111123456789", "bulo", mentiroso.priv, ruta);
    // la huella anotada es de OTRA clave; con la raíz real de la tienda no valida
    expect(estaRevocada("1111111123456789", ruta, generarPar().pub)).toBe(false);
  });

  it("quitar una anotación equivocada funciona", () => {
    const ruta = LIBRO("rev2.json");
    const par = generarPar();
    anotarRevocacion("0000cafebabe1234", "mal anotada", par.priv, ruta);
    expect(quitarRevocacion("0000cafebabe1234", ruta)).toBe(1);
    expect(leerRevocaciones(ruta).revocaciones).toHaveLength(0);
  });
});
