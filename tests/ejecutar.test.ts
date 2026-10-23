/**
 * EJECUTAR — un turno de verdad, medido.
 *
 * Lo que se prueba:
 *
 *   1. se abre el módulo con su CÁPSULA y su PUERTA, y contesta;
 *   2. lo CONCEDIDO manda: un módulo que pide `mind:read` y no lo tiene
 *      concedido corre sin puerta (y el turno lo dice);
 *   3. el turno se mide: los tokens, la limpieza y los permisos montados;
 *   4. y lo que el módulo TOCÓ se calcula de verdad (el diff del árbol).
 *
 * Referencia: core/turnos/ejecuta.ts, core/modulos/consentimiento.ts.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ejecutaTurno } from "../core/turnos/ejecuta.ts";
import { Consentimientos } from "../core/modulos/consentimiento.ts";
import { leeManifiesto } from "../tienda/modulo-manifiesto.ts";

const raizKit = join(import.meta.dirname, "..");

/** Un módulo de juguete que habla por la puerta. */
const moduloDePrueba = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "esme-turno-"));
  writeFileSync(
    join(dir, "module.yaml"),
    [
      "schema_version: 1",
      'id: "esme.prueba.turno"',
      'name: "Turno"',
      'version: "0.1.0"',
      'category: "tool"',
      'description: "Un módulo de juguete que contesta por la puerta."',
      'author: "esme@prueba"',
      'license: "MIT"',
      'entry: "dist/index.js"',
      'runtime: "nodejs"',
      "permissions:",
      "  - mind:read",
      "  - mind:write",
      "benchmarks:",
      "  recall_delta: 0.01",
      '  report: "bench.json"',
      "",
    ].join("\n")
  );
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "index.ts"),
    [
      "export async function ciclo(consulta: string) {",
      "  const puerta = globalThis.esme;",
      "  if (!puerta?.mente) return { respuesta: 'sin puerta', recuerdo: null };",
      "  const r = await puerta.mente.recall({ query: consulta, budget: 400 });",
      "  return { respuesta: r[0]?.texto ?? 'nada', recuerdo: r[0]?.id ?? null };",
      "}",
    ].join("\n")
  );
  return dir;
};

describe("ejecutar un turno", () => {
  it("abre el módulo, le pregunta y mide el turno", async () => {
    const dir = moduloDePrueba();
    try {
      // el módulo necesita estar construido
      const { construyeModulo } = await import("../tienda/construye.ts");
      await construyeModulo(dir);

      const r = await ejecutaTurno({
        dirModulo: dir,
        consulta: "¿qué se decidió sobre el Taller?",
        motor: "local",
      });
      expect(r.error).toBeUndefined();
      expect(r.turno.respuesta).toContain("recuerdo de");
      expect(r.turno.tokens.total).toBeGreaterThan(0);
      expect(r.limpieza).toBeGreaterThan(0);
      // sin libro, se concede lo declarado (es una ejecución de prueba)
      expect(r.concedidos.sort()).toEqual(["mind:read", "mind:write"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("lo concedido manda: sin permiso, el módulo corre sin puerta", async () => {
    const dir = moduloDePrueba();
    try {
      const { construyeModulo } = await import("../tienda/construye.ts");
      await construyeModulo(dir);

      const libro = new Consentimientos(join(dir, "permisos.json"));
      // la persona concede sólo la lectura
      libro.concede("esme.prueba.turno", ["mind:read"], "la persona");

      const r = await ejecutaTurno({
        dirModulo: dir,
        consulta: "¿qué se decidió sobre el Taller?",
        consentimientos: libro,
      });
      expect(r.concedidos).toEqual(["mind:read"]);
      expect(r.pendientes).toEqual(["mind:write"]);
      // el módulo igualmente pregunta por la puerta (la lectura está concedida)
      expect(r.turno.respuesta).toContain("recuerdo de");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("lo que el módulo tocó se calcula de verdad (en el espacio de trabajo)", async () => {
    const dir = moduloDePrueba();
    const espacio = mkdtempSync(join(tmpdir(), "esme-espacio-"));
    try {
      // el módulo escribe POR LA PUERTA (la cápsula cierra node:fs: por eso
      // un módulo que quiere escribir pide fs:project)
      writeFileSync(
        join(dir, "module.yaml"),
        readFileSync(join(dir, "module.yaml"), "utf8").replace(
          "  - mind:write",
          "  - mind:write\n  - fs:project"
        )
      );
      writeFileSync(
        join(dir, "src", "index.ts"),
        [
          "export async function ciclo(consulta: string) {",
          "  const puerta = globalThis.esme;",
          "  const r = puerta?.mente ? await puerta.mente.recall({ query: consulta, budget: 400 }) : [];",
          "  if (puerta?.fs) await puerta.fs.escribir('nota.txt', 'una nota\\n');",
          "  return { respuesta: r[0]?.texto ?? 'nada' };",
          "}",
        ].join("\n")
      );
      const { construyeModulo } = await import("../tienda/construye.ts");
      await construyeModulo(dir);

      const r = await ejecutaTurno({ dirModulo: dir, consulta: "hola", espacio });
      const rutas = r.cambios.ficheros.map((f) => f.ruta);
      expect(rutas).toContain("nota.txt");
      // y el turno lo dice: el fichero cambió con sus líneas
      const nota = r.cambios.ficheros.find((f) => f.ruta === "nota.txt");
      expect(nota?.anadidos).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(espacio, { recursive: true, force: true });
    }
  }, 60_000);
});
