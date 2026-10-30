/**
 * IMPORTAR DE OTROS — plugins de Claude Code, skills sueltas, servidores MCP
 * del registro y recetas de goose, como paquetes de Esme.
 *
 * Las fixtures de `tests/fixtures/importar/` son sintéticas (escritas para
 * estas pruebas, con los formatos de hoy de cada uno). Lo que no se puede
 * traer se descarta con su motivo, nunca en silencio, y lo que sale tiene
 * que valer: `validaPaqueteDatos` y, escrito a disco, `leePaqueteDeCarpeta`.
 *
 * Referencia: tienda/importa-*.ts, docs/PAQUETES.md.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validaPaqueteDatos, type PaqueteDatos } from "../core/paquetes/manifiesto.ts";
import { leePaqueteDeCarpeta, escribePaquete } from "../tienda/paquete-disco.ts";
import { importaCarpetaSkill } from "../tienda/importa-skill.ts";
import { importaMarketplaceClaude, importaPluginClaude } from "../tienda/importa-claude.ts";
import { importaServidorMcp } from "../tienda/importa-mcp.ts";
import { importaRecetaGoose } from "../tienda/importa-goose.ts";
import type { Importe } from "../tienda/importa-comun.ts";

const FIX = join(import.meta.dirname, "fixtures", "importar");

const carpetas: string[] = [];
const temporal = (): string => {
  const d = mkdtempSync(join(tmpdir(), "esme-importar-"));
  carpetas.push(d);
  return d;
};
afterEach(() => {
  for (const d of carpetas.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Una copia de una fixture, para cambiarla sin tocar la de verdad. */
const copia = (nombre: string): string => {
  const d = join(temporal(), nombre);
  cpSync(join(FIX, nombre), d, { recursive: true });
  return d;
};

const texto = (f: string | Uint8Array | undefined): string => (typeof f === "string" ? f : new TextDecoder().decode(f));

type M = Record<string, any>;

/** El importe tiene que haber ido bien: su paquete y su manifiesto. */
function bien(r: Importe): { paquete: PaqueteDatos; m: M; avisos: string[]; descartado: { que: string; motivo: string }[] } {
  if (!r.ok) throw new Error(`el importe falló: ${r.errores.join("; ")}`);
  const v = validaPaqueteDatos(r.paquete);
  expect(v.errores).toEqual([]);
  return { paquete: r.paquete, m: r.paquete.manifiesto as M, avisos: r.avisos, descartado: r.descartado };
}

/** Escrito a disco y leído de vuelta, sigue valiendo. */
function instalable(p: PaqueteDatos): void {
  const dir = join(temporal(), "paquete");
  escribePaquete(p, dir);
  const d = leePaqueteDeCarpeta(dir);
  expect(d.errores).toEqual([]);
  expect(d.ok).toBe(true);
}

