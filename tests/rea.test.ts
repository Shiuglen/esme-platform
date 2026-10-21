/**
 * REA: la evidencia, el catálogo, el conocimiento y la puerta de los programas.
 *
 * Qué se comprueba aquí, y por qué cada cosa:
 *
 *   - LA FORMA: una evidencia que no encaja se DICE (con sus motivos), no se
 *     rellena a medias. Un nodo sin identidad no se inventa: se descarta.
 *   - EL CATÁLOGO: una operación que no está en el catálogo no se concede, y
 *     un efecto desconocido no se presume inocuo.
 *   - EL CONOCIMIENTO: un hecho por entidad (no por nodo), y lo que NO se vio
 *     sale como conocimiento.
 *   - LA ABSORCIÓN: el presupuesto se CUENTA (un recorte silencioso es una
 *     mentira con forma de dato) y ninguna fila lleva un secreto dentro.
 *   - LA PUERTA: las cuatro guardas. Sin lista no se lanza nada; los
 *     argumentos son un array (no una cadena con comillas); el hijo nace
 *     dentro del proyecto; y no ve las llaves de la persona.
 *
 * Referencia: core/rea/, core/extension-host/proc.ts, docs/REA.md.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leeEvidenciaRea, leeEvidenciaReaJson, leeCatalogoRea } from "../core/rea/forma.ts";
import { capacidadesExigidas, operacionPermitida, resumenCatalogo } from "../core/rea/capacidades.ts";
import { conocimientoDe } from "../core/rea/conocimiento.ts";
import { absorbeEvidencia } from "../core/rea/absorbe.ts";
import { importaRea } from "../core/mind/importers/rea.ts";
import { ejecutaPrograma, entornoHijo, resuelveEjecutable } from "../core/extension-host/proc.ts";

/* ------------------------------------------------------------------ *
 * Un documento de REA de mentira, pero con la forma buena.             *
 * ------------------------------------------------------------------ */

const evidenciaDeMentira = (): Record<string, unknown> => ({
  evidence_id: "ev-1",
  subject: {
    name: "MiApp",
    format: "asar",
    digest: { sha256: "a".repeat(64) },
    local_path: "/tmp/MiApp",
    architecture: "x64",
  },
  provider: { id: "rea", name: "REA", version: "0.9" },
  operation: "analizar-app",
  confidence: "exact",
  authority: "estatico",
  limitations: ["no se vio el código nativo", "el análisis se truncó"],
  normalized_result: {
    summary: {
      ipc: { literal_channels: 12, main_handlers: 4 },
      browser_windows: 1,
      preload_entrypoints: 1,
    },
    statistics: { nodes: 4 },
    semantic_graph: {
      nodes: [
        {
          kind: "module",
          node_id: "n1",
          label: "principal",
          identity: { module_path: "app/principal.js", source_range: { start: { line: 10 } } },
          evidence: { context_id: "c1" },
        },
        {
          kind: "function",
          node_id: "n2",
          label: "arrancar",
          identity: { module_path: "app/principal.js" },
          evidence: { context_id: "c1" },
        },
        {
          kind: "expression",
          node_id: "n3",
        },
        { kind: "sin-identidad" },
      ],
      relations: [
        { source_node_id: "n1", target_node_id: "n2", relation: "declara", resolution: "exact" },
        { source_node_id: "n1", relation: "a medias" },
      ],
      unknowns: [
        { node_id: "n3", family: "expresion", reason: "no se pudo resolver", relation_kinds: ["usa"] },
        { family: "sin-motivo" },
      ],
      evidence_contexts: [{ context_id: "c1", confidence: "exact", authority: "estatico" }],
      coverage: {
        status: "parcial",
        truncated: true,
        omitted_nodes: 12,
        omitted_relations: 3,
        families: [{ family: "expresion", status: "parcial", retained_relations: 2, omitted_relations: 3 }],
      },
    },
  },
});

/* ------------------------------------------------------------------ *
 * LA FORMA                                                               *
 * ------------------------------------------------------------------ */

