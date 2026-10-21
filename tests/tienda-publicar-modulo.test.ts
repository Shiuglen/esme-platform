/**
 * LA TIENDA, de extremo a extremo — un módulo de cualquiera entra y se instala.
 *
 * Esto es el objetivo de la era, escrito como prueba: «una tienda firmada
 * donde cualquiera publica». El camino entero:
 *
 *   crear → verificar (construir, medir, juzgar) → publicar (firmar el
 *   artefacto, meterlo en el índice firmado) → instalar (el consumidor
 *   verifica con la raíz congelada y lo desempaqueta).
 *
 * La tienda que se usa aquí es de mentira (una carpeta temporal con su
 * propia raíz): la tienda de verdad está firmada con la llave de release y
 * no se toca en un test. Lo que se prueba es el MECANISMO, no el contenido.
 *
 * Referencia: docs/ENTRADA.md, docs/TIENDA.md, tienda/receptor.ts.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { creaModulo } from "../scripts/crear-modulo.ts";
import { publicaModulo } from "../scripts/publicar-modulo.ts";
import { verificaModulo } from "../scripts/verificar-modulo.ts";
import { verificarPaquete, instalar } from "../tienda/receptor.ts";
import { generarPar, firmarIndex, declaraClave } from "../tienda/firma.ts";
import { huellaDePub } from "../tienda/rotacion.ts";

const raizKit = join(import.meta.dirname, "..");

/** Una tienda de mentira: su propia raíz, su índice firmado y su sitio. */
const tiendaDePrueba = (): { raiz: string; tienda: string; pub: string; clave: ReturnType<typeof generarPar> } => {
  const raiz = mkdtempSync(join(tmpdir(), "esme-tienda-"));
  const tienda = join(raiz, "tienda");
  mkdirSync(join(tienda, "paquetes"), { recursive: true });
  mkdirSync(join(tienda, "firmas"), { recursive: true });
  const clave = generarPar();
  // la raíz congelada: lo que el consumidor fija un día y ya no cambia
  writeFileSync(join(tienda, "raiz.pub.pem"), clave.pub);
  const indice = firmarIndex(
    declaraClave({ schema_version: 1, modulos: [] }, clave.pub, clave.huella),
    clave.priv,
    clave.huella
  );
  writeFileSync(join(tienda, "index.json"), JSON.stringify(indice, null, 2) + "\n");
  return { raiz, tienda, pub: clave.pub, clave };
};

describe("una tienda donde cualquiera publica", () => {
  it("el módulo de cualquiera llega al índice firmado y el consumidor lo instala", async () => {
    const { raiz, tienda, pub, clave } = tiendaDePrueba();
    const dir = join(raiz, "mi-modulo");
    try {
      // 1. el módulo nace
      await creaModulo({ id: "esme.tercero.mi-modulo", nombre: "Mío", dir }, raizKit);

      // 2. se verifica de verdad (construye, mide, juzga)
      const verificado = await verificaModulo(dir);
      expect(verificado.veredicto?.entra).toBe(true);

      // 3. se publica: paquete firmado + entrada en el índice firmado
      const publicado = await publicaModulo(dir, { tienda, clave });
      expect(publicado.ok).toBe(true);
      expect(publicado.id).toBe("esme.tercero.mi-modulo");

      // el índice declara el módulo y está firmado por la raíz
      const indice = JSON.parse(readFileSync(join(tienda, "index.json"), "utf8")) as {
        modulos: Array<{ id: string; artefacto?: { tar?: string } }>;
        signature?: { signed_by?: string };
        claves?: Record<string, string>;
      };
      const entrada = indice.modulos.find((m) => m.id === "esme.tercero.mi-modulo");
      expect(entrada).toBeTruthy();
      expect(entrada?.artefacto?.tar).toBeTruthy();
      // la clave que firmó el índice está declarada DENTRO del cuerpo firmado
      expect(indice.claves?.[huellaDePub(pub)]).toBe(pub);
      expect(indice.signature?.signed_by).toBe(clave.huella);

      // 4. el consumidor verifica con la raíz congelada y lo instala
      const v = verificarPaquete("esme.tercero.mi-modulo", "0.1.0", raiz, pub);
      expect(v.ok).toBe(true);

      const destino = join(raiz, "instalados");
      const inst = instalar("esme.tercero.mi-modulo", raiz, destino, { pubPem: pub });
      expect(inst.id).toBe("esme.tercero.mi-modulo");
      expect(existsSync(join(inst.dir, "module.yaml"))).toBe(true);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  }, 120_000);

  it("un módulo que el juez no acepta no entra en el índice (ni de broma)", async () => {
    const { raiz, tienda, pub, clave } = tiendaDePrueba();
    const dir = join(raiz, "roto");
    try {
      await creaModulo({ id: "esme.tercero.roto", nombre: "Roto", dir }, raizKit);
      // se rompe a propósito: el módulo revienta al hablar
      writeFileSync(
        join(dir, "src", "index.ts"),
        "export async function ciclo(): Promise<never> { throw new Error('boom'); }\n"
      );

      const publicado = await publicaModulo(dir, { tienda, clave });
      expect(publicado.ok).toBe(false);

      const indice = JSON.parse(readFileSync(join(tienda, "index.json"), "utf8")) as {
        modulos: Array<{ id: string }>;
      };
      expect(indice.modulos.find((m) => m.id === "esme.tercero.roto")).toBeUndefined();
      // y el consumidor, claro, no lo puede instalar
      const v = verificarPaquete("esme.tercero.roto", "0.1.0", raiz, pub);
      expect(v.ok).toBe(false);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  }, 120_000);

  it("la firma que trae no casa con los bytes: no se publica (nadie firma el aire)", async () => {
    const { raiz, tienda, clave } = tiendaDePrueba();
    const dir = join(raiz, "ajeno");
    try {
      await creaModulo({ id: "esme.tercero.ajeno", nombre: "Ajeno", dir }, raizKit);
      // una firma de otra cosa (bytes que no son los del paquete)
      const falsa = join(raiz, "falsa.artefacto.json");
      writeFileSync(
        falsa,
        JSON.stringify({
          modulo: "esme.tercero.ajeno",
          version: "0.1.0",
          tar: "0".repeat(64),
          bytes: 1,
          firmado_en: "2026-10-21",
          firma: { signed_by: "x", hash: "y", signature: "z" },
        })
      );
      const publicado = await publicaModulo(dir, { tienda, clave, firma: falsa });
      expect(publicado.ok).toBe(false);
      expect(publicado.razon).toContain("no es de estos bytes");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  }, 120_000);
});