describe("importaPluginClaude — un plugin de Claude Code", () => {
  it("sale como un paquete: skills, tareas y comandos, agentes y herramientas", () => {
    const { m } = bien(importaPluginClaude(join(FIX, "plugin-claude")));
    expect(m.id).toBe("esme.ana-prueba.estudio-claude");
    expect(m.name).toBe("Estudio");
    expect(m.version).toBe("1.2.0");
    expect(m.kind).toBe("package");
    expect(m.author).toBe("Ana Prueba");
    expect(m.keywords).toEqual(["estudio", "prueba"]);
    expect(m.homepage).toBe("https://example.com/estudio");
    expect(m.source).toEqual({ from: "claude-plugin", ref: "estudio-claude" });

    expect(m.contributes.skills).toEqual([{ id: "repasar", path: "skills/repasar", scripts: false }]);
    expect(m.contributes.tasks).toEqual([
      {
        id: "resumen",
        title: "Resume un tema en cinco frases",
        prompt: "Resume en cinco frases claras el tema: {{argumentos}}",
        inputs: [{ key: "argumentos", description: "[tema]", required: false }],
      },
    ]);
    expect(m.contributes.commands).toEqual([{ id: "resumen", title: "Resume un tema en cinco frases", task: "resumen" }]);
    expect(m.contributes.agents).toEqual([{ id: "revisor", recipe: "agents/revisor.md", format: "claude-md" }]);
    expect(m.contributes.tools).toEqual([
      { id: "notas", mcp: { command: "node", args: ["${ESME_PAQUETE}/servidor/notas.js", "--modo", "lectura"], env_keys: ["NOTAS_TOKEN"] } },
    ]);
    expect(m.permissions).toEqual([{ kind: "proc:spawn", programs: ["node"] }]);
  });

  it("los hooks se descartan con su motivo, y no viajan", () => {
    const { paquete, descartado } = bien(importaPluginClaude(join(FIX, "plugin-claude")));
    expect(descartado).toContainEqual({ que: "hooks", motivo: "un hook corre código en cada paso sin pasar por los permisos" });
    expect(Object.keys(paquete.ficheros).sort()).toEqual([
      "LICENSE",
      "agents/revisor.md",
      "servidor/notas.js",
      "skills/repasar/SKILL.md",
      "skills/repasar/guia.md",
    ]);
  });

  it("${CLAUDE_PLUGIN_ROOT} pasa a ${ESME_PAQUETE}, también en lo que lee el modelo", () => {
    const { paquete } = bien(importaPluginClaude(join(FIX, "plugin-claude")));
    const skill = texto(paquete.ficheros["skills/repasar/SKILL.md"]);
    expect(skill).toContain("${ESME_PAQUETE}/skills/repasar/guia.md");
    expect(skill).not.toContain("CLAUDE_PLUGIN_ROOT");
  });

  it("lo que no viaja de un comando se dice (allowed-tools)", () => {
    const { avisos } = bien(importaPluginClaude(join(FIX, "plugin-claude")));
    expect(avisos).toContainEqual(expect.stringContaining("allowed-tools"));
  });

  it("escrito a disco, se lee como un paquete", () => {
    instalable(bien(importaPluginClaude(join(FIX, "plugin-claude"))).paquete);
  });

  it("sin licencia ni LICENSE es un error; con --licencia MIT, vale", () => {
    const dir = copia("plugin-claude");
    unlinkSync(join(dir, "LICENSE"));
    const r = importaPluginClaude(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual([expect.stringContaining("--licencia")]);
    const { m, avisos } = bien(importaPluginClaude(dir, { licencia: "MIT" }));
    expect(m.license).toBe("MIT");
    expect(avisos).toContainEqual(expect.stringContaining("la licencia la pones tú"));
  });

  it("una licencia que no está entre las de un paquete es un error, aunque digas otra", () => {
    const dir = copia("plugin-claude");
    unlinkSync(join(dir, "LICENSE"));
    const json = JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8"));
    writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ ...json, license: "GPL-3.0" }));
    const r = importaPluginClaude(dir, { licencia: "MIT" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual([expect.stringContaining("GPL-3.0")]);
  });

  it("si la licencia está escrita, se queda la suya (y se avisa si dices otra)", () => {
    const { m, avisos } = bien(importaPluginClaude(join(FIX, "plugin-claude"), { licencia: "Apache-2.0" }));
    expect(m.license).toBe("MIT");
    expect(avisos).toContainEqual(expect.stringContaining("se queda la suya"));
  });

  it("un enlace simbólico no viaja: se descarta, y lo demás sigue", () => {
    const dir = copia("plugin-claude");
    const fuera = join(temporal(), "secreto.txt");
    writeFileSync(fuera, "esto no es del plugin");
    symlinkSync(fuera, join(dir, "skills", "repasar", "enlace.txt"));
    const { paquete, descartado } = bien(importaPluginClaude(dir));
    expect(descartado).toContainEqual({ que: "skills/repasar/enlace.txt", motivo: "un enlace simbólico no viaja: copia el fichero de verdad" });
    expect(paquete.ficheros["skills/repasar/enlace.txt"]).toBeUndefined();
    instalable(paquete);
  });

  it("una ruta del manifiesto que se sale del plugin se descarta", () => {
    const dir = copia("plugin-claude");
    const json = JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8"));
    writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ ...json, skills: ["../fuera"] }));
    const { m, descartado } = bien(importaPluginClaude(dir));
    expect(descartado).toContainEqual({ que: "skills: ../fuera", motivo: "se sale del plugin" });
    expect(m.contributes.skills.map((s: M) => s.id)).toEqual(["repasar"]);
  });

  it("un servidor que necesita ${user_config.…} en sus argumentos se descarta (llega con las llaves)", () => {
    const dir = copia("plugin-claude");
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { notas: { command: "node", args: ["--url", "${user_config.endpoint}"] } } })
    );
    const { m, descartado } = bien(importaPluginClaude(dir));
    expect(m.contributes.tools).toBeUndefined();
    expect(descartado).toContainEqual({ que: "mcpServers.notas", motivo: "usa ${user_config.…} en sus argumentos, y eso llega con las llaves de Esme, en la Fase 2" });
  });

  it("un servidor remoto pide su host, y sus cabeceras van sin valor (marcadas secretas)", () => {
    const dir = copia("plugin-claude");
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { notas: { type: "http", url: "https://api.example.com/mcp", headers: { Authorization: "Bearer ${NOTAS_TOKEN}" } } } })
    );
    const { m, avisos } = bien(importaPluginClaude(dir));
    expect(m.contributes.tools).toEqual([
      { id: "notas", mcp: { url: "https://api.example.com/mcp", headers: [{ name: "Authorization", secret: true, required: true }] } },
    ]);
    expect(m.permissions).toEqual([{ kind: "net:fetch", hosts: ["api.example.com"] }]);
    expect(avisos.join("\n")).not.toContain("Bearer");
  });

  it("bin/, monitors, userConfig, dependencies y lo que no tiene punto se descartan, cada uno con su motivo", () => {
    const dir = copia("plugin-claude");
    const json = JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8"));
    writeFileSync(
      join(dir, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        ...json,
        dependencies: ["otro-plugin"],
        userConfig: { endpoint: { type: "string", title: "Endpoint", description: "Dónde" } },
        experimental: { monitors: [{ name: "vigila", command: "tail -f x", description: "vigila" }] },
        lspServers: { go: { command: "gopls", extensionToLanguage: { ".go": "go" } } },
      })
    );
    cpSync(join(dir, "servidor"), join(dir, "bin"), { recursive: true });
    const { paquete, descartado } = bien(importaPluginClaude(dir));
    expect(descartado).toEqual(
      expect.arrayContaining([
        { que: "bin/", motivo: "pone programas en el PATH sin pedir permiso" },
        { que: "monitors", motivo: "un proceso que corre siempre; en Esme es una rutina con permisos" },
        { que: "userConfig", motivo: "llega con las llaves de Esme, en la Fase 2" },
        { que: "dependencies", motivo: "no traen huella: se instalan aparte y se fijan al resolver" },
        { que: "lspServers", motivo: "sin punto en Esme todavía" },
      ])
    );
    expect(Object.keys(paquete.ficheros).some((f) => f.startsWith("bin/"))).toBe(false);
  });
});

