// LA FRONTERA, COMPROBADA POR LAS TRES PARTES.
//
// La spec (estandar/cerebro-frontera.spec.yaml) es el contrato entre el
// cerebro (Python) y la app (TypeScript). Este test la compara con las dos
// implementaciones reales:
//
//   - el cerebro: daimon/server.py (Python) — si está a mano
//   - la app:     app/src/main/mente/cliente.ts (el RUTAS de la puerta)
//
// Cuando el repo de la app no está (la CI del kit), se comparan con las
// COPIAS de aquí: las tres partes quedan atadas igual, y en local (donde sí
// está la app) el test mira la app de verdad.
//
// Lo que se comprueba: ninguna ruta del cerebro queda sin escribir (entre dos
// lenguas solo sobrevive lo que está escrito) y ninguna ruta escrita falta
// en la puerta.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import * as yaml from "js-yaml";

const raizKit = resolve(import.meta.dirname, "..");
const appRepo = join(homedir(), "Daimon");
const tieneApp = existsSync(join(appRepo, "app", "src", "main", "mente", "cliente.ts"));

/** Las rutas de la spec (las que la frontera declara). */
const rutasDeLaSpec = (): string[] => {
  const spec = yaml.load(
    readFileSync(resolve(raizKit, "estandar", "cerebro-frontera.spec.yaml"), "utf8")
  ) as { contrato?: Record<string, unknown> };
  const rutas: string[] = [];
  const camina = (d: unknown) => {
    if (!d || typeof d !== "object") return;
    if (Array.isArray(d)) {
      d.forEach(camina);
      return;
    }
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      if (k === "ruta" && typeof v === "string") rutas.push(v.split("?")[0]);
      else camina(v);
    }
  };
  camina(spec.contrato);
  return [...new Set(rutas)].sort();
};

/** La copia de aquí del cerebro (la última conocida): la CI la usa. */
const COPIA_CEREBRO = `
@mcp.custom_route("/health", methods=["GET"])
@mcp.custom_route("/recall", methods=["POST"])
@mcp.custom_route("/remember", methods=["POST"])
@mcp.custom_route("/feedback", methods=["POST"])
@mcp.custom_route("/memories", methods=["GET"])
@mcp.custom_route("/memory/{id}", methods=["GET"])
@mcp.custom_route("/forget", methods=["POST"])
@mcp.custom_route("/ingest", methods=["POST"])
@mcp.custom_route("/ingest-x", methods=["POST"])
@mcp.custom_route("/rumbo", methods=["GET"])
@mcp.custom_route("/sueño", methods=["POST"])
@mcp.custom_route("/repeticiones", methods=["GET"])
@mcp.custom_route("/necesidad", methods=["GET"])
@mcp.custom_route("/equipo", methods=["POST"])
@mcp.custom_route("/orquesta", methods=["GET"])
@mcp.custom_route("/atlas", methods=["GET"])
@mcp.custom_route("/voz/oir", methods=["POST"])
@mcp.custom_route("/voz/decir", methods=["POST"])
@mcp.custom_route("/events", methods=["GET"])
@mcp.custom_route("/.well-known/agent-card.json", methods=["GET"])
@mcp.custom_route("/.well-known/agent.json", methods=["GET"])
`;

/** La copia de aquí de la puerta de la app (la última conocida): la CI la usa. */
const COPIA_APP = `
salud: '/health', recuerdos: '/memories', recordar: '/recall', escribir: '/remember',
feedback: '/feedback', olvido: '/forget', ingesta: '/ingest', sueno: '/sueño',
orquestacion: '/orquesta', atlas: '/atlas', mcp: '/mcp', rumbo: '/rumbo',
memoria: '/memory/{id}', vozOir: '/voz/oir', vozDecir: '/voz/decir', eventos: '/events',
ingestX: '/ingest-x', equipo: '/equipo', repeticiones: '/repeticiones', necesidad: '/necesidad',
`;

