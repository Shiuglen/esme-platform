/**
 * LOS DESEOS FIRMADOS — la demanda escrita, con su firma.
 *
 * Lo que se prueba:
 *
 *   1. la lista firmada se verifica con la llave que la firmó;
 *   2. y un byte cambiado rompe la firma (la demanda no se puede retocar);
 *   3. la confianza camina la estirpe (como el índice): una lista firmada por
 *      una llave de la estirpe vale; una firmada por una llave desconocida, no;
 *   4. y la lista de la casa (tienda/deseos.json) verifica de verdad.
 *
 * Referencia: core/tienda/deseos-firmados.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  firmaDeseos,
  verificaDeseos,
  confiaDeseos,
} from "../core/tienda/deseos-firmados.ts";
import { generarPar } from "../tienda/firma.ts";
import { crearDelegacion, guardarLedger } from "../tienda/rotacion.ts";
import { juzgaDeseos } from "../core/tienda/deseos.ts";
import type { Deseo } from "../core/tienda/deseos.ts";

const raiz = join(import.meta.dirname, "..");

const deseo = (parcial: Partial<Deseo> = {}): Deseo => ({
  id: "esme.deseo.prueba",
  url: "https://x.com/alguien/status/1",
  autor: "@alguien",
  texto: "Quiero que los puntos se puedan ver desde la ventana.",
  etiquetas: ["puntos"],
  estado: "nuevo",
  ts: 1_700_000_000_000,
  ...parcial,
});

describe("los deseos firmados", () => {
  it("la lista firmada verifica con la llave que la firmó", () => {
    const clave = generarPar();
    const firmada = firmaDeseos([deseo()], clave.priv, clave.huella);
    const v = verificaDeseos(JSON.stringify(firmada), clave.pub);
    expect(v.ok).toBe(true);
  });

  it("un byte retocado rompe la firma", () => {
    const clave = generarPar();
    const firmada = firmaDeseos([deseo()], clave.priv, clave.huella);
    const texto = JSON.stringify(firmada).replace("puntos", "PUNTOS");
    const v = verificaDeseos(texto, clave.pub);
    expect(v.ok).toBe(false);
  });

  it("una lista firmada por una llave desconocida no vale", () => {
    const desconocida = generarPar();
    const firmada = firmaDeseos([deseo()], desconocida.priv, desconocida.huella);
    const raizClave = generarPar();
    const v = verificaDeseos(JSON.stringify(firmada), raizClave.pub);
    expect(v.ok).toBe(false);
  });

  it("la confianza camina la estirpe (como el índice)", () => {
    const raizClave = generarPar();
    const delegado = generarPar();
    const cert = crearDelegacion(raizClave.pub, delegado.pub, raizClave.priv, "publicador");
    const ledger = join("/tmp", `esme-ledger-${Date.now()}.json`);
    guardarLedger(ledger, { sucesiones: [], delegaciones: [cert] });

    const firmada = firmaDeseos([deseo()], delegado.priv, delegado.huella);
    const c = confiaDeseos(JSON.stringify(firmada), raizClave.pub, ledger);
    expect(c.ok).toBe(true);
    expect(c.via).toBe("delegada");
  });

  it("la lista de la casa verifica de verdad (con la raíz y la estirpe)", () => {
    const ruta = join(raiz, "tienda", "deseos.json");
    if (!existsSync(ruta)) return; // la lista aún no se ha publicado
    const pubRaiz = readFileSync(join(raiz, "tienda", "raiz.pub.pem"), "utf8");
    const c = confiaDeseos(
      readFileSync(ruta, "utf8"),
      pubRaiz,
      join(raiz, "tienda", "rotaciones.json")
    );
    expect(c.ok).toBe(true);
  });

  it("y los deseos de la casa son válidos (juzgados)", () => {
    const ruta = join(raiz, "tienda", "deseos-lista.json");
    if (!existsSync(ruta)) return;
    const v = juzgaDeseos(JSON.parse(readFileSync(ruta, "utf8")));
    expect(v.ok).toBe(true);
    expect(v.deseos.length).toBeGreaterThan(0);
  });
});
