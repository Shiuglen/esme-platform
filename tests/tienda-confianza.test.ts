import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { empaquetar, sha256De } from "../tienda/empaque.ts";
import { firmarBytes, verificarBytes, generarPar } from "../tienda/firma.ts";
import { validaCiclo, type BenchCiclo } from "../tienda/bench.ts";
import { panelDe } from "../tienda/panel.ts";
import { resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const tmp = (nombre: string) =>
  mkdtempSync(join(tmpdir(), `tgz-${nombre}-`));

describe("la capa de confianza de la tienda", () => {
  it("el tarball es reproducible: dos empaques → mismo sha256", () => {
    const a = empaquetar(`${raiz}/modulos/ejemplo-hola-mundo`, tmp("a"));
    const b = empaquetar(`${raiz}/modulos/ejemplo-hola-mundo`, tmp("b"));
    expect(a.sha256).toBe(b.sha256);
    expect(sha256De(a.ruta)).toBe(a.sha256);
    rmSync(a.ruta, { force: true });
    rmSync(b.ruta, { force: true });
  });

  it("la firma de bytes vale, un byte cambia la rompe", () => {
    const { priv, pub } = generarPar();
    const bytes = Buffer.from("el artefacto completo");
    const f = firmarBytes(bytes, priv, "esme@bench");
    expect(verificarBytes(bytes, f, pub).ok).toBe(true);
    bytes[0] = 0xff; // un byte distinto y la firma cae
    expect(verificarBytes(bytes, f, pub).ok).toBe(false);
  });

  it("el bench de herramienta: el ciclo ok entra, el roto no", () => {
    const bien: BenchCiclo = {
      modulo: "x",
      version: "0.1.0",
      fecha: "hoy",
      casos: 3,
      ciclo_ok: true,
      tokens_ciclo: 20,
    };
    expect(validaCiclo(bien).entra).toBe(true);
    expect(validaCiclo({ ...bien, ciclo_ok: false }).entra).toBe(false);
    expect(validaCiclo({ ...bien, tokens_ciclo: 900 }).entra).toBe(false);
    expect(validaCiclo({ ...bien, casos: 1 }).entra).toBe(false);
  });

  it("el panel juzga memoria con recall y herramienta con el ciclo", () => {
    const indice = {
      modulos: [
        {
          id: "esme.nucleo.troceo-pro",
          version: "0.1.0",
          category: "memory",
          bench: {
            modulo: "esme.nucleo.troceo-pro",
            casos: 12,
            recall_base: 0.25,
            recall_con: 1.0,
            tokens_base: 22,
            tokens_con: 37,
          },
        },
        {
          id: "esme.nucleo.hola-mundo",
          version: "0.1.0",
          category: "tool",
          bench_ciclo: {
            modulo: "esme.nucleo.hola-mundo",
            casos: 3,
            ciclo_ok: true,
            tokens_ciclo: 19,
          },
        },
        { id: "esme.nucleo.sin-bench", version: "0.1.0", category: "tool" },
      ],
    };
    const p = panelDe(indice);
    expect(p.filas.find((f) => f.id.includes("troceo-pro"))?.entra).toBe(true);
    expect(p.filas.find((f) => f.id.includes("hola-mundo"))?.entra).toBe(true);
    expect(p.filas.find((f) => f.id.includes("sin-bench"))?.entra).toBe(false);
  });
});
