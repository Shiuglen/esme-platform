/**
 * EL PAQUETE — la forma de un module.yaml v2, sin disco y sin YAML.
 *
 * Esme tenía siete listas de cosas instalables (pieles, módulos, productos,
 * skills, herramientas, tareas del Taller y motores), cada una con su
 * formato y su manera de pedir permisos. El paquete es UNA forma para
 * todas: el module.yaml de la v1, crecido. Su manifiesto dice
 *
 *   - qué APORTA: sus contribuciones, en doce puntos cerrados (`PUNTOS`),
 *     cada uno con su naturaleza (datos o código) y el sitio donde corre;
 *   - qué USA: otros paquetes, cada uno fijado por su huella (`uses`);
 *   - qué PIDE: sus permisos, con alcance (`core/paquetes/permisos.ts`).
 *
 * Una PLANTILLA es un paquete solo de datos que junta otros paquetes y unos
 * ajustes en una forma de trabajar lista para usar («Esme para estudiar»).
 *
 * Lo que NO hay: hooks libres. Un hook corre código en cada paso sin pasar
 * por los permisos; lo que haría, lo hace una herramienta o una rutina, que
 * sí pasan por ellos. Y la regla que lo sostiene todo: lo que un paquete
 * lanza o con quien habla lo PIDE. Un servidor MCP remoto sin su `net:fetch`,
 * o un motor sin su `proc:spawn`, no entra.
 *
 * La v1 sigue valiendo tal cual (`core/ipc/module-schema.ts` la lee como
 * siempre) y, además, se puede ver como un paquete de una sola contribución
 * (`deV1`): así el que lista, resuelve o enseña paquetes no tiene dos
 * caminos.
 *
 * Por qué vive en `core/` y sin YAML: es un CONTRATO, como el de la v1.
 * Quien tiene el fichero en disco lo lee con `tienda/paquete-disco.ts`.
 *
 * Referencia: estandar/paquete.spec.yaml, docs/PAQUETES.md.
 */
import { z } from "zod";
import { ManifestSchema, RUNTIMES, validaManifiesto, type Manifest } from "../ipc/module-schema.ts";
import { LICENCIAS_PERMITIDAS } from "../../tienda/skills.ts";
import { CAPABILITIES } from "../extension-host/capability.ts";
import {
  MOTIVOS_PERMISO,
  esHost,
  esPrograma,
  permiteHost,
  permitePrograma,
  problemasDeAlcance,
  rutaDentro,
  type Permiso,
} from "./permisos.ts";
import { esRango, esVersion } from "./semver.ts";

/** De qué está hecho lo que aporta un punto. */
export type Naturaleza = "datos" | "código" | "código aislado";
/** Dónde corre: en la ventana, en una sesión, siempre (sin sesión) o en la mente. */
export type DondeCorre = "ventana" | "sesión" | "siempre" | "mente";

/**
 * Los doce puntos de contribución: qué son, dónde corren y qué claves
 * lleva cada entrada. La spec declara lo mismo (la conformidad lo mira).
 */
export const PUNTOS = {
  themes: { naturaleza: "datos", corre: "ventana", claves: ["id", "file"] },
  skills: { naturaleza: "datos", corre: "sesión", claves: ["id", "path", "remote", "scripts"] },
  tools: { naturaleza: "código", corre: "sesión", claves: ["id", "entry", "runtime", "mcp"] },
  views: { naturaleza: "código aislado", corre: "ventana", claves: ["id", "entry", "title"] },
  agents: { naturaleza: "datos", corre: "sesión", claves: ["id", "recipe", "format"] },
  teams: { naturaleza: "datos", corre: "sesión", claves: ["id", "file"] },
  tasks: {
    naturaleza: "datos",
    corre: "sesión",
    claves: ["id", "title", "prompt", "steps", "roles", "category", "icon", "inputs"],
  },
  routines: { naturaleza: "datos", corre: "siempre", claves: ["id", "when", "task", "agent"] },
  channels: { naturaleza: "datos", corre: "siempre", claves: ["id", "tool"] },
  memory: { naturaleza: "código", corre: "mente", claves: ["id", "entry", "runtime"] },
  engines: {
    naturaleza: "datos",
    corre: "sesión",
    claves: ["id", "name", "binaries", "args", "install", "repo", "login", "compliance", "verified"],
  },
  commands: { naturaleza: "datos", corre: "ventana", claves: ["id", "title", "task"] },
} as const satisfies Record<string, { naturaleza: Naturaleza; corre: DondeCorre; claves: readonly string[] }>;

