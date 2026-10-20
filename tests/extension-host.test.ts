import { describe, expect, it } from "vitest";
import { abreHost } from "../core/extension-host/host.ts";
import { resolve } from "node:path";

// el dist se reconstruye antes de correr (ver package.json: build:ejemplo)
const dist = resolve(
  import.meta.dirname,
  "../modulos/ejemplo-hola-mundo/dist/index.js"
);

describe("extension host real (worker viva, puerta con nonce)", () => {
  it("el módulo entra y responde desde su propio mundo del worker", async () => {
    const host = abreHost(dist);
    try {
      const r = (await host.call("resumen", ["la mente es local", "el servidor nunca piensa"])) as {
        id: string;
        total: number;
        primera: string | null;
      };
      expect(r.id).toBe("esme.nucleo.hola-mundo");
      expect(r.total).toBe(2);
      expect(r.primera).toBe("la mente es local");
    } finally {
      await host.cerrar();
    }
  });

  it("una función no exportada queda cerrada por la puerta del host", async () => {
    const host = abreHost(dist);
    try {
      await expect(host.call("leechProcess")).rejects.toThrow(/no exportado/);
    } finally {
      await host.cerrar();
    }
  });

  it("los argumentos serializables cruzan; lo no serializable explota en la puerta", async () => {
    const host = abreHost(dist);
    try {
      // el ciclo pide una función de recall: imposible de clonar → la puerta
      // del host responde con error controlado, no con un crash del proceso
      await expect(host.call("ciclo", () => [])).rejects.toThrow(/clone|serialize|Error/i);
    } finally {
      await host.cerrar();
    }
  });
});
