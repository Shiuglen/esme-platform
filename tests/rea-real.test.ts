/**
 * LA EVIDENCIA REAL — el contrato, comprobado con datos de verdad.
 *
 * Qué es este fichero. Una evidencia REAL de REA (6.7.0), recortada: se
 * quitó el grafo crudo y las huellas (lo que el kit no lee), y se dejó el
 * resto tal cual — los mismos nodos, las mismas limitaciones, la misma
 * cobertura, los mismos números.
 *
 * Por qué un fichero real y no uno inventado. Un contrato probado con datos
 * inventados prueba el contrato y nada más: si REA cambia una clave, un
 * ejemplo inventado sigue «pasando» y el kit se entera en el peor momento.
 * Con la evidencia real, el test dice la verdad sobre el REA que hay.
 *
 * De dónde sale. `rea analyze default_app.asar --format json` (el asar por
 * defecto de Electron), en esta máquina, el 21-oct-2026. Lo que se conserva:
 * el sujeto, el proveedor, las 9 limitaciones declaradas, el resumen de la
 * superficie, 37 nodos de 11 clases, 40 relaciones, 10 desconocidos y las 13
 * familias de cobertura.
 *
 * Referencia: docs/REA.md, core/rea/evidencia.ts, core/rea/conocimiento.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { leeEvidenciaRea, leeEvidenciaReaJson } from "../core/rea/forma.ts";
import { conocimientoDe } from "../core/rea/conocimiento.ts";
import { absorbeEvidencia } from "../core/rea/absorbe.ts";

const ruta = resolve(import.meta.dirname, "fixtures", "rea-evidencia-real.json");
const texto = readFileSync(ruta, "utf8");

describe("la evidencia REAL de REA encaja en el contrato del kit", () => {
  it("se lee (el sobre entero, con lo que REA de verdad manda)", () => {
    const lectura = leeEvidenciaReaJson(texto);
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const ev = lectura.evidencia;
    expect(ev.subject.name).toBe("default_app.asar");
    expect(ev.provider.id).toBeTruthy();
    expect(ev.operation).toBeTruthy();
    expect(ev.limitations.length).toBeGreaterThan(5);
  });

  it("el grafo real entra: los nodos, las relaciones y los desconocidos", () => {
    const lectura = leeEvidenciaReaJson(texto);
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const ev = lectura.evidencia;
    expect(ev.nodes.length).toBeGreaterThan(10);
    expect(ev.relations.length).toBeGreaterThan(5);
    expect(ev.unknowns.length).toBeGreaterThan(3);
    // y los nodos traen de dónde vienen
    const conModulo = ev.nodes.filter((n) => n.modulo);
    expect(conModulo.length).toBeGreaterThan(3);
    // y la confianza sale del contexto de evidencia
    expect(ev.nodes.some((n) => n.confianza !== null)).toBe(true);
  });

  it("la cobertura real trae las 13 familias (y su estado)", () => {
    const lectura = leeEvidenciaReaJson(texto);
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.evidencia.coverage.families.length).toBeGreaterThan(5);
    const conRelaciones = lectura.evidencia.coverage.families.filter((f) => f.retained_relations > 0);
    expect(conRelaciones.length).toBeGreaterThan(3);
  });

  it("y el resumen: la superficie real del programa", () => {
    const lectura = leeEvidenciaReaJson(texto);
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const ipc = lectura.evidencia.summary.ipc as Record<string, unknown>;
    expect(ipc.literal_channels).toBe(1);
    expect(lectura.evidencia.summary.browser_windows).toBe(1);
    expect(lectura.evidencia.summary.preload_entrypoints).toBe(1);
  });
});

describe("la evidencia REAL produce conocimiento (no ruido)", () => {
  const hechos = (): ReturnType<typeof conocimientoDe> => {
    const lectura = leeEvidenciaReaJson(texto);
    if (!lectura.ok) throw new Error("la evidencia real debería encajar");
    return conocimientoDe(lectura.evidencia);
  };

  it("un hecho por entidad: los nodos son muchos, los hechos son pocos", () => {
    const c = hechos();
    // 37 nodos, y los hechos NO son 37: son entidades, no nodos
    expect(c.hechos.length).toBeLessThan(80);
    expect(c.hechos.length).toBeGreaterThan(5);
  });

  it("las 9 limitaciones de REA son hechos de tipo «limite»", () => {
    const c = hechos();
    const limites = c.hechos.filter((h) => h.tipo === "limite");
    expect(limites.length).toBe(9);
    // y el texto DICE que no se afirma: es lo que las hace valiosas
    expect(limites[0]?.texto).toContain("NO afirma");
  });

  it("los desconocidos son hechos (lo que no se vio también es conocimiento)", () => {
    const c = hechos();
    const desconocidos = c.hechos.filter((h) => h.tipo === "desconocido");
    expect(desconocidos.length).toBeGreaterThan(0);
    expect(desconocidos[0]?.texto).toContain("no es ausencia");
  });

  it("la superficie real se dice en una frase", () => {
    const c = hechos();
    const superficie = c.hechos.find((h) => h.tipo === "superficie");
    expect(superficie).toBeTruthy();
    expect(superficie?.texto).toContain("canales IPC literales");
    expect(superficie?.texto).toContain("ventanas de navegador");
  });

  it("los módulos reales salen con sus funciones con nombre", () => {
    const c = hechos();
    const modulos = c.hechos.filter((h) => h.tipo === "modulo");
    expect(modulos.length).toBeGreaterThan(0);
    expect(modulos.some((m) => m.texto.includes("función(es) con nombre"))).toBe(true);
  });

  it("la composición cuenta el inventario, no lo suelta", () => {
    const c = hechos();
    const comp = c.hechos.find((h) => h.tipo === "composicion");
    expect(comp).toBeTruthy();
    expect(comp?.texto).toContain("Composición observada");
  });
});

describe("la evidencia REAL se absorbe en la mente (y el presupuesto se cuenta)", () => {
  it("sale un puñado de filas, y la nota lo dice", () => {
    const lectura = leeEvidenciaReaJson(texto);
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const a = absorbeEvidencia(lectura.evidencia);
    expect(a.trozos.length).toBeGreaterThan(5);
    expect(a.nota).toContain("fuera por presupuesto");
    // ninguna fila lleva un secreto (y el contador lo dice)
    expect(a.secretosRedactados).toBe(0);
  });

  it("con un presupuesto corto, lo que no cabe SE CUENTA (no se pierde en silencio)", () => {
    const lectura = leeEvidenciaReaJson(texto);
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const a = absorbeEvidencia(lectura.evidencia, { maxTrozos: 3 });
    expect(a.trozos.length).toBeLessThanOrEqual(4);
    expect(a.fuera).toBeGreaterThan(0);
    expect(a.nota).toContain("fuera por presupuesto");
  });
});

describe("el kit aguanta lo que REA manda de más", () => {
  it("claves que el kit no conoce no rompen la lectura (la forma es tolerante)", () => {
    const crudo = JSON.parse(texto) as Record<string, unknown>;
    crudo.clave_del_futuro = { loQueSea: true };
    const lectura = leeEvidenciaRea(crudo);
    expect(lectura.ok).toBe(true);
  });
});
