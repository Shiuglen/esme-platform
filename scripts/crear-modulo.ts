/**
 * crear-modulo — el módulo de cualquiera, en un comando.
 *   npm run crear:modulo -- --id esme.tu.slug --nombre "Mi módulo" \
 *        [--categoria tool] [--permisos mind:read,mind:write] [--dir <ruta>]
 *
 * Qué es esto: el principio de la era. Si Esme es una plataforma abierta, la
 * primera vez que alguien llega tiene que poder hacer algo que FUNCIONE sin
 * aprender cinco cosas a la vez. Antes esto era: copiar una carpeta, editar
 * un YAML, escribir un `src/index.ts`, inventarse un bench, construirlo,
 * firmarlo… y si algo de eso se olvidaba, el módulo se quedaba fuera sin
 * saber por qué.
 *
 * Aquí se nace con todo: manifiesto válido, código que habla por la puerta,
 * prueba que pasa, y NACE JUZGADO (al final el script lo verifica de verdad:
 * lo construye, lo mide y lo juzga; si el juez lo echa, lo dice aquí, no
 * tres días después en la tienda).
 *
 * El módulo que sale es de verdad: no hay números inventados. El bench.json
 * lo escribe la MEDIDA (scripts/verificar-modulo.ts → core/bench/ciclo.ts).
 *
 * Referencia: docs/ENTRADA.md, core/ipc/module-schema.ts, estandar/module-manifest.spec.yaml.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { CATEGORIES, type Category } from "../core/ipc/module-schema.ts";
import { CAPABILITIES, type Capability } from "../core/extension-host/capability.ts";
import { verificaModulo, renderVerificacion } from "./verificar-modulo.ts";
import { cargaSpecPiel, pielBase } from "../tienda/piel.ts";

export interface OpcionesCrear {
  /** El id: `esme.<autor>.<slug>`. */
  id: string;
  /** El nombre que verá la persona. */
  nombre: string;
  /** La categoría (tool por defecto). */
  categoria?: Category;
  /** Lo que el módulo pide (por defecto: mind:read y mind:write). */
  permisos?: Capability[];
  /** Dónde se crea (por defecto: `modulos/<slug>` en el kit). */
  dir?: string;
  /** La descripción: qué hace y por qué. */
  descripcion?: string;
  /** Quién lo firma (por defecto: el autor del id). */
  autor?: string;
}

export const RE_ID_MODULO = /^esme\.[a-z0-9-]+\.[a-z0-9-]+$/;

/** El slug: la última parte del id (la carpeta del módulo). */
export const slugDe = (id: string): string => id.split(".").pop() ?? "modulo";

/**
 * Dice por qué un id no vale, o `null` si vale. El id es la identidad del
 * módulo en toda la casa: si no es único y ordenable, no entra.
 */
export function problemaDeId(id: string): string | null {
  if (!id) return "falta el id";
  if (!RE_ID_MODULO.test(id))
    return `el id debe ser esme.<autor>.<slug> en minúsculas (ejemplo: esme.tu.mi-modulo), y es «${id}»`;
  return null;
}

/** El manifiesto del módulo nuevo, en YAML (el formato que la spec fija). */
export function manifiestoDe(o: OpcionesCrear): string {
  // los permisos por defecto según lo que el módulo hace: un módulo de
  // memoria trocea (no necesita la mente) y un tema sólo se viste.
  const permisos =
    o.permisos ??
    ((o.categoria ?? "tool") === "memory" || (o.categoria ?? "tool") === "theme"
      ? []
      : ["mind:read", "mind:write"]);
  const descripcion =
    o.descripcion ??
    `${o.nombre}: un módulo de Esme que responde por la puerta y recuerda lo que la mente le dice.`;
  return `# El manifiesto de ${o.nombre}.
#
# Lo mínimo que un módulo DEBE declarar para entrar en la Tienda:
#   - un id único (esme.<autor>.<slug>);
#   - lo que pide (permissions): lo que no está aquí, no lo tiene;
#   - su examen (benchmarks): sin número medido, no hay veredicto.
#
# Referencia: estandar/module-manifest.spec.yaml, docs/ENTRADA.md.
schema_version: 1
id: "${o.id}"
name: "${o.nombre}"
version: "0.1.0"
category: "${o.categoria ?? "tool"}"
description: "${descripcion}"
author: "${o.autor ?? o.id.split(".")[1] ?? "anonimo"}"
license: "MIT"
entry: "dist/index.js"
runtime: "nodejs"
permissions:${permisos.length ? "\n" + permisos.map((p) => `  - ${p}`).join("\n") : " []"}
decision_criteria: []
dependencies:
  - "esme.core@^1.0"
sideEffects: false
benchmarks:
  recall_delta: 0.01
  report: "bench.json"
`;
}

