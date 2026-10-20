// El rumbo viaja con la mente: si un .mind lo lleva, tiene que valer.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validaMindDir } from "../core/mind/portable-format.ts";
import { EXCLUSION_MINIMA } from "../core/mind/redaction.ts";
import { escribeMind, leeMind, type MenteAExportar } from "../core/mind/mind-file.ts";
import {
  normalizaRumbo,
  rumboAPng,
  validaRumbo,
  type Rumbo,
} from "../core/mind/rumbo.ts";

const base = () => {
  const d = mkdtempSync(join(tmpdir(), "mind-"));
  mkdirSync(join(d, "embeddings"));
  mkdirSync(join(d, "crs-delta"));
  writeFileSync(join(d, "metadata.json"), JSON.stringify({ schema_version: 1, created_at: 1, motor: "x", recall: 1, counts: {} }));
  writeFileSync(join(d, "cognition.sig"), "firma");
  writeFileSync(join(d, "exclusion-list.json"), JSON.stringify(EXCLUSION_MINIMA));
  return d;
};

const destino = () => join(mkdtempSync(join(tmpdir(), "mind-rumbo-")), "mente");

const mente = (rumbo?: unknown): MenteAExportar => ({
  recuerdos: [{ id: "r1", texto: "La mente es local", vector: [0.1, 0.2] }],
  motor: "EmbeddingGemma-300M int8",
  recall: 0.77,
  ...(rumbo !== undefined ? { rumbo } : {}),
});

const RUMBO: Rumbo = {
  version: 1,
  pilares: [{ id: "p1", texto: "Esme de otro mundo", creado: 1 }],
  objetivos: [
    { id: "o1", texto: "La tienda firmada", estado: "activo", creado: 2, cerrado: null, pilar: "p1" },
  ],
};

describe("el rumbo en una mente portable", () => {
  it("una mente sin rumbo sigue siendo una mente válida", () => {
    expect(validaMindDir(base()).ok).toBe(true);
  });

  it("si el rumbo está, tiene que valer", () => {
    const d = base();
    writeFileSync(join(d, "rumbo.json"), JSON.stringify({ version: 1, pilares: [{ id: "p1", texto: "Esme de otro mundo", creado: 1 }], objetivos: [{ id: "o1", texto: "La tienda firmada", estado: "activo", creado: 2, cerrado: null, pilar: "p1" }] }));
    expect(validaMindDir(d).ok).toBe(true);
  });

  it("un rumbo con un objetivo sin estado raro no vale", () => {
    const d = base();
    writeFileSync(join(d, "rumbo.json"), JSON.stringify({ pilares: [], objetivos: [{ id: "o1", texto: "X", estado: "inventado" }] }));
    const r = validaMindDir(d);
    expect(r.ok).toBe(false);
    expect(r.errores.join(" ")).toContain("estado raro");
  });

  it("un rumbo que no es JSON no vale", () => {
    const d = base();
    writeFileSync(join(d, "rumbo.json"), "{ roto");
    expect(validaMindDir(d).ok).toBe(false);
  });
});