describe("importaMarketplaceClaude — un marketplace", () => {
  it("importa la entrada relativa y deja la de github pendiente", () => {
    const r = importaMarketplaceClaude(join(FIX, "marketplace.json"));
    expect(r.errores).toEqual([]);
    expect(r.importados).toHaveLength(1);
    expect(bien(r.importados[0]).m.id).toBe("esme.ana-prueba.estudio-claude");
    expect(r.pendientes).toEqual([{ nombre: "remoto", motivo: "fuente remota: se trae al instalar, fijada por su sha" }]);
  });

  it("una entrada que se sale del marketplace no se importa", () => {
    const dir = temporal();
    const ruta = join(dir, "marketplace.json");
    writeFileSync(ruta, JSON.stringify({ name: "m", owner: { name: "Ana Prueba" }, plugins: [{ name: "x", source: "./../fuera" }] }));
    const r = importaMarketplaceClaude(ruta);
    expect(r.importados).toHaveLength(1);
    expect(r.importados[0].ok).toBe(false);
    if (!r.importados[0].ok) expect(r.importados[0].errores).toEqual([expect.stringContaining("se sale del marketplace")]);
  });

  it("un marketplace que no se puede leer lo dice, sin lanzar", () => {
    const dir = temporal();
    writeFileSync(join(dir, "roto.json"), "{ roto");
    const r = importaMarketplaceClaude(join(dir, "roto.json"));
    expect(r.importados).toEqual([]);
    expect(r.errores).toEqual([expect.stringContaining("no se puede leer")]);
  });
});