describe("la evidencia de REA: la forma se comprueba", () => {
  it("lee una evidencia buena y la normaliza", () => {
    const lectura = leeEvidenciaRea(evidenciaDeMentira());
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const ev = lectura.evidencia;
    expect(ev.subject.name).toBe("MiApp");
    expect(ev.subject.sha256).toBe("a".repeat(64));
    expect(ev.provider.name).toBe("REA");
    expect(ev.confidence).toBe("exact");
    expect(ev.limitations).toHaveLength(2);
    // el nodo sin node_id se descarta: no se inventa
    expect(ev.nodes.map((n) => n.node_id)).toEqual(["n1", "n2", "n3"]);
    // la confianza del nodo viene de su contexto de evidencia
    expect(ev.nodes[0]?.confianza).toBe("exact");
    expect(ev.nodes[0]?.autoridad).toBe("estatico");
    expect(ev.nodes[0]?.modulo).toBe("app/principal.js");
    expect(ev.nodes[0]?.linea).toBe(10);
    // la relación sin destino no es relación
    expect(ev.relations).toHaveLength(1);
    // el desconocido sin motivo no se cuenta como desconocido
    expect(ev.unknowns).toHaveLength(1);
    expect(ev.coverage.status).toBe("parcial");
    expect(ev.coverage.truncated).toBe(true);
    expect(ev.coverage.families[0]?.family).toBe("expresion");
  });

  it("una forma que no encaja se DICE, no se rellena a medias", () => {
    const lectura = leeEvidenciaRea({ provider: { id: "rea" } });
    expect(lectura.ok).toBe(false);
    if (lectura.ok) return;
    expect(lectura.errores.length).toBeGreaterThan(0);
    expect(lectura.errores.join(" ")).toContain("subject");
  });

  it("un JSON que no se puede leer se dice (y no se lanza)", () => {
    const lectura = leeEvidenciaReaJson("{ esto no es json");
    expect(lectura.ok).toBe(false);
    if (lectura.ok) return;
    expect(lectura.errores[0]).toContain("el JSON no se puede leer");
  });

  it("una evidencia sin normalized_result es una evidencia, no un fallo", () => {
    const lectura = leeEvidenciaRea({
      subject: { name: "X" },
      provider: { id: "rea" },
      limitations: [],
    });
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.evidencia.nodes).toEqual([]);
    expect(lectura.evidencia.summary).toEqual({});
    expect(lectura.evidencia.coverage.status).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * EL CATÁLOGO                                                            *
 * ------------------------------------------------------------------ */

describe("el catálogo de REA: lo que cuesta cada operación", () => {
  const catalogoCrudo = (): Record<string, unknown> => ({
    open: true,
    capabilities: [
      {
        provider: { id: "rea" },
        shared_limitations: ["sin red en modo offline"],
        groups: [
          {
            operations: ["analizar-app"],
            effects: ["launches_process", "may_write_filesystem"],
            limitations: ["el análisis estático no lee los secretos"],
            available: true,
          },
          {
            operations: ["abrir-navegador"],
            effects: ["may_access_network", "may_show_ui", "efecto-del-futuro"],
            available: false,
            reason: "no hay navegador en esta máquina",
          },
        ],
      },
    ],
  });

  it("lee el catálogo y aplana las operaciones", () => {
    const lectura = leeCatalogoRea(catalogoCrudo());
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const ops = lectura.catalogo.operaciones;
    expect(ops).toHaveLength(2);
    const analizar = ops.find((o) => o.operacion === "analizar-app");
    expect(analizar?.disponible).toBe(true);
    expect(analizar?.efectos).toEqual(["launches_process", "may_write_filesystem"]);
    // las limitaciones del grupo y las compartidas se suman
    expect(analizar?.limitaciones).toContain("sin red en modo offline");
    expect(analizar?.limitaciones).toContain("el análisis estático no lee los secretos");
    expect(lectura.catalogo.limitaciones).toEqual(["sin red en modo offline"]);
  });

  it("los efectos que el kit no conoce se apartan, no se inventan", () => {
    const lectura = leeCatalogoRea(catalogoCrudo());
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const abrir = lectura.catalogo.operaciones.find((o) => o.operacion === "abrir-navegador");
    expect(abrir?.efectos).toEqual(["may_access_network", "may_show_ui"]);
  });

  it("cada efecto exige su capacidad del kit", () => {
    const lectura = leeCatalogoRea(catalogoCrudo());
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const req = capacidadesExigidas(lectura.catalogo, "analizar-app");
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    expect(req.capacidades.sort()).toEqual(["fs:project", "proc:spawn"]);
  });

  it("una operación que no está en el catálogo NO se concede", () => {
    const lectura = leeCatalogoRea(catalogoCrudo());
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const req = capacidadesExigidas(lectura.catalogo, "operacion-inventada");
    expect(req.ok).toBe(false);
    if (req.ok) return;
    expect(req.error).toContain("operación desconocida");
  });

  it("una operación sin efectos declarados no se presume inocua", () => {
    // sin efectos declarados, la operación exige lo que exige el peor efecto
    const lectura = leeCatalogoRea({
      open: true,
      capabilities: [
        {
          provider: { id: "rea" },
          groups: [{ operations: ["misterio"], effects: [], available: true }],
        },
      ],
    });
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const req = capacidadesExigidas(lectura.catalogo, "misterio");
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    expect(req.capacidades.length).toBeGreaterThan(0);
  });

  it("se dice qué capacidades faltan", () => {
    const lectura = leeCatalogoRea(catalogoCrudo());
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const v = operacionPermitida(lectura.catalogo, "analizar-app", ["fs:project"]);
    expect(v.ok).toBe(false);
    expect(v.faltan).toEqual(["proc:spawn"]);
    const bien = operacionPermitida(lectura.catalogo, "analizar-app", ["fs:project", "proc:spawn"]);
    expect(bien.ok).toBe(true);
  });

  it("el resumen del catálogo es una frase legible", () => {
    const lectura = leeCatalogoRea(catalogoCrudo());
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const r = resumenCatalogo(lectura.catalogo);
    expect(r).toContain("2 operaciones declaradas");
    expect(r).toContain("1 disponibles");
  });
});

/* ------------------------------------------------------------------ *
 * EL CONOCIMIENTO                                                        *
 * ------------------------------------------------------------------ */

describe("el conocimiento de REA: un hecho por entidad, no por nodo", () => {
  const ev = (): ReturnType<typeof conocimientoDe> => {
    const lectura = leeEvidenciaRea(evidenciaDeMentira());
    if (!lectura.ok) throw new Error("la evidencia de prueba no debería fallar");
    return conocimientoDe(lectura.evidencia);
  };

  it("dice qué se miró y con qué autoridad", () => {
    const c = ev();
    const sujeto = c.hechos.find((h) => h.tipo === "sujeto");
    expect(sujeto).toBeTruthy();
    expect(sujeto?.texto).toContain("MiApp");
    expect(sujeto?.confianza).toBe("exact");
  });

  it("la composición es un inventario, no un volcado", () => {
    const c = ev();
    const comp = c.hechos.find((h) => h.tipo === "composicion");
    expect(comp).toBeTruthy();
    expect(comp?.texto).toContain("1 module");
  });

  it("LO QUE NO SE VIO también es conocimiento", () => {
    const c = ev();
    expect(c.hechos.some((h) => h.tipo === "limite")).toBe(true);
    expect(c.hechos.some((h) => h.tipo === "desconocido")).toBe(true);
    expect(c.hechos.some((h) => h.tipo === "cobertura")).toBe(true);
    const limite = c.hechos.find((h) => h.tipo === "limite");
    expect(limite?.texto).toContain("no se vio el código nativo");
    // la cobertura global dice que el grafo está truncado
    const cobertura = c.hechos.find((h) => h.clave === "cobertura:global");
    expect(cobertura?.texto).toContain("truncado");
    // y la de cada familia, su parte
    const familia = c.hechos.find((h) => h.clave === "cobertura:expresion");
    expect(familia?.texto).toContain("3 omitidas");
  });

  it("la superficie del programa se dice en una frase", () => {
    const c = ev();
    const sup = c.hechos.find((h) => h.tipo === "superficie");
    expect(sup).toBeTruthy();
    expect(sup?.texto).toContain("12 canales IPC literales");
    expect(sup?.texto).toContain("1 ventanas de navegador");
  });

  it("el presupuesto se CUENTA: lo que no cabe, se dice que no cabe", () => {
    const lectura = leeEvidenciaRea(evidenciaDeMentira());
    if (!lectura.ok) throw new Error("la evidencia de prueba no debería fallar");
    const c = conocimientoDe(lectura.evidencia, 2);
    expect(c.hechos.length).toBeLessThanOrEqual(2);
    expect(c.total).toBeGreaterThan(c.hechos.length);
    expect(c.fuera).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * LA ABSORCIÓN                                                           *
 * ------------------------------------------------------------------ */

describe("la absorción de REA: presupuesto contado y secretos fuera", () => {
  const evidencia = (): ReturnType<typeof leeEvidenciaRea> => leeEvidenciaRea(evidenciaDeMentira());

  it("las filas que salen son filas de la mente", () => {
    const l = evidencia();
    if (!l.ok) throw new Error("la evidencia de prueba no debería fallar");
    const a = absorbeEvidencia(l.evidencia);
    expect(a.trozos.length).toBeGreaterThan(0);
    expect(a.ficheros).toEqual([]);
    for (const t of a.trozos) {
      expect(typeof t.id).toBe("string");
      expect(t.tokens).toBeGreaterThan(0);
      expect(t.texto.length).toBeGreaterThan(0);
    }
    // la nota final recuerda que esto es un resumen
    expect(a.trozos.some((t) => t.id.endsWith("nota-de-absorcion"))).toBe(true);
  });

  it("una fila no lleva un secreto dentro", () => {
    const crudo = evidenciaDeMentira();
    // el secreto va en el NOMBRE de un módulo: así sí llega a una fila
    const grafo = (crudo.normalized_result as Record<string, unknown>).semantic_graph as Record<
      string,
      unknown
    >;
    (grafo.nodes as Array<Record<string, unknown>>)[0]!.label =
      "config-sk-1234567890abcdefghij";
    const l = leeEvidenciaRea(crudo);
    if (!l.ok) throw new Error("la evidencia de prueba no debería fallar");
    const a = absorbeEvidencia(l.evidencia);
    expect(a.secretosRedactados).toBeGreaterThan(0);
    for (const t of a.trozos) {
      expect(t.texto).not.toContain("sk-1234567890abcdefghij");
      // ni el id de la fila (el id sale de la clave, que también lleva el nombre)
      expect(t.id).not.toContain("sk-1234567890abcdefghij");
      expect(t.clave).not.toContain("sk-1234567890abcdefghij");
    }
  });

  it("lo que no cabe se cuenta, no se pierde en silencio", () => {
    const l = evidencia();
    if (!l.ok) throw new Error("la evidencia de prueba no debería fallar");
    const a = absorbeEvidencia(l.evidencia, { maxTrozos: 1, budgetTokens: 10_000 });
    expect(a.trozos.length).toBeLessThanOrEqual(2);
    expect(a.fuera).toBeGreaterThan(0);
    expect(a.nota).toContain("fuera por presupuesto");
  });
});

/* ------------------------------------------------------------------ *
 * EL IMPORTADOR                                                          *
 * ------------------------------------------------------------------ */

describe("el importador de REA: lee un JSON ya exportado y no ejecuta nada", () => {
  it("absorbe la evidencia de un fichero", () => {
    const dir = mkdtempSync(join(tmpdir(), "rea-"));
    const ruta = join(dir, "evidencia.json");
    writeFileSync(ruta, JSON.stringify(evidenciaDeMentira()));
    const r = importaRea(ruta);
    expect(r.errores).toEqual([]);
    expect(r.hechos).toBeGreaterThan(0);
    expect(r.trozos.length).toBeGreaterThan(0);
    expect(r.ficheros).toEqual([ruta]);
  });

  it("una evidencia ilegible se dice (y no se finge que se absorbió)", () => {
    const dir = mkdtempSync(join(tmpdir(), "rea-"));
    const ruta = join(dir, "evidencia.json");
    writeFileSync(ruta, JSON.stringify({ subject: {} }));
    const r = importaRea(ruta);
    expect(r.errores.length).toBeGreaterThan(0);
    expect(r.trozos).toEqual([]);
    expect(r.hechos).toBe(0);
  });

  it("un fichero que no existe se dice", () => {
    const r = importaRea(join(tmpdir(), "no-existe-esta-evidencia.json"));
    expect(r.errores.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * LA PUERTA DE LOS PROGRAMAS                                             *
 * ------------------------------------------------------------------ */

describe("la puerta de los programas: las cuatro guardas", () => {
  it("sin lista, no se lanza nada", async () => {
    await expect(
      ejecutaPrograma({ programa: "node", args: ["-e", "console.log(1)"] })
    ).rejects.toThrow(/programa no permitido/);
  });

  it("un nombre inventado recibe un no, no una ejecución", async () => {
    await expect(
      ejecutaPrograma(
        { programa: "rm", args: ["-rf", "/"] },
        { permitidos: [{ nombre: "node", descripcion: "node" }] }
      )
    ).rejects.toThrow(/programa no permitido: «rm»/);
  });

  it("los argumentos son un array: una cadena con comillas no vale", async () => {
    await expect(
      ejecutaPrograma(
        { programa: "node", args: ["-e", "console.log(1)"] as unknown as string[] },
        { permitidos: [{ nombre: "node", descripcion: "node" }] }
      )
    ).resolves.toBeTruthy();
    // la puerta real rechaza las cadenas: se comprueba con la petición cruda
    const peticion = { programa: "node", args: "-e console.log(1)" as unknown as string[] };
    await expect(
      ejecutaPrograma(peticion, { permitidos: [{ nombre: "node", descripcion: "node" }] })
    ).rejects.toThrow(/array de texto/);
  });

  it("la ruta del programa tiene que ser absoluta", () => {
    const r = resuelveEjecutable("rea", [{ nombre: "rea", ruta: "bin/rea", descripcion: "REA" }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("absoluta");
  });

  it("el hijo no ve las llaves de la persona", () => {
    process.env.LLAVE_DE_LA_PERSONA = "no-deberia-salir";
    const env = entornoHijo({ nombre: "rea", descripcion: "REA", envPermitidas: ["REA_HOME"] }, {
      LLAVE_DE_LA_PERSONA: "no-deberia-salir",
      REA_HOME: "/tmp/rea",
    });
    expect(env.LLAVE_DE_LA_PERSONA).toBeUndefined();
    expect(env.REA_HOME).toBe("/tmp/rea");
    delete process.env.LLAVE_DE_LA_PERSONA;
  });

  it("el cwd se confina al proyecto", async () => {
    const proyecto = mkdtempSync(join(tmpdir(), "proyecto-"));
    await expect(
      ejecutaPrograma(
        { programa: "node", args: ["-e", "console.log(1)"], cwd: "../fuera" },
        { permitidos: [{ nombre: "node", descripcion: "node" }], proyecto }
      )
    ).rejects.toThrow(/fuera del proyecto/);
  });

  it("sin proyecto, no hay carpeta a la que confinarse", async () => {
    await expect(
      ejecutaPrograma(
        { programa: "node", args: ["-e", "console.log(1)"], cwd: "." },
        { permitidos: [{ nombre: "node", descripcion: "node" }] }
      )
    ).rejects.toThrow(/no hay carpeta a la que confinarse/);
  });

  it("el programa permitido se lanza y devuelve su salida", async () => {
    const r = await ejecutaPrograma(
      { programa: "node", args: ["-e", "process.stdout.write('hola')"] },
      { permitidos: [{ nombre: "node", descripcion: "node" }] }
    );
    expect(r.codigo).toBe(0);
    expect(r.stdout).toBe("hola");
    expect(r.timeout).toBe(false);
    expect(r.truncado).toBe(false);
  });

  it("la salida se corta por el tope de bytes (y se dice)", async () => {
    const r = await ejecutaPrograma(
      { programa: "node", args: ["-e", "process.stdout.write('x'.repeat(5000))"], maxBytes: 100 },
      { permitidos: [{ nombre: "node", descripcion: "node" }] }
    );
    expect(r.truncado).toBe(true);
    expect(Buffer.byteLength(r.stdout, "utf8")).toBeLessThanOrEqual(100);
  });

  it("el tiempo tope mata al hijo (y se dice)", async () => {
    const r = await ejecutaPrograma(
      { programa: "node", args: ["-e", "setTimeout(() => {}, 10000)"], timeoutMs: 300 },
      { permitidos: [{ nombre: "node", descripcion: "node" }] }
    );
    expect(r.timeout).toBe(true);
    expect(r.codigo).toBeNull();
  });
});
