/**
 * EL REGISTRO DE LOS LANZAMIENTOS — la puerta deja rastro.
 *
 * Qué se comprueba. Una puerta que lanza programas y no dice qué lanzó es
 * una puerta que trabaja a ciegas: nadie puede saber después qué se hizo en
 * la casa con la capacidad más peligrosa que tiene. El rastro dice el
 * programa, los argumentos, el módulo que lo pidió y cómo acabó — y
 * SOBREVIVE al proceso (está en un fichero, no en la memoria).
 *
 * Referencia: core/modulos/lanzamientos.ts, core/extension-host/proc.ts.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modulos } from "../core/modulos/api.ts";
import { leeModulo } from "../tienda/modulos.ts";
import { leeLanzamientos, registraLanzamiento } from "../core/modulos/lanzamientos.ts";

/** Un módulo de mentira que lanza un programa por la puerta. */
const moduloQueLanza = (dir: string): string => {
  const carpeta = join(dir, "modulo");
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(
    join(carpeta, "modulo.mjs"),
    `export async function ciclo() {
       const r = await globalThis.esme.proc.ejecutar({ programa: "node", args: ["-e", "process.stdout.write('sali' + 'da')"] });
       return r.stdout;
     }`,
    "utf8"
  );
  writeFileSync(
    join(carpeta, "module.yaml"),
    `schema_version: 1
id: "esme.prueba.rastro"
name: "Rastro"
version: "0.1.0"
category: "tool"
description: "Un módulo de prueba que lanza un programa."
author: "esme@prueba"
license: "MIT"
entry: "modulo.mjs"
runtime: "nodejs"
permissions:
  - proc:spawn
`,
    "utf8"
  );
  return carpeta;
};

describe("el registro de los lanzamientos", () => {
  it("anota una línea por lanzamiento (y se puede volver a leer)", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-lanz-"));
    const ruta = join(dir, "lanzamientos.jsonl");
    registraLanzamiento(ruta, {
      modulo: "esme.prueba.m",
      programa: "rea",
      args: ["analyze", "/tmp/app"],
      codigo: 0,
      ms: 812,
      truncado: false,
      timeout: false,
      en: 1_700_000_000_000,
    });
    const leidos = leeLanzamientos(ruta);
    expect(leidos).toHaveLength(1);
    expect(leidos[0].programa).toBe("rea");
    expect(leidos[0].args).toEqual(["analyze", "/tmp/app"]);
    expect(leidos[0].codigo).toBe(0);
  });

  it("una línea rota no tira el registro entero", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-lanz-"));
    const ruta = join(dir, "lanzamientos.jsonl");
    writeFileSync(ruta, '{"programa":"rea","modulo":"m"}\n{esto no es json}\n{"programa":"node","modulo":"m"}\n', "utf8");
    const leidos = leeLanzamientos(ruta);
    expect(leidos).toHaveLength(2);
    expect(leidos[0].programa).toBe("node");
  });

  it("no hay registro, no hay lanzamientos (y no es un fallo)", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-lanz-"));
    expect(leeLanzamientos(join(dir, "no-existe.jsonl"))).toEqual([]);
  });
});

describe("la puerta deja rastro (de verdad, y en un fichero)", () => {
  it("el lanzamiento queda anotado: qué, con qué y por quién", async () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-rastro-"));
    const modulosDir = join(dir, "modulos");
    mkdirSync(modulosDir, { recursive: true });
    const rutaRegistro = join(modulosDir, "lanzamientos.jsonl");
    const carpeta = moduloQueLanza(dir);
    const leido = leeModulo(carpeta);

    const runtime = modulos({
      rutaPermisos: join(modulosDir, "consentimientos.json"),
      rutaLanzamientos: rutaRegistro,
      programas: [{ nombre: "node", descripcion: "node, para la prueba" }],
    });
    runtime.registro.registra(leido.modulo!);
    runtime.concede("esme.prueba.rastro", ["proc:spawn"]);
    await runtime.activa("esme.prueba.rastro");
    await runtime.llama("esme.prueba.rastro", "ciclo");
    await runtime.cierra();

    // en memoria
    const enMemoria = runtime.registro.rastros();
    expect(enMemoria).toHaveLength(1);
    expect(enMemoria[0].programa).toBe("node");
    expect(enMemoria[0].modulo).toBe("esme.prueba.rastro");
    expect(enMemoria[0].codigo).toBe(0);

    // y en el fichero (que sobrevive al proceso)
    const enFichero = leeLanzamientos(rutaRegistro);
    expect(enFichero).toHaveLength(1);
    expect(enFichero[0].programa).toBe("node");
    expect(enFichero[0].args.length).toBeGreaterThan(0);
    // el rastro NO se guarda la salida (un programa puede devolver 200 MB)
    expect(readFileSync(rutaRegistro, "utf8")).not.toContain("salida");
  });

  it("y el doctor lo enseña (lo que la casa hizo de verdad)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-rastro-"));
    const modulosDir = join(dir, "modulos");
    mkdirSync(modulosDir, { recursive: true });
    const rutaRegistro = join(modulosDir, "lanzamientos.jsonl");
    const carpeta = moduloQueLanza(dir);
    const leido = leeModulo(carpeta);

    const runtime = modulos({
      rutaPermisos: join(modulosDir, "consentimientos.json"),
      rutaLanzamientos: rutaRegistro,
      programas: [{ nombre: "node", descripcion: "node, para la prueba" }],
    });
    runtime.registro.registra(leido.modulo!);
    runtime.concede("esme.prueba.rastro", ["proc:spawn"]);
    await runtime.activa("esme.prueba.rastro");
    await runtime.llama("esme.prueba.rastro", "ciclo");
    await runtime.cierra();

    const { doctorDeLaCasa, renderDoctor } = await import("../core/modulos/doctor.ts");
    const estado = doctorDeLaCasa({
      instalados: [],
      pendientes: {},
      tienda: [],
      rastros: leeLanzamientos(rutaRegistro),
    });
    expect(estado.rastros).toHaveLength(1);
    const texto = renderDoctor(estado);
    expect(texto).toContain("node");
    expect(texto).toContain("esme.prueba.rastro");
  });
});
