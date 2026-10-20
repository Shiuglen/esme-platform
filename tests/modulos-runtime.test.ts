/**
 * EL RUNTIME DE LOS MÓDULOS — el ciclo entero, comprobado.
 *
 * Esto no es una prueba de que "una función devuelve algo": es la prueba de
 * que un módulo puede INSTALARSE de una tienda firmada, ACTIVARSE con una
 * puerta real, USARSE y ser JUZGADO, todo con la confianza de verdad (la raíz
 * congelada, el índice firmado, la firma del artefacto) y sin red.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { crearServidor } from "../tienda/servidor.ts";
import { leeRaiz } from "../tienda/raiz.ts";
import { instalaModulo, leeModulo, instaladosEn } from "../tienda/modulos.ts";
import { modulos } from "../core/modulos/api.ts";
import { Consentimientos } from "../core/modulos/consentimiento.ts";
import { mideModulo } from "../core/bench/modulos.ts";
import { juzgaModulo } from "../core/modulos/veredicto.ts";
import { confinaEntrada } from "../core/modulos/rutas.ts";
import type { MenteViva } from "../core/ipc/mind-schema-types.ts";

const raizKit = resolve(import.meta.dirname, "..");
const tmp = (n: string) => mkdtempSync(join(tmpdir(), `esme-rt-${n}-`));

/** Una mente de mentira que recuerda lo que se le dice. */
const menteStub = (): MenteViva & { escritos: string[] } => {
  const escritos: string[] = [];
  return {
    escritos,
    recall: async (q: string) => [{ id: "r1", texto: `recuerdo de ${q}` }],
    remember: async (text: string) => {
      escritos.push(text);
      return { id: `m${escritos.length}` };
    },
    intake: async (source: string, content: string) => ({ id: "i1" }),
    rumbo: async () => ({ pilares: [], objetivos: [] }) as never,
  };
};

describe("el libro de los permisos", () => {
  it("concede, guarda en disco y vuelve a leer lo mismo", () => {
    const dir = tmp("permisos");
    const ruta = join(dir, "consentimientos.json");
    const a = new Consentimientos(ruta);
    a.concede("esme.x.y", ["mind:read"], "la persona");
    expect(a.concedidasDe("esme.x.y")).toEqual(["mind:read"]);

    const b = new Consentimientos(ruta);
    expect(b.concedidasDe("esme.x.y")).toEqual(["mind:read"]);

    b.revoca("esme.x.y", ["mind:read"]);
    expect(b.concedidasDe("esme.x.y")).toEqual([]);
  });

  it("el estado dice lo que falta: lo declarado, lo concedido, lo pendiente", () => {
    const libro = new Consentimientos(join(tmp("estado"), "c.json"));
    libro.concede("esme.x.y", ["mind:read"]);
    const e = libro.estado("esme.x.y", ["mind:read", "net:fetch"]);
    expect(e.concedidas).toEqual(["mind:read"]);
    expect(e.pendientes).toEqual(["net:fetch"]);
  });
});

