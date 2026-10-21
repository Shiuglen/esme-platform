/**
 * LOS DESEOS — la lista de deseos de la tienda.
 *
 * Lo que guardas en tu X (el FYP, los marcadores) es la materia prima de la
 * tienda: si algo te parece bueno, es un **deseo** — «esto le falta a Esme».
 * Y un deseo es una PROMESA que se puede cumplir: cuando alguien construye
 * el módulo que lo cumple, el deseo pasa a «hecho» y dice con cuál.
 *
 * Por qué el kit se ocupa de esto: porque la tienda es el juez, y un juez que
 * no sabe lo que la gente pide es un juez a ciegas. La lista de deseos es la
 * demanda escrita, y es lo que dice qué falta construir.
 *
 * Las reglas:
 *
 *   1. **todo deseo viene de algo** (una URL: lo que guardaste). Un deseo sin
 *      origen es una opinión, no un deseo;
 *   2. **el estado es cerrado**: nuevo, en curso, hecho, descartado;
 *   3. **«hecho» dice con qué se cumplió** — un módulo de la tienda o un
 *      contrato de la casa — y tiene que existir (si no, el deseo está
 *      mintiendo);
 *   4. y un deseo hecho **no se borra**: se queda, con su módulo (es la
 *      historia de lo que la casa construyó).
 *
 * Referencia: estandar/deseo.spec.yaml, docs/TIENDA.md.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * ¿Existe ese contrato en estandar/?
 *
 * El nombre puede venir con o sin el prefijo (`estandar/`), y el fichero tiene
 * que estar de verdad: un deseo no se cumple con un contrato que nadie
 * escribió.
 */
