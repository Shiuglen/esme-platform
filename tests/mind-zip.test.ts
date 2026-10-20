// La mente en un fichero: el ZIP es el contenedor, las garantías son las mismas.
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { escribeMindZip, leeMindZip } from "../core/mind/mind-zip.ts";
import { comprime, descomprime, crc32 } from "../core/mind/zip.ts";
import type { MenteAExportar } from "../core/mind/mind-file.ts";

const destino = () => join(mkdtempSync(join(tmpdir(), "mindzip-")), "mente.mind.zip");

const mente = (): MenteAExportar => ({
  recuerdos: [
    { id: "r1", texto: "La mente es local", vector: [0.1, 0.2], fuente: "obsidian/notas/idea.md" },
    { id: "r2", texto: "mi secreto ghp_axbcdefghijklmnopqrstuvwxyz1234567890AB", vector: [0.3, 0.4] },
  ],
  motor: "EmbeddingGemma-300M int8",
  recall: 0.77,
  rumbo: {
    version: 1,
    pilares: [{ id: "p1", texto: "Esme de otro mundo", creado: 1 }],
    objetivos: [{ id: "o1", texto: "La tienda firmada", estado: "activo", creado: 2, cerrado: null, pilar: "p1" }],
  },
});

describe("el contenedor zip (bytes y nada más)", () => {
  it("ida y vuelta: lo que entra, sale", () => {
    const bytes = comprime([
      { nombre: "b.txt", datos: Buffer.from("hola") },
      { nombre: "a/carpeta.txt", datos: Buffer.from("adentro") },
    ]);
    const salida = descomprime(bytes);
    expect(salida.map((e) => e.nombre)).toEqual(["a/carpeta.txt", "b.txt"]); // orden canónico
    expect(salida[0].datos.toString()).toBe("adentro");
    expect(salida[1].datos.toString()).toBe("hola");
  });

  it("los mismos bytes de entrada dan los mismos bytes de salida", () => {
    const a = comprime([{ nombre: "x", datos: Buffer.from("hola") }]);
    const b = comprime([{ nombre: "x", datos: Buffer.from("hola") }]);
    expect(a.equals(b)).toBe(true);
  });

  it("un fichero roto se dice, no se devuelve a medias", () => {
    const bytes = comprime([{ nombre: "x", datos: Buffer.from("hola") }]);
    const roto = Buffer.from(bytes);
    roto[35] = roto[35] ^ 0xff; // un byte del contenido
    expect(() => descomprime(roto)).toThrow(/corrupto|cuadra/);
  });

  it("esto no es un zip: lo dice", () => {
    expect(() => descomprime(Buffer.from("no soy un zip"))).toThrow(/no es un zip/);
  });

  it("el crc de un fichero conocido es el de verdad", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
});

describe("la mente en un solo fichero", () => {
  it("el zip lleva la mente entera (y solo lo legal)", () => {
    const z = escribeMindZip(destino(), mente());
    expect(z.entradas).toContain("embeddings/vectors.jsonl");
    expect(z.entradas).toContain("cognition.sig");
    expect(z.entradas).toContain("exclusion-list.json");
    expect(z.entradas).toContain("rumbo.json");
    expect(z.bytes).toBeGreaterThan(0);
  });

  it("ida y vuelta fiel: recuerdos, exclusiones y rumbo", () => {
    const ruta = destino();
    escribeMindZip(ruta, mente());
    const leida = leeMindZip(ruta);
    expect(leida.recuerdos.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    expect(leida.exclusions).toContain("work/**");
    expect(leida.rumbo?.pilares[0].texto).toBe("Esme de otro mundo");
  });

  it("el secreto sigue redactado dentro del fichero", () => {
    const ruta = destino();
    escribeMindZip(ruta, mente());
    const crudo = readFileSync(ruta);
    expect(crudo.includes(Buffer.from("ghp_axbc"))).toBe(false);
    expect(leeMindZip(ruta).recuerdos.find((r) => r.id === "r2")?.texto).toContain("[SECRET:github-ghp]");
  });

  it("la cognición se verifica al importar: un fichero manipulado no entra", () => {
    const ruta = destino();
    escribeMindZip(ruta, mente());
    const bytes = readFileSync(ruta);
    const entradas = descomprime(bytes);
    const vectores = entradas.find((e) => e.nombre === "embeddings/vectors.jsonl");
    expect(vectores).toBeTruthy();
    const maniado = entradas.map((e) =>
      e.nombre === "embeddings/vectors.jsonl"
        ? { ...e, datos: Buffer.from(e.datos.toString().replace("0.1,0.2", "0.9,0.9")) }
        : e
    );
    const destino2 = destino();
    writeFileSync(destino2, comprime(maniado));
    expect(() => leeMindZip(destino2)).toThrow(/ALTERADA/);
  });

  it("la misma mente da la misma cognición (la identidad es semántica, no del fichero)", () => {
    const a = escribeMindZip(destino(), mente());
    const b = escribeMindZip(destino(), mente());
    // el fichero lleva created_at (el momento de la exportación), así que los
    // bytes cambian; lo que NO cambia es el estado semántico de la mente
    const cognicionDe = (ruta: string) =>
      descomprime(readFileSync(ruta)).find((e) => e.nombre === "cognition.sig")?.datos.toString();
    expect(cognicionDe(a.ruta)).toBe(cognicionDe(b.ruta));
    expect(cognicionDe(a.ruta)).toBeTruthy();
  });
});