export type Punto = keyof typeof PUNTOS;

/** Los puntos que traen código: una plantilla no puede traer ninguno. */
const PUNTOS_CODIGO = (Object.keys(PUNTOS) as Punto[]).filter((p) => PUNTOS[p].naturaleza !== "datos");

/** Paquete o plantilla. */
export const TIPOS_PAQUETE = ["package", "template"] as const;

/** Los formatos de la receta de un agente: la del kit, la de Claude Code y la línea de comandos. */
export const FORMATOS_AGENTE = ["receta", "claude-md", "comando"] as const;

/** Las licencias: las de la v1 y las que el juez de skills ya acepta. */
export const LICENCIAS_PAQUETE = [
  ...new Set([...ManifestSchema.shape.license.options, ...LICENCIAS_PERMITIDAS]),
] as [string, ...string[]];

/** Los niveles de aislamiento: dónde tiene que correr lo que trae un paquete. */
export const NIVELES = {
  0: "datos",
  1: "WASM",
  2: "cápsula",
  3: "caja del sistema",
  4: "microVM",
} as const;
export type Nivel = keyof typeof NIVELES;

/**
 * Lo que Esme sustituye en `mcp.command`, `mcp.args` y en el entorno, y
 * también en lo que lee el modelo (el SKILL.md, la receta de un agente, el
 * prompt de una tarea): un plugin importado sigue encontrando sus ficheros.
 */
export const VARIABLES_PAQUETE = {
  ESME_PAQUETE: "la carpeta donde está instalado el paquete",
  ESME_DATOS: "la carpeta de sus datos, que sobrevive a las actualizaciones",
} as const;

/** Las claves de arriba del todo de un module.yaml v2. */
export const CLAVES_PAQUETE = [
  "schema_version",
  "id",
  "version",
  "name",
  "kind",
  "description",
  "author",
  "license",
  "keywords",
  "homepage",
  "uses",
  "contributes",
  "permissions",
  "settings",
  "success",
  "source",
  "works_with",
  "decision_criteria",
  "benchmarks",
  "signatures",
] as const;

/** Lo que es de la v1 y en la v2 va en otro sitio (y dónde). */
const CLAVES_V1: Record<string, string> = {
  category: "en la v2, lo que trae va en su punto (tools, memory, themes, agents…)",
  entry: "en la v2, el código va en su punto (tools o memory), con su runtime",
  runtime: "en la v2, el runtime va con el código, en su punto (tools o memory)",
  dependencies: "en la v2, lo que usa va en uses, fijado por su huella",
  sideEffects: "en la v2, los efectos se dicen con permisos",
  engines: "en la v2, los motores con los que trabaja van en works_with (contributes.engines es para los que aporta)",
};

const ID = /^esme\.[a-z0-9-]+\.[a-z0-9-]+$/;
const ID_ENTRADA = /^[a-z0-9][a-z0-9-]*$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const PROGRAMA = /^[A-Za-z0-9._+-]+$/;

const IdEntrada = z.string().regex(ID_ENTRADA, "un id de entrada va en minúsculas, con guiones");
const Ruta = z.string().refine(rutaDentro, "una ruta del paquete es relativa, con «/», y no sale con «..»");
const Url = z
  .string()
  .refine((u) => /^https?:\/\//.test(u) && URL.canParse(u), "una URL http(s) que se pueda leer");

const Remota = z
  .object({
    repo: z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "repo: «dueño/nombre»"),
    commit: z.string().regex(COMMIT, "commit: los 40 caracteres del commit"),
    path: Ruta,
    sha256: z.string().regex(SHA256, "sha256: la huella del árbol, 64 caracteres hexadecimales"),
  })
  .strict();

