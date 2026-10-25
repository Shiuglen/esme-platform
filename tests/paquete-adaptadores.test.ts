/**
 * LAS SIETE LISTAS DE HOY, COMO PAQUETES — sin cambiar ni una.
 *
 * La app tiene siete listas de cosas instalables, cada una con su forma:
 * pieles de casa y de la Tienda, productos, skills, herramientas MCP, tareas
 * del Taller y motores (los de casa y el espejo del registro ACP). Los
 * adaptadores las leen como paquetes v2. La promesa: un paquete por
 * elemento, que valga, y nada perdido en silencio (lo que no se adapta va
 * a `fuera`, con su motivo).
 *
 * Las listas son las de la app en un commit fijo (tests/fixtures/app/,
 * copiadas con scripts/paquetes/fixtures-app.ts): datos públicos de la app,
 * nunca de nadie.
 *
 * Referencia: core/paquetes/adaptadores/, docs/PAQUETES.md.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validaPaqueteDatos, type PaqueteDatos } from "../core/paquetes/manifiesto.ts";
import { slug, type Adaptados } from "../core/paquetes/adaptadores/comun.ts";
import { paquetesDePielesCasa, paquetesDePielesTienda } from "../core/paquetes/adaptadores/pieles.ts";
import { paquetesDeProductos } from "../core/paquetes/adaptadores/productos.ts";
import { paquetesDeSkills } from "../core/paquetes/adaptadores/skills.ts";
import { herramientaMcp, paquetesDeHerramientas } from "../core/paquetes/adaptadores/herramientas.ts";
import { paquetesDeTareas } from "../core/paquetes/adaptadores/tareas.ts";
import { paquetesDeMotoresAcp, paquetesDelEspejoAcp } from "../core/paquetes/adaptadores/motores.ts";

type Cualquiera = Record<string, any>;

const fixture = (lista: string): Cualquiera[] =>
  JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "app", `${lista}.json`), "utf8")).datos;

const LISTAS: Array<[string, (datos: unknown[]) => Adaptados]> = [
  ["pieles-casa", paquetesDePielesCasa],
  ["pieles-tienda", paquetesDePielesTienda],
  ["productos", paquetesDeProductos],
  ["skills", paquetesDeSkills],
  ["herramientas", paquetesDeHerramientas],
  ["tareas", paquetesDeTareas],
  ["motores-acp", paquetesDeMotoresAcp],
  ["espejo-acp", paquetesDelEspejoAcp],
];

/** El manifiesto de un paquete, por su id. */
const de = (r: Adaptados, id: string): Cualquiera => {
  const p = r.paquetes.find((x) => x.manifiesto.id === id);
  expect(p, id).toBeTruthy();
  return p!.manifiesto as Cualquiera;
};

/** Los bytes de un paquete: su manifiesto y sus ficheros, en su orden. */
const bytes = (p: PaqueteDatos): string => JSON.stringify(p);

describe("las siete listas de la app — un paquete por elemento, y todos valen", () => {
  for (const [lista, adapta] of LISTAS) {
    it(`${lista}: un paquete por elemento, nada fuera, sin errores ni avisos`, () => {
      const datos = fixture(lista);
      expect(datos.length).toBeGreaterThan(0);
      const r = adapta(datos);
      expect(r.fuera).toEqual([]);
      expect(r.avisos).toEqual([]);
      expect(r.paquetes).toHaveLength(datos.length);
      for (const p of r.paquetes) {
        const v = validaPaqueteDatos(p);
        expect(v.errores, String(p.manifiesto.id)).toEqual([]);
        expect(v.avisos, String(p.manifiesto.id)).toEqual([]);
        expect((p.manifiesto.source as Cualquiera).from).toBe(
          lista === "productos" && String(p.manifiesto.id).startsWith("esme.tienda.piel-") ? "app:pieles-tienda" : `app:${lista}`
        );
      }
    });
  }

  it("los ids no se repiten entre listas: la única excepción son los productos piel, que SON las pieles de la Tienda", () => {
    const vistos = new Map<string, { lista: string; p: PaqueteDatos }>();
    for (const [lista, adapta] of LISTAS) {
      for (const p of adapta(fixture(lista)).paquetes) {
        const id = String(p.manifiesto.id);
        const antes = vistos.get(id);
        if (!antes) {
          vistos.set(id, { lista, p });
          continue;
        }
        expect([antes.lista, lista].sort(), id).toEqual(["pieles-tienda", "productos"]);
        expect(bytes(p), id).toBe(bytes(antes.p));
      }
    }
  });

  it("los productos de tipo piel dan, byte a byte, los paquetes de PIELES_TIENDA", () => {
    const tienda = paquetesDePielesTienda(fixture("pieles-tienda")).paquetes;
    const productos = paquetesDeProductos(fixture("productos")).paquetes.filter((p) =>
      String(p.manifiesto.id).startsWith("esme.tienda.piel-")
    );
    expect(productos).toHaveLength(tienda.length);
    const porId = (ps: PaqueteDatos[]) => [...ps].sort((a, b) => String(a.manifiesto.id).localeCompare(String(b.manifiesto.id)));
    expect(porId(productos).map(bytes)).toEqual(porId(tienda).map(bytes));
  });

  it("«Boreal» de casa y «boreal» de la Tienda no chocan", () => {
    const casa = paquetesDePielesCasa(fixture("pieles-casa"));
    const tienda = paquetesDePielesTienda(fixture("pieles-tienda"));
    expect(de(casa, "esme.casa.piel-boreal").name).toBe("Boreal");
    expect(de(tienda, "esme.tienda.piel-boreal").name).toBe("Aurora boreal");
  });

  it("cada piel.json es el objeto de la app, sin cambios", () => {
    const casa = fixture("pieles-casa");
    paquetesDePielesCasa(casa).paquetes.forEach((p, i) =>
      expect(JSON.parse(String(p.ficheros["piel.json"]))).toEqual(casa[i])
    );
    const tienda = fixture("pieles-tienda");
    paquetesDePielesTienda(tienda).paquetes.forEach((p, i) =>
      expect(JSON.parse(String(p.ficheros["piel.json"]))).toEqual(tienda[i].piel)
    );
  });

  it("las etiquetas de la Tienda viajan como keywords", () => {
    const tienda = fixture("pieles-tienda");
    expect(de(paquetesDePielesTienda(tienda), "esme.tienda.piel-neon-tokio").keywords).toEqual(tienda[0].etiquetas);
  });
});

