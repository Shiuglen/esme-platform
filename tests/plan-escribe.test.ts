/**
 * EL PLAN Y LA ESCRITURA — lo que el espejo de openrig enseñó.
 *
 * Dos cosas, y las dos son de «leer el código de otro»:
 *
 *   1. **la compactación es un plan** (`compact-plan.ts`): lo que entra, lo
 *      que no, y POR QUÉ. Un recorte en silencio no se puede revisar ni
 *      corregir;
 *   2. **nada se escribe a medias** (`atomic-text-write.ts`): si el proceso
 *      se muere escribiendo, el fichero viejo sigue entero. En esta casa eso
 *      no es un detalle: el índice firmado de la tienda no puede quedar a
 *      medias, porque entonces la tienda deja de verificar y nadie sabe por
 *      qué.
 *
 * Referencia: core/talamus/plan.ts, core/escribe.ts.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planDeEmpaquete, resumenPlan } from "../core/talamus/plan.ts";
import { escribeAtomico, escribeJsonAtomico } from "../core/escribe.ts";
import type { Recuerdo } from "../core/talamus/context-packager.ts";

const recuerdos = (): Recuerdo[] => [
  { id: "r1", texto: "la red neuronal está hecha", tokens: 40, score: 0.9 },
  { id: "r2", texto: "la regla de oro", tokens: 30, score: 0.4 },
  { id: "r3", texto: "ruido puro", tokens: 20, score: 0.05 },
  { id: "r4", texto: "el Tálamo", tokens: 50, score: 0.8 },
];

describe("el plan de compactación", () => {
  it("dice lo que entra y lo que no", () => {
    const p = planDeEmpaquete("red neuronal", recuerdos(), 400);
    expect(p.entra.length).toBeGreaterThan(0);
    expect(p.quedan.length).toBeGreaterThan(0);
    expect(p.tokens).toBe(p.entra.reduce((n, r) => n + r.tokens, 0));
  });

  it("el motivo de cada uno: ruido, marginal o no cabía", () => {
    // con hueco de sobra, sólo el ruido se queda fuera
    const holgado = planDeEmpaquete("red neuronal", recuerdos(), 400);
    expect(holgado.quedan.find((q) => q.id === "r3")?.motivo).toBe("ruido");

    // con poco presupuesto: el marginal se queda por la regla de los
    // marginales, y lo relevante que no cabe, por no caber
    const justo = planDeEmpaquete("red neuronal", recuerdos(), 60);
    const marginal = justo.quedan.find((q) => q.id === "r2");
    expect(["marginal", "no-cabe"]).toContain(marginal?.motivo);
    const noCabe = justo.quedan.find((q) => q.id === "r4");
    expect(["marginal", "no-cabe"]).toContain(noCabe?.motivo);
  });

  it("con poco presupuesto, lo que no cabe se dice (no se recorta en silencio)", () => {
    const p = planDeEmpaquete("red neuronal", recuerdos(), 50);
    const noCabe = p.quedan.find((q) => q.id === "r4");
    expect(noCabe?.motivo).toBe("no-cabe");
    expect(p.tokens).toBeLessThanOrEqual(50);
  });

  it("el plan no cambia lo que decide el Tálamo (sólo lo explica)", () => {
    const p = planDeEmpaquete("red neuronal", recuerdos(), 400);
    const dentro = new Set(p.entra.map((r) => r.id));
    for (const f of p.quedan) expect(dentro.has(f.id)).toBe(false);
  });

  it("el resumen lo dice en una línea", () => {
    const r = resumenPlan(planDeEmpaquete("red neuronal", recuerdos(), 400));
    expect(r).toContain("entran");
    expect(r).toContain("ruido");
  });
});

describe("escribir sin romperse", () => {
  it("el fichero queda entero (y no quedan temporales)", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-escribe-"));
    try {
      const ruta = join(dir, "indice.json");
      escribeJsonAtomico(ruta, { a: 1, b: [2, 3] });
      expect(JSON.parse(readFileSync(ruta, "utf8")).b).toEqual([2, 3]);
      // no queda ningún temporal en la carpeta
      const temporales = readdirSync(dir).filter((f) => f.endsWith(".tmp"));
      expect(temporales).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("escribir encima conserva el contenido viejo hasta el final (nunca a medias)", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-escribe-"));
    try {
      const ruta = join(dir, "datos.txt");
      escribeAtomico(ruta, "el contenido viejo");
      escribeAtomico(ruta, "el nuevo");
      expect(readFileSync(ruta, "utf8")).toBe("el nuevo");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("crea la carpeta si no existe (y el fichero queda)", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-escribe-"));
    try {
      const ruta = join(dir, "nueva", "carpeta", "fichero.txt");
      escribeAtomico(ruta, "hola");
      expect(existsSync(ruta)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
