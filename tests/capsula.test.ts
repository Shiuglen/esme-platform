/**
 * La CÁPSULA — lo que un módulo NO puede hacer, comprobado.
 *
 * Estos tests no miran el código: abren un worker de verdad, con un módulo de
 * verdad, y preguntan. Si la cápsula se abre, el test falla.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abreHost } from "../core/extension-host/host.ts";
import { esProhibido } from "../core/extension-host/sandbox.ts";

/** Un módulo de mentira, escrito en el disco, que hace lo que le pidan. */
function moduloCon(cuerpo: string): string {
  const dir = mkdtempSync(join(tmpdir(), "esme-capsula-"));
  const ruta = join(dir, "mod.mjs");
  writeFileSync(
    ruta,
    `export async function prueba() { ${cuerpo} }`,
    "utf8"
  );
  return ruta;
}

describe("la cápsula: los núcleos prohibidos no se importan", () => {
  it("importar node:fs falla con el motivo, no con un error raro", async () => {
    const ruta = moduloCon(`try { await import("node:fs"); return "IMPORTADO"; }
      catch (e) { return String(e.message).slice(0, 120); }`);
    const host = abreHost(ruta);
    try {
      const r = (await host.call("prueba")) as string;
      expect(r).not.toContain("IMPORTADO");
      expect(r).toContain("cápsula");
    } finally {
      await host.cerrar();
    }
  });

  it("importar node:child_process tampoco", async () => {
    const ruta = moduloCon(`try { await import("node:child_process"); return "IMPORTADO"; }
      catch (e) { return String(e.message).slice(0, 120); }`);
    const host = abreHost(ruta);
    try {
      expect(await host.call("prueba")).not.toContain("IMPORTADO");
    } finally {
      await host.cerrar();
    }
  });

  it("la lista de prohibidos cubre los nodos que filtran o tocan el sistema", () => {
    for (const n of ["node:fs", "node:child_process", "node:os", "node:process", "node:net", "node:http"]) {
      expect(esProhibido(n)).toBe(true);
    }
    expect(esProhibido("node:path")).toBe(false);
    expect(esProhibido("node:crypto")).toBe(false);
  });

  it("node:module está prohibido: quien pueda tocarlo puede desarmar la cápsula", async () => {
    // `module.registerHooks` permite redirigir el cargador: un módulo que
    // pudiera importarlo podría reopenar `node:fs` para sí solo. Por eso
    // `node:module` está en la lista de prohibidos, y no por casualidad.
    const ruta = moduloCon(`try { await import("node:module"); return "IMPORTADO"; }
      catch (e) { return "BLOQUEADO"; }`);
    const host = abreHost(ruta);
    try {
      expect(await host.call("prueba")).toBe("BLOQUEADO");
    } finally {
      await host.cerrar();
    }
  });

  it("ni siquiera con createRequire se llega al disco", async () => {
    // el cargador también intercepta `require`: la puerta trasera está cerrada
    // por el mismo sitio que la principal
    const ruta = moduloCon(`try {
        const { createRequire } = await import("node:module");
        const fs = createRequire(import.meta.url)("node:fs");
        return "IMPORTADO:" + typeof fs.readFileSync;
      } catch (e) { return "BLOQUEADO"; }`);
    const host = abreHost(ruta);
    try {
      expect(await host.call("prueba")).toBe("BLOQUEADO");
    } finally {
      await host.cerrar();
    }
  });
});

describe("la cápsula: los globales se ciegan", () => {
  it("fetch no existe en el mundo del módulo", async () => {
    const ruta = moduloCon(`return typeof globalThis.fetch;`);
    const host = abreHost(ruta);
    try {
      expect(await host.call("prueba")).toBe("undefined");
    } finally {
      await host.cerrar();
    }
  });

  it("process.env no enseña las llaves de la persona", async () => {
    const ruta = moduloCon(`return JSON.stringify({
      home: process.env.HOME ?? null,
      claves: Object.keys(process.env ?? {}).length,
    });`);
    process.env.ESME_LLAVE_SECRETA = "no-deberia-salir";
    const host = abreHost(ruta);
    try {
      const r = JSON.parse((await host.call("prueba")) as string) as {
        home: string | null;
        claves: number;
      };
      expect(r.home).toBeNull();
      expect(r.claves).toBe(0);
    } finally {
      delete process.env.ESME_LLAVE_SECRETA;
      await host.cerrar();
    }
  });
});