describe("el runtime: instalar, consentir, activar, usar", () => {
  it("el ciclo entero contra la tienda local, con firma de verdad", async () => {
    const servidor = crearServidor(raizKit);
    await servidor.listo();
    const destino = tmp("modulos");
    const pubRaiz = leeRaiz(raizKit);
    expect(pubRaiz, "el kit tiene que traer su raíz congelada").toBeTruthy();

    try {
      // 1. instalar: baja el índice, verifica la firma y desempaqueta.
      const m = await instalaModulo("esme.nucleo.troceo-pro", {
        baseUrl: servidor.url(),
        pubRaiz: pubRaiz!,
        destino,
      });
      expect(m.id).toBe("esme.nucleo.troceo-pro");
      expect(existsSync(m.entrada)).toBe(true);

      // 2. la puerta: lo que hay instalado se ve con su manifiesto.
      const runtime = modulos({
        rutaPermisos: join(destino, "consentimientos.json"),
        cargar: async () => instaladosEn(destino),
      });
      const lista = await runtime.carga();
      expect(lista.map((x) => x.id)).toContain("esme.nucleo.troceo-pro");
      const v = runtime.vista("esme.nucleo.troceo-pro");
      expect(v.permisos.declaradas).toEqual(["mind:write"]);
      expect(v.permisos.pendientes).toEqual(["mind:write"]); // aún no ha dicho nadie

      // 3. consentir: la persona concede.
      runtime.concede("esme.nucleo.troceo-pro", ["mind:write"], "la persona");
      expect(runtime.vista("esme.nucleo.troceo-pro").permisos.concedidas).toEqual(["mind:write"]);

      // 4. activar: el worker vivo.
      const activo = await runtime.activa("esme.nucleo.troceo-pro");
      expect(activo.estado).toBe("activo");

      // 5. usar: el módulo responde desde su propio mundo.
      const filas = (await runtime.llama("esme.nucleo.troceo-pro", "filasDe", [
        { tipo: "fila-tabla", texto: "| a | b |" },
        { tipo: "parrafo", texto: "no soy una fila" },
      ])) as { tipo: string }[];
      expect(filas).toHaveLength(1);
      expect(filas[0].tipo).toBe("fila-tabla");

      // 6. cerrar: la puerta se cierra de verdad.
      await runtime.cierra();
    } finally {
      await servidor.cerrar();
      rmSync(destino, { recursive: true, force: true });
    }
  });

  it("un módulo que NO tiene permiso no lo tiene: la puerta no lo monta", async () => {
    const dir = tmp("puerta");
    const runtime = modulos({ rutaPermisos: join(dir, "c.json") });
    // el módulo de la puerta, construido (el globalSetup lo construye)
    const leido = leeModulo(resolve(raizKit, "modulos/ejemplo-puerta"));
    expect(leido.ok).toBe(true);
    runtime.registro.registra(leido.modulo!);

    // sólo se le concede mind:read (y no hay mente detrás: la puerta no la monta)
    runtime.concede("esme.nucleo.puerta", ["mind:read"]);
    const m = await runtime.activa("esme.nucleo.puerta");
    expect(m.estado).toBe("activo");

    const r = (await runtime.llama("esme.nucleo.puerta", "demuestra")) as {
      tocadas: string[];
      emitio: boolean;
      pintó: boolean;
    };
    // sin mente detrás, la puerta no tiene mente: el módulo lo nota y sigue
    expect(r.tocadas).not.toContain("mind:read");
    expect(r.emitio).toBe(false); // ipc:emit no concedido: la puerta no lo tiene
    expect(r.pintó).toBe(false); // ui:render tampoco

    await runtime.cierra();
  });

  it("concedido todo, el módulo toca todo lo que pide", async () => {
    const dir = tmp("puerta-todo");
    const proyecto = tmp("proyecto");
    writeFileSync(join(proyecto, "LEEME.md"), "hola desde el proyecto", "utf8");
    const mente = menteStub();

    const runtime = modulos({
      rutaPermisos: join(dir, "c.json"),
      mente,
      proyecto,
    });
    const leido = leeModulo(resolve(raizKit, "modulos/ejemplo-puerta"));
    runtime.registro.registra(leido.modulo!);
    runtime.concede("esme.nucleo.puerta", [
      "mind:read",
      "mind:write",
      "ipc:emit",
      "ui:render",
      "fs:project",
    ]);

    const eventos: string[] = [];
    const runtimeConEventos = modulos({
      rutaPermisos: join(dir, "c.json"),
      mente,
      proyecto,
      onEvento: (e) => eventos.push(e),
    });
    runtimeConEventos.registro.registra(leido.modulo!);
    runtimeConEventos.concede("esme.nucleo.puerta", [
      "mind:read",
      "mind:write",
      "ipc:emit",
      "ui:render",
      "fs:project",
    ]);
    await runtimeConEventos.activa("esme.nucleo.puerta");

    const r = (await runtimeConEventos.llama("esme.nucleo.puerta", "demuestra")) as {
      recuerdo: string | null;
      leyo: string | null;
      emitio: boolean;
      pintó: boolean;
      tocadas: string[];
    };
    expect(r.recuerdo).toContain("recuerdo de");
    expect(r.leyo).toBe("hola desde el proyecto");
    expect(r.emitio).toBe(true);
    expect(r.pintó).toBe(true);
    expect(r.tocadas.sort()).toEqual([
      "fs:project",
      "ipc:emit",
      "mind:read",
      "mind:write",
      "ui:render",
    ]);
    expect(eventos).toEqual(["esme.nucleo.puerta:demostrado"]);
    expect(mente.escritos).toHaveLength(1);

    await runtimeConEventos.cierra();
  });
});

describe("la entrada de un módulo no se sale de su carpeta", () => {
  it("un entry con .. es rechazado", () => {
    const r = confinaEntrada("/tmp/mod", "../../etc/passwd");
    expect("error" in r).toBe(true);
  });

  it("un entry normal se queda dentro", () => {
    const r = confinaEntrada("/tmp/mod", "dist/index.js");
    expect("ruta" in r).toBe(true);
  });

  it("un entry absoluto no vale", () => {
    const r = confinaEntrada("/tmp/mod", "/etc/passwd");
    expect("error" in r).toBe(true);
  });
});