export function existeContrato(nombre: string): boolean {
  const raiz = resolve(import.meta.dirname, "..", "..");
  const limpio = nombre.replace(/^estandar\//, "").replace(/\.spec\.yaml$/, "");
  const candidatos = [
    join(raiz, "estandar", `${limpio}.spec.yaml`),
    join(raiz, "estandar", limpio),
  ];
  return candidatos.some((ruta) => existsSync(ruta));
}

/** Los estados de un deseo (cerrados). */
export const ESTADOS_DESEO = ["nuevo", "en_curso", "hecho", "descartado"] as const;
export type EstadoDeseo = (typeof ESTADOS_DESEO)[number];

/** Un deseo. */
export interface Deseo {
  /** El id estable. */
  id: string;
  /** De dónde sale (la URL de lo que guardaste). */
  url: string;
  /** Quién lo guardó (el alias del sitio: @usuario). */
  autor: string;
  /** Lo que se pide, en una frase. */
  texto: string;
  /** Las etiquetas (para buscarlo). */
  etiquetas: string[];
  /** El estado. */
  estado: EstadoDeseo;
  /** Si está hecho: el módulo que lo cumplió. */
  modulo?: string;
  /**
   * Si está hecho: el CONTRATO que lo cumplió (una spec de estandar/).
   *
   * Porque no todo lo que cumple un deseo es un módulo: una piel es un
   * documento, un agente es una receta, y hay veces que lo que hace falta es
   * un contrato (la forma de algo). Los dos caminos son reales, y los dos se
   * comprueban.
   */
  contrato?: string;
  /** Cuándo (epoch ms). */
  ts: number;
}

/** El veredicto del juez de deseos. */
export interface VeredictoDeseo {
  ok: boolean;
  /** El deseo (completo). */
  deseo: Deseo | null;
  /** Los errores. */
  errores: string[];
}

/**
 * Juzga un deseo.
 *
 * `modulosPublicados` es lo que hay en la tienda: si un deseo dice estar
 * hecho con un módulo que no está, es mentira (y se dice).
 */
export function juzgaDeseo(x: unknown, modulosPublicados: string[] = []): VeredictoDeseo {
  const errores: string[] = [];
  if (typeof x !== "object" || x === null || Array.isArray(x)) {
    return { ok: false, deseo: null, errores: ["un deseo es un objeto"] };
  }
  const r = x as Record<string, unknown>;

  const id = typeof r.id === "string" ? r.id : "";
  if (!id) errores.push("id: falta");

  // 1. todo deseo viene de algo
  const url = typeof r.url === "string" ? r.url.trim() : "";
  if (!url || !/^https?:\/\//.test(url)) {
    errores.push(`url: «${url}» no es un enlace (un deseo viene de algo que guardaste)`);
  }

  const autor = typeof r.autor === "string" ? r.autor.trim() : "";
  if (!autor) errores.push("autor: falta (quién lo guardó)");

  const texto = typeof r.texto === "string" ? r.texto.trim() : "";
  if (texto.length < 10) {
    errores.push("texto: tiene que decir qué falta (mínimo 10 letras)");
  }

  // 2. el estado es cerrado
  const estado = String(r.estado ?? "nuevo");
  if (!(ESTADOS_DESEO as readonly string[]).includes(estado)) {
    errores.push(`estado: «${estado}» no es un estado (valen: ${ESTADOS_DESEO.join(", ")})`);
  }

  let etiquetas: string[] = [];
  if (r.etiquetas !== undefined) {
    if (!Array.isArray(r.etiquetas)) errores.push("etiquetas: tiene que ser una lista");
    else etiquetas = r.etiquetas.filter((e): e is string => typeof e === "string");
  }

  // 3. «hecho» dice con qué se cumplió: un módulo de la tienda o un
  //    contrato de la casa. Y tiene que EXISTIR: un deseo que dice estar
  //    hecho sin decir con qué, miente.
  let modulo: string | undefined;
  let contrato: string | undefined;
  if (estado === "hecho") {
    modulo = typeof r.modulo === "string" ? r.modulo.trim() : "";
    contrato = typeof r.contrato === "string" ? r.contrato.trim() : "";
    if (!modulo && !contrato) {
      errores.push(
        "modulo: un deseo hecho tiene que decir con qué se cumplió (un módulo de la tienda o un contrato de la casa)"
      );
    }
    if (modulo && modulosPublicados.length && !modulosPublicados.includes(modulo)) {
      errores.push(`modulo: «${modulo}» no está en la tienda (el deseo dice estar hecho y no lo está)`);
    }
    if (contrato && !existeContrato(contrato)) {
      errores.push(`contrato: «${contrato}» no existe en estandar/`);
    }
  }

  const ts = Number(r.ts);
  if (!Number.isFinite(ts) || ts <= 0) errores.push("ts: falta (cuándo)");

  const deseo: Deseo = {
    id,
    url,
    autor,
    texto: texto.slice(0, 300),
    etiquetas,
    estado: (estado as EstadoDeseo) ?? "nuevo",
    ...(modulo ? { modulo } : {}),
    ...(contrato ? { contrato } : {}),
    ts: Number.isFinite(ts) ? Math.floor(ts) : 0,
  };

  return { ok: errores.length === 0, deseo, errores };
}

/**
 * Juzga una lista de deseos (la lista entera de la tienda).
 *
 * Y una regla más: un deseo HECHO no se borra (se queda, con su módulo: es la
 * historia de lo que la casa construyó).
 */
export function juzgaDeseos(
  lista: unknown,
  modulosPublicados: string[] = []
): { ok: boolean; deseos: Deseo[]; errores: string[] } {
  if (!Array.isArray(lista)) {
    return { ok: false, deseos: [], errores: ["la lista de deseos es una lista"] };
  }
  const deseos: Deseo[] = [];
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (const [i, x] of lista.entries()) {
    const v = juzgaDeseo(x, modulosPublicados);
    if (!v.ok) {
      errores.push(`deseo ${i}: ${v.errores.join("; ")}`);
      continue;
    }
    const d = v.deseo!;
    if (vistos.has(d.id)) {
      errores.push(`deseo ${i}: el id «${d.id}» está repetido`);
      continue;
    }
    vistos.add(d.id);
    deseos.push(d);
  }
  return { ok: errores.length === 0, deseos, errores };
}

/**
 * Lo que la tienda está pidiendo (la demanda escrita).
 *
 * Sirve para una cosa muy concreta: saber qué falta construir. Los deseos
 * «en curso» y «nuevo», agrupados por etiqueta.
 */
export function demanda(deseos: Deseo[]): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const d of deseos) {
    if (d.estado !== "nuevo" && d.estado !== "en_curso") continue;
    for (const e of d.etiquetas.length ? d.etiquetas : ["sin-etiqueta"]) {
      cuenta[e] = (cuenta[e] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(cuenta).sort((a, b) => b[1] - a[1]));
}
