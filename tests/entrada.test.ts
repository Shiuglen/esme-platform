/**
 * LA PUERTA DE ENTRADA — el módulo de cualquiera, de principio a fin.
 *
 * Lo que se prueba aquí es el camino COMPLETO de quien llega de fuera:
 * crea el módulo (un comando), lo verifica (que lo construye, lo mide de
 * verdad y lo juzga) y recibe un veredicto con números, no con palabras.
 *
 * Y lo que se prueba de la otra manera: que la puerta SE CIERRE cuando tiene
 * que cerrarse. Un módulo que no carga, o que usa una capacidad que no
 * declaró, tiene que quedarse fuera — con el motivo escrito.
 *
 * Referencia: docs/ENTRADA.md, core/bench/ciclo.ts, core/modulos/veredicto.ts.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { creaModulo, problemaDeId } from "../tienda/crea.ts";
import { verificaModulo } from "../tienda/verifica.ts";
import { mideCicloModulo } from "../core/bench/ciclo.ts";
import { leeManifiesto } from "../tienda/modulo-manifiesto.ts";

const raizKit = join(import.meta.dirname, "..");
const dirs: string[] = [];

/** Una carpeta de trabajo que se limpia al final. */
const casa = (): string => {
  const d = mkdtempSync(join(tmpdir(), "esme-entrada-"));
  dirs.push(d);
  return d;
};

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("el id del módulo", () => {
  it("exige esme.<autor>.<slug> en minúsculas", () => {
    expect(problemaDeId("esme.tu.mi-modulo")).toBeNull();
    expect(problemaDeId("esme.tu")).toContain("esme.<autor>.<slug>");
    expect(problemaDeId("MiModulo")).toContain("esme.<autor>.<slug>");
    expect(problemaDeId("")).toContain("falta el id");
  });
});

describe("nacer con todo puesto", () => {
  it("crea un módulo con manifiesto, código, prueba y README", async () => {
    const dir = join(casa(), "mi-modulo");
    const { creado } = await creaModulo(
      { id: "esme.prueba.mi-modulo", nombre: "Mi módulo", dir },
      raizKit
    );
    expect(creado).toBe(true);

    const dictamen = leeManifiesto(dir, { exigirEntrada: false });
    expect(dictamen.ok).toBe(true);
    expect(dictamen.manifest?.id).toBe("esme.prueba.mi-modulo");
    expect(dictamen.manifest?.entry).toBe("dist/index.js");

    const fuente = readFileSync(join(dir, "src", "index.ts"), "utf8");
    expect(fuente).toContain("export async function ciclo");
    // la puerta, no la red cruda: la cápsula cierra fetch, fs y process.env.
    // (el código, no el comentario: el comentario los NOMBRA para explicar
    // que no están.)
    expect(fuente).not.toMatch(/^\s*import\s/m);
    expect(fuente).not.toContain("globalThis.fetch");
    expect(fuente).toContain("globalThis.esme");
  });

  it("no pisa un módulo que ya existe", async () => {
    const dir = join(casa(), "mio");
    await creaModulo({ id: "esme.prueba.mio", nombre: "Mío", dir }, raizKit);
    const otra = await creaModulo({ id: "esme.prueba.mio", nombre: "Otro", dir }, raizKit);
    expect(otra.creado).toBe(false);
  });

  it("un id malo no crea nada", async () => {
    await expect(
      creaModulo({ id: "no-es-un-id", nombre: "X", dir: join(casa(), "x") }, raizKit)
    ).rejects.toThrow(/esme\.<autor>\.<slug>/);
  });
});

