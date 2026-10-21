/**
 * LOS RECURSOS — las piezas con las que se construye.
 *
 * La tienda tiene tres cosas y ahora se entienden juntas:
 *
 *   - los **PRODUCTOS**: lo que la casa vende (módulos, pieles, recetas de
 *     agente) — el índice firmado;
 *   - los **DESEOS**: lo que la gente guarda y a Esme le falta — la lista
 *     firmada (la demanda);
 *   - y los **RECURSOS**: las piezas de fuera que sirven para construir lo
 *     que falta (repos, paquetes, servicios, patrones) — este catálogo.
 *
 * Lo que hace útil al catálogo no es la lista: es el **emparejamiento**. Un
 * deseo («un escritorio donde el agente ve su propia interfaz») tiene
 * recursos que lo resuelven o lo iluminan (Dot Desktop, un repositorio de
 * automatizaciones de escritorio). Sin emparejamiento, la lista es un blog.
 *
 * Y una regla de honestidad: cada recurso dice **cuánto lo hemos mirado**
 * (`probado` = corre y lo hemos medido; `mirado` = le hemos leído el
 * código; `sin-mirar` = sólo un enlace). Un catálogo que finge que se lo
 * conoce todo no sirve para decidir nada.
 *
 * Referencia: estandar/recurso.spec.yaml, core/tienda/deseos.ts.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { raizDelPaquete } from "../paquete.ts";

/** Los tipos de recurso (cerrados: un tipo nuevo es una spec nueva). */
export const TIPOS_RECURSO = ["repo", "paquete", "servicio", "patron"] as const;
export type TipoRecurso = (typeof TIPOS_RECURSO)[number];

/** Cuánto lo ha mirado la casa. */
export const VEREDICTOS_RECURSO = ["probado", "mirado", "sin-mirar"] as const;
export type VeredictoRecurso = (typeof VEREDICTOS_RECURSO)[number];

/** Un recurso. */
export interface Recurso {
  id: string;
  nombre: string;
  url: string;
  tipo: TipoRecurso;
  /** Qué resuelve (una frase). */
  para_que: string;
  etiquetas: string[];
  /** La licencia (o "desconocida": se dice lo que se sabe). */
  licencia: string;
  /** Cuánto lo ha mirado la casa. */
  veredicto: VeredictoRecurso;
}

/** El juicio del juez de recursos. */
export interface JuicioRecurso {
  ok: boolean;
  recurso: Recurso | null;
  errores: string[];
}

/**
 * Juzga un recurso.
 *
 * Lo que se comprueba: la forma, el tipo (cerrado), la URL (un recurso sin
 * URL no se puede consultar), la licencia (se puede no saber: pero entonces
 * tiene que decir «desconocida», no inventar una) y el veredicto (cuánto lo
 * hemos mirado: un catálogo honesto empieza por admit lo que no sabe).
 */
export function juzgaRecurso(x: unknown): JuicioRecurso {
  const errores: string[] = [];
  if (typeof x !== "object" || x === null || Array.isArray(x)) {
    return { ok: false, recurso: null, errores: ["un recurso es un objeto"] };
  }
  const r = x as Record<string, unknown>;

  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!/^[a-z0-9][a-z0-9._/-]{2,119}$/i.test(id)) {
    errores.push(`id: «${id}» no vale (letras, números, punto, guion y barra)`);
  }

  const nombre = typeof r.nombre === "string" ? r.nombre.trim() : "";
  if (!nombre) errores.push("nombre: falta");

  const url = typeof r.url === "string" ? r.url.trim() : "";
  if (!/^https?:\/\//.test(url)) errores.push(`url: «${url}» no es un enlace`);

  const tipo = String(r.tipo ?? "");
  if (!(TIPOS_RECURSO as readonly string[]).includes(tipo)) {
    errores.push(`tipo: «${tipo}» no es un tipo (valen: ${TIPOS_RECURSO.join(", ")})`);
  }

  const para_que = typeof r.para_que === "string" ? r.para_que.trim() : "";
  if (para_que.length < 10) errores.push("para_que: tiene que decir qué resuelve");

  const licencia = typeof r.licencia === "string" ? r.licencia.trim() : "";
  if (!licencia) errores.push("licencia: falta (o pon «desconocida», pero no la inventes)");

  const veredicto = String(r.veredicto ?? "");
  if (!(VEREDICTOS_RECURSO as readonly string[]).includes(veredicto)) {
    errores.push(`veredicto: «${veredicto}» no es un veredicto (valen: ${VEREDICTOS_RECURSO.join(", ")})`);
  }

  let etiquetas: string[] = [];
  if (r.etiquetas !== undefined) {
    if (!Array.isArray(r.etiquetas)) errores.push("etiquetas: tiene que ser una lista");
    else etiquetas = r.etiquetas.filter((e): e is string => typeof e === "string");
  }

  const recurso: Recurso = {
    id,
    nombre,
    url,
    tipo: (tipo as TipoRecurso) ?? "repo",
    para_que,
    etiquetas,
    licencia,
    veredicto: (veredicto as VeredictoRecurso) ?? "sin-mirar",
  };

  return { ok: errores.length === 0, recurso, errores };
}