describe("cada lista, con lo suyo", () => {
  it("una herramienta remota pide su host; una de npm lanza npx con la versión fijada", () => {
    const r = paquetesDeHerramientas(fixture("herramientas"));
    const figma = de(r, "esme.mcp.figma");
    expect(figma.contributes.tools).toEqual([{ id: "figma", mcp: { url: "https://mcp.figma.com/mcp" } }]);
    expect(figma.permissions).toEqual([{ kind: "net:fetch", hosts: ["mcp.figma.com"] }]);
    expect(figma.version).toBe("1.0.3");
    const rea = de(r, "esme.mcp.rea");
    expect(rea.contributes.tools).toEqual([{ id: "rea", mcp: { command: "npx", args: ["-y", "rea-agents@6.7.0", "mcp"] } }]);
    expect(rea.permissions).toEqual([{ kind: "proc:spawn", programs: ["npx"] }]);
    expect(rea.homepage).toBe("https://github.com/morluto/rea");
  });

  it("las cabeceras de una herramienta remota van con ella, y las secretas se marcan", () => {
    const neon = de(paquetesDeHerramientas(fixture("herramientas")), "esme.mcp.neon");
    expect(neon.contributes.tools[0].mcp.headers).toEqual([
      { name: "Authorization", description: "Optional Bearer token with a Neon API key.", secret: true, required: false },
      { name: "x-read-only", description: "Optional header to enable read-only mode for tool filtering.", secret: false, required: false },
    ]);
  });

  it("un agente de la Tienda: su receta es la del producto, y pide el programa que lanza", () => {
    const productos = fixture("productos");
    const r = paquetesDeProductos(productos);
    const oc = r.paquetes.find((p) => p.manifiesto.id === "esme.tienda.agente-opencode")!;
    const m = oc.manifiesto as Cualquiera;
    expect(m.contributes.agents).toEqual([{ id: "opencode", recipe: "agente.json", format: "comando" }]);
    expect(m.permissions).toEqual([{ kind: "proc:spawn", programs: ["opencode"] }]);
    expect(m.version).toBe("1.0.0");
    expect(m.author).toBe("SST");
    expect(JSON.parse(String(oc.ficheros["agente.json"]))).toEqual(productos.find((p) => p.id === "opencode")!.contenido);
  });

  it("una skill: remota, fijada a su commit y a su huella, con su licencia", () => {
    const skills = fixture("skills");
    const fd = skills.find((s) => s.id === "anthropics/frontend-design")!;
    const m = de(paquetesDeSkills(skills), "esme.anthropics.frontend-design");
    expect(m.contributes.skills).toEqual([
      {
        id: "frontend-design",
        remote: { repo: fd.repo, commit: fd.commit, path: fd.ruta, sha256: fd.arbolSha256 },
        scripts: false,
      },
    ]);
    expect(m.license).toBe(fd.licencia);
    expect(m.version).toBe("0.0.0");
    expect(m.source).toEqual({ from: "app:skills", ref: "anthropics/frontend-design", commit: fd.commit });
  });

  it("dos skills con el mismo nombre de colecciones distintas no chocan", () => {
    const r = paquetesDeSkills(fixture("skills"));
    expect(de(r, "esme.superpowers.test-driven-development").contributes.skills[0].remote.repo).toBe("obra/superpowers");
    expect(de(r, "esme.addy.test-driven-development").contributes.skills[0].remote.repo).toBe("addyosmani/agent-skills");
  });

  it("un motor de casa pide lanzar sus binarios; uno del espejo no lanza nada", () => {
    const cursor = de(paquetesDeMotoresAcp(fixture("motores-acp")), "esme.casa.motor-cursor");
    expect(cursor.contributes.engines[0]).toMatchObject({ id: "cursor", name: "Cursor", binaries: ["cursor-agent", "agent"], args: ["acp"] });
    expect(cursor.permissions).toEqual([{ kind: "proc:spawn", programs: ["agent", "cursor-agent"] }]);
    const espejo = paquetesDelEspejoAcp(fixture("espejo-acp"));
    for (const p of espejo.paquetes) expect(p.manifiesto.permissions ?? [], String(p.manifiesto.id)).toEqual([]);
    expect(de(espejo, "esme.acp.agoragentic-acp").contributes.engines[0]).toMatchObject({
      repo: "https://github.com/rhein1/agoragentic-integrations",
      install: "npx agoragentic-mcp@1.3.0 --acp",
    });
  });

  it("una tarea del Taller lleva su encargo, sus pasos y sus oficios", () => {
    const tareas = fixture("tareas");
    const flujo = tareas.find((t) => t.id === "flujo-funcion-completa")!;
    const m = de(paquetesDeTareas(tareas), "esme.casa.tarea-flujo-funcion-completa");
    expect(m.contributes.tasks).toEqual([
      {
        id: "flujo-funcion-completa",
        title: flujo.titulo,
        prompt: flujo.encargo,
        steps: flujo.pasos,
        roles: flujo.oficios,
        category: flujo.categoria,
        icon: flujo.icono,
      },
    ]);
    expect(m.description).toBe(flujo.descripcion);
  });
});

