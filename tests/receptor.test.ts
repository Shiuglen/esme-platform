import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { instalar, verificarPaquete, clavePub } from "../tienda/receptor.ts";
import { abreHost } from "../core/extension-host/host.ts";

const raiz = resolve(import.meta.dirname, "..");
const tmp = () => mkdtempSync(join(tmpdir(), "rec-"));

const ID = "esme.nucleo.troceo-pro";

describe("el receptor: verificar antes de creer", () => {
  it("el paquete honesto pasa la verificación con su sha256 a la vista", () => {
    const v = verificarPaquete(ID, "0.1.0", raiz, clavePub(raiz));
    if (!v.ok) throw new Error(v.razon);
    expect(v.bytes).toBeGreaterThan(500);
    expect(v.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("un tar al que se le toca UN byte es rechazado", () => {
    const original = readFileSync(
      join(raiz, "tienda", "paquetes", "esme-nucleo-troceo-pro-0.1.0.tgz")
    );
    const sabotado = Buffer.from(original);
    const donde = Math.floor(sabotado.length / 2);
    sabotado[donde] = sabotado[donde] ^ 0x01;
    const rutaSaboteada = join(tmp(), "sabotado.tgz");
    writeFileSync(rutaSaboteada, sabotado);
    const v = verificarPaquete(ID, "0.1.0", raiz, clavePub(raiz), {
      tar: rutaSaboteada,
    });
    expect(v.ok).toBe(false);
    expect("razon" in v && v.razon.length).toBeGreaterThan(5);
  });

  it("instala: la carpeta instalada dice el id correcto y trae su dist", () => {
    const destino = tmp();
    const inst = instalar(ID, raiz, destino);
    expect(inst.id).toBe(ID);
    expect(inst.version).toBe("0.1.0");
    expect(readFileSync(join(inst.dir, "module.yaml"), "utf8")).toContain(
      "esme.nucleo.troceo-pro"
    );
    rmSync(destino, { recursive: true, force: true });
  });

  it("instalación rechazada si el índice no publica otra versión", () => {
    expect(() => instalar(ID, raiz, tmp(), { version: "9.9.9" })).toThrow(
      /rechazada|no publica/
    );
  });

  it("el módulo instalado corre en el extension host y contesta por filas", async () => {
    const destino = tmp();
    const inst = instalar(ID, raiz, destino);
    const host = abreHost(join(inst.dir, inst.entrada));
    const DOC = "| a | b |\n|---|---|\n| uno | dos |\n| tres | cuatro |\n";
    const trozos = (await host.call("troceaConFilas", "n", DOC)) as unknown[];
    const filas = (await host.call("filasDe", trozos)) as { texto: string }[];
    expect(filas.length).toBeGreaterThanOrEqual(2);
    expect(filas.some((f) => f.texto.includes("tres"))).toBe(true);
    await host.cerrar();
    rmSync(destino, { recursive: true, force: true });
  });
});
