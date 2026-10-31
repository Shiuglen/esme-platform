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
import { leePaquete, nivelDe, validaPaqueteDatos, type PaqueteDatos } from "../core/paquetes/manifiesto.ts";
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

    // trae servidor/notas.js, y una skill puede correr cualquier código del paquete
    expect(m.contributes.skills).toEqual([{ id: "repasar", path: "skills/repasar", scripts: true }]);
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
    expect(m.id).toBe("esme.io-github-ana-prueba.notas");
    expect(m.name).toBe("Notas");
    expect(m.author).toBe("io.github.ana-prueba");
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

  it("hooks y allowed-tools con la clave entre comillas tampoco viajan", () => {
    const md = `---\nname: a\ndescription: Una skill de prueba que hace algo útil.\n"allowed-tools": Bash(*)\n'hooks':\n  PreToolUse:\n    - hooks: [{type: command, command: "curl x"}]\n---\nHola.\n`;
    const { paquete, descartado, avisos } = bien(importaPluginClaude(plugin(base, { "skills/a/SKILL.md": md })));
    const sale = texto(paquete.ficheros["skills/a/SKILL.md"]);
    expect(sale).not.toContain("hooks");
    expect(sale).not.toContain("allowed-tools");
    expect(descartado).toContainEqual({ que: "skills/a/SKILL.md: hooks", motivo: "un hook corre código en cada paso sin pasar por los permisos" });
    expect(avisos).toContainEqual(expect.stringContaining("«allowed-tools» no viaja"));
  });

  it("unos hooks que no se saben quitar (con «<<» o «? hooks») no viajan: la skill se queda fuera, y si es suelta, error", () => {
    const conMerge = "---\nname: b\ndescription: Una skill de prueba que hace algo útil.\n<<: {hooks: {Stop: [{command: x}]}}\n---\nHola.\n";
    const explicita = "---\nname: c\ndescription: Una skill de prueba que hace algo útil.\n? hooks\n: {Stop: [{command: x}]}\n---\nHola.\n";
    const agente = "---\nname: g\ndescription: Guía\n<<: {mcpServers: {x: {command: y}}}\n---\nHola.\n";
    const dir = plugin(base, { "skills/b/SKILL.md": conMerge, "skills/c/SKILL.md": explicita, "skills/d/SKILL.md": skill("d"), "agents/g.md": agente });
    const { m, paquete, descartado } = bien(importaPluginClaude(dir));
    expect(m.contributes.skills.map((s: M) => s.id)).toEqual(["d"]);
    expect(m.contributes.agents).toBeUndefined();
    for (const que of ["skills/b", "skills/c", "agents/g.md"]) {
      expect(descartado).toContainEqual({ que, motivo: expect.stringContaining("no se sabe quitar") });
      expect(Object.keys(paquete.ficheros).some((f) => f.startsWith(que))).toBe(false);
    }
    const suelta = join(temporal(), "suelta");
    mkdirSync(suelta);
    writeFileSync(join(suelta, "SKILL.md"), conMerge.replace("name: b", "name: suelta\nlicense: MIT"));
    const r = importaCarpetaSkill(suelta, { autor: "Ana Prueba" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual([expect.stringContaining("no se sabe quitar")]);
  });

  it("una credencial escrita en la URL o en los argumentos de un servidor no viaja, ni su valor en ningún mensaje", () => {
    const fijo = "algo-mcp@1.0.0";
    const dir = plugin(base, {
      "skills/a/SKILL.md": skill("a"),
      ".mcp.json": JSON.stringify({
        mcpServers: {
          enUrl: { type: "http", url: "https://api.example.com/mcp?api_key=valor-secreto-3" },
          conUsuario: { type: "http", url: "https://ana:valor-secreto-4@api.example.com/mcp" },
          enArgs: { command: "npx", args: ["-y", fijo, "--token", "valor-secreto-5"] },
          conIgual: { command: "npx", args: ["-y", fijo, "--api-key=valor-secreto-6"] },
          enEntorno: { command: "npx", args: ["-y", fijo, "GITHUB_TOKEN=valor-secreto-7"] },
          conPrefijo: { command: "npx", args: ["-y", fijo, "ghp_abcdefghijklmnopqrstuvwxyz0123456789"] },
          limpio: { command: "npx", args: ["-y", fijo, "--auth-type", "oauth", "--key-file", "llave.txt"] },
        },
      }),
    });
    const r = importaPluginClaude(dir);
    const { m, descartado } = bien(r);
    expect(m.contributes.tools.map((t: M) => t.id)).toEqual(["limpio"]);
    for (const n of ["enUrl", "conUsuario", "enArgs", "conIgual", "enEntorno", "conPrefijo"])
      expect(descartado).toContainEqual({ que: `mcpServers.${n}`, motivo: expect.stringContaining("credencial") });
    expect(JSON.stringify(r)).not.toMatch(/valor-secreto|ghp_abc/);
  });

  it("goose y el registro MCP: una credencial en la URL o en los argumentos tampoco viaja", () => {
    const ruta = join(temporal(), "receta.yaml");
    writeFileSync(
      ruta,
      [
        "title: Con llaves",
        "description: Una receta de prueba, sintética.",
        "instructions: Haz algo útil.",
        "extensions:",
        "  - {type: stdio, name: local, cmd: uvx, args: ['algo-mcp==1.0.0', '--api-key=valor-secreto-8']}",
        "  - {type: streamable_http, name: remota, uri: 'https://api.example.com/mcp?token=valor-secreto-9'}",
        "  - {type: stdio, name: bien, cmd: uvx, args: ['otro-mcp==1.0.0']}",
      ].join("\n")
    );
    const g = importaRecetaGoose(ruta, { licencia: "MIT", autor: "Ana Prueba" });
    const { m, descartado } = bien(g);
    expect(m.contributes.tools.map((t: M) => t.id)).toEqual(["bien"]);
    for (const que of ["extensions.local", "extensions.remota"])
      expect(descartado).toContainEqual({ que, motivo: expect.stringContaining("credencial") });
    expect(JSON.stringify(g)).not.toContain("valor-secreto");

    const s = importaServidorMcp({
      name: "io.github.ana-prueba/llaves",
      description: "Un servidor MCP de prueba, sintético.",
      version: "1.0.0",
      remotes: [{ type: "streamable-http", url: "https://api.example.com/mcp?key=valor-secreto-10" }],
      packages: [{ registryType: "npm", identifier: "@ana/llaves", version: "1.0.0", packageArguments: [{ type: "named", name: "--token", value: "valor-secreto-11" }] }],
    });
    expect(s.ok).toBe(false);
    if (!s.ok) {
      expect(s.errores.join("\n")).toContain("remotes[0]: lleva una credencial escrita");
      expect(s.errores.join("\n")).toContain("packages[0]: lleva una credencial escrita");
    }
    expect(JSON.stringify(s)).not.toContain("valor-secreto");
  });

  it("server.json: un paquete de npm o de PyPI que no es un nombre (o una versión que es una opción) no se lanza", () => {
    const s = importaServidorMcp({
      name: "io.github.ana-prueba/raro",
      description: "Un servidor MCP de prueba, sintético.",
      version: "1.0.0",
      packages: [
        { registryType: "npm", identifier: "--registry=https://malo.example.com", version: "1.0.0" },
        { registryType: "pypi", identifier: "-e git+https://malo.example.com/x", version: "1.0.0" },
        { registryType: "pypi", identifier: "raro-mcp", version: "--pre" },
      ],
    });
    expect(s.ok).toBe(false);
    if (!s.ok) {
      const todo = s.errores.join("\n");
      expect(todo).toContain("packages[0]: «--registry=https://malo.example.com» no es un nombre de paquete de npm");
      expect(todo).toContain("packages[1]: «-e git+https://malo.example.com/x» no es un nombre de paquete de PyPI");
      expect(todo).toContain("packages[2]: su versión «--pre» no vale");
    }
  });

  it("server.json: el autor es su espacio del registro; el espacio «mcp» es el de las herramientas de Esme", () => {
    const r = importaServidorMcp({ name: "mcp/notas", description: "Un servidor MCP de prueba, sintético.", version: "1.0.0", remotes: [{ type: "streamable-http", url: "https://notas.example.com/mcp" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual([expect.stringContaining("«mcp»")]);
  });

  it("tampoco viajan las credenciales de la nube, las claves .pem, el .envrc ni la configuración de Claude Code (un ejemplo, sí)", () => {
    const dir = plugin(base, {
      "skills/a/SKILL.md": skill("a"),
      ".aws/credentials": "x",
      ".ssh/config": "x",
      "credentials.json": "{}",
      "secrets.yaml": "x: 1",
      ".envrc": "export X=1",
      "private.pem": "x",
      ".docker/config.json": "{}",
      ".kube/config": "x",
      ".pgpass": "x",
      "service-account.json": "{}",
      ".claude/settings.json": "{}",
      ".claude/settings.local.json": "{}",
      "skills/a/.mcp.json": "{}",
      "secrets.example.yaml": "x: <el tuyo>",
    });
    const { paquete, descartado } = bien(importaPluginClaude(dir));
    const secreto = "suele guardar secretos (llaves, tokens): no viaja nunca";
    for (const que of [".aws/", ".ssh/", "credentials.json", "secrets.yaml", ".envrc", "private.pem", ".docker/config.json", ".kube/config", ".pgpass", "service-account.json"])
      expect(descartado).toContainEqual({ que, motivo: secreto });
    for (const que of [".claude/settings.json", ".claude/settings.local.json"])
      expect(descartado).toContainEqual({ que, motivo: expect.stringContaining("Claude Code") });
    expect(descartado).toContainEqual({ que: "skills/a/.mcp.json", motivo: expect.stringContaining("servidores MCP") });
    expect(Object.keys(paquete.ficheros).sort()).toEqual(["secrets.example.yaml", "skills/a/SKILL.md"]);
  });

  it("en un marketplace, la licencia y el autor del plugin.json mandan: si la entrada dice otra licencia, no se sabe cuál vale", () => {
    const dir = join(temporal(), "mercado");
    const escribe = (ruta: string, contenido: string) => {
      mkdirSync(dirname(join(dir, ruta)), { recursive: true });
      writeFileSync(join(dir, ruta), contenido);
    };
    escribe(
      ".claude-plugin/marketplace.json",
      JSON.stringify({
        name: "mercado",
        owner: { name: "Dueño" },
        plugins: [
          { name: "gpl", source: "./gpl", license: "MIT" },
          { name: "otra", source: "./otra", license: "Apache-2.0" },
          { name: "autor", source: "./autor", author: { name: "Otro Nombre" } },
        ],
      })
    );
    for (const [n, extra] of [["gpl", { license: "GPL-3.0" }], ["otra", {}], ["autor", {}]] as const) {
      escribe(`${n}/.claude-plugin/plugin.json`, JSON.stringify({ ...base, name: n, ...extra }));
      escribe(`${n}/skills/a/SKILL.md`, skill("a"));
    }
    const [gpl, otra, autor] = importaMarketplaceClaude(dir).importados;
    expect(gpl.ok).toBe(false);
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.errores).toEqual([expect.stringContaining("no se sabe cuál vale")]);
    const a = bien(autor);
    expect(a.m.author).toBe("Ana Prueba");
    expect(a.avisos).toContainEqual(expect.stringContaining("«Otro Nombre»"));
  });

  it("una licencia permisiva con una cláusula que la cierra (Commons Clause, solo no comercial) no es la permisiva", () => {
    const commons =
      'Apache License\nVersion 2.0, January 2004\n...\n"Commons Clause" License Condition v1.0\nThe Software is provided to you by the Licensor under the License, as defined below, subject to the following condition. Without limiting other conditions in the License, the grant of rights under the License will not include, and the License does not grant to you, the right to Sell the Software.';
    const noComercial =
      "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy...\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nAdditional terms: this software may only be used for non-commercial purposes.";
    const mit = (cola: string) =>
      `MIT License\n\nCopyright (c) 2026 Ana\n\nPermission is hereby granted, free of charge, to any person obtaining a copy...\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\n${cola}\n`;
    const otras = [
      "Additional restriction: the Software may not be used for any revenue-generating purpose.",
      "Commercial use of this software is not permitted.",
      "You may not use the Software for commercial purposes.",
      "For personal use only.",
    ].map(mit);
    for (const LICENSE of [commons, noComercial, ...otras]) {
      const r = importaPluginClaude(plugin({ ...base, license: undefined }, { "skills/a/SKILL.md": skill("a"), LICENSE }), { licencia: "MIT" });
      expect(r.ok, LICENSE.slice(-90)).toBe(false);
    }
  });

  it("«para uso comercial o no comercial» no cierra nada: el Unlicense lo dice, y un MIT que lo repite sigue siendo MIT", () => {
    const unlicense =
      "This is free and unencumbered software released into the public domain.\n\nAnyone is free to copy, modify, publish, use, compile, sell, or distribute this software, either in source code form or as a compiled binary, for any purpose, commercial or non-commercial, and by any means.\n";
    const mit =
      "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy...\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nThis library is free for commercial and non-commercial use.\n";
    for (const [LICENSE, licencia] of [[unlicense, "Unlicense"], [mit, "MIT"]]) {
      const { m } = bien(importaPluginClaude(plugin({ ...base, license: undefined }, { "skills/a/SKILL.md": skill("a"), LICENSE })));
      expect(m.license).toBe(licencia);
    }
  });

  it("una licencia escrita con un LICENSE que no se reconoce va, pero se avisa", () => {
    const dir = plugin(base, { "skills/a/SKILL.md": skill("a"), LICENSE: "Licencia de la casa: úsalo en tus proyectos personales." });
    const { m, avisos } = bien(importaPluginClaude(dir));
    expect(m.license).toBe("MIT");
    expect(avisos).toContainEqual(expect.stringContaining("su LICENSE no se reconoce"));
  });

  it("si el plugin trae código fuera de sus skills, sus skills pueden correrlo: scripts: true, y el nivel lo dice", () => {
    const dir = plugin(base, { "skills/a/SKILL.md": skill("a", "Corre ${CLAUDE_PLUGIN_ROOT}/scripts/borra.py."), "scripts/borra.py": "print('x')\n" });
    const { m } = bien(importaPluginClaude(dir));
    expect(m.contributes.skills).toEqual([{ id: "a", path: "skills/a", scripts: true }]);
    expect(nivelDe(leePaquete(m).paquete!)).toBe(3);
  });

  it("un servidor que se lanza por una ruta del paquete (o relativa) no viaja; por una ruta absoluta, va por su nombre", () => {
    const dir = plugin(base, {
      ".mcp.json": JSON.stringify({
        mcpServers: {
          propio: { command: "${CLAUDE_PLUGIN_ROOT}/bin/npx", args: ["x"] },
          relativo: { command: "./bin/servidor" },
          absoluto: { command: "/usr/local/bin/node", args: ["${CLAUDE_PLUGIN_ROOT}/servidor.js"] },
        },
      }),
      "servidor.js": "export {};\n",
    });
    const { m, descartado, avisos } = bien(importaPluginClaude(dir));
    expect(m.contributes.tools).toEqual([{ id: "absoluto", mcp: { command: "node", args: ["${ESME_PAQUETE}/servidor.js"] } }]);
    expect(m.permissions).toEqual([{ kind: "proc:spawn", programs: ["node"] }]);
    for (const que of ["mcpServers.propio", "mcpServers.relativo"])
      expect(descartado).toContainEqual({ que, motivo: expect.stringContaining("por su ruta") });
    expect(avisos).toContainEqual(expect.stringContaining("«/usr/local/bin/node» va como «node»"));
  });

  it("goose: los números y los sí/no de los args van como texto; otra cosa descarta la extensión", () => {
    const ruta = join(temporal(), "receta.yaml");
    writeFileSync(
      ruta,
      [
        "title: Args",
        "description: Una receta de prueba, sintética.",
        "instructions: Haz algo útil.",
        "extensions:",
        "  - {type: stdio, name: bien, cmd: uvx, args: ['otro-mcp==1.0.0', '--port', 8080, '--verbose', true]}",
        "  - {type: stdio, name: raro, cmd: uvx, args: ['x-mcp==1.0.0', {a: 1}]}",
      ].join("\n")
    );
    const { m, descartado } = bien(importaRecetaGoose(ruta, { licencia: "MIT", autor: "Ana Prueba" }));
    expect(m.contributes.tools).toEqual([{ id: "bien", mcp: { command: "uvx", args: ["otro-mcp==1.0.0", "--port", "8080", "--verbose", "true"] } }]);
    expect(descartado).toContainEqual({ que: "extensions.raro", motivo: "sus args no son una lista de textos" });
  });
});
