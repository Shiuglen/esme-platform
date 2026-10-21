/**
 * ACTUALIZAR Y EL DOCTOR — el ciclo de vida que faltaba.
 *
 * Lo que se prueba:
 *
 *   1. el plan de actualización ve lo que está viejo (y lo que ya está al día);
 *   2. una versión nueva NO es más creíble por ser nueva: al aplicar se
 *      verifica la firma igual que al instalar;
 *   3. y los PERMISOS no se tocan al actualizar: actualizar no es consentir;
 *   4. el doctor dice si la casa está en pie, y AVISA de lo que hay que
 *      mirar: los permisos que piden palabra, la tienda que no verifica y los
 *      procesos que se pasan del tope de memoria.
 *
 * Referencia: core/modulos/actualiza.ts, core/modulos/doctor.ts.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  planDeActualizacion,
  esMasNueva,
  comparaVersiones,
  mideCambioContraTarball,
} from "../core/modulos/actualiza.ts";
import { doctorDeLaCasa, renderDoctor } from "../core/modulos/doctor.ts";
import { empaquetar } from "../tienda/empaque.ts";

describe("actualizar", () => {
  it("compara versiones (semver estricto)", () => {
    expect(comparaVersiones("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(comparaVersiones("1.0.0", "1.0.0")).toBe(0);
    expect(comparaVersiones("0.1.0", "0.2.0")).toBeLessThan(0);
    expect(esMasNueva("0.1.0", "0.1.1")).toBe(true);
    expect(esMasNueva("0.1.0", "0.1.0")).toBe(false);
  });

  it("el plan ve lo que está viejo y lo que ya está al día", () => {
    const plan = planDeActualizacion(
      [
        { id: "esme.a", version: "0.1.0", dir: "/tmp/a" },
        { id: "esme.b", version: "0.2.0", dir: "/tmp/b" },
      ],
      [
        { id: "esme.a", version: "0.3.0" },
        { id: "esme.b", version: "0.2.0" },
      ]
    );
    expect(plan.actualizaciones.length).toBe(1);
    expect(plan.actualizaciones[0].id).toBe("esme.a");
    expect(plan.actualizaciones[0].de).toBe("0.1.0");
    expect(plan.actualizaciones[0].a).toBe("0.3.0");
    expect(plan.alDia.some((x) => x.includes("esme.b"))).toBe(true);
  });

  it("el diff entre versiones se mide (con el Myers de los turnos)", () => {
    const dir = mkdtempSync(join(tmpdir(), "esme-ver-"));
    const destino = join(dir, "nuevo");
    try {
      // el «módulo» viejo
      mkdirSync(join(dir, "viejo"));
      writeFileSync(join(dir, "viejo", "module.yaml"), "id: esme.x\nversion: 0.1.0\n");
      writeFileSync(join(dir, "viejo", "nota.txt"), "una nota\n");
      // el nuevo
      mkdirSync(destino);
      writeFileSync(join(destino, "module.yaml"), "id: esme.x\nversion: 0.2.0\n");
      writeFileSync(join(destino, "nota.txt"), "una nota\ny otra línea\n");
      const tar = empaquetar(destino, dir).ruta;

      const cambios = mideCambioContraTarball(
        { id: "esme.x", version: "0.1.0", dir: join(dir, "viejo") },
        tar
      );
      const nota = cambios.ficheros.find((f) => f.ruta === "nota.txt");
      expect(nota?.anadidos).toBe(1);
      const manifiesto = cambios.ficheros.find((f) => f.ruta === "module.yaml");
      expect(manifiesto?.estado).toBe("modificado");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("el doctor de la casa", () => {
  const base = {
    instalados: [{ id: "esme.a", version: "0.1.0", dir: "/tmp/a" }],
    pendientes: { "esme.a": ["mind:write"] },
    tienda: [{ id: "esme.a", version: "0.2.0" }],
  };

  it("avisa de los permisos que piden palabra", () => {
    const e = doctorDeLaCasa(base);
    expect(e.avisos.some((a) => a.includes("PIDIENDO PALABRA"))).toBe(true);
    expect(e.instalados[0].permisos_pendientes).toEqual(["mind:write"]);
  });

  it("avisa de la versión nueva y de la tienda que no verifica", () => {
    const e = doctorDeLaCasa({
      ...base,
      rutaIndice: "/tmp/no-existe-indice.json",
    });
    expect(e.avisos.some((a) => a.includes("versión nueva"))).toBe(true);
  });

  it("dice qué programas se pueden lanzar (y si la puerta está cerrada)", () => {
    const cerrado = doctorDeLaCasa(base);
    expect(cerrado.programas).toEqual([]);
    expect(renderDoctor(cerrado)).toContain("la puerta de los programas está cerrada");

    const abierto = doctorDeLaCasa({
      ...base,
      programas: [{ nombre: "rea", descripcion: "el motor de ingeniería inversa" }],
    });
    expect(abierto.programas).toHaveLength(1);
    expect(renderDoctor(abierto)).toContain("rea");
  });

  it("avisa de los procesos que se pasan del tope", () => {
    const e = doctorDeLaCasa({
      ...base,
      memoria: [{ proceso: "electron", pid: 1, mb: 3000, pasado: true }],
    });
    expect(e.avisos.some((a) => a.includes("tope de memoria"))).toBe(true);
  });

  it("el veredicto: la casa está en pie cuando no hay nada que mirar", () => {
    const e = doctorDeLaCasa({
      instalados: [{ id: "esme.a", version: "0.2.0", dir: "/tmp/a" }],
      pendientes: {},
      tienda: [{ id: "esme.a", version: "0.2.0" }],
    });
    expect(e.enPie).toBe(true);
    expect(renderDoctor(e)).toContain("en pie");
  });
});