/** Las palabras que sirven para emparejar (sin acentos, sin ruido). */
export function palabrasDe(texto: string): Set<string> {
  const relleno = new Set([
    "para", "por", "con", "una", "uno", "que", "como", "del", "las", "los",
    "the", "and", "with", "your", "you", "for", "from", "este", "esta", "este",
  ]);
  return new Set(
    (texto ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9áéíóúñ]+/)
      .filter((p) => p.length > 3 && !relleno.has(p))
  );
}

/** Un deseo y los recursos que lo iluminan. */
export interface Emparejamiento {
  /** El deseo. */
  deseo: string;
  /** Los recursos, del más encajado al menos. */
  recursos: Array<{ id: string; nombre: string; porque: string; puntos: number }>;
}

/**
 * Los deseos que NADA ilumina.
 *
 * Por qué esto importa más que los que sí. Un deseo con recursos es un deseo
 * que la casa ya resuelve: no dice nada nuevo. Un deseo SIN recursos es una
 * hueco: es la hoja de ruta. Y si no se dice, se pierde: la lista de deseos
 * parecería cubierta entera.
 *
 * (La misma regla que en REA: lo que no se vio también es conocimiento.)
 *
 * Y el filtro: un deseo que ya está HECHO (o descartado) no es un hueco. Se
 * hizo, o se dejó hacer: no está pendiente. Contarlo como hueco sería decir
 * «esto falta» de algo que ya está resuelto — y la hoja de ruta mentiría.
 */
export function huecosDelEmparejamiento(
  pares: Emparejamiento[],
  estados: Record<string, string> = {}
): Array<{ deseo: string; recursos: number }> {
  return pares
    .filter((p) => p.recursos.length === 0)
    .filter((p) => {
      const estado = estados[p.deseo];
      return estado !== "hecho" && estado !== "descartado";
    })
    .map((p) => ({ deseo: p.deseo, recursos: 0 }));
}

/**
 * Empareja deseos con recursos.
 *
 * El emparejamiento es de palabras (y de etiquetas): no es un modelo, es una
 * cuenta. Y explica POR QUÉ cada recurso encaja («las dos comparten “escritorio”»),
 * porque un emparejamiento sin explicación no sirve para decidir.
 */
export function empareja(
  deseos: Array<{ id: string; texto: string; etiquetas: string[] }>,
  recursos: Recurso[],
  opts: { minimo?: number } = {}
): Emparejamiento[] {
  const minimo = opts.minimo ?? 1;
  const salida: Emparejamiento[] = [];
  for (const d of deseos) {
    const delDeseo = palabrasDe(d.texto);
    const etiquetasDeseo = new Set(d.etiquetas.map((e) => e.toLowerCase()));
    const encontrados: Array<{ id: string; nombre: string; porque: string; puntos: number }> = [];
    for (const r of recursos) {
      const compartidas = [...palabrasDe(`${r.para_que} ${r.nombre}`)].filter((p) => delDeseo.has(p));
      const etiquetasComunes = r.etiquetas.map((e) => e.toLowerCase()).filter((e) => etiquetasDeseo.has(e));
      const puntos = compartidas.length + etiquetasComunes.length * 2;
      if (puntos < minimo) continue;
      const razones: string[] = [];
      if (etiquetasComunes.length) razones.push(`comparten «${etiquetasComunes.join(", ")}»`);
      if (compartidas.length) razones.push(`comparten «${compartidas.slice(0, 3).join(", ")}»`);
      encontrados.push({
        id: r.id,
        nombre: r.nombre,
        porque: razones.join("; "),
        puntos,
      });
    }
    encontrados.sort((a, b) => b.puntos - a.puntos || a.id.localeCompare(b.id));
    salida.push({ deseo: d.id, recursos: encontrados });
  }
  return salida;
}

/** ¿Existe este contrato en estandar/ (igual que los deseos)? */
export function existeContratoDeRecurso(nombre: string): boolean {
  const raiz = raizDelPaquete();
  const limpio = nombre.replace(/^estandar\//, "").replace(/\.spec\.yaml$/, "");
  return [
    join(raiz, "estandar", `${limpio}.spec.yaml`),
    join(raiz, "estandar", limpio),
  ].some((ruta) => existsSync(ruta));
}