/** El `package.json` del módulo: mínimo, y con el MISMO build que la casa. */
export function paqueteDe(o: OpcionesCrear): string {
  return JSON.stringify(
    {
      name: `@esme/${slugDe(o.id)}`,
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: {
        build: "esbuild src/index.ts --bundle --format=esm --outfile=dist/index.js",
      },
    },
    null,
    2
  ) + "\n";
}

/**
 * La piel de un módulo de tema.
 *
 * Un tema ES una piel (un documento de datos, nunca código): el módulo la
 * trae en `piel.json` y el juez la lee antes de que entre. Para partir, la
 * de la casa (Tinta y Luz): lo que no digas, se hereda.
 */
export function pielDe(base: unknown): string {
  return JSON.stringify(base, null, 2) + "\n";
}

/**
 * El código del módulo: habla POR LA PUERTA y contesta.
 *
 * Lo importante: no usa `fetch`, ni `node:fs`, ni `process.env`. No puede:
 * la cápsula los cierra (core/extension-host/sandbox.ts). Va por la puerta, y
 * la puerta decide qué pasa.
 */
/**
 * El código de un módulo de MEMORIA: trocea.
 *
 * Un módulo de memoria no contesta: decide cómo se corta la memoria. La
 * convención es una función `trocea(fuente, texto)` que devuelve los trozos.
 * El examen de la casa (core/bench/memoria.ts) la mide: si el troceo del
 * módulo hace que las respuestas quepan en el presupuesto, el recall sube.
 *
 * El ejemplo trocea por filas de tabla (que es el hallazgo de la casa): una
 * tabla como un bloque entero no entra en el presupuesto del pack, y las
 * preguntas sobre una fila concreta se quedan sin contexto.
 */
export function fuenteDeMemoria(o: OpcionesCrear): string {
  return `/**
 * ${o.nombre} — un módulo de MEMORIA de Esme.
 *
 * La convención: el módulo exporta \`trocea(fuente, texto)\` y devuelve los
 * trozos. Así el examen de la casa (core/bench/memoria.ts) lo mide sin que
 * nadie escriba un banco a mano, y el juez tiene un número con el que
 * dictaminar.
 *
 * Aquí las tablas se trocean POR FILA: una tabla entera es un bloque que no
 * cabe en el presupuesto del pack, y las preguntas sobre una fila concreta se
 * quedan sin respuesta.
 *
 * Referencia: docs/ENTRADA.md, core/bench/memoria.ts.
 */
export const MODULO_ID = "${o.id}";

export interface Trozo {
  id: string;
  fuente: string;
  texto: string;
  tokens: number;
  tipo: "apartado" | "parrafo" | "fila-tabla";
}

/** Trocea el texto: apartados, párrafos y filas de tabla. */
export function trocea(fuente: string, texto: string): Trozo[] {
  const trozos: Trozo[] = [];
  const parrafoDe = (id: string, t: string, tipo: Trozo["tipo"]): Trozo => ({
    id: \`\${fuente}:\${id}\`,
    fuente,
    texto: t,
    tokens: Math.ceil(t.length / 4),
    tipo,
  });

  let seccion = "inicio";
  let parrafo: string[] = [];
  let tabla: string[] = [];

  const cerrarParrafo = (): void => {
    const t = parrafo.join(" ").trim();
    if (t) trozos.push(parrafoDe(\`s-\${seccion}\`, t, "parrafo"));
    parrafo = [];
  };
  const cerrarTabla = (): void => {
    for (let i = 0; i < tabla.length; i++) {
      const linea = tabla[i];
      // la cabecera de la tabla no es un dato de nadie
      if (i === 0 && linea.includes("---")) continue;
      const t = linea.trim();
      if (!t) continue;
      trozos.push(parrafoDe(\`fila-\${i}\`, t, "fila-tabla"));
    }
    tabla = [];
  };

  for (const linea of texto.split("\\n")) {
    if (linea.trim().startsWith("|")) {
      cerrarParrafo();
      tabla.push(linea);
      continue;
    }
    if (tabla.length) cerrarTabla();
    if (linea.startsWith("#")) {
      cerrarParrafo();
      seccion = linea.replace(/^#+\\s*/, "").trim().toLowerCase().replace(/\\s+/g, "-");
      continue;
    }
    if (!linea.trim()) {
      cerrarParrafo();
      continue;
    }
    parrafo.push(linea.trim());
  }
  if (tabla.length) cerrarTabla();
  cerrarParrafo();
  return trozos;
}

/** Las filas de tabla: los datos sueltos, listos para indexar. */
export function filasDe(trozos: Trozo[]): Trozo[] {
  return trozos.filter((t) => t.tipo === "fila-tabla");
}
`;
}