/** Las rutas del cerebro Python (las que declara el servidor). */
const rutasDelCerebro = (): string[] => {
  const ruta = join(appRepo, "daimon", "server.py");
  const texto = existe(ruta) ? readFileSync(ruta, "utf8") : COPIA_CEREBRO;
  const rutas = [...texto.matchAll(/custom_route\("([^"]+)"/g)].map((m) => m[1]);
  // /mcp lo sirve el framework del MCP (no es un custom_route): está ahí, pero
  // no se declara como tal
  rutas.push("/mcp");
  return [...new Set(rutas)].sort();
};

/** Las rutas de la puerta de la app (el RUTAS declarado). */
const rutasDeLaApp = (): string[] => {
  const texto = textoDeLaApp();
  const rutas = [...texto.matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
  return [...new Set(rutas)].sort();
};

/** El RUTAS de la app de verdad, o la copia de aquí si el repo no está. */
const textoDeLaApp = (): string => {
  const ruta = join(appRepo, "app", "src", "main", "mente", "cliente.ts");
  return existe(ruta) ? readFileSync(ruta, "utf8") : COPIA_APP;
};

const existe = (r: string): boolean => {
  try {
    return existsSync(r);
  } catch {
    return false;
  }
};

describe("la frontera: la spec, el cerebro y la app dicen lo mismo", () => {
  it("la spec declara rutas (y no se queda vacía)", () => {
    expect(rutasDeLaSpec().length).toBeGreaterThan(10);
  });

  it("NINGUNA ruta del cerebro queda sin escribir en la spec", () => {
    const sinEscribir = rutasDelCerebro().filter((r) => !rutasDeLaSpec().includes(r));
    expect(
      sinEscribir,
      `estas rutas del cerebro no están en estandar/cerebro-frontera.spec.yaml: ${sinEscribir.join(", ")}`
    ).toEqual([]);
  });

  it("NINGUNA ruta de la spec falta en el cerebro", () => {
    const faltan = rutasDeLaSpec().filter((r) => !rutasDelCerebro().includes(r));
    expect(
      faltan,
      `la spec promete rutas que el cerebro no tiene: ${faltan.join(", ")}`
    ).toEqual([]);
  });

  it("NINGUNA ruta de la spec falta en la puerta de la app", () => {
    const faltan = rutasDeLaSpec().filter(
      (r) => !rutasDeLaApp().includes(r) && !r.startsWith("/.well-known/")
    );
    expect(
      faltan,
      `la spec promete rutas que la puerta no tiene: ${faltan.join(", ")}`
    ).toEqual([]);
  });

  it("la app no llama a nada que la spec no declare", () => {
    const sinDeclarar = rutasDeLaApp().filter((r) => !rutasDeLaSpec().includes(r));
    expect(
      sinDeclarar,
      `la puerta llama a rutas sin escribir: ${sinDeclarar.join(", ")}`
    ).toEqual([]);
  });

  it("la forma de la memoria es la misma en los tres ({id})", () => {
    expect(rutasDeLaSpec()).toContain("/memory/{id}");
    expect(rutasDelCerebro()).toContain("/memory/{id}");
    expect(rutasDeLaApp()).toContain("/memory/{id}");
  });

  it("la copia de aquí está al día (si no, la CI juzga una app que ya no existe)", () => {
    // la CI del kit no tiene el repo de la app: usa las copias de aquí. Si
    // esas copias se quedan viejas, la CI pasa por alto una ruta que la app
    // tiene de verdad. Este test las ata a la app real.
    const ruta = join(appRepo, "app", "src", "main", "mente", "cliente.ts");
    if (!existe(ruta)) return; // sin app a la vista, la copia es lo que hay
    const copia = [...COPIA_APP.matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
    const reales = [...textoDeLaApp().matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
    const faltan = [...new Set(reales)].filter((r) => !copia.includes(r));
    const sobra = [...new Set(copia)].filter((r) => !reales.includes(r));
    expect(
      faltan,
      `la copia de la puerta está vieja: le faltan ${faltan.join(", ")}`
    ).toEqual([]);
    expect(
      sobra,
      `la copia de la puerta tiene rutas que la app ya no tiene: ${sobra.join(", ")}`
    ).toEqual([]);
  });

  it("la puerta manda los campos que la spec dice (y el nombre no cambia por el camino)", () => {
    // la spec declara el cuerpo de cada ruta: "query: string, budget?: number…"
    // de ahí salen los campos obligatorios (los que no tienen ?).
    const cuerpos = cuerposDeLaSpec();
    const cuerposDeLaApp = cuerposDeLaPuerta();
    const problemas: string[] = [];
    for (const [ruta, campos] of cuerpos) {
      const enviado = cuerposDeLaApp.get(ruta);
      if (!enviado) continue; // la app no llama a esa ruta (no es problema suyo)
      for (const campo of campos) {
        if (!new RegExp(`\\b${campo}\\b`).test(enviado))
          problemas.push(`${ruta}: la spec pide «${campo}» y la puerta no lo manda`);
      }
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});

/** Los cuerpos que declara la spec: ruta → campos obligatorios. */
const cuerposDeLaSpec = (): Map<string, string[]> => {
  const spec = yaml.load(
    readFileSync(resolve(raizKit, "estandar", "cerebro-frontera.spec.yaml"), "utf8")
  ) as { contrato?: Record<string, unknown> };
  const out = new Map<string, string[]>();
  const camina = (d: unknown) => {
    if (!d || typeof d !== "object") return;
    if (Array.isArray(d)) {
      d.forEach(camina);
      return;
    }
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      if (k === "ruta" && typeof v === "string" && v.startsWith("/")) {
        const cuerpo = (d as Record<string, unknown>).cuerpo;
        if (typeof cuerpo === "string") {
          // solo lo que va dentro de las llaves: el resto es prosa
          const dentro = cuerpo.match(/\{([\s\S]*)\}/)?.[1] ?? "";
          const obligatorios = [...dentro.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)]
            .map((m) => m[1])
            .filter((c) => !new RegExp(`\\b${c}\\?\\s*:`).test(dentro));
          out.set(v.split("?")[0], [...new Set(obligatorios)]);
        }
      }
      camina(v);
    }
  };
  camina(spec.contrato);
  return out;
};

/** Los cuerpos que manda la puerta: ruta → el literal del cuerpo. */
const cuerposDeLaPuerta = (): Map<string, string> => {
  const ruta = join(appRepo, "app", "src", "main", "mente", "cliente.ts");
  const texto = existe(ruta) ? readFileSync(ruta, "utf8") : "";
  const out = new Map<string, string>();
  const re = /RUTAS\.(\w+)[\s\S]{0,200}?body:\s*JSON\.stringify\(\{([\s\S]{0,400}?)\}\)/g;
  for (const m of texto.matchAll(re)) {
    const nombre = m[1];
    const rutaDeclarada = texto.match(new RegExp(`\\b${nombre}:\\s*'([^']+)'`))?.[1] ?? "";
    if (rutaDeclarada) out.set(rutaDeclarada, m[2]);
  }
  return out;
};