const Cabecera = z
  .object({
    name: z.string().min(1),
    secret: z.boolean().optional(),
    required: z.boolean().optional(),
    description: z.string().optional(),
  })
  .strict();

const McpLocal = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env_keys: z.array(z.string()).optional(),
  })
  .strict();

const McpRemoto = z.object({ url: Url, headers: z.array(Cabecera).optional() }).strict();

const EntradaTarea = z
  .object({
    key: z.string().min(1),
    description: z.string().optional(),
    required: z.boolean().optional(),
    default: z.string().optional(),
  })
  .strict();

/** La forma de una entrada de cada punto (los campos de más se avisan, no se rechazan). */
const ENTRADAS = {
  themes: z.object({ id: IdEntrada, file: Ruta }).passthrough(),
  skills: z.object({ id: IdEntrada, path: Ruta.optional(), remote: Remota.optional(), scripts: z.boolean().optional() }).passthrough(),
  tools: z
    .object({
      id: IdEntrada,
      entry: Ruta.optional(),
      runtime: z.enum(RUNTIMES).optional(),
      mcp: z.union([McpLocal, McpRemoto]).optional(),
    })
    .passthrough(),
  views: z.object({ id: IdEntrada, entry: Ruta, title: z.string().optional() }).passthrough(),
  agents: z.object({ id: IdEntrada, recipe: Ruta, format: z.enum(FORMATOS_AGENTE).default("receta") }).passthrough(),
  teams: z.object({ id: IdEntrada, file: Ruta }).passthrough(),
  tasks: z
    .object({
      id: IdEntrada,
      title: z.string().min(1),
      prompt: z.string().min(1),
      steps: z.array(z.string()).optional(),
      roles: z.array(z.string()).optional(),
      category: z.string().optional(),
      icon: z.string().optional(),
      inputs: z.array(EntradaTarea).optional(),
    })
    .passthrough(),
  routines: z
    .object({ id: IdEntrada, when: z.string().min(1), task: z.string().min(1), agent: z.string().optional() })
    .passthrough(),
  channels: z.object({ id: IdEntrada, tool: z.string().min(1) }).passthrough(),
  memory: z.object({ id: IdEntrada, entry: Ruta, runtime: z.enum(RUNTIMES) }).passthrough(),
  engines: z
    .object({
      id: IdEntrada,
      name: z.string().min(1),
      binaries: z.array(z.string().regex(PROGRAMA, "un binario va por su nombre, no por su ruta")).optional(),
      args: z.array(z.string()).optional(),
      install: z.string().optional(),
      repo: Url.optional(),
      login: z.string().optional(),
      compliance: z.string().optional(),
      verified: z.string().optional(),
    })
    .passthrough(),
  commands: z.object({ id: IdEntrada, title: z.string().min(1), task: z.string().min(1) }).passthrough(),
} satisfies Record<Punto, z.ZodType>;

const Contribuciones = z
  .object(
    Object.fromEntries(
      (Object.keys(ENTRADAS) as Punto[]).map((p) => [p, z.array(ENTRADAS[p]).optional()])
    ) as { [P in Punto]: z.ZodOptional<z.ZodArray<(typeof ENTRADAS)[P]>> }
  )
  .passthrough();

/** Un permiso en su forma larga: la capacidad y su límite (lo que vale lo dice `permisos.ts`). */
const PermisoLargo = z
  .object({
    kind: z.enum(CAPABILITIES),
    hosts: z.array(z.string().refine(esHost, MOTIVOS_PERMISO.host)).min(1, MOTIVOS_PERMISO.vacio).optional(),
    paths: z.array(z.string().refine(rutaDentro, MOTIVOS_PERMISO.ruta)).min(1, MOTIVOS_PERMISO.vacio).optional(),
    programs: z.array(z.string().refine(esPrograma, MOTIVOS_PERMISO.programa)).min(1, MOTIVOS_PERMISO.vacio).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    for (const x of problemasDeAlcance(p))
      ctx.addIssue({ code: "custom", ...(x.alcance ? { path: [x.alcance] } : {}), message: x.motivo });
  });