/**
 * El código del módulo: habla POR LA PUERTA y contesta.
 *
 * Lo importante: no usa `fetch`, ni `node:fs`, ni `process.env`. No puede:
 * la cápsula los cierra (core/extension-host/sandbox.ts). Va por la puerta, y
 * la puerta decide qué pasa.
 */
export function fuenteDe(o: OpcionesCrear): string {
  return `/**
 * ${o.nombre} — un módulo de Esme.
 *
 * La convención de la puerta de entrada: el módulo exporta \`ciclo(consulta)\`
 * y devuelve lo que sabe de ella. Así se puede MEDIR sin que nadie escriba
 * un examen a mano (core/bench/ciclo.ts), y el juez tiene un número con el
 * que dictaminar.
 *
 * Lo que NO se hace aquí (y no se puede): \`fetch\`, \`node:fs\`,
 * \`process.env\`. La cápsula los cierra. Para eso está la puerta.
 *
 * Referencia: docs/MODULOS.md, docs/ENTRADA.md.
 */
export const MODULO_ID = "${o.id}";

export interface RespuestaCiclo {
  /** La respuesta corta: lo que la persona ve. */
  respuesta: string;
  /** Cuántos recuerdos trajo la mente. */
  remembered: number;
  /** Si el módulo escribió algo en la mente. */
  escribio: boolean;
}

/**
 * El ciclo: preguntar a la mente, contestarle a la persona.
 *
 * Lo que la persona conceda es lo que hay: si \`mind:read\` no está concedido,
 * la puerta ni siquiera monta la mente, y este módulo lo dice en vez de
 * fingir que consultó.
 */
export async function ciclo(consulta: string): Promise<RespuestaCiclo> {
  const puerta = globalThis.esme;
  let respuesta = "no hay puerta a la mente en este módulo";
  let remembered = 0;
  let escribio = false;

  if (puerta?.mente) {
    const r = await puerta.mente.recall({ query: consulta, budget: 400 });
    remembered = Array.isArray(r) ? r.length : 0;
    const primero = Array.isArray(r) ? r[0]?.texto : undefined;
    respuesta = primero ?? "la mente no recuerda nada de eso";
    await puerta.mente.remember({
      text: \`\${MODULO_ID} consultó: \${consulta}\`,
      kind: "note",
    });
    escribio = true;
  }

  return { respuesta, remembered, escribio };
}
`;
}

/** La prueba del módulo: lo mínimo que tiene que ser verdad. */
export function pruebaDe(o: OpcionesCrear): string {
  if ((o.categoria ?? "tool") === "memory") {
    return `import { describe, expect, it } from "vitest";
import { trocea, filasDe, MODULO_ID } from "../src/index.ts";

describe("${o.nombre}", () => {
  it("declara su id", () => {
    expect(MODULO_ID).toBe("${o.id}");
  });

  it("trocea el texto en trozos", () => {
    const t = trocea("doc", "Un párrafo.\n\n| A | B |\n|---|---|\n| 1 | 2 |");
    expect(t.length).toBeGreaterThan(1);
    expect(t.every((x) => x.texto.length > 0)).toBe(true);
  });

  it("las filas de tabla salen sueltas (el hallazgo de la casa)", () => {
    const t = trocea("doc", "| A | B |\n|---|---|\n| 1 | 2 |");
    expect(filasDe(t).length).toBe(1);
  });
});
`;
  }
  return `import { describe, expect, it } from "vitest";
import { ciclo, MODULO_ID } from "../src/index.ts";

describe("${o.nombre}", () => {
  it("declara su id", () => {
    expect(MODULO_ID).toBe("${o.id}");
  });

  it("responde aunque no tenga puerta (no finge que consultó)", async () => {
    const r = await ciclo("¿qué se decidió sobre el Taller?");
    expect(typeof r.respuesta).toBe("string");
    expect(r.respuesta.length).toBeGreaterThan(0);
  });
});
`;
}

