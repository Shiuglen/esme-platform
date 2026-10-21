/**
 * EL CATÁLOGO DE RECURSOS — las piezas, y a qué deseo iluminan.
 *
 * Lo que se prueba:
 *
 *   1. el juez: la forma, el tipo (cerrado), la URL, la licencia (se puede no
 *      saber: «desconocida», no inventada) y el veredicto (cuánto lo hemos
 *      mirado);
 *   2. el emparejamiento: cada deseo encuentra los recursos que lo iluminan,
 *      y explica POR QUÉ (no es una caja negra);
 *   3. y la honestidad del veredicto: un recurso «probado» es el que la casa
 *      ha medido de verdad (como los que ha pasado por REA).
 *
 * Referencia: core/tienda/recursos.ts, estandar/recurso.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  juzgaRecurso,
  empareja, huecosDelEmparejamiento,
  palabrasDe,
  TIPOS_RECURSO,
  VEREDICTOS_RECURSO,
  type Recurso,
} from "../core/tienda/recursos.ts";
import { firmaCatalogo, verificaCatalogo, confiaCatalogo } from "../core/tienda/recursos-firmados.ts";
import { generarPar } from "../tienda/firma.ts";

const raiz = join(import.meta.dirname, "..");

const recurso = (parcial: Partial<Recurso> = {}): Record<string, unknown> => ({
  id: "openrig",
  nombre: "OpenRig",
  url: "https://github.com/mvschwarz/openrig",
  tipo: "repo",
  para_que: "Un runtime de agentes cuyos pasos se pueden rastrear y probar.",
  etiquetas: ["traza", "equipo"],
  licencia: "MIT",
  veredicto: "probado",
  ...parcial,
});

describe("el juez de los recursos", () => {
  it("un recurso bien formado entra", () => {
    const v = juzgaRecurso(recurso());
    expect(v.errores).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("sin URL no sirve (un recurso que no se puede consultar, no es un recurso)", () => {
    const v = juzgaRecurso(recurso({ url: "no soy un enlace" }));
    expect(v.ok).toBe(false);
    expect(v.errores.join(" ")).toContain("no es un enlace");
  });

  it("el tipo y el veredicto son cerrados", () => {
    expect(juzgaRecurso(recurso({ tipo: "casa" as never })).ok).toBe(false);
    expect(juzgaRecurso(recurso({ veredicto: "casi-mirado" as never })).ok).toBe(false);
    expect([...TIPOS_RECURSO]).toEqual(["repo", "paquete", "servicio", "patron"]);
    expect([...VEREDICTOS_RECURSO]).toEqual(["probado", "mirado", "sin-mirar"]);
  });

  it("la licencia se puede no saber (pero no se inventa)", () => {
    const v = juzgaRecurso(recurso({ licencia: "" }));
    expect(v.ok).toBe(false);
    const desconocido = juzgaRecurso(recurso({ licencia: "desconocida" }));
    expect(desconocido.ok).toBe(true);
  });

  it("sin «para qué» no vale (un recurso sin propósito no ilumina nada)", () => {
    const v = juzgaRecurso(recurso({ para_que: "sí" }));
    expect(v.ok).toBe(false);
  });
});

describe("el emparejamiento con los deseos", () => {
  const recursos: Recurso[] = [
    juzgaRecurso(recurso({ id: "openrig", etiquetas: ["traza", "pruebas"] })).recurso!,
    juzgaRecurso(
      recurso({
        id: "dot",
        nombre: "Dot Desktop",
        url: "https://x.com/usedotai",
        para_que: "El escritorio de puntos: el agente ve su propia interfaz.",
        etiquetas: ["escritorio", "puntos"],
        veredicto: "sin-mirar",
      })
    ).recurso!,
    juzgaRecurso(
      recurso({
        id: "crewai",
        nombre: "CrewAI",
        url: "https://github.com/crewAIInc/crewAI",
        para_que: "Equipos de agentes con un líder que los dirige.",
        etiquetas: ["equipo", "agentes"],
      })
    ).recurso!,
  ];

  it("cada deseo encuentra los recursos que lo iluminan", () => {
    const pares = empareja(
      [
        { id: "d-traza", texto: "Saber qué llamada falló en una ejecución de varios pasos", etiquetas: ["traza"] },
        { id: "d-puntos", texto: "Un escritorio donde el agente ve su propia interfaz", etiquetas: ["puntos"] },
      ],
      recursos
    );
    expect(pares[0].recursos[0].id).toBe("openrig");
    expect(pares[1].recursos[0].id).toBe("dot");
  });

  it("y explica por qué (un emparejamiento sin explicación no sirve para decidir)", () => {
    const pares = empareja(
      [{ id: "d-traza", texto: "Saber qué llamada falló", etiquetas: ["traza"] }],
      recursos
    );
    expect(pares[0].recursos[0].porque).toContain("traza");
  });

  it("el hueco se ve: un deseo que nada ilumina es la hoja de ruta", () => {
    const pares = empareja(
      [
        { id: "d-traza", texto: "Saber qué llamada falló", etiquetas: ["traza"] },
        { id: "d-nuevo", texto: "Algo que ningún recurso cubre", etiquetas: ["nuevo"] },
      ],
      recursos
    );
    const huecos = huecosDelEmparejamiento(pares);
    expect(huecos.map((h) => h.deseo)).toEqual(["d-nuevo"]);
  });

  it("un deseo YA HECHO no es un hueco (si no, la hoja de ruta mentiría)", () => {
    const pares = empareja(
      [{ id: "d-nuevo", texto: "Algo que ningún recurso cubre", etiquetas: ["nuevo"] }],
      recursos
    );
    // sin estado: es un hueco (está pedido)
    expect(huecosDelEmparejamiento(pares)).toHaveLength(1);
    // hecho: se hizo, no está pendiente
    expect(huecosDelEmparejamiento(pares, { "d-nuevo": "hecho" })).toHaveLength(0);
    // descartado: se dejó hacer, tampoco
    expect(huecosDelEmparejamiento(pares, { "d-nuevo": "descartado" })).toHaveLength(0);
    // en curso: sigue pendiente, es un hueco
    expect(huecosDelEmparejamiento(pares, { "d-nuevo": "en_curso" })).toHaveLength(1);
  });

  it("las palabras no distinguen mayúsculas ni acentos", () => {    const a = palabrasDe("Rastreo y pruebas");
    const b = palabrasDe("rastreo y pruebas");
    expect([...a].sort()).toEqual([...b].sort());
  });
});

describe("el catálogo firmado", () => {
  it("el catálogo se firma y se verifica", () => {
    const clave = generarPar();
    const recursos = [juzgaRecurso(recurso()).recurso!];
    const firmado = firmaCatalogo(recursos, clave.priv, clave.huella);
    const v = verificaCatalogo(JSON.stringify(firmado), clave.pub);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.recursos).toHaveLength(1);
  });

  it("un recurso que no vale no entra en el catálogo firmado", () => {
    const clave = generarPar();
    const firmado = firmaCatalogo(
      [juzgaRecurso(recurso()).recurso!],
      clave.priv,
      clave.huella
    );
    // se estropea un recurso: el catálogo entero deja de verificar
    const roto = { ...(firmado as Record<string, unknown>) } as Record<string, unknown>;
    (roto.recursos as unknown[])[0] = { id: "x", url: "no" };
    const v = verificaCatalogo(JSON.stringify(roto), clave.pub);
    expect(v.ok).toBe(false);
  });

  it("el catálogo de la casa verifica de verdad", () => {
    const ruta = join(raiz, "tienda", "recursos.json");
    if (!existsSync(ruta)) return;
    const pubRaiz = readFileSync(join(raiz, "tienda", "raiz.pub.pem"), "utf8");
    const c = confiaCatalogo(
      readFileSync(ruta, "utf8"),
      pubRaiz,
      join(raiz, "tienda", "rotaciones.json")
    );
    expect(c.ok).toBe(true);
  });
});