describe("el juez de los módulos", () => {
  const manifiesto = {
    schema_version: 1 as const,
    id: "esme.prueba.módulo",
    name: "Prueba",
    version: "0.1.0",
    category: "tool" as const,
    description: "un módulo de mentira para el juez",
    author: "esme@bench",
    license: "MIT" as const,
    entry: "dist/index.js",
    runtime: "nodejs" as const,
    permissions: ["mind:read" as const],
    decision_criteria: [],
    dependencies: [],
    sideEffects: false,
    benchmarks: { recall_delta: 0.01, report: "bench.json" },
  };

  /** El informe de un módulo de memoria: base vs. con. */
  const informeMemoria = (over: Record<string, unknown> = {}) => ({
    modulo: "esme.prueba.módulo",
    version: "0.1.0",
    casos: 12,
    recall_base: 0.25,
    recall_con: 1,
    tokens_base: 20,
    tokens_con: 30,
    semilla: 0,
    ...over,
  });

  const medidas = (
    over: Partial<Parameters<typeof juzgaModulo>[1]> = {},
    informe: Record<string, unknown> | null = informeMemoria()
  ) => ({
    carga: true,
    usadas: ["mind:read"],
    informe: informe as never,
    ...over,
  });

  it("el que mejora lo que promete, entra", () => {
    const v = juzgaModulo(manifiesto, medidas());
    expect(v.entra).toBe(true);
    expect(v.nivel).toBe("ok");
    expect(v.medidas.delta).toBeCloseTo(0.75);
  });

  it("el que no mejora lo que promete, no entra", () => {
    const v = juzgaModulo(
      manifiesto,
      medidas({}, informeMemoria({ recall_con: 0.255, tokens_con: 22 }))
    );
    expect(v.entra).toBe(false);
    expect(v.causa).toContain("mínimo");
  });

  it("el que no carga, no entra", () => {
    const v = juzgaModulo(manifiesto, medidas({ carga: false, error: "no arrancó" }));
    expect(v.entra).toBe(false);
    expect(v.causa).toContain("no carga");
  });

  it("el que usa algo que no declaró, no entra", () => {
    const v = juzgaModulo(manifiesto, medidas({ usadas: ["mind:read", "net:fetch"] }));
    expect(v.entra).toBe(false);
    expect(v.causa).toContain("no declaró");
  });

  it("el que pide más de lo que usa, entra con aviso", () => {
    const v = juzgaModulo(
      { ...manifiesto, permissions: ["mind:read", "mind:write"] },
      medidas({ usadas: ["mind:read"] })
    );
    expect(v.entra).toBe(true);
    expect(v.nivel).toBe("aviso");
    expect(v.causa).toContain("mind:write");
  });

  it("un módulo de herramienta se juzga por su ciclo, no por el recall", () => {
    const v = juzgaModulo(
      { ...manifiesto, category: "tool" },
      medidas(
        {},
        {
          modulo: "esme.prueba.módulo",
          version: "0.1.0",
          casos: 5,
          ciclo_ok: true,
          tokens_ciclo: 42,
        }
      )
    );
    expect(v.entra).toBe(true);
    expect(v.medidas.forma).toBe("ciclo");
    expect(v.causa).toContain("ciclo funciona");
  });

  it("un módulo de herramienta cuyo ciclo falla, no entra", () => {
    const v = juzgaModulo(
      { ...manifiesto, category: "tool" },
      medidas(
        {},
        { modulo: "esme.prueba.módulo", version: "0.1.0", casos: 5, ciclo_ok: false, tokens_ciclo: 42 }
      )
    );
    expect(v.entra).toBe(false);
    expect(v.causa).toContain("ciclo falló");
  });

  it("sin informe (sin número), no entra", () => {
    const v = juzgaModulo(manifiesto, medidas({}, null));
    expect(v.entra).toBe(false);
    expect(v.causa).toContain("no hay número");
  });

  it("un peaje no entra: pagar 40 tokens por 0,01 de recall no es mejorar", () => {
    const v = juzgaModulo(
      manifiesto,
      medidas(
        {},
        informeMemoria({ recall_base: 0.5, recall_con: 0.51, tokens_base: 10, tokens_con: 40 })
      )
    );
    expect(v.entra).toBe(false);
    expect(v.causa).toContain("cuesta demasiado");
  });
});

describe("la medición mira de verdad", () => {
  it("abre el módulo de la puerta y ve qué capacidades toca", async () => {
    const dir = resolve(raizKit, "modulos/ejemplo-puerta");
    const leido = leeModulo(dir);
    expect(leido.ok).toBe(true);
    const { medidas } = await mideModulo(dir, leido.modulo!.manifiesto, {
      mente: menteStub(),
    });
    expect(medidas.carga).toBe(true);
    // el medidor concede lo declarado para ver qué toca de verdad: la sonda
    // llama a `demuestra`, que toca la puerta entera
    expect(medidas.usadas.sort()).toEqual([
      "fs:project",
      "ipc:emit",
      "mind:read",
      "mind:write",
      "ui:render",
    ]);
    // su informe es el del ciclo (es un módulo de herramienta): medido, no
    // escrito a mano
    expect(medidas.informe?.ciclo_ok).toBe(true);
    expect(medidas.informe?.casos).toBeGreaterThanOrEqual(3);
  });

  it("el veredicto de un módulo real, medido", async () => {
    const dir = resolve(raizKit, "modulos/ejemplo-troceo-pro");
    const leido = leeModulo(dir);
    const { manifiesto, medidas } = await mideModulo(dir, leido.modulo!.manifiesto);
    const v = juzgaModulo(manifiesto, medidas);
    expect(v.entra).toBe(true);
    expect(v.medidas.delta).toBeGreaterThan(manifiesto.benchmarks!.recall_delta);
  });
});