/** El README del módulo: qué es, cómo se prueba, cómo se publica. */
export function readmeDe(o: OpcionesCrear): string {
  return `# ${o.nombre}

Módulo de Esme. Id: \`${o.id}\`.

## Qué hace

Un módulo de tipo \`${o.categoria ?? "tool"}\` que responde por la puerta y
recuerda lo que la mente le dice. Pide: ${(o.permisos ?? []).join(", ") || "nada"}.

## Cómo se comprueba

\`\`\`bash
npm run verificar:modulo -- ${o.dir ?? join("modulos", slugDe(o.id))}
\`\`\`

El verificador construye el módulo, lo mide de verdad (abre su worker, le
habla por la puerta y cuenta los tokens) y lo juzga. El \`bench.json\` que
aparece junto al manifiesto lo escribe la medida, no la mano.

## Cómo se publica

1. \`npm run verificar:modulo -- <esta-carpeta>\` — tiene que decir ENTR.
2. Abre una PR en \`tienda/\` con el paquete (\`salida/\`) y el veredicto.
3. Quien mantiene la tienda lo mete en el índice firmado.

Referencia: \`docs/ENTRADA.md\`.
`;
}

/**
 * Crea el módulo en disco y lo verifica. Devuelve lo que pasó.
 *
 * Si el módulo ya existe, no se toca: la casa no pisa el trabajo de nadie.
 */
export async function creaModulo(
  o: OpcionesCrear,
  raizKit: string
): Promise<{ dir: string; creado: boolean; veredicto: string | null }> {
  const problema = problemaDeId(o.id);
  if (problema) throw new Error(problema);
  const dir = resolve(o.dir ?? join(raizKit, "modulos", slugDe(o.id)));
  if (existsSync(dir)) {
    return { dir, creado: false, veredicto: null };
  }

  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "test"), { recursive: true });
  writeFileSync(join(dir, "module.yaml"), manifiestoDe(o));
  writeFileSync(join(dir, "package.json"), paqueteDe(o));
  writeFileSync(
    join(dir, "src", "index.ts"),
    (o.categoria ?? "tool") === "memory" ? fuenteDeMemoria(o) : fuenteDe(o)
  );
  writeFileSync(join(dir, "test", "index.test.ts"), pruebaDe(o));
  writeFileSync(join(dir, "README.md"), readmeDe({ ...o, dir: join("modulos", slugDe(o.id)) }));
  // un tema trae su piel: el documento que decide cómo se ve
  if ((o.categoria ?? "tool") === "theme") {
    const spec = cargaSpecPiel(join(raizKit, "estandar", "piel.spec.yaml"));
    writeFileSync(join(dir, "piel.json"), pielDe(pielBase(spec)));
  }

  return { dir, creado: true, veredicto: null };
}

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const raizKit = resolve(import.meta.dirname, "..");

  const id = arg("--id") ?? "";
  const nombre = arg("--nombre") ?? arg("--name") ?? "";
  if (!id || !nombre) {
    console.error(
      "uso: npm run crear:modulo -- --id esme.tu.slug --nombre \"Mi módulo\" [--categoria tool] [--permisos mind:read,mind:write] [--dir <ruta>]"
    );
    process.exit(2);
  }
  const cat = arg("--categoria");
  if (cat && !CATEGORIES.includes(cat as Category)) {
    console.error(`categoría desconocida: ${cat} (valen: ${CATEGORIES.join(", ")})`);
    process.exit(2);
  }
  // sin --permisos, cada categoría pide lo que necesita (el manifiesto lo
  // decide); con --permisos, manda quien lo dice.
  const argPermisos = arg("--permisos");
  const permisos = argPermisos
    ? argPermisos.split(",").map((p) => p.trim()).filter(Boolean)
    : [];
  for (const p of permisos) {
    if (!CAPABILITIES.includes(p as Capability)) {
      console.error(`permiso desconocido: ${p} (valen: ${CAPABILITIES.join(", ")})`);
      process.exit(2);
    }
  }

  const opcion: OpcionesCrear = {
    id,
    nombre,
    categoria: (cat as Category) ?? "tool",
    ...(argPermisos ? { permisos: permisos as Capability[] } : {}),
    dir: arg("--dir") ?? undefined,
  };

  const { dir, creado } = await creaModulo(opcion, raizKit);
  if (!creado) {
    console.error(`ya existe ${dir} — no se pisa el trabajo de nadie`);
    process.exit(1);
  }
  console.log(`módulo : ${dir}`);

  // nace juzgado: se verifica de verdad, y se dice lo que diga el juez.
  const resultado = await verificaModulo(dir);
  console.log(renderVerificacion(resultado));
  process.exit(resultado.veredicto?.entra ? 0 : 1);
}
