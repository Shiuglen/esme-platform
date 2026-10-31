/**
 * LA SPEC DEL PAQUETE Y SU CÓDIGO — la misma cosa, y se nota cuando no.
 *
 * `paquete.spec.yaml` no solo describe: trae un manifiesto de ejemplo, los
 * doce puntos, los alcances, los niveles, los rangos y los hosts que se
 * cubren y los que no. La conformidad lo compara con el código. Aquí se
 * prueba la prueba: si la spec se separa (un punto de menos, un ejemplo que
 * el código rechaza, un host parecido que la spec da por cubierto), se dice.
 *
 * Referencia: scripts/estandar/conformidad-paquete.ts, estandar/paquete.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { compruebaPaquete } from "../scripts/estandar/conformidad-paquete.ts";
import { leeSpec } from "../scripts/estandar/conformidad.ts";

type Spec = Record<string, any>;

const spec = (): Spec => structuredClone(leeSpec("paquete.spec.yaml"));

/** Los fallos de una spec, juntos en un texto. */
const fallos = (s: Spec): string => {
  const f: string[] = [];
  compruebaPaquete(s, (p) => f.push(p));
  return f.join("\n");
};

describe("paquete.spec.yaml — la de verdad cuadra", () => {
  it("sin fallos", () => {
    expect(fallos(spec())).toBe("");
  });

  it("el ejemplo trae las veintiuna claves de arriba, el oficio también", () => {
    expect(Object.keys(spec().manifiesto)).toHaveLength(21);
    expect(spec().manifiesto.oficio.secciones[0].id).toBe("hoy");
  });
});

describe("paquete.spec.yaml — y la comprobación ve cuando se separa", () => {
  it("un punto que falta en la spec", () => {
    const s = spec();
    delete s.puntos.commands;
    expect(fallos(s)).toContain("commands");
  });

  it("un punto con otra naturaleza, otro sitio o otras claves", () => {
    const s = spec();
    s.puntos.tools.naturaleza = "datos";
    s.puntos.routines.corre = "sesión";
    s.puntos.agents.claves = ["id", "file", "format"];
    const f = fallos(s);
    expect(f).toContain("tools");
    expect(f).toContain("routines");
    expect(f).toContain("agents");
  });

  it("un ejemplo que el código rechaza", () => {
    const s = spec();
    s.manifiesto.contributes.tools = [{ id: "x", entry: "dist/x.js", runtime: "nodejs" }];
    expect(fallos(s)).toContain("una plantilla es solo datos");
  });

  it("un ejemplo al que le falta una clave", () => {
    const s = spec();
    delete s.manifiesto.signatures;
    expect(fallos(s)).toContain("signatures");
  });

  it("una licencia, un tipo o un formato de más", () => {
    const s = spec();
    s.licencias.push("GPL-3.0");
    s.tipos.push("app");
    s.formatos_agente.push("yaml");
    const f = fallos(s);
    expect(f).toContain("GPL-3.0");
    expect(f).toContain("app");
    expect(f).toContain("yaml");
  });

  it("un alcance cambiado o una capacidad que falta", () => {
    const s = spec();
    s.alcances["net:fetch"] = ["paths"];
    delete s.alcances["proc:spawn"];
    const f = fallos(s);
    expect(f).toContain("net:fetch");
    expect(f).toContain("proc:spawn");
  });

  it("un nivel con otro nombre", () => {
    const s = spec();
    s.niveles[2] = "contenedor";
    expect(fallos(s)).toContain("contenedor");
  });

  it("una variable que el código no sustituye", () => {
    const s = spec();
    s.variables.ESME_HOGAR = "la casa";
    expect(fallos(s)).toContain("ESME_HOGAR");
  });

  it("un rango que la spec admite y el código no (o al revés)", () => {
    const s = spec();
    s.rangos.validos.push("^1.0.0-beta");
    s.rangos.no_validos.push("^1.2");
    s.rangos.ejemplos.push(["2.0.0", "^1.0", true]);
    const f = fallos(s);
    expect(f).toContain("^1.0.0-beta");
    expect(f).toContain("^1.2");
    expect(f).toContain("2.0.0");
  });

  it("un host parecido que la spec da por cubierto", () => {
    const s = spec();
    s.hosts.cubre.push(["*.figma.com", "evil-figma.com"]);
    expect(fallos(s)).toContain("evil-figma.com");
  });

  it("las claves del candado", () => {
    const s = spec();
    s.lock.claves = ["lock_version", "paquetes"];
    s.lock.claves_paquete.push("firma");
    const f = fallos(s);
    expect(f).toContain("raiz");
    expect(f).toContain("firma");
  });

  it("el oficio: una vista de más, otra de reserva, un estado o un tipo de menos", () => {
    const s = spec();
    s.oficio.vistas.push("esme.calendario");
    s.oficio.vistas_con_filtro.push("esme.memoria");
    s.oficio.vista_de_reserva = "esme.hoy";
    s.oficio.estados.pop();
    s.oficio.tipos_de_entrada = ["text", "number"];
    s.oficio.primera = "tareas";
    const f = fallos(s);
    expect(f).toContain("esme.calendario");
    expect(f).toContain("oficio.vistas_con_filtro");
    expect(f).toContain("oficio.vista_de_reserva");
    expect(f).toContain("oficio.estados");
    expect(f).toContain("oficio.tipos_de_entrada");
    expect(f).toContain("oficio.primera");
  });

  it("el oficio: un tope cambiado, o uno que falta", () => {
    const s = spec();
    s.oficio.topes.secciones = 20;
    delete s.oficio.topes.campos;
    const f = fallos(s);
    expect(f).toContain("oficio.topes.secciones");
    expect(f).toContain("oficio.topes.campos");
  });

  it("el oficio: un filtro que la spec da por bueno y el código no (o al revés)", () => {
    const s = spec();
    s.oficio.filtros.validos.push("estado:te-necesita && etiqueta:x");
    s.oficio.filtros.no_validos.push("etiqueta:escrito");
    const f = fallos(s);
    expect(f).toContain("estado:te-necesita && etiqueta:x");
    expect(f).toContain("etiqueta:escrito");
  });

  it("una spec sin una sección entera lo dice, no se rompe", () => {
    const s = spec();
    delete s.hosts;
    delete s.puntos;
    expect(() => fallos(s)).not.toThrow();
    expect(fallos(s)).toContain("hosts");
  });
});
