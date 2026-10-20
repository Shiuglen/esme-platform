import { describe, expect, it } from "vitest";
import { abreHost } from "../core/extension-host/host.ts";
import { resolve } from "node:path";
import type { MenteViva } from "../core/ipc/mind-schema.ts";

const dist = resolve(import.meta.dirname, "../modulos/ejemplo-hola-mundo/dist/index.js");
const cerrar = {} as Record<string, never>;
void cerrar;

const menteTstub: MenteViva = {
  recall: async (q, budget) => [{ id: "1", texto: q, tokens: budget }],
};

describe("la puerta de la mente (denyall + zod + permiso declarado)", () => {
  it("recall con permiso declarado pasa y vuelve del Tálamo", async () => {
    const host = abreHost(dist, { permisos: ["mind:read"], mente: menteTstub });
    try {
      const r = (await host.call("mind.recall", { query: "qué es el Tálamo", budget: 300 })) as {
        id: string;
        tokens: number;
        texto: string;
      }[];
      expect(r[0].texto).toBe("qué es el Tálamo");
      expect(r[0].tokens).toBe(300);
    } finally {
      await host.cerrar();
    }
  });

  it("recall SIN permiso declarado queda DENEGADO, no fallado", async () => {
    const host = abreHost(dist, { permisos: [], mente: menteTstub });
    try {
      await expect(host.call("mind.recall", { query: "x" })).rejects.toThrow(/permiso no concedido/);
    } finally {
      await host.cerrar();
    }
  });

  it("remember sin mind:write → denegado; con mind:write → llega a la mente", async () => {
    let guardado: string | null = null;
    const mente: MenteViva = {
      recall: async () => [],
      remember: async (text) => {
        guardado = text;
        return { id: "n1" };
      },
    };
    const hostDenie = abreHost(dist, { permisos: ["mind:read"], mente });
    await expect(hostDenie.call("mind.remember", { text: "hola" })).rejects.toThrow(/mind:write/);
    await hostDenie.cerrar();

    const hostCon = abreHost(dist, { permisos: ["mind:read", "mind:write"], mente });
    try {
      const r = (await hostCon.call("mind.remember", { text: "hecho nuevo", kind: "decision" })) as {
        id: string;
      };
      expect(r.id).toBe("n1");
      expect(guardado).toBe("hecho nuevo");
    } finally {
      await hostCon.cerrar();
    }
  });

  it("forma ilegal (query número) es rechazada por el SCHEMA, no por suerte", async () => {
    const host = abreHost(dist, { permisos: ["mind:read"], mente: menteTstub });
    try {
      await expect(host.call("mind.recall", { query: 42 })).rejects.toThrow(/forma ilegal/);
    } finally {
      await host.cerrar();
    }
  });

  it("metodo inexistente mind.loquesea → mensaje claro", async () => {
    const host = abreHost(dist, { permisos: ["mind:read"], mente: menteTstub });
    try {
      await expect(host.call("mind.nulo", { q: 1 })).rejects.toThrow(/desconocido/);
    } finally {
      await host.cerrar();
    }
  });

  it("host sin mente conectada nunca miente: se Proclama", async () => {
    const host = abreHost(dist, { permisos: ["mind:read"] });
    try {
      await expect(host.call("mind.recall", { query: "x" })).rejects.toThrow(/no hay mente/);
    } finally {
      await host.cerrar();
    }
  });
});