/** La forma de un permiso (las dos formas). Vive aquí, en el contrato: `permisos.ts` no carga zod. */
export const PermisoSchema = z.union([z.enum(CAPABILITIES), PermisoLargo]);

const Uso = z
  .object({
    id: z.string().regex(ID, "id debe ser esme.<autor>.<slug>"),
    version: z.string().refine(esRango, "no es un rango (*, 1.2.3, ^1.2, ~1.2.3, >=1.2)"),
    sha256: z.string().regex(SHA256, "la huella son 64 caracteres hexadecimales"),
  })
  .strict();

const Ajustes = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).superRefine((s, ctx) => {
  if ("rumbo" in s && typeof s.rumbo !== "string")
    ctx.addIssue({ code: "custom", path: ["rumbo"], message: "el rumbo es un texto" });
  if ("budget_usd_per_day" in s && (typeof s.budget_usd_per_day !== "number" || s.budget_usd_per_day < 0))
    ctx.addIssue({ code: "custom", path: ["budget_usd_per_day"], message: "un número de dólares, 0 o más" });
});

/** El nombre lógico de lo que se lanza (`${ESME_PAQUETE}/bin/x` lanza «x»). */
export const programaDe = (comando: string): string => comando.split(/[\\/]/).pop() || comando;

type Entradas = { [P in Punto]?: Array<z.infer<(typeof ENTRADAS)[P]>> };

/** Las reglas que cruzan campos: las que la forma sola no ve. */
function reglas(m: Record<string, unknown> & { kind: string; uses: z.infer<typeof Uso>[]; contributes: Entradas & Record<string, unknown>; permissions: Permiso[]; settings?: unknown }, ctx: z.RefinementCtx): void {
  const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: "custom", message, path });

  for (const [clave, donde] of Object.entries(CLAVES_V1)) {
    if (clave in m) issue(`«${clave}» es de la v1: ${donde}`, [clave]);
  }

  const c = m.contributes;
  if ("hooks" in c) {
    issue(
      "Esme no admite hooks libres: un hook corre código en cada paso sin pasar por los permisos. Lo que haga, que lo haga una herramienta (tools) o una rutina (routines).",
      ["contributes", "hooks"]
    );
  }

  const puntos = Object.keys(PUNTOS) as Punto[];
  const total = puntos.reduce((n, p) => n + (c[p]?.length ?? 0), 0);
  if (!total && !m.uses.length) issue("el paquete no aporta nada: ni contributes ni uses", ["contributes"]);

  for (const p of puntos) {
    const vistos = new Set<string>();
    for (const e of c[p] ?? []) {
      if (vistos.has(e.id)) issue(`contributes.${p}: el id «${e.id}» está repetido`, ["contributes", p]);
      vistos.add(e.id);
    }
  }

  if (m.kind === "template") {
    for (const p of PUNTOS_CODIGO) {
      if (c[p]?.length)
        issue(
          `una plantilla es solo datos: «${p}» es ${PUNTOS[p].naturaleza}; ponlo en un paquete y úsalo con uses`,
          ["contributes", p]
        );
    }
  } else if (m.settings !== undefined) {
    issue("settings es de las plantillas: un paquete no crea proyectos", ["settings"]);
  }

  const herramientas = new Set((c.tools ?? []).map((t) => t.id));
  for (const canal of c.channels ?? []) {
    if (!herramientas.has(canal.tool))
      issue(`channels.${canal.id}: la herramienta «${canal.tool}» no está en este paquete`, ["contributes", "channels"]);
  }
  const tareas = new Set((c.tasks ?? []).map((t) => t.id));
  for (const cmd of c.commands ?? []) {
    if (!tareas.has(cmd.task))
      issue(`commands.${cmd.id}: la tarea «${cmd.task}» no está en este paquete`, ["contributes", "commands"]);
  }

  const usados = new Set<string>();
  for (const u of m.uses) {
    if (usados.has(u.id)) issue(`uses: «${u.id}» está dos veces`, ["uses"]);
    usados.add(u.id);
  }

  for (const s of c.skills ?? []) {
    if ((s.path === undefined) === (s.remote === undefined))
      issue(`skills.${s.id}: o path o remote (una skill es local o remota, no las dos ni ninguna)`, ["contributes", "skills"]);
  }

  const pideLanzar = (donde: string, programa: string) =>
    issue(`${donde}: lanza «${programa}» y no lo pide (permissions: proc:spawn con programs: [${programa}])`, ["permissions"]);

  for (const t of c.tools ?? []) {
    const codigo = t.entry !== undefined || t.runtime !== undefined;
    if (t.mcp ? codigo : !(t.entry && t.runtime)) {
      issue(`tools.${t.id}: o entry con runtime, o mcp (código del paquete o un servidor MCP, no las dos)`, ["contributes", "tools"]);
      continue;
    }
    if (t.mcp && "url" in t.mcp) {
      const host = new URL(t.mcp.url).hostname;
      if (!permiteHost(m.permissions, host))
        issue(`tools.${t.id}: se conecta a ${host} y no lo pide (permissions: net:fetch con hosts: [${host}])`, ["permissions"]);
    } else if (t.mcp && "command" in t.mcp) {
      const programa = programaDe(t.mcp.command);
      if (!permitePrograma(m.permissions, programa)) pideLanzar(`tools.${t.id}`, programa);
    }
  }

  for (const e of c.engines ?? []) {
    for (const b of e.binaries ?? []) if (!permitePrograma(m.permissions, b)) pideLanzar(`engines.${e.id}`, b);
  }
}