describe("importaRecetaGoose — una receta de goose", () => {
  const receta = () => bien(importaRecetaGoose(join(FIX, "receta-goose.yaml"), { licencia: "Apache-2.0" }));

  it("sale como un paquete con una tarea: instructions y prompt juntos, y las inputs de parameters", () => {
    const { m } = receta();
    expect(m.id).toBe("esme.ana-prueba.plan-de-estudio");
    expect(m.license).toBe("Apache-2.0");
    expect(m.source).toEqual({ from: "goose-recipe", ref: "receta-goose.yaml" });
    expect(m.contributes.tasks).toEqual([
      {
        id: "plan-de-estudio",
        title: "Plan de estudio",
        prompt: "Eres un tutor que planifica con calma y sin prisas.\n\nPrepara un plan para estudiar {{ tema }} antes del {{ fecha }}.",
        inputs: [
          { key: "tema", description: "El tema que estudiar", required: true },
          { key: "fecha", description: "Cuándo es el examen", required: false, default: "2026-12-01" },
        ],
      },
    ]);
  });

  it("stdio pide lanzar su cmd, streamable_http pide su host, y la builtin se descarta", () => {
    const { m, descartado } = receta();
    expect(m.contributes.tools).toEqual([
      { id: "calendario", mcp: { command: "uvx", args: ["calendario-mcp==1.0.0"], env_keys: ["CALENDARIO_TOKEN"] } },
      { id: "apuntes", mcp: { url: "https://apuntes.example.com/mcp", headers: [{ name: "Authorization", secret: true, required: true }] } },
    ]);
    expect(m.permissions).toEqual([
      { kind: "net:fetch", hosts: ["apuntes.example.com"] },
      { kind: "proc:spawn", programs: ["uvx"] },
    ]);
    expect(descartado).toContainEqual({
      que: "extensions.developer",
      motivo: "es parte de goose por dentro: en Esme, lo que haga lo trae el motor o un paquete",
    });
  });

  it("el esquema de la respuesta es el check de success, y va dentro", () => {
    const { m, paquete } = receta();
    expect(m.success.check).toBe("schemas/respuesta.json");
    expect(m.success.task).toBe(m.contributes.tasks[0].prompt);
    expect(JSON.parse(texto(paquete.ficheros["schemas/respuesta.json"]))).toEqual({
      type: "object",
      properties: { pasos: { type: "array", items: { type: "string" } } },
      required: ["pasos"],
    });
  });

  it("settings, activities, sub_recipes y retry.checks se descartan, cada uno con su motivo", () => {
    expect(receta().descartado).toEqual(
      expect.arrayContaining([
        { que: "settings", motivo: "el motor lo eligen Esme y la persona" },
        { que: "activities", motivo: "las sugerencias son de su interfaz" },
        { que: "sub_recipes", motivo: "una sub-receta por ruta no trae huella" },
        { que: "retry.checks", motivo: "un check de shell es código" },
      ])
    );
  });

  it("escrita a disco, se lee como un paquete", () => {
    instalable(receta().paquete);
  });

  it("sin licencia (ni LICENSE al lado) es un error", () => {
    const r = importaRecetaGoose(join(FIX, "receta-goose.yaml"));
    expect(r.ok).toBe(false);
  });

  it("una receta que no es YAML que se pueda leer es un error, sin lanzar", () => {
    const ruta = join(temporal(), "rota.yaml");
    writeFileSync(ruta, "title: [sin cerrar");
    const r = importaRecetaGoose(ruta, { licencia: "MIT", autor: "Ana Prueba" });
    expect(r.ok).toBe(false);
  });
});

