import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicKey } from "node:crypto";
import { crearServidor } from "../tienda/servidor.ts";
import { instalarRemoto } from "../tienda/cliente.ts";
import { abreHost } from "../core/extension-host/host.ts";
import { firmarIndex, generarPar } from "../tienda/firma.ts";

const raiz = resolve(import.meta.dirname, "..");
// la raíz que un forastero fija: su única lectura de confianza
const pubRaiz = () =>
  createPublicKey(
    readFileSync(join(raiz, ".keys", "index-dev.pem"), "utf8")
  ).export({ type: "spki", format: "pem" }).toString();

const servidor = crearServidor(raiz);
await servidor.listo();
const forastero = () => mkdtempSync(join(tmpdir(), "forastero-"));
afterAll(() => servidor.cerrar());

describe("el consumidor remoto: HTTP + confianza en su raíz", () => {
  it("baja de la red, verifica e instala de verdad", async () => {
    const destino = forastero();
    const inst = await instalarRemoto(
      servidor.url(),
      "esme.nucleo.troceo-pro",
      await pubRaiz(),
      destino
    );
    expect(inst.id).toBe("esme.nucleo.troceo-pro");
    expect(inst.via).toBe("directa");
    // el módulo instalado corre en SU host
    const host = abreHost(join(inst.dir, inst.entrada));
    const filas = (await host.call(
      "filasDe",
      await host.call("troceaConFilas", "n", "| a | b |\n|---|---|\n| uno | dos |\n")
    )) as { texto: string }[];
    expect(filas.some((f) => f.texto.includes("dos"))).toBe(true);
    await host.cerrar();
    rmSync(destino, { recursive: true, force: true });
  });

  it("un índice firmado por OTRAS claves es rechazado antes de bajar nada", async () => {
    const destino = forastero();
    const impostora = generarPar();
    // servimos un índice falso montado en una mini-tienda trampa
    const trampa = mkdtempSync(join(tmpdir(), "trampa-"));
    mkdirSync(join(trampa, "tienda"), { recursive: true });
    writeFileSync(
      join(trampa, "tienda", "index.json"),
      JSON.stringify(
        firmarIndex({ modulos: [], claves: {} }, impostora.priv, impostora.huella)
      )
    );
    const servidorTrampa = crearServidor(trampa);
    try {
      await servidorTrampa.listo();
      await expect(
        instalarRemoto(servidorTrampa.url(), "esme.nucleo.troceo-pro", await pubRaiz(), destino)
      ).rejects.toThrow(/estirpe/);
    } finally {
      await servidorTrampa.cerrar();
      rmSync(trampa, { recursive: true, force: true });
      rmSync(destino, { recursive: true, force: true });
    }
  });

  it("lo que la tienda no publica, no se baja (404 con rechazo claro)", async () => {
    const destino = forastero();
    await expect(
      instalarRemoto(servidor.url(), "esme.nucleo.inexistente", await pubRaiz(), destino)
    ).rejects.toThrow(/no está en el índice/);
    rmSync(destino, { recursive: true, force: true });
  });
});