/** Schema del module.yaml v2 (especificación en estandar/paquete.spec.yaml). */
export const ManifiestoV2Schema = z
  .object({
    schema_version: z.literal(2),
    id: z.string().regex(ID, "id debe ser esme.<autor>.<slug>"),
    version: z.string().regex(VERSION, "version semver estricto"),
    name: z.string().min(1),
    kind: z.enum(TIPOS_PAQUETE),
    description: z.string().min(10, "description demasiado corta"),
    author: z.string().min(3),
    license: z.enum(LICENCIAS_PAQUETE),
    keywords: z.array(z.string().min(1)).optional(),
    homepage: Url.optional(),
    uses: z.array(Uso).default([]),
    contributes: Contribuciones.default({}),
    permissions: z.array(PermisoSchema).default([]),
    settings: Ajustes.optional(),
    success: z.object({ task: z.string().min(1), check: Ruta.optional() }).strict().optional(),
    source: z.object({ from: z.string().min(1), ref: z.string().min(1), commit: z.string().optional() }).strict().optional(),
    works_with: z.array(z.string()).optional(),
    decision_criteria: ManifestSchema.shape.decision_criteria.unwrap().optional(),
    benchmarks: ManifestSchema.shape.benchmarks,
    signatures: ManifestSchema.shape.signatures,
  })
  .passthrough() // tolerancia: los campos de más se avisan, no se rechazan
  .superRefine((m, ctx) => reglas(m as Parameters<typeof reglas>[0], ctx));

export type ManifiestoV2 = z.infer<typeof ManifiestoV2Schema>;

const Huella = z.string().regex(SHA256, "la huella son 64 caracteres hexadecimales");
const VersionEstricta = z.string().refine(esVersion, "version semver estricto");

/**
 * La forma del candado (la spec, sección `lock`). También es contrato, y
 * vive aquí para que zod entre en un solo fichero; lo que se hace con él
 * (leerlo, escribirlo y compararlo) está en `lock.ts`.
 */
export const LockSchema = z
  .object({
    lock_version: z.literal(1),
    raiz: z.object({ id: z.string().min(1), version: VersionEstricta, sha256: Huella.optional() }).strict(),
    paquetes: z
      .array(
        z.object({ id: z.string().min(1), version: VersionEstricta, sha256: Huella, permisos: z.array(PermisoSchema) }).strict()
      )
      .refine((ps) => new Set(ps.map((p) => p.id)).size === ps.length, "un paquete está dos veces"),
    permisos: z.array(PermisoSchema),
  })
  .strict();