describe("importaServidorMcp — un server.json del registro MCP", () => {
  const servidor = (): M => JSON.parse(readFileSync(join(FIX, "server.json"), "utf8"));

  it("con remotes y packages da una sola herramienta, la remota; el npm es otra forma de llegar", () => {
    const { m, descartado, avisos } = bien(importaServidorMcp(servidor()));
    expect(m.id).toBe("esme.mcp.io-github-ana-prueba-notas");
    expect(m.name).toBe("Notas");
    expect(m.author).toBe("Esme");
    expect(m.license).toBe("MIT");
    expect(m.homepage).toBe("https://notas.example.com");
    expect(m.source).toEqual({ from: "mcp-registry", ref: "io.github.ana-prueba/notas" });
    expect(m.contributes.tools).toEqual([
      {
        id: "notas",
        mcp: { url: "https://notas.example.com/mcp", headers: [{ name: "X-API-Key", description: "Tu llave de Notas", secret: true, required: true }] },
      },
    ]);
    expect(m.permissions).toEqual([{ kind: "net:fetch", hosts: ["notas.example.com"] }]);
    expect(descartado).toEqual([{ que: "packages[0]", motivo: "otra forma de llegar al mismo servidor" }]);
    expect(avisos).toContainEqual(expect.stringContaining("MIT"));
  });

  it("solo con el paquete npm: npx con su versión fija, y sus variables de entorno", () => {
    const { remotes: _, ...sinRemotos } = servidor();
    const { m } = bien(importaServidorMcp(sinRemotos));
    expect(m.contributes.tools).toEqual([
      { id: "notas", mcp: { command: "npx", args: ["-y", "@ana-prueba/notas-mcp@1.0.0"], env_keys: ["NOTAS_TOKEN"] } },
    ]);
    expect(m.permissions).toEqual([{ kind: "proc:spawn", programs: ["npx"] }]);
  });

  it("una URL con variables no se puede fijar todavía: se descarta y se usa el npm", () => {
    const s = servidor();
    s.remotes[0].url = "https://{tenant}.notas.example.com/mcp";
    const { m, descartado } = bien(importaServidorMcp(s));
    expect(m.contributes.tools[0].mcp.command).toBe("npx");
    expect(descartado).toContainEqual({ que: "remotes[0]", motivo: "la URL lleva variables ({…}): se rellenan al instalar, en la Fase 2" });
  });

  it("sin ninguna forma de llegar que Esme sepa usar es un error", () => {
    const s = servidor();
    delete s.remotes;
    s.packages = [{ registryType: "oci", identifier: "docker.io/ana/notas:1.0.0", transport: { type: "stdio" } }];
    const r = importaServidorMcp(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual([expect.stringContaining("no hay forma de llegar")]);
  });

  it("lo que no es un server.json es un error, sin lanzar", () => {
    expect(importaServidorMcp(null).ok).toBe(false);
    expect(importaServidorMcp({ description: "sin nombre ni nada" }).ok).toBe(false);
  });
});

describe("importaCarpetaSkill — una skill suelta (SKILL.md)", () => {
  it("sale con path «.», y scripts: true porque trae scripts/", () => {
    const { m, paquete } = bien(importaCarpetaSkill(join(FIX, "skill-suelta"), { autor: "Ana Prueba" }));
    expect(m.id).toBe("esme.ana-prueba.skill-suelta");
    expect(m.license).toBe("Apache-2.0");
    expect(m.source).toEqual({ from: "skill", ref: "skill-suelta" });
    expect(m.contributes.skills).toEqual([{ id: "skill-suelta", path: ".", scripts: true }]);
    expect(Object.keys(paquete.ficheros).sort()).toEqual(["SKILL.md", "scripts/baraja.py"]);
    instalable(paquete);
  });

  it("sin autor es un error que dice cómo darlo", () => {
    const r = importaCarpetaSkill(join(FIX, "skill-suelta"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual([expect.stringContaining("--autor")]);
  });

  it("una carpeta sin SKILL.md es un error", () => {
    const r = importaCarpetaSkill(temporal(), { autor: "Ana Prueba", licencia: "MIT" });
    expect(r.ok).toBe(false);
  });
});

describe("importar — lo que las fixtures no enseñan", () => {
  /** Un plugin de prueba en una carpeta nueva: su plugin.json y sus ficheros. */
  const plugin = (json: Record<string, unknown>, ficheros: Record<string, string>): string => {
    const dir = join(temporal(), "plugin");
    for (const [ruta, contenido] of Object.entries({ ".claude-plugin/plugin.json": JSON.stringify(json), ...ficheros })) {
      const destino = join(dir, ruta);
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, contenido);
    }
    return dir;
  };
  const base = { name: "prueba", version: "1.0.0", description: "Un plugin de prueba, sintético.", author: { name: "Ana Prueba" }, license: "MIT" };
  const skill = (nombre: string, cuerpo = "Haz algo útil.") => `---\nname: ${nombre}\ndescription: Una skill de prueba que hace algo útil.\n---\n${cuerpo}\n`;

  it("los ficheros de secretos no viajan nunca (un .env.example, sí)", () => {
    const dir = plugin(base, { "skills/a/SKILL.md": skill("a"), ".env": "TOKEN=x", ".npmrc": "//r/:_authToken=x", "id_ed25519": "x", ".env.example": "TOKEN=" });
    const { paquete, descartado } = bien(importaPluginClaude(dir));
    for (const f of [".env", ".npmrc", "id_ed25519"]) {
      expect(paquete.ficheros[f]).toBeUndefined();
      expect(descartado).toContainEqual({ que: f, motivo: "suele guardar secretos (llaves, tokens): no viaja nunca" });
    }
    expect(paquete.ficheros[".env.example"]).toBeDefined();
  });

  it("los valores de las variables y las cabeceras no salen ni en un aviso", () => {
    const dir = plugin(base, {
      "skills/a/SKILL.md": skill("a"),
      ".mcp.json": JSON.stringify({
        mcpServers: {
          local: { command: "node", args: ["s.js"], env: { CLAVE: "valor-secreto-1" } },
          remoto: { type: "http", url: "https://api.example.com/mcp", headers: { "X-Key": "valor-secreto-2" } },
        },
      }),
    });
    const { m, avisos } = bien(importaPluginClaude(dir));
    expect(JSON.stringify(m)).not.toContain("valor-secreto");
    expect(avisos.join("\n")).not.toContain("valor-secreto");
    expect(avisos).toContainEqual(expect.stringContaining("«CLAVE» trae un valor escrito"));
    expect(avisos).toContainEqual(expect.stringContaining("«X-Key» trae un valor escrito"));
  });

  it("la licencia sale de su texto: un Apache que no es la 2.0 no es Apache-2.0, ni con --licencia", () => {
    const dir = plugin({ ...base, license: undefined }, { "skills/a/SKILL.md": skill("a"), LICENSE: "Apache License\nVersion 1.1\n..." });
    const r = importaPluginClaude(dir, { licencia: "MIT" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual([expect.stringContaining("Apache (no la 2.0)")]);
  });

  it("manda la licencia que se nombra antes: un Apache-2.0 con avisos de terceros en MIT es Apache-2.0", () => {
    const apache = "Apache License\nVersion 2.0, January 2004\n...\nThird-party: MIT License. Permission is hereby granted, free of charge...";
    const dir = plugin({ ...base, license: undefined }, { "skills/a/SKILL.md": skill("a"), LICENSE: apache });
    expect(bien(importaPluginClaude(dir)).m.license).toBe("Apache-2.0");
  });

  it("si lo escrito y el LICENSE no cuadran, y el LICENSE es ajeno, no se sabe cuál vale: error", () => {
    const dir = plugin(base, { "skills/a/SKILL.md": skill("a"), LICENSE: "GNU GENERAL PUBLIC LICENSE\nVersion 3" });
    const r = importaPluginClaude(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual([expect.stringContaining("no se sabe cuál vale")]);
  });

  it("de «MIT OR Apache-2.0» se elige una de las nuestras, y se dice", () => {
    const dir = plugin({ ...base, license: "MIT OR Apache-2.0" }, { "skills/a/SKILL.md": skill("a") });
    const { m, avisos } = bien(importaPluginClaude(dir));
    expect(m.license).toBe("MIT");
    expect(avisos).toContainEqual(expect.stringContaining("se elige MIT"));
  });

  it("una skill del plugin con licencia cerrada no viaja; las demás, sí", () => {
    const dir = plugin(base, {
      "skills/abierta/SKILL.md": skill("abierta"),
      "skills/cerrada/SKILL.md": skill("cerrada"),
      "skills/cerrada/LICENSE.txt": "© 2026 Alguien. All rights reserved.",
      "skills/cerrada/plantilla.md": "secreto de empresa",
    });
    const { m, paquete, descartado } = bien(importaPluginClaude(dir));
    expect(m.contributes.skills.map((s: M) => s.id)).toEqual(["abierta"]);
    expect(descartado).toContainEqual({ que: "skills/cerrada", motivo: expect.stringContaining("un paquete no puede llevarla") });
    expect(Object.keys(paquete.ficheros).some((f) => f.startsWith("skills/cerrada"))).toBe(false);
  });

  it("los argumentos de un comando: $0 y $ARGUMENTS[1] son entradas numeradas, con su pista; un \\$ se queda", () => {
    const dir = plugin(base, {
      "commands/copia.md": '---\ndescription: Copia algo\nargument-hint: "<origen> [destino]"\n---\nCopia $0 en $ARGUMENTS[1]. Literal: \\$ARGUMENTS.\n',
      "commands/sin-hueco.md": '---\ndescription: Resume\nargument-hint: "[tema]"\n---\nResume el tema.\n',
      "commands/ordenes.md": "---\ndescription: Mira el estado\n---\nEstado: !`git status`\n",
    });
    const { m, avisos } = bien(importaPluginClaude(dir));
    const tarea = (id: string) => m.contributes.tasks.find((t: M) => t.id === id);
    expect(tarea("copia").prompt).toBe("Copia {{argumento-1}} en {{argumento-2}}. Literal: \\$ARGUMENTS.");
    expect(tarea("copia").inputs).toEqual([
      { key: "argumento-1", description: "<origen>", required: false },
      { key: "argumento-2", description: "[destino]", required: false },
    ]);
    expect(tarea("sin-hueco").prompt).toBe("Resume el tema.\n\n{{argumentos}}");
    expect(avisos).toContainEqual(expect.stringContaining("commands/ordenes.md: lleva órdenes"));
  });

  it("de un agente se quita lo que Claude Code no lee en un plugin, y sus variables pasan a las de Esme", () => {
    const dir = plugin(base, {
      "agents/guia.md": "---\nname: guia\ndescription: Guía\npermissionMode: bypassPermissions\nhooks:\n  Stop:\n    - command: x\n---\nLee ${CLAUDE_PLUGIN_ROOT}/docs.\n",
    });
    const { paquete, avisos } = bien(importaPluginClaude(dir));
    const agente = texto(paquete.ficheros["agents/guia.md"]);
    expect(agente).not.toContain("permissionMode");
    expect(agente).not.toContain("hooks");
    expect(agente).toContain("${ESME_PAQUETE}/docs");
    expect(avisos).toContainEqual(expect.stringContaining("«permissionMode» se quita"));
  });

  it("un canal viaja si su servidor viaja; si no, se descarta", () => {
    const dir = plugin(
      { ...base, channels: [{ server: "notas" }, { server: "otro" }] },
      { ".mcp.json": JSON.stringify({ mcpServers: { notas: { command: "node", args: ["n.js"] } } }) }
    );
    const { m, descartado } = bien(importaPluginClaude(dir));
    expect(m.contributes.channels).toEqual([{ id: "notas", tool: "notas" }]);
    expect(descartado).toContainEqual({ que: "channels.otro", motivo: "su servidor no viaja" });
  });

  it("npx sin versión fija se avisa", () => {
    const dir = plugin(base, { ".mcp.json": JSON.stringify({ mcpServers: { x: { command: "npx", args: ["-y", "algo-mcp"] } } }) });
    expect(bien(importaPluginClaude(dir)).avisos).toContainEqual(expect.stringContaining("«algo-mcp» sin versión fija"));
  });

  it("un marketplace que es su propio plugin («./») con su lista de skills carga solo esas", () => {
    const dir = join(temporal(), "mercado");
    for (const [ruta, contenido] of Object.entries({
      ".claude-plugin/marketplace.json": JSON.stringify({
        name: "mercado",
        owner: { name: "Ana Prueba" },
        plugins: [{ name: "lote", source: "./", description: "Un lote de skills de prueba.", license: "MIT", skills: ["./skills/a"] }],
      }),
      "skills/a/SKILL.md": skill("a"),
      "skills/b/SKILL.md": skill("b"),
    })) {
      mkdirSync(dirname(join(dir, ruta)), { recursive: true });
      writeFileSync(join(dir, ruta), contenido);
    }
    const r = importaMarketplaceClaude(dir);
    const { m, paquete, descartado } = bien(r.importados[0]);
    expect(m.id).toBe("esme.ana-prueba.lote");
    expect(m.contributes.skills.map((s: M) => s.id)).toEqual(["a"]);
    expect(descartado).toContainEqual({ que: "skills/b", motivo: "una skill que este plugin no carga: no viaja" });
    expect(paquete.ficheros["skills/b/SKILL.md"]).toBeUndefined();
  });

  it("una skill suelta que corre órdenes al leerse trae scripts, y su allowed-tools no viaja", () => {
    const dir = join(temporal(), "ordenes");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: ordenes\ndescription: Mira el repositorio antes de contestar.\nallowed-tools: Bash(git *)\nlicense: MIT\n---\nEstado: !`git status`\n"
    );
    const { m, paquete, avisos } = bien(importaCarpetaSkill(dir, { autor: "Ana Prueba" }));
    expect(m.contributes.skills).toEqual([{ id: "ordenes", path: ".", scripts: true }]);
    expect(texto(paquete.ficheros["SKILL.md"])).not.toContain("allowed-tools");
    expect(avisos).toContainEqual(expect.stringContaining("«allowed-tools» no viaja"));
  });

  it("un correo no es un autor: sin --autor, error", () => {
    const dir = join(temporal(), "correo");
    mkdirSync(dir);
    writeFileSync(join(dir, "SKILL.md"), "---\nname: correo\ndescription: Una skill de prueba con un correo de autor.\nlicense: MIT\nmetadata:\n  author: ana@example.com\n---\nHola.\n");
    const r = importaCarpetaSkill(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual([expect.stringContaining("--autor")]);
  });

  it("un server.json de PyPI se lanza con uvx, fijado; uno que pide argumentos al instalar se descarta", () => {
    const s = {
      name: "io.github.ana-prueba/py",
      description: "Un servidor MCP de Python, sintético.",
      version: "2.0.0",
      packages: [
        { registryType: "npm", identifier: "@ana/py", version: "2.0.0", packageArguments: [{ type: "positional", valueHint: "ruta", isRequired: true }] },
        { registryType: "pypi", identifier: "py-mcp", version: "2.0.0", transport: { type: "stdio" } },
      ],
    };
    const { m, descartado } = bien(importaServidorMcp(s));
    expect(m.contributes.tools).toEqual([{ id: "py", mcp: { command: "uvx", args: ["py-mcp==2.0.0"] } }]);
    expect(descartado).toEqual([{ que: "packages[0]", motivo: "necesita argumentos que pone quien lo instala: en la Fase 2" }]);
  });
});