describe("la puerta: lo concedido existe, lo demás no", () => {
  it("sin permisos, la puerta no tiene ni fs ni net", async () => {
    const ruta = moduloCon(`const e = globalThis.esme;
      return JSON.stringify({ fs: typeof e.fs, net: typeof e.net, ipc: typeof e.ipc, mente: typeof e.mente });`);
    const host = abreHost(ruta, { permisos: [], concedidas: [] });
    try {
      const r = JSON.parse((await host.call("prueba")) as string) as Record<string, string>;
      expect(r.fs).toBe("undefined");
      expect(r.net).toBe("undefined");
      expect(r.ipc).toBe("undefined");
      expect(r.mente).toBe("undefined");
    } finally {
      await host.cerrar();
    }
  });

  it("lo declarado y no concedido NO se monta (laintersección manda)", async () => {
    const ruta = moduloCon(`return typeof globalThis.esme.fs;`);
    const host = abreHost(ruta, { permisos: ["fs:project"], concedidas: [] });
    try {
      expect(await host.call("prueba")).toBe("undefined");
    } finally {
      await host.cerrar();
    }
  });

  it("lo declarado y concedido sí se monta", async () => {
    const ruta = moduloCon(`return typeof globalThis.esme.fs;`);
    const host = abreHost(ruta, {
      permisos: ["fs:project"],
      concedidas: ["fs:project"],
      proyecto: mkdtempSync(join(tmpdir(), "esme-proyecto-")),
    });
    try {
      expect(await host.call("prueba")).toBe("object");
    } finally {
      await host.cerrar();
    }
  });
});

describe("la puerta del disco: confinada al proyecto", () => {
  it("lee dentro del proyecto", async () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-proyecto-"));
    writeFileSync(join(dir, "nota.txt"), "hola", "utf8");
    const ruta = moduloCon(
      `return await globalThis.esme.fs.leer("nota.txt");`
    );
    const host = abreHost(ruta, {
      permisos: ["fs:project"],
      concedidas: ["fs:project"],
      proyecto: dir,
    });
    try {
      expect(await host.call("prueba")).toBe("hola");
    } finally {
      await host.cerrar();
    }
  });

  it("NO sale del proyecto con ..", async () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-proyecto-"));
    const ruta = moduloCon(
      `try { return await globalThis.esme.fs.leer("../../etc/passwd"); }
       catch (e) { return "RECHAZADO:" + e.message; }`
    );
    const host = abreHost(ruta, {
      permisos: ["fs:project"],
      concedidas: ["fs:project"],
      proyecto: dir,
    });
    try {
      expect(await host.call("prueba")).toContain("RECHAZADO");
    } finally {
      await host.cerrar();
    }
  });
});

describe("la puerta de la mente: permiso, forma y puerta", () => {
  it("la mente responde por la puerta con permiso concedido", async () => {
    const ruta = moduloCon(
      `const r = await globalThis.esme.mente.recall({ query: "hola", budget: 100 });
       return JSON.stringify(r);`
    );
    const host = abreHost(ruta, {
      permisos: ["mind:read"],
      concedidas: ["mind:read"],
      mente: {
        recall: async (q: string, budget?: number) => [{ id: "r1", texto: `recuerdo de ${q}`, tokens: budget }],
      },
    });
    try {
      const r = JSON.parse((await host.call("prueba")) as string) as { id: string }[];
      expect(r[0].id).toBe("r1");
    } finally {
      await host.cerrar();
    }
  });

  it("sin permiso, la mente se niega en voz alta", async () => {
    const ruta = moduloCon(
      `try { await globalThis.esme.mente.recall({ query: "hola" }); return "SE ME CONCEDIO"; }
       catch (e) { return "RECHAZADO:" + e.message; }`
    );
    const host = abreHost(ruta, {
      permisos: ["mind:read"],
      concedidas: [],
      mente: { recall: async () => [] },
    });
    try {
      expect(await host.call("prueba")).toContain("RECHAZADO");
    } finally {
      await host.cerrar();
    }
  });
});

describe("la puerta de la red: lista de dominios", () => {
  it("un dominio no concedido no se toca", async () => {
    const ruta = moduloCon(
      `try { const r = await globalThis.esme.net.fetch("http://127.0.0.1:9/"); return "TOCADO:" + r.estado; }
       catch (e) { return "RECHAZADO:" + e.message; }`
    );
    const host = abreHost(ruta, {
      permisos: ["net:fetch"],
      concedidas: ["net:fetch"],
      dominios: ["example.org"],
    });
    try {
      expect(await host.call("prueba")).toContain("RECHAZADO");
    } finally {
      await host.cerrar();
    }
  });
});

describe("la puerta de los eventos: con namespace", () => {
  it("el evento sale con el namespace del módulo", async () => {
    const ruta = moduloCon(`await globalThis.esme.ipc.emit("listo", { ok: 1 }); return "hecho";`);
    const vistos: string[] = [];
    const host = abreHost(ruta, {
      permisos: ["ipc:emit"],
      concedidas: ["ipc:emit"],
      id: "esme.prueba.módulo",
      onEvento: (e) => vistos.push(e),
    });
    try {
      await host.call("prueba");
      expect(vistos).toEqual(["esme.prueba.módulo:listo"]);
    } finally {
      await host.cerrar();
    }
  });
});