/** Un paquete en memoria: su manifiesto (sin validar) y sus ficheros. */
export interface PaqueteDatos {
  manifiesto: Record<string, unknown>;
  ficheros: Record<string, string | Uint8Array>;
}

/** Un paquete que se conoce: su manifiesto y la huella de su árbol. */
export interface PaqueteConocido {
  manifiesto: ManifiestoV2;
  sha256: string;
}

/** Lo que sale de leer un manifiesto (v1 o v2), siempre visto como v2. */
export interface LecturaPaquete {
  ok: boolean;
  /** La versión del manifiesto leído (null si ni eso se pudo leer). */
  version: 1 | 2 | null;
  paquete?: ManifiestoV2;
  errores: string[];
  avisos: string[];
}

type Issue = z.core.$ZodIssue;

/**
 * Los errores en castellano y con su camino. De una unión (un permiso
 * corto o largo; un MCP local o remoto) se cuenta la rama que entendió la
 * forma: la que llegó más hondo.
 */
function mensajes(issues: readonly Issue[], base: PropertyKey[] = []): string[] {
  const salida: string[] = [];
  for (const i of issues) {
    const camino = [...base, ...i.path];
    if (i.code === "invalid_union" && i.errors.length) {
      const nota = (r: Issue[]) =>
        Math.max(0, ...r.map((x) => x.path.length)) + (r.some((x) => x.code === "custom") ? 0.5 : 0);
      const rama = [...i.errors].sort((a, b) => nota(b) - nota(a))[0];
      salida.push(...mensajes(rama, camino));
      continue;
    }
    salida.push(camino.length ? `${camino.map(String).join(".")}: ${i.message}` : i.message);
  }
  return salida;
}

/** Lo que se avisa sin rechazar: claves y puntos que esta versión no conoce, y la red sin límite. */
function avisosDe(raw: Record<string, unknown>, m: ManifiestoV2): string[] {
  const avisos: string[] = [];
  for (const k of Object.keys(raw)) {
    if (!(CLAVES_PAQUETE as readonly string[]).includes(k)) avisos.push(`clave desconocida «${k}»: se ignora`);
  }
  const contribuciones = (raw.contributes ?? {}) as Record<string, unknown>;
  for (const [p, entradas] of Object.entries(contribuciones)) {
    if (!(p in PUNTOS)) {
      avisos.push(`el punto «${p}» no lo conoce esta versión: se ignora`);
      continue;
    }
    const claves = PUNTOS[p as Punto].claves as readonly string[];
    for (const e of Array.isArray(entradas) ? (entradas as Record<string, unknown>[]) : []) {
      for (const k of Object.keys(e)) {
        if (!claves.includes(k)) avisos.push(`contributes.${p}.${String(e.id)}: clave desconocida «${k}»: se ignora`);
      }
    }
  }
  for (const p of m.permissions) {
    if (typeof p !== "string" && p.hosts?.includes("*"))
      avisos.push("net:fetch con «*» es toda la red: si es lo que quieres, escribe «net:fetch» a secas");
  }
  for (const t of m.contributes.tools ?? []) {
    if (t.mcp && "url" in t.mcp && t.mcp.url.startsWith("http://")) {
      const host = new URL(t.mcp.url).hostname;
      if (host !== "localhost" && host !== "127.0.0.1")
        avisos.push(`tools.${t.id}: habla con ${host} por http, sin cifrar`);
    }
  }
  return avisos;
}

/**
 * Un módulo v1, visto como un paquete de una sola contribución.
 *
 * La categoría dice el punto: `memory` → memory, `theme` → themes (su
 * `piel.json`), `agent` → agents (su `agente.json`), y lo demás (tool,
 * integration, thinking) → tools, con su entry y su runtime. Las
 * `dependencies` de la v1 (`esme.core@^1.0`) piden una versión del núcleo,
 * no un paquete: no son `uses`.
 */
