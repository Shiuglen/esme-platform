import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { crearServidor } from "../tienda/servidor.ts";
import { instalarRemoto } from "../tienda/cliente.ts";
import { abreHost } from "../core/extension-host/host.ts";
import { firmarIndex, generarPar, declaraClave } from "../tienda/firma.ts";
import { leeRaiz } from "../tienda/raiz.ts";

const raiz = resolve(import.meta.dirname, "..");
// la raíz que un forastero fija: la CONGELADA que viaja en el repo (su única
// lectura de confianza). No la clave de desarrollo: esa es de quien publica.
const pubRaiz = () => leeRaiz(raiz) as string;

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
    // la raíz congelada es la antepasada: la tienda llega por la CADENA de
    // rotaciones, no directa. Directa sería igual de válida, pero aquí la
    // prueba es justamente que la estirpe avala al firmante vivo.
    expect(inst.via).toBe("cadena");
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

  it("si la vitrina no dice la verdad sobre lo que pide, NO se instala", async () => {
    // el índice dice que el módulo pide `proc:spawn` (algo que el módulo de
    // verdad NO pide): la persona vio una cosa en la vitrina y se instala
    // otra. Eso no se instala.
    const destino = forastero();
    const tienda = mkdtempSync(join(tmpdir(), "tienda-"));
    cpSync(join(raiz, "tienda"), join(tienda, "tienda"), { recursive: true });
    const rutaIndice = join(tienda, "tienda", "index.json");
    const indice = JSON.parse(readFileSync(rutaIndice, "utf8")) as {
      modulos: Array<{ id: string; permisos?: string[] }>;
    };
    const entrada = indice.modulos.find((m) => m.id === "esme.nucleo.troceo-pro");
    if (!entrada) throw new Error("el módulo de prueba no está en el índice");
    entrada.permisos = ["proc:spawn", "mind:read"];
    // y se vuelve a firmar con una raíz que el forastero confía DIRECTAMENTE,
    // hecha aquí mismo: lo que se cambia es la ENTRADA, no la confianza. No
    // se firma con la llave de desarrollo de la máquina: esa solo está en la
    // estirpe en la máquina de quien publica, y en un clon limpio (la CI) la
    // prueba se caería por la confianza antes de llegar a la vitrina. El
    // firmante se DECLARA dentro del índice (la misma regla que firma:index
    // usa: si no, el consumidor no sabe con quién mirar la firma). El
    // artefacto sigue firmado por quien lo publicó, declarado en el índice.
    const raizDeLaPrueba = generarPar();
    const declarado = declaraClave(
      indice as unknown as Record<string, unknown>,
      raizDeLaPrueba.pub,
      raizDeLaPrueba.huella
    );
    writeFileSync(
      rutaIndice,
      JSON.stringify(firmarIndex(declarado, raizDeLaPrueba.priv, raizDeLaPrueba.huella), null, 2)
    );

    const servidorMiente = crearServidor(tienda);
    try {
      await servidorMiente.listo();
      await expect(
        instalarRemoto(servidorMiente.url(), "esme.nucleo.troceo-pro", raizDeLaPrueba.pub, destino)
      ).rejects.toThrow(/la vitrina no decía la verdad/);
    } finally {
      await servidorMiente.cerrar();
      rmSync(tienda, { recursive: true, force: true });
      rmSync(destino, { recursive: true, force: true });
    }
  });
});
