/**
 * LA MEDIDA DE LA MEMORIA — un módulo de memoria cualquiera, el mismo examen.
 *
 * La puerta de entrada mide el ciclo de los módulos de herramienta (core/bench/ciclo.ts).
 * Los de memoria son otra cosa: un módulo de memoria no «contesta», **trocea**
 * (o recupera, o ordena): decide cómo se corta la memoria, y de eso depende
 * que el pack del Tálamo quepa en el presupuesto y que la pregunta encuentre
 * su respuesta.
 *
 * El examen es el mismo de la casa (core/bench/examen-real.ts): un documento
 * con una tabla y unas preguntas, y dos mundos:
 *
 *   - **base**: la tabla como un trozo grande (el troceo de la pobre). El
 *     presupuesto no la deja entrar, así que las preguntas sobre una fila se
 *     quedan sin respuesta;
 *   - **con**: el módulo trocea, y cada fila cabe.
 *
 * Y aquí está lo que hace falta para un módulo de TERCEROS: el oro se
 * define por el TEXTO de la respuesta, no por su identificador. Un módulo
 * ajeno trocea con sus propios ids, así que un oro por id no valdría para
 * nadie: el oro es «la fila que responde», y un trozo acierta si la lleva
 * dentro.
 *
 * La convención: el módulo exporta una función que trocea — `trocea(fuente,
 * texto)` (la casa la llama `troceaConFilas`, que es lo mismo).
 *
 * Referencia: core/bench/ciclo.ts, core/bench/examen-real.ts,
 * core/bench/runner.ts, docs/ENTRADA.md.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { abreHost } from "../extension-host/host.ts";
import { confinaEntrada } from "../modulos/rutas.ts";
import type { Manifest } from "../ipc/module-schema.ts";
import type { InformeModulo } from "../modulos/veredicto.ts";
import { conScoreDeCaso, puntua, type Candidato, type Caso } from "./examen.ts";
import { armaRecuperador } from "./recuperador.ts";
import { DOC, PREGUNTAS } from "./examen-real.ts";
import { trocea } from "../mind/troceo.ts";

/** Los nombres que se aceptan para la función que trocea (la convención y la de la casa). */
export const FN_TROCEA = ["trocea", "troceaConFilas"];

/** Un trozo tal y como lo devuelve un módulo. */
export interface TrozoM {
  id?: string;
  fuente?: string;
  texto: string;
  tokens?: number;
  tipo?: string;
}

/** El examen: el documento y las preguntas con su respuesta (el TEXTO del oro). */
export interface ExamenMemoria {
  /** El documento que se trocea. */
  doc: string;
  /** Las preguntas, con el texto que las responde. */
  casos: Array<{ id: string; pregunta: string; oro: string }>;
}

/**
 * El examen del mundo base y del mundo con módulo.
 *
 * El documento y las preguntas son los de la casa (core/bench/examen-real.ts);
 * aquí el oro se lleva a TEXTO, que es lo que permite medir a un módulo ajeno.
 */
export function examenMemoria(): ExamenMemoria {
  const doc = DOC;
  const trozos = trocea("doc", doc);
  const parrafos = trozos.filter((t) => t.tipo === "parrafo");
  const filas = trozos.filter((t) => t.tipo === "fila-tabla" && !t.texto.startsWith("| Área"));
  const casos = PREGUNTAS.map((p) => ({
    id: p.id,
    pregunta: p.pregunta,
    oro:
      p.oroEnFila >= 0
        ? filas[p.oroEnFila]?.texto ?? ""
        : parrafos[p.oroParr]?.texto ?? "",
  }));
  return { doc, casos };
}