export function deV1(m: Manifest): ManifiestoV2 {
  const slug = m.id.split(".")[2];
  const entrada =
    m.category === "memory"
      ? { memory: [{ id: slug, entry: m.entry, runtime: m.runtime }] }
      : m.category === "theme"
        ? { themes: [{ id: slug, file: "piel.json" }] }
        : m.category === "agent"
          ? { agents: [{ id: slug, recipe: "agente.json", format: "receta" }] }
          : { tools: [{ id: slug, entry: m.entry, runtime: m.runtime }] };
  return ManifiestoV2Schema.parse({
    schema_version: 2,
    id: m.id,
    version: m.version,
    name: m.name,
    kind: "package",
    description: m.description,
    author: m.author,
    license: m.license,
    contributes: entrada,
    permissions: [...m.permissions],
    ...(m.engines ? { works_with: m.engines } : {}),
    ...(m.decision_criteria.length ? { decision_criteria: m.decision_criteria } : {}),
    ...(m.benchmarks ? { benchmarks: m.benchmarks } : {}),
    ...(m.signatures ? { signatures: m.signatures } : {}),
  });
}

/** Lee un manifiesto ya cargado (v1 o v2). La v1 se valida con su esquema de siempre. */
export function leePaquete(raw: unknown): LecturaPaquete {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, version: null, errores: ["el manifiesto no es un objeto"], avisos: [] };
  }
  const crudo = raw as Record<string, unknown>;
  if (crudo.schema_version === 1) {
    const r = validaManifiesto(crudo);
    if (!r.ok) return { ok: false, version: 1, errores: r.errores, avisos: r.avisos };
    const avisos = [...r.avisos];
    const m = r.manifest!;
    if (m.category === "theme" || m.category === "agent")
      avisos.push(`el módulo v1 de «${m.category}» trae además código (entry): en la v2, eso iría en su propio punto`);
    return { ok: true, version: 1, paquete: deV1(m), errores: [], avisos };
  }
  if (crudo.schema_version === 2) {
    const r = ManifiestoV2Schema.safeParse(crudo);
    if (!r.success) return { ok: false, version: 2, errores: mensajes(r.error.issues), avisos: [] };
    return { ok: true, version: 2, paquete: r.data, errores: [], avisos: avisosDe(crudo, r.data) };
  }
  return {
    ok: false,
    version: null,
    errores: [`schema_version: ${String(crudo.schema_version)} (se espera 1 o 2)`],
    avisos: [],
  };
}

/** Una ruta del paquete, limpia: sin `./` ni barras de más (`.` es la raíz, ""). */
const limpia = (r: string): string =>
  r
    .split("/")
    .filter((s) => s !== "" && s !== ".")
    .join("/");

/** Un fichero que el manifiesto nombra. `codigo`: existe tras construir el paquete. */
export interface RutaDePaquete {
  punto: Punto | "success";
  id: string;
  ruta: string;
  codigo: boolean;
}

/** Los ficheros que el manifiesto dice que trae (una skill local, su SKILL.md). */
export function rutasDe(m: ManifiestoV2): RutaDePaquete[] {
  const c = m.contributes;
  const rutas: RutaDePaquete[] = [];
  const pon = (punto: RutaDePaquete["punto"], id: string, ruta: string, codigo = false) =>
    rutas.push({ punto, id, ruta: limpia(ruta), codigo });
  for (const t of c.themes ?? []) pon("themes", t.id, t.file);
  for (const s of c.skills ?? []) if (s.path !== undefined) pon("skills", s.id, `${s.path}/SKILL.md`);
  for (const t of c.tools ?? []) if (t.entry) pon("tools", t.id, t.entry, true);
  for (const v of c.views ?? []) pon("views", v.id, v.entry, true);
  for (const a of c.agents ?? []) pon("agents", a.id, a.recipe);
  for (const e of c.teams ?? []) pon("teams", e.id, e.file);
  for (const x of c.memory ?? []) pon("memory", x.id, x.entry, true);
  if (m.success?.check) pon("success", "check", m.success.check);
  return rutas;
}

