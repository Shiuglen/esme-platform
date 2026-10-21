/**
 * LA ESTIRPE QUE DELEGA — la tienda federada.
 *
 * Lo que se prueba:
 *
 *   1. una llave que publica sin derecho NO publica (se rechaza);
 *   2. una llave DELEGADA por la raíz sí publica, y el consumidor con la raíz
 *      congelada lo verifica (vía «delegada»);
 *   3. una delegación no válida (firmada por otra cosa) no vale;
 *   4. y el delegado no puede fingir ser la raíz: la firma que el consumidor
 *      comprueba es la del delegado, sobre el índice entero.
 *
 * Referencia: tienda/rotacion.ts, tienda/claves.ts, scripts/delegar.ts.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generarPar, firmarIndex, declaraClave } from "../tienda/firma.ts";
import {
  crearDelegacion,
  delegacionValida,
  leerLedger,
  guardarLedger,
  rutaRotaciones,
  llevaDeRaizConDelegados,
  type CertDelegacion,
} from "../tienda/rotacion.ts";
import { confiaIndexChain } from "../tienda/rotacion.ts";
import { leeRaiz } from "../tienda/raiz.ts";

/** Una casa de mentira: su raíz congelada y su ledger. */
const casa = (): { raiz: string; pubRaiz: string; rutaLedger: string; raizPar: ReturnType<typeof generarPar> } => {
  const dir = mkdtempSync(join(tmpdir(), "esme-estre-"));
  mkdirSync(join(dir, "tienda"), { recursive: true });
  const raizPar = generarPar();
  writeFileSync(join(dir, "tienda", "raiz.pub.pem"), raizPar.pub);
  const rutaLedger = rutaRotaciones(dir);
  guardarLedger(rutaLedger, { sucesiones: [], delegaciones: [] });
  return { raiz: dir, pubRaiz: raizPar.pub, rutaLedger, raizPar };
};

describe("la delegación", () => {
  it("la mandante la firma (y el delegado no puede hacerla por sí mismo)", () => {
    const mandante = generarPar();
    const delegado = generarPar();
    const cert = crearDelegacion(mandante.pub, delegado.pub, mandante.priv, "publicador de confianza");
    expect(delegacionValida(cert)).toBe(true);
    expect(cert.ambito).toBe("publicar");
    expect(cert.motivo).toBe("publicador de confianza");

    // el mismo certificado, pero con la firma de OTRA llave: no vale
    const otro = generarPar();
    const falso = {
      ...cert,
      firma: crearDelegacion(mandante.pub, otro.pub, otro.priv, "x").firma,
    };
    expect(delegacionValida(falso)).toBe(false);
  });

  it("la raíz llega al delegado por el camino de las delegaciones", () => {
    const mandante = generarPar();
    const delegado = generarPar();
    const cert = crearDelegacion(mandante.pub, delegado.pub, mandante.priv, "x");
    const camino = llevaDeRaizConDelegados(
      mandante.huella,
      delegado.huella,
      [],
      [cert],
      mandante.pub
    );
    expect(camino.ok).toBe(true);
    expect(camino.pasos.join(" ")).toContain("delega");
  });

  it("una llave que nadie delegó no llega a ninguna parte", () => {
    const mandante = generarPar();
    const otro = generarPar();
    const camino = llevaDeRaizConDelegados(mandante.huella, otro.huella, [], [], mandante.pub);
    expect(camino.ok).toBe(false);
  });
});

describe("el consumidor con la raíz congelada", () => {
  it("acepta un índice firmado por un delegado (vía «delegada»)", () => {
    const { raiz, pubRaiz, rutaLedger, raizPar } = casa();
    try {
      const delegado = generarPar();
      const cert = crearDelegacion(raizPar.pub, delegado.pub, raizPar.priv, "publicador de confianza");
      const ledger = leerLedger(rutaLedger);
      guardarLedger(rutaLedger, {
        sucesiones: ledger.sucesiones,
        delegaciones: [...(ledger.delegaciones ?? []), cert],
      });

      const indice = firmarIndex(
        declaraClave({ schema_version: 1, modulos: [] }, delegado.pub, delegado.huella),
        delegado.priv,
        delegado.huella
      );
      const confianza = confiaIndexChain(indice, pubRaiz, rutaLedger);
      expect(confianza.ok).toBe(true);
      expect(confianza.via).toBe("delegada");
      expect(confianza.pubActiva).toBeTruthy();
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("RECHAZA un índice firmado por una llave sin delegar", () => {
    const { raiz, pubRaiz, rutaLedger } = casa();
    try {
      const desconocido = generarPar();
      const indice = firmarIndex(
        declaraClave({ schema_version: 1, modulos: [] }, desconocido.pub, desconocido.huella),
        desconocido.priv,
        desconocido.huella
      );
      const confianza = confiaIndexChain(indice, pubRaiz, rutaLedger);
      expect(confianza.ok).toBe(false);
      expect(confianza.via).toBe("ninguna");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("RECHAZA una delegación que no está bien firmada", () => {
    const { raiz, pubRaiz, rutaLedger, raizPar } = casa();
    try {
      const delegado = generarPar();
      const mentirosa: CertDelegacion = {
        ...crearDelegacion(raizPar.pub, delegado.pub, raizPar.priv, "x"),
        // la firma es de otra llave: el papel no vale
        firma: crearDelegacion(raizPar.pub, delegado.pub, generarPar().priv, "x").firma,
      };
      guardarLedger(rutaLedger, { sucesiones: [], delegaciones: [mentirosa] });
      const indice = firmarIndex(
        declaraClave({ schema_version: 1, modulos: [] }, delegado.pub, delegado.huella),
        delegado.priv,
        delegado.huella
      );
      expect(confiaIndexChain(indice, pubRaiz, rutaLedger).ok).toBe(false);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("la raíz sigue siendo la raíz (delegar no la transfiere)", () => {
    const { raiz, pubRaiz, rutaLedger, raizPar } = casa();
    try {
      const delegado = generarPar();
      const cert = crearDelegacion(raizPar.pub, delegado.pub, raizPar.priv, "x");
      guardarLedger(rutaLedger, { sucesiones: [], delegaciones: [cert] });
      // un índice firmado por la raíz: sigue siendo directa
      const indice = firmarIndex(
        declaraClave({ schema_version: 1, modulos: [] }, raizPar.pub, raizPar.huella),
        raizPar.priv,
        raizPar.huella
      );
      const confianza = confiaIndexChain(indice, pubRaiz, rutaLedger);
      expect(confianza.ok).toBe(true);
      expect(confianza.via).toBe("directa");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});
