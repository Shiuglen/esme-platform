// La puerta hacia dentro: el MÓDULO pregunta a la mente y la respuesta vuelve.
//
// El módulo no recibe la mente: pide. El host decide (permiso declarado,
// forma verificada con zod) y la mente nunca sale del proceso del host.
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { abreHost } from "../core/extension-host/host.ts";
import type { MenteViva } from "../core/ipc/mind-schema.ts";
import type { Rumbo } from "../core/mind/rumbo.ts";

const raiz = resolve(import.meta.dirname, "..");

const RUMBO: Rumbo = {
  version: 1,
  pilares: [{ id: "p1", texto: "Esme de otro mundo", creado: 1 }],
  objetivos: [
    { id: "o1", texto: "La tienda firmada", estado: "activo", creado: 2, cerrado: null, pilar: "p1" },
    { id: "o2", texto: "El juez de las skills", estado: "pausado", creado: 3, cerrado: null, pilar: "p1" },
  ],
};

const menteStub: MenteViva = {
  recall: async (q, budget) => [{ id: "1", texto: q, tokens: budget }],
  remember: async () => ({ id: "n1" }),
  rumbo: async () => RUMBO,
};

/**
 * Un módulo de verdad: TypeScript, compilado con esbuild como se compila un
 * módulo publicado. Pregunta por la puerta (el SDK del kit).
 */
async function moduloQuePregunta(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "modulo-puerta-"));
  const fuente = join(dir, "modulo.ts");
  writeFileSync(
    fuente,
    `
import { mente } from "${raiz}/core/ipc/sdk.ts";

export async function paraQueTrabaja(): Promise<{ pilares: string[]; activos: string[] }> {
  const r = await mente().rumbo();
  return {
    pilares: r.pilares.map((p) => p.texto),
    activos: r.objetivos.filter((o) => o.estado === "activo").map((o) => o.texto),
  };
}

export async function recuerda(query: string): Promise<string[]> {
  const rs = await mente().recall({ query });
  return rs.map((r) => r.texto);
}
`
  );
  const salida = join(dir, "modulo.mjs");
  await build({
    entryPoints: [fuente],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: salida,
    logLevel: "silent",
  });
  return salida;
}

describe("la puerta hacia dentro (el módulo pregunta a la mente)", () => {
  it("el módulo pregunta el rumbo y le llega", async () => {
    const host = abreHost(await moduloQuePregunta(), { permisos: ["mind:read"], mente: menteStub });
    try {
      const r = (await host.call("paraQueTrabaja")) as { pilares: string[]; activos: string[] };
      expect(r.pilares).toEqual(["Esme de otro mundo"]);
      expect(r.activos).toEqual(["La tienda firmada"]); // el pausado no está activo
    } finally {
      await host.cerrar();
    }
  });

  it("y también puede recordar: el ciclo completo, desde dentro", async () => {
    const host = abreHost(await moduloQuePregunta(), { permisos: ["mind:read"], mente: menteStub });
    try {
      const r = (await host.call("recuerda", "qué es el Tálamo")) as string[];
      expect(r).toEqual(["qué es el Tálamo"]);
    } finally {
      await host.cerrar();
    }
  });

  it("sin permiso declarado, la puerta se CIERRA y el módulo lo sabe", async () => {
    const host = abreHost(await moduloQuePregunta(), { permisos: [], mente: menteStub });
    try {
      await expect(host.call("paraQueTrabaja")).rejects.toThrow(/permiso no concedido/);
    } finally {
      await host.cerrar();
    }
  });

  it("el módulo no recibe la mente: recibe la respuesta", async () => {
    const host = abreHost(await moduloQuePregunta(), { permisos: ["mind:read"], mente: menteStub });
    try {
      const r = (await host.call("paraQueTrabaja")) as Record<string, unknown>;
      // ni la mente, ni sus funciones, ni un camino a ella
      expect(Object.keys(r)).toEqual(["pilares", "activos"]);
      expect(JSON.stringify(r)).not.toContain("recall");
    } finally {
      await host.cerrar();
    }
  });

  it("un método que no existe en el contrato se rechaza en la puerta", async () => {
    const dir = mkdtempSync(join(tmpdir(), "modulo-puerta-"));
    const fuente = join(dir, "modulo.ts");
    writeFileSync(
      fuente,
      `
export async function inventa(): Promise<string> {
  const m = (globalThis as any).mente;
  return await m.loquesea({});
}
`
    );
    const salida = join(dir, "modulo.mjs");
    await build({
      entryPoints: [fuente],
      bundle: true,
      format: "esm",
      platform: "node",
      outfile: salida,
      logLevel: "silent",
    });
    const host = abreHost(salida, { permisos: ["mind:read"], mente: menteStub });
    try {
      await expect(host.call("inventa")).rejects.toThrow(/desconocido/);
    } finally {
      await host.cerrar();
    }
  });

  it("sin puerta, el SDK lo dice (no finge que preguntó)", async () => {
    const { mente } = await import("../core/ipc/sdk.ts");
    expect(() => mente()).toThrow(/no tiene puerta a la mente/);
  });
});