const NIVEL_RUNTIME: Record<(typeof RUNTIMES)[number], Nivel> = { wasm: 1, nodejs: 2, python: 3 };

/**
 * El nivel de aislamiento que pide lo que trae: el más alto de sus puntos.
 * Datos 0; WASM 1; JavaScript en la cápsula 2 (y una vista, en la suya);
 * un proceso del sistema 3 (Python, un servidor MCP local, un motor con sus
 * binarios, un agente de línea de comandos, una skill con scripts). El 4
 * (microVM) no lo pide un paquete: lo elige quien ejecuta.
 */
export function nivelDe(m: ManifiestoV2): Nivel {
  const c = m.contributes;
  const niveles: Nivel[] = [0];
  for (const t of c.tools ?? []) niveles.push(t.mcp ? ("command" in t.mcp ? 3 : 0) : NIVEL_RUNTIME[t.runtime!]);
  for (const x of c.memory ?? []) niveles.push(NIVEL_RUNTIME[x.runtime]);
  if (c.views?.length) niveles.push(2);
  if (c.skills?.some((s) => s.scripts)) niveles.push(3);
  if (c.engines?.some((e) => e.binaries?.length)) niveles.push(3);
  if (c.agents?.some((a) => a.format === "comando")) niveles.push(3);
  return Math.max(...niveles) as Nivel;
}

/**
 * Cómo se lee una ruta del paquete: su texto, null si no está, o el motivo
 * por el que no se puede leer (la capa de disco dice, por ejemplo, que un
 * enlace se sale del paquete).
 */
export type LeeRuta = (ruta: string) => string | null | { error: string };

/**
 * Lo que el manifiesto promete y los ficheros tienen que cumplir: cada ruta
 * existe (el código, si se exige: `exigirEntrada: false` es para dictaminar
 * antes de construir, y solo perdona que falte: el que ya está no puede
 * salirse del paquete) y un agente de línea de comandos pide el binario que
 * lanza.
 */
export function compruebaFicheros(m: ManifiestoV2, leer: LeeRuta, opts: { exigirEntrada?: boolean } = {}): string[] {
  const errores: string[] = [];
  for (const r of rutasDe(m)) {
    const texto = leer(r.ruta);
    // sin exigir el código, lo que perdona es que falte; el que ya está se mira igual
    if (texto === null && r.codigo && opts.exigirEntrada === false) continue;
    if (texto === null)
      errores.push(`${r.punto}.${r.id}: falta «${r.ruta}»${r.codigo ? " (¿falta construirlo?)" : ""}`);
    else if (typeof texto !== "string") errores.push(`${r.punto}.${r.id}: ${texto.error}`);
  }
  for (const a of m.contributes.agents ?? []) {
    if (a.format !== "comando") continue;
    const texto = leer(limpia(a.recipe));
    if (typeof texto !== "string") continue; // ya dicho arriba
    let comando: unknown;
    try {
      comando = (JSON.parse(texto) as { comando?: unknown }).comando;
    } catch {
      comando = undefined;
    }
    if (typeof comando !== "string" || !comando.trim()) {
      errores.push(`agents.${a.id}: «${a.recipe}» no trae un «comando» que se pueda leer`);
      continue;
    }
    const programa = programaDe(comando.trim().split(/\s+/)[0]);
    if (!permitePrograma(m.permissions, programa))
      errores.push(`agents.${a.id}: lanza «${programa}» y no lo pide (permissions: proc:spawn con programs: [${programa}])`);
  }
  return errores;
}

/** Un paquete en memoria, entero: su manifiesto y que los ficheros que nombra estén. */
export function validaPaqueteDatos(p: PaqueteDatos): LecturaPaquete {
  const r = leePaquete(p.manifiesto);
  if (!r.ok) return r;
  const leer = (ruta: string): string | null => {
    const f = p.ficheros[ruta];
    if (f === undefined) return null;
    return typeof f === "string" ? f : new TextDecoder().decode(f);
  };
  const errores = compruebaFicheros(r.paquete!, leer);
  return { ...r, ok: errores.length === 0, errores };
}