describe("lo que no se adapta va fuera, con su motivo", () => {
  it("un producto de tipo app (aún no es un paquete)", () => {
    const r = paquetesDeProductos([
      { id: "mi-app", tipo: "app", nombre: "Mi app", autor: "Prueba", descripcion: "Una app de prueba, sintética.", etiquetas: [], version: 1, contenido: {} },
    ]);
    expect(r.paquetes).toEqual([]);
    expect(r.fuera).toHaveLength(1);
    expect(r.fuera[0].origen).toContain("mi-app");
    expect(r.fuera[0].motivo).toContain("app");
  });

  it("un elemento roto, de cualquier lista, no lanza", () => {
    for (const [lista, adapta] of LISTAS) {
      const r = adapta([{}, null, 3, "x", { id: "solo-id" }]);
      expect(r.paquetes, lista).toEqual([]);
      expect(r.fuera, lista).toHaveLength(5);
      for (const f of r.fuera) expect(f.motivo, lista).not.toBe("");
    }
  });

  it("un elemento de verdad sin su id o sin su nombre", () => {
    for (const [lista, adapta] of LISTAS) {
      const primero = fixture(lista)[0];
      for (const clave of ["id", "nombre", "titulo"]) {
        if (!(clave in primero)) continue;
        const roto = { ...primero };
        delete roto[clave];
        const r = adapta([roto]);
        expect(r.paquetes, `${lista} sin ${clave}`).toEqual([]);
        expect(r.fuera, `${lista} sin ${clave}`).toHaveLength(1);
      }
    }
  });
});

describe("herramientaMcp — una conexión MCP, como herramienta del paquete", () => {
  it("un servidor remoto por http sin cifrar se avisa", () => {
    const h = herramientaMcp("x", { tipo: "remoto", url: "http://mcp.ejemplo.com/mcp" });
    expect(h.permisos).toEqual([{ kind: "net:fetch", hosts: ["mcp.ejemplo.com"] }]);
    expect(h.avisos.join("\n")).toContain("sin cifrar");
  });

  it("un paquete de npm sin versión fija se avisa (npx bajaría la última)", () => {
    const h = herramientaMcp("x", { tipo: "npm", paquete: "@ejemplo/mcp" });
    expect(h.entrada.mcp).toEqual({ command: "npx", args: ["-y", "@ejemplo/mcp"] });
    expect(h.avisos.join("\n")).toContain("versión");
  });

  it("las variables de entorno van como env_keys; una cabecera en un servidor local se avisa", () => {
    const h = herramientaMcp("x", {
      tipo: "npm",
      paquete: "@ejemplo/mcp",
      version: "1.0.0",
      variables: [
        { nombre: "API_KEY", secreta: true, donde: "entorno" },
        { nombre: "Authorization", donde: "cabecera" },
      ],
    });
    expect(h.entrada.mcp).toEqual({ command: "npx", args: ["-y", "@ejemplo/mcp@1.0.0"], env_keys: ["API_KEY"] });
    expect(h.avisos.join("\n")).toContain("Authorization");
  });
});

describe("slug — un nombre como pieza de id", () => {
  it("minúsculas, sin tildes, y todo lo demás a guiones", () => {
    expect(slug("Tinta y Luz")).toBe("tinta-y-luz");
    expect(slug("Neón Tokio")).toBe("neon-tokio");
    expect(slug("  Ñandú/Árbol!! ")).toBe("nandu-arbol");
    expect(slug("Investigación")).toBe("investigacion");
    expect(slug("ya-es-un-slug")).toBe("ya-es-un-slug");
  });
});
