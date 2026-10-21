/**
 * LA ARENA — la cata a ciegas, y lo que se aprende de ella.
 *
 * Lo que se prueba:
 *
 *   1. el REPARTO es a ciegas y repetible (con la sal, la misma carrera reparte
 *      igual; sin ella, no se puede adivinar);
 *   2. el COMPROMISO verifica al revelar, y si el mapa se cambia por el
 *      camino, la arena queda CONTAMINADA y no cuenta;
 *   3. el JUEZ echa las arenas mal escritas, y dice por qué;
 *   4. la parte CIEGA no puede llevar motor, ni modelo, ni coste (las fugas
 *      se ven, no se confían);
 *   5. el PALADAR necesita catas de sobra, y sólo cuenta las catas limpias;
 *   6. el ROUTER pregunta primero a la persona, luego al paladar, y sólo al
 *      final decide el router;
 *   7. y la carrera de verdad: los participantes miden, el documento ciego se
 *      escribe con su compromiso, y al revelar cuadra.
 *
 * Referencia: core/arena/, estandar/arena.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compromisoDe,
  reparteCiego,
  mismaHuella,
  huellaDe,
} from "../core/arena/ciego.ts";
import {
  juzgaArena,
  vistaCiega,
  fugasCiegas,
  type Arena,
} from "../core/arena/arena.ts";
import {
  agregaPaladar,
  MINIMO_CATAS,
  proponePaladar,
  paladarParaRouter,
} from "../core/arena/paladar.ts";
import { aprendeDe, eligeConAprendido } from "../core/router/aprende.ts";
import { ejecutaCata, revelaCata } from "../core/arena/ejecuta.ts";

const SAL = "sal-de-prueba";

/** Una arena buena: la que el juez tiene que dar por buena. */
const arenaBuena = (cambios: Partial<Arena> = {}): Arena => {
  const sal = SAL;
  const mapa = { A: "claude-code", B: "opencode" };
  return {
    id: "arena-1",
    version: 1,
    emitido: "2026-10-21T00:00:00.000Z",
    tarea: "arregla la puerta",
    categoria: "codigo",
    participantes: [
      { etiqueta: "A", medidas: { ms: 100, tokens: 50, cambios: 1, ok: true } },
      { etiqueta: "B", medidas: { ms: 200, tokens: 80, cambios: 2, ok: true } },
    ],
    compromiso: { algoritmo: "sha256", hash: compromisoDe(mapa, sal) },
    veredicto: { elegida: "A" },
    revelacion: {
      sal,
      fichas: { A: { motor: "claude-code" }, B: { motor: "opencode" } },
    },
    ...cambios,
  };
};

/** Un módulo de juguete que contesta por la puerta. */
const moduloDePrueba = (id: string, respuesta: string): string => {
  const dir = mkdtempSync(join(tmpdir(), "esme-arena-"));
  writeFileSync(
    join(dir, "module.yaml"),
    [
      "schema_version: 1",
      `id: "${id}"`,
      'name: "Arena"',
      'version: "0.1.0"',
      'category: "tool"',
      'description: "Un módulo de juguete que contesta por la puerta."',
      'author: "esme@prueba"',
      'license: "MIT"',
      'entry: "dist/index.js"',
      'runtime: "nodejs"',
      "permissions:",
      "  - mind:read",
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
      "  const r = puerta?.mente ? await puerta.mente.recall({ query: consulta, budget: 400 }) : [];",
      `  return { respuesta: ${JSON.stringify(respuesta)}, recuerdo: r[0]?.id ?? null };`,
      "}",
    ].join("\n")
  );
  return dir;
};

describe("el ciego", () => {
  it("el reparto es repetible con la sal y no se adivina sin ella", () => {
    const motores = ["claude-code", "opencode", "qwen", "codex"];
    const uno = reparteCiego(motores, SAL);
    const otro = reparteCiego(motores, SAL);
    expect(uno).toEqual(otro);
    // es un reparto: cada motor tiene una etiqueta y ninguna se repite
    expect(Object.keys(uno).sort()).toEqual(["A", "B", "C", "D"]);
    expect(Object.values(uno).sort()).toEqual([...motores].sort());
    // y con otra sal el reparto es otro
    const otroSal = reparteCiego(motores, "otra-sal");
    expect(otroSal).not.toEqual(uno);
  });

  it("el canónico no depende del orden de las claves", () => {
    expect(huellaDe({ a: 1, b: 2 })).toBe(huellaDe({ b: 2, a: 1 }));
  });

  it("dos huellas se comparan sin que se note", () => {
    expect(mismaHuella(huellaDe({ a: 1 }), huellaDe({ a: 1 }))).toBe(true);
    expect(mismaHuella(huellaDe({ a: 1 }), huellaDe({ a: 2 }))).toBe(false);
    expect(mismaHuella("no-es-un-hash", "no-es-un-hash")).toBe(false);
  });
});