describe("la puerta se abre con números", () => {
  it("el módulo creado entra: se construye, se mide y se juzga", async () => {
    const dir = join(casa(), "entra");
    await creaModulo({ id: "esme.prueba.entra", nombre: "Entra", dir }, raizKit);

    const r = await verificaModulo(dir);
    expect(r.manifiestoOk).toBe(true);
    expect(r.veredicto?.entra).toBe(true);
    expect(r.veredicto?.medidas.carga).toBe(true);
    expect(r.veredicto?.medidas.forma).toBe("ciclo");
    // el módulo usó lo que pidió: la puerta montada y la mente de verdad
    expect(r.veredicto?.medidas.usadas.sort()).toEqual(["mind:read", "mind:write"]);
    expect(r.paquete).not.toBeNull();

    // el bench.json lo escribió la MEDIDA, no la mano
    const bench = JSON.parse(readFileSync(join(dir, "bench.json"), "utf8")) as {
      casos: number;
      ciclo_ok: boolean;
      tokens_ciclo: number;
      sondas: Array<{ fn: string }>;
    };
    expect(bench.casos).toBe(3);
    expect(bench.ciclo_ok).toBe(true);
    expect(bench.tokens_ciclo).toBeGreaterThan(0);
    expect(bench.sondas[0].fn).toBe("ciclo");
  }, 60_000);
});

describe("la puerta se cierra cuando tiene que cerrarse", () => {
  it("un módulo que no carga se queda fuera, y se dice por qué", async () => {
    const dir = join(casa(), "roto");
    await creaModulo({ id: "esme.prueba.roto", nombre: "Roto", dir }, raizKit);
    writeFileSync(
      join(dir, "src", "index.ts"),
      "export async function ciclo(): Promise<never> { throw new Error('me rompo'); }\n"
    );

    const r = await verificaModulo(dir);
    expect(r.veredicto?.entra).toBe(false);
    expect(r.veredicto?.causa).toMatch(/no carga|el ciclo falló|no contestó/i);
  }, 60_000);

  it("un módulo que usa una capacidad que NO declaró no entra: la puerta no se la da", async () => {
    const dir = join(casa(), "mentiroso");
    await creaModulo(
      { id: "esme.prueba.mentiroso", nombre: "Mentiroso", dir, permisos: ["mind:read"] },
      raizKit
    );
    // escribe en la mente sin haber declarado mind:write
    writeFileSync(
      join(dir, "src", "index.ts"),
      [
        "export async function ciclo(consulta: string) {",
        "  const puerta = globalThis.esme;",
        "  await puerta.mente.remember({ text: consulta, kind: 'note' });",
        "  return { respuesta: 'ok' };",
        "}",
      ].join("\n")
    );

    const r = await verificaModulo(dir);
    expect(r.veredicto?.entra).toBe(false);
    // el motivo dice QUÉ arreglar: la puerta no le dio el permiso que pidió
    expect(r.veredicto?.causa).toMatch(/permiso no concedido/i);
  }, 60_000);

  it("un módulo sin entrada no se mide (no se ejecuta nada que apunte fuera)", async () => {
    const dir = join(casa(), "sin-entrada");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "module.yaml"),
      [
        "schema_version: 1",
        'id: "esme.prueba.sin-entrada"',
        'name: "Sin entrada"',
        'version: "0.1.0"',
        'category: "tool"',
        'description: "Un módulo que no tiene entrada construida todavía."',
        'author: "esme@prueba"',
        'license: "MIT"',
        'entry: "dist/index.js"',
        'runtime: "nodejs"',
        "permissions: []",
        "decision_criteria: []",
        "dependencies: []",
        "sideEffects: false",
        "benchmarks:",
        "  recall_delta: 0.01",
        '  report: "bench.json"',
        "",
      ].join("\n")
    );

    const medida = await mideCicloModulo(dir, {
      schema_version: 1,
      id: "esme.prueba.sin-entrada",
      name: "Sin entrada",
      version: "0.1.0",
      category: "tool",
      description: "Un módulo que no tiene entrada construida todavía.",
      author: "esme@prueba",
      license: "MIT",
      entry: "dist/index.js",
      runtime: "nodejs",
      permissions: [],
      decision_criteria: [],
      dependencies: [],
      sideEffects: false,
      benchmarks: { recall_delta: 0.01, report: "bench.json" },
    });
    expect(medida.error).toBeTruthy();
    expect(medida.informe.ciclo_ok).toBe(false);
  });
});