/** Normaliza un texto para comparar (espacios y mayúsculas). */
export function normaliza(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

/** ¿Un trozo lleva dentro la respuesta? (el oro es texto, no id) */
export function llevaOro(textoTrozo: string, oro: string): boolean {
  const a = normaliza(textoTrozo);
  const b = normaliza(oro);
  if (!b) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * El recall de un mundo: las preguntas cuya respuesta se puede traer dentro
 * del presupuesto.
 *
 * El presupuesto es el mismo de la casa (k=2, 60 tokens): el Tálamo real
 * (context-packager) elige, no este fichero.
 */
export function recallPorTexto(
  candidatos: Candidato[],
  casos: Array<{ id: string; pregunta: string; oro: string }>,
  opts: { k?: number; budget?: number } = {}
): { recall: number; tokens: number } {
  const k = opts.k ?? 2;
  const budget = opts.budget ?? 60;
  let aciertos = 0;
  let tokens = 0;
  for (const caso of casos) {
    const conScore = conScoreDeCaso(candidatos, { id: caso.id, pregunta: caso.pregunta, oro: [caso.oro] } as Caso);
    const ids = armaRecuperador(conScore)(caso.pregunta, k, budget);
    const traidos = ids
      .map((id) => conScore.find((c) => c.id === id))
      .filter((c): c is Candidato => Boolean(c));
    const lleva = traidos.some((c) => llevaOro(c.texto, caso.oro));
    if (lleva) aciertos++;
    tokens += traidos.reduce((n, c) => n + c.tokens, 0);
  }
  const n = casos.length || 1;
  return { recall: aciertos / n, tokens: tokens / n };
}

/** El mundo base: los apartados y la tabla ENTERA (el troceo de la pobre). */
export function candidatosBaseMemoria(examen: ExamenMemoria, trocea: (f: string, t: string) => TrozoM[]): Candidato[] {
  const trozos = trocea("doc", examen.doc);
  const apartados = trozos.filter((t) => t.tipo === "parrafo");
  const filas = trozos.filter((t) => t.tipo === "fila-tabla");
  return puntua([
    ...apartados.map((t) => ({ id: t.id ?? "", texto: t.texto })),
    { id: "doc:tablas-entera", texto: filas.map((f) => f.texto).join("\n") },
  ]);
}

/** El mundo con módulo: los trozos que hace el módulo. */
export function candidatosConMemoria(trozos: TrozoM[]): Candidato[] {
  return puntua(trozos.map((t, i) => ({ id: t.id ?? `trozo-${i}`, texto: t.texto })));
}

export interface OpcionesMemoria {
  /** La función que trocea (si no, se busca la de la convención). */
  fn?: string;
  /** El examen (si no, el de la casa). */
  examen?: ExamenMemoria;
  /** El troceo del núcleo (el mundo base). */
  troceaNucleo?: (f: string, t: string) => TrozoM[];
}

export interface MedidaMemoria {
  /** El informe (forma memoria). */
  informe: InformeModulo;
  /** Las capacidades que el módulo tocó. */
  usadas: string[];
  /** Por qué falló, si falló. */
  error?: string;
}

/**
 * Mide un módulo de memoria: lo abre, le hace trocear el documento del
 * examen y compara su mundo con el mundo base.
 */
export async function mideMemoriaModulo(
  dirModulo: string,
  manifiesto: Manifest,
  opts: OpcionesMemoria = {}
): Promise<MedidaMemoria> {
  const examen = opts.examen ?? examenMemoria();
  if (!examen || !examen.casos.length) {
    return {
      informe: {
        modulo: manifiesto.id,
        version: manifiesto.version,
        fecha: new Date().toISOString().slice(0, 10),
        casos: 0,
        recall_base: 0,
        recall_con: 0,
        tokens_base: 0,
        tokens_con: 0,
        semilla: 0,
      },
      usadas: [],
      error: "no hay examen con el que medir",
    };
  }

  const entrada = confinaEntrada(dirModulo, manifiesto.entry);
  if ("error" in entrada) {
    return {
      informe: {
        modulo: manifiesto.id,
        version: manifiesto.version,
        fecha: new Date().toISOString().slice(0, 10),
        casos: 0,
        recall_base: 0,
        recall_con: 0,
        tokens_base: 0,
        tokens_con: 0,
        semilla: 0,
      },
      usadas: [],
      error: entrada.error,
    };
  }

  const host = abreHost(entrada.ruta, {
    permisos: manifiesto.permissions,
    concedidas: manifiesto.permissions,
    id: manifiesto.id,
    version: manifiesto.version,
  });

  // qué función trocea: la que se dice, o la primera de la convención
  let fn = opts.fn ?? "";
  if (!fn) {
    for (const nombre of FN_TROCEA) {
      try {
        await host.call(nombre, "doc", ""); // ¿existe?
        fn = nombre;
        break;
      } catch {
        // no es esa: la siguiente
      }
    }
  }
  if (!fn) {
    await host.cerrar();
    return {
      informe: {
        modulo: manifiesto.id,
        version: manifiesto.version,
        fecha: new Date().toISOString().slice(0, 10),
        casos: 0,
        recall_base: 0,
        recall_con: 0,
        tokens_base: 0,
        tokens_con: 0,
        semilla: 0,
      },
      usadas: [],
      error: `el módulo no exporta ninguna función de troceo (${FN_TROCEA.join(" o ")})`,
    };
  }

  let trozos: TrozoM[] = [];
  let error: string | undefined;
  try {
    const r = (await host.call(fn, "doc", examen.doc)) as TrozoM[];
    trozos = Array.isArray(r) ? r : [];
    if (!trozos.length) error = "el módulo no devolvió trozos";
  } catch (e) {
    error = String((e as Error)?.message || e);
  }
  const usadas = host.usadas();
  await host.cerrar();

  const troceaNucleo = opts.troceaNucleo ?? ((f: string, t: string) => trocea(f, t));
  const base = candidatosBaseMemoria(examen, troceaNucleo);
  const con = candidatosConMemoria(trozos);
  const rBase = recallPorTexto(base, examen.casos);
  const rCon = recallPorTexto(con, examen.casos);

  return {
    informe: {
      modulo: manifiesto.id,
      version: manifiesto.version,
      fecha: new Date().toISOString().slice(0, 10),
      casos: examen.casos.length,
      recall_base: rBase.recall,
      recall_con: rCon.recall,
      tokens_base: rBase.tokens,
      tokens_con: rCon.tokens,
      semilla: 0,
    },
    usadas,
    error,
  };
}
