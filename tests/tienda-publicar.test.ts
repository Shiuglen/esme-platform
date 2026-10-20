// Publicar exige derecho: solo firma quien la raíz congelada avala.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { puedePublicar } from "../tienda/claves.ts";
import { leeRaiz } from "../tienda/raiz.ts";
import { generarPar } from "../tienda/firma.ts";
import { confiaIndexChain } from "../tienda/rotacion.ts";

const raiz = resolve(import.meta.dirname, "..");
const indice = () =>
  JSON.parse(readFileSync(join(raiz, "tienda", "index.json"), "utf8")) as {
    signature: { signed_by: string };
    claves: Record<string, string>;
  };

describe("el derecho a publicar", () => {
  it("la raíz congelada puede publicar (es la raíz)", () => {
    const pub = leeRaiz(raiz) as string;
    expect(puedePublicar({ pub }, raiz).ok).toBe(true);
  });

  it("una llave nueva, sin certificado, NO puede publicar (y lo dice)", () => {
    const r = puedePublicar({ pub: generarPar().pub }, raiz);
    expect(r.ok).toBe(false);
    expect(r.razon).toContain("estirpe");
  });

  it("la llave viva de la tienda sí puede: la raíz la avala por la cadena", () => {
    const idx = indice();
    const pub = idx.claves[idx.signature.signed_by];
    const r = puedePublicar({ pub }, raiz);
    expect(r.ok).toBe(true);
    expect(r.razon).toContain("estirpe");
  });

  it("la propiedad que lo sostiene: el índice publicado lo verifica la raíz congelada", () => {
    // cualquiera con el ancla del repo puede verificar la tienda, sin
    // necesitar la privada de nadie. Esto es lo que hace que un clon
    // recién hecho sea suficiente.
    const confianza = confiaIndexChain(
      indice() as unknown as Record<string, unknown>,
      leeRaiz(raiz) as string,
      join(raiz, "tienda", "rotaciones.json")
    );
    expect(confianza.ok).toBe(true);
  });
});