describe("el juez de la arena", () => {
  it("da por buena una arena bien escrita", () => {
    const j = juzgaArena(arenaBuena());
    expect(j.errores).toEqual([]);
    expect(j.integridad).toBe("limpia");
    expect(j.ok).toBe(true);
  });

  it("echa las arenas mal escritas, y dice por qué", () => {
    const rota = arenaBuena({
      id: "",
      categoria: "cocina" as never,
      participantes: [{ etiqueta: "A", medidas: { ms: 1, tokens: 1, cambios: 0, ok: true } }],
    });
    const j = juzgaArena(rota);
    expect(j.ok).toBe(false);
    expect(j.errores.join(" ")).toContain("falta el id");
    expect(j.errores.join(" ")).toContain("la categoría");
    expect(j.errores.join(" ")).toContain("al menos dos participantes");
  });

  it("el veredicto tiene que elegir una etiqueta de verdad", () => {
    const j = juzgaArena(arenaBuena({ veredicto: { elegida: "Z" } }));
    expect(j.ok).toBe(false);
    expect(j.errores.join(" ")).toContain("«Z»");
  });

  it("si el mapa se cambia después de la carrera, la arena está contaminada", () => {
    // el organizador cambia el mapa después de ver los resultados
    const AMG = arenaBuena();
    const muda = {
      ...AMG,
      revelacion: {
        sal: SAL,
        fichas: { A: { motor: "opencode" }, B: { motor: "claude-code" } },
      },
    };
    const j = juzgaArena(muda);
    expect(j.integridad).toBe("contaminada");
    expect(j.ok).toBe(false);
    expect(j.errores.join(" ")).toContain("contaminada");
  });

  it("una arena sin revelar no está rota: sólo está a medias", () => {
    const a = arenaBuena();
    const ciega: Arena = { ...a, veredicto: undefined, revelacion: undefined };
    const j = juzgaArena(ciega);
    expect(j.integridad).toBe("sin_revelar");
    expect(j.errores).toEqual([]);
  });
});