describe("el rumbo sale con la mente (el export lo lleva)", () => {
  it("el paquete exportado trae el rumbo y la ida y vuelta es fiel", () => {
    const d = destino();
    escribeMind(d, mente(RUMBO));
    expect(existsSync(join(d, "rumbo.json"))).toBe(true);
    const im = leeMind(d);
    expect(im.rumbo).toEqual(RUMBO);
  });

  it("una mente sin rumbo se importa igual (solo pierde el para qué)", () => {
    const d = destino();
    escribeMind(d, mente());
    expect(existsSync(join(d, "rumbo.json"))).toBe(false);
    expect(leeMind(d).rumbo).toBe(null);
  });

  it("los bytes son los de Python: mismo orden, misma sangría, mismo salto", () => {
    const d = destino();
    escribeMind(d, mente(RUMBO));
    const bytes = readFileSync(join(d, "rumbo.json"), "utf8");
    // esto es EXACTAMENTE lo que sale de json.dumps(sano, ensure_ascii=False, indent=1) + "\n"
    expect(bytes).toBe(
      '{\n "version": 1,\n "pilares": [\n  {\n   "id": "p1",\n   "texto": "Esme de otro mundo",\n   "creado": 1\n  }\n ],\n "objetivos": [\n  {\n   "id": "o1",\n   "texto": "La tienda firmada",\n   "estado": "activo",\n   "creado": 2,\n   "cerrado": null,\n   "pilar": "p1"\n  }\n ]\n}\n'
    );
    expect(bytes).toBe(rumboAPng(RUMBO));
  });

  it("un secreto en el rumbo viaja redactado (nada sale en claro)", () => {
    const d = destino();
    escribeMind(d, mente({
      version: 1,
      pilares: [{ id: "p1", texto: "la llave ghp_axbcdefghijklmnopqrstuvwxyz1234567890AB", creado: 1 }],
      objetivos: [],
    }));
    const bytes = readFileSync(join(d, "rumbo.json"), "utf8");
    expect(bytes).not.toContain("ghp_axbc");
    expect(bytes).toContain("[SECRET:github-ghp]");
  });

  it("un rumbo roto no vale la mente entera", () => {
    const d = destino();
    escribeMind(d, mente(RUMBO));
    writeFileSync(join(d, "rumbo.json"), JSON.stringify({ pilares: [], objetivos: [{ id: "o1", texto: "X", estado: "inventado" }] }));
    expect(() => leeMind(d)).toThrow(/estado raro/);
  });
});

describe("el rumbo se normaliza como en Python (espejo exacto)", () => {
  it("lo que no vale se cae, lo demás se queda", () => {
    const r = normalizaRumbo({
      version: 1,
      pilares: [
        { texto: "  Esme   de otro mundo  ", creado: 7 },
        { texto: "Esme de otro mundo" }, // texto repetido: se cae
        { texto: "" }, // vacío: se cae
        "no soy un pilar",
      ],
      objetivos: [
        { texto: "La tienda firmada", estado: "inventado", pilar: "p9" },
        { texto: "La tienda firmada" }, // repetido: se cae
      ],
    });
    expect(r.pilares).toHaveLength(1);
    expect(r.pilares[0].texto).toBe("Esme de otro mundo");
    expect(r.pilares[0].id).toBe("esme-de-otro-mundo-7");
    expect(r.objetivos).toHaveLength(1);
    expect(r.objetivos[0].estado).toBe("activo"); // un estado raro vale "activo"
    expect(r.objetivos[0].pilar).toBe(null); // un pilar que no existe no vale
    expect(r.objetivos[0].cerrado).toBe(null);
  });

  it("los topes son los mismos: 7 pilares y 60 objetivos", () => {
    const pilares = Array.from({ length: 12 }, (_, i) => ({ texto: `pilar ${i}` }));
    const objetivos = Array.from({ length: 80 }, (_, i) => ({ texto: `objetivo ${i}` }));
    const r = normalizaRumbo({ pilares, objetivos });
    expect(r.pilares).toHaveLength(7);
    expect(r.objetivos).toHaveLength(60);
  });

  it("el texto se colapsa y se corta a 200 caracteres", () => {
    const r = normalizaRumbo({ pilares: [{ texto: "a".repeat(300) }], objetivos: [] });
    expect(r.pilares[0].texto).toHaveLength(200);
  });

  it("un rumbo que no es un objeto es un rumbo vacío (nunca una excepción)", () => {
    expect(normalizaRumbo(null)).toEqual({ version: 1, pilares: [], objetivos: [] });
    expect(normalizaRumbo("nada")).toEqual({ version: 1, pilares: [], objetivos: [] });
  });

  it("el verificador no perdona: lo que no vale, no vale", () => {
    expect(validaRumbo(RUMBO)).toEqual([]);
    expect(validaRumbo({ pilares: [], objetivos: [{ id: "o1", texto: "X", estado: "raro" }] }).join(" ")).toContain("estado raro");
    expect(validaRumbo({ pilares: [{ texto: "sin id" }], objetivos: [] }).join(" ")).toContain("sin id");
    expect(validaRumbo({ pilares: "no es una lista", objetivos: [] }).join(" ")).toContain("pilares[]");
    expect(validaRumbo({ pilares: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, texto: `p${i}` })), objetivos: [] }).join(" ")).toContain("tope");
  });
});
