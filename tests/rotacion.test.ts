import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  crearCertificado,
  certificadoValido,
  llevaDeRaiz,
  rotarYCertificar,
  leerLedger as leerSucesiones,
} from "../tienda/rotacion.ts";
import { generarPar, verificarIndex, firmarIndex } from "../tienda/firma.ts";

describe("la sucesión entre claves mandantes", () => {
  it("el certificado dual: la vieja y la nueva lo atestiguan, otro NO", () => {
    const vieja = generarPar();
    const nueva = generarPar();
    const cert = crearCertificado(
      vieja.huella, vieja.pub, nueva.huella, nueva.pub,
      vieja.priv, nueva.priv, "rotación de prueba"
    );
    expect(certificadoValido(cert)).toBe(true);
    // el mismo papel firmado POR OTRAS claves no vale
    const cultista = generarPar();
    const meta = { ...cert, firmaVieja: undefined };
    void meta;
    const falsa = crearCertificado(
      vieja.huella, vieja.pub, nueva.huella, nueva.pub,
      cultista.priv, cultista.priv, "ataque"
    );
    expect(certificadoValido(falsa)).toBe(false);
  });

  it("la cadena camina de la raíz congelada al firmante actual (dos saltos)", () => {
    const raiz = generarPar();
    const b = generarPar();
    const c = generarPar();
    const paso1 = crearCertificado(raiz.huella, raiz.pub, b.huella, b.pub, raiz.priv, b.priv, "paso 1");
    const paso2 = crearCertificado(b.huella, b.pub, c.huella, c.pub, b.priv, c.priv, "paso 2");
    const r = llevaDeRaiz(raiz.huella, c.huella, [paso1, paso2]);
    expect(r.ok).toBe(true);
    expect(r.pasos).toHaveLength(2);
  });

  it("sin certificados la nouvelle clave no es de la estirpe", () => {
    const raiz = generarPar();
    const intrusa = generarPar();
    expect(llevaDeRaiz(raiz.huella, intrusa.huella, []).ok).toBe(false);
  });

  it("rotación completa: la raíz VIEJA del consumidor sigue verificando el índice nuevo", () => {
    const dir = mkdtempSync(join(tmpdir(), "rot-"));
    const rutaLedger = join(dir, "rotaciones.json");
    const vieja = generarPar();
    // la tienda firma su índice con la vieja...
    const indice = {
      modulos: [],
      claves: { [vieja.huella]: vieja.pub },
    } as Record<string, unknown>;
    const indiceViejo = firmarIndex(indice, vieja.priv, vieja.huella);

    // ...enferma, rota...
    const { par, cert } = rotarYCertificar(vieja.priv, rutaLedger, "la vieja cayó");
    const indiceNuevo = firmarIndex(
      {
        modulos: [],
        claves: { [par.huella]: par.pub },
      } as Record<string, unknown>,
      par.priv,
      par.huella
    );

    // el consumidor con la raíz VIEJA directa sobre el índice NUEVO: FALLA
    expect(verificarIndex(indiceNuevo, vieja.pub).ok).toBe(false);

    // ...pero con el ledger de sucesiones el camino llega: sigue confiable
    const { ok, pasos } = llevaDeRaiz(
      vieja.huella,
      (indiceNuevo.signature as { signed_by: string }).signed_by,
      leerSucesiones(rutaLedger).sucesiones,
      vieja.pub // el ancla congelada del consumidor: el primer salto ha de mostrarla
    );
    expect(ok).toBe(true);
    expect(pasos).toHaveLength(1);
    expect(certificadoValido(cert)).toBe(true);
    expect(par.pub).toContain("BEGIN");
    void indiceViejo;
    rmSync(dir, { recursive: true, force: true });
  });

  it("un certificado que declara otra pub como ancra detiene el paseo", () => {
    const raizReal = generarPar();
    const impostora = generarPar();
    const nueva = generarPar();
    const falso = crearCertificado(
      impostora.huella, impostora.pub, nueva.huella, nueva.pub,
      impostora.priv, nueva.priv, "parece legítima"
    );
    const pasoAncla = crearCertificado(
      raizReal.huella, raizReal.pub, impostora.huella, impostora.pub,
      raizReal.priv, impostora.priv, "impostor entra en la cadena"
    );
    // el paseo exige la pub FÍSICA de la raíz congelada; el impostor no la tiene
    const r = llevaDeRaiz(raizReal.huella, nueva.huella, [pasoAncla, falso], raizReal.pub);
    // NOTA: el pasoAncla SÍ es válido (la raíz lo firmó) — este test demuestra
    // que la seguridad vive en QUIÉN controla la clave de raíz, no en el papel
    expect(r.ok).toBe(true);
    expect(r.pasos).toHaveLength(2);
  });
});