describe("las fugas", () => {
  it("la parte ciega no puede llevar motor, ni modelo, ni coste", () => {
    const a = arenaBuena();
    const colada = {
      ...a,
      participantes: [
        { etiqueta: "A", medidas: { ms: 1, tokens: 1, cambios: 0, ok: true }, motor: "claude-code" },
        { etiqueta: "B", medidas: { ms: 2, tokens: 2, cambios: 0, ok: true } },
      ],
    } as unknown as Arena;
    const fugas = fugasCiegas(colada);
    expect(fugas.length).toBeGreaterThan(0);
    expect(fugas.join(" ")).toContain("motor");
    // y el juez lo dice
    const j = juzgaArena(colada);
    expect(j.ok).toBe(false);
  });

  it("la vista ciega enseña etiquetas y medidas, y nada más", () => {
    const vista = vistaCiega(arenaBuena());
    const texto = JSON.stringify(vista);
    expect(texto).not.toContain("claude-code");
    expect(texto).not.toContain("opencode");
    expect(vista.participantes.map((p) => p.etiqueta)).toEqual(["A", "B"]);
    expect(vista.huella).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("el paladar", () => {
  it("necesita catas de sobra antes de proponer", () => {
    const una = arenaBuena();
    const dos = arenaBuena({ id: "arena-2" });
    const paladar = agregaPaladar([una, dos]);
    expect(proponePaladar(paladar, "codigo")).toBeNull();

    const tres = arenaBuena({ id: "arena-3" });
    const conTres = agregaPaladar([una, dos, tres]);
    const p = proponePaladar(conTres, "codigo");
    expect(p?.motor).toBe("claude-code");
    expect(p?.catas).toBe(MINIMO_CATAS);
    expect(p?.ganadas).toBe(MINIMO_CATAS);
  });

  it("las catas sucias no cuentan", () => {
    const sucia = arenaBuena({
      id: "arena-sucia",
      revelacion: {
        sal: SAL,
        fichas: { A: { motor: "opencode" }, B: { motor: "claude-code" } },
      },
    });
    const paladar = agregaPaladar([sucia, sucia, sucia]);
    expect(proponePaladar(paladar, "codigo")).toBeNull();
  });

  it("el número va siempre al lado: aunque no proponga, se ve la cuenta", () => {
    const paladar = agregaPaladar([arenaBuena()]);
    // el que ganó: una cata, una ganada
    const ganador = paladar.codigo["claude-code"];
    expect(ganador.catas).toBe(1);
    expect(ganador.ganadas).toBe(1);
    expect(ganador.tasa).toBe(1);
    // el que perdió: estuvo en la carrera, pero no ganó
    const perdedor = paladar.codigo["opencode"];
    expect(perdedor.catas).toBe(1);
    expect(perdedor.ganadas).toBe(0);
    expect(perdedor.tasa).toBe(0);
  });

  it("el paladar para el router sólo lleva las propuestas que pasan el listón", () => {
    const una = arenaBuena();
    const palate = paladarParaRouter(agregaPaladar([una]));
    expect(palate.codigo).toBeUndefined();
  });
});

describe("el router con paladar", () => {
  it("pregunta primero a la persona, luego al paladar, y al final decide él", () => {
    const aprendido = aprendeDe([
      {
        ts: 1,
        tarea: "arregla el fallo de la puerta",
        ruta: "opencode",
        confianza: 0.5,
        veredicto: "corregido",
        ruta_correcta: "qwen",
      },
    ]);
    // 1. la persona
    expect(
      eligeConAprendido("arregla el fallo de la puerta", aprendido, () => "laya", "pruebas")
    ).toEqual({ ruta: "qwen", de: "persona" });

    // 2. el paladar (el veredicto exacto no aplica a esta otra tarea)
    const conPaladar = { ...aprendido, paladar: { pruebas: { motor: "qwen", catas: 3, ganadas: 3 } } };
    expect(eligeConAprendido("otra tarea", conPaladar, () => "laya", "pruebas")).toEqual({
      ruta: "qwen",
      de: "paladar",
    });

    // 3. el router, cuando no hay nada aprendido
    expect(eligeConAprendido("otra tarea", aprendido, () => "laya", "pruebas")).toEqual({
      ruta: "laya",
      de: "router",
    });
  });
});

describe("la carrera de verdad", () => {
  it("mide a los participantes, reparte a ciegas y deja el documento ciego", async () => {
    const dirA = moduloDePrueba("esme.prueba.arena-a", "la respuesta de A");
    const dirB = moduloDePrueba("esme.prueba.arena-b", "la respuesta de B");
    try {
      const { construyeModulo } = await import("../scripts/construir-modulos.ts");
      await construyeModulo(dirA);
      await construyeModulo(dirB);

      const r = await ejecutaCata({
        tarea: "¿qué se decidió sobre el Taller?",
        categoria: "pruebas",
        participantes: [
          { motor: "esme.prueba.arena-a", dir: dirA },
          { motor: "esme.prueba.arena-b", dir: dirB },
        ],
        sal: SAL,
      });

      // el documento ciego: etiquetas y medidas, y ni un nombre
      const texto = JSON.stringify(r.arena);
      expect(texto).not.toContain("esme.prueba.arena-a");
      expect(texto).not.toContain("esme.prueba.arena-b");
      expect(r.arena.participantes.length).toBe(2);
      for (const p of r.arena.participantes) {
        expect(p.medidas.ok).toBe(true);
        expect(p.medidas.ms).toBeGreaterThanOrEqual(0);
        expect(p.medidas.tokens).toBeGreaterThan(0);
      }

      // y el compromiso ata el mapa a la sal
      const revelada = revelaCata(r.arena, {
        sal: r.sal,
        fichas: r.fichas,
        elegida: r.arena.participantes[0].etiqueta,
      });
      const j = juzgaArena(revelada);
      expect(j.integridad).toBe("limpia");
      expect(j.ok).toBe(true);
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  }, 120_000);

  it("una cata necesita dos participantes", async () => {
    await expect(
      ejecutaCata({ tarea: "hola", categoria: "libre", participantes: [{ motor: "uno" }] })
    ).rejects.toThrow(/dos participantes/);
  });
});
