/**
 * LA PIEL — el tema de Esme es un documento, y la tienda lo juzga.
 *
 * Una piel decide todo lo que se ve: color, letra, forma, densidad, movimiento
 * y fondo. La ventana la viste; aquí la **juzga**: una piel que trae una
 * opción que no existe, o que no se lee, no entra en la tienda.
 *
 * Por qué el kit juzga pieles si la ventana las vestía: porque el juez tiene
 * que estar ANTES de la puerta. Si la validación vive en la ventana, quien
 * publica una piel inválida se entera cuando alguien la viste — y para
 * entonces ya está en la tienda de todos.
 *
 * Lo que esta regla NO es: un catálogo genérico de skins. Una piel puede ser
 * libre (sus colores, su letra); lo que no puede es romper la lectura. La
 * estética es el producto: por eso hay un juez, y por eso el juez tiene
 * reglas escritas (estandar/piel.spec.yaml).
 *
 * Referencia: estandar/piel.spec.yaml, docs/ARQUITECTURA.md §12,
 * app/src/renderer/tinta/piel.ts (la casa).
 */
import * as yaml from "js-yaml";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { raizDelPaquete } from "../core/paquete.ts";

/** La spec de la piel (las opciones y la base). */
export interface SpecPiel {
  opciones: {
    letras: string[];
    estilos: string[];
    sombras: string[];
    densidades: string[];
    movimientos: string[];
    fondos: string[];
    navegaciones: string[];
    portadas: string[];
    presencias: string[];
    caracteres: string[];
    escenas: string[];
  };
  piezas: Record<string, string[]>;
  reglas: { legibilidad: { minimo: number; pares: string[][]; modos: string[] } };
  base: Piel;
}

/** Una piel (la forma que declara la spec). */
export interface Piel {
  version: number;
  nombre: string;
  color:
    | { tipo: "estilo"; estilo: string }
    | { tipo: "gustos"; gustos: { tono: number; papel: number; fuerza: number } }
    | {
        tipo: "libre";
        noche: Base;
        dia: Base;
      };
  letra: { titulos: string; texto: string; escala: number };
  forma: { radio: number; sombra: string };
  densidad: string;
  movimiento: string;
  caracter: string;
  fondo: string;
  navegacion: string;
  portada: string;
  escena: string;
  presencia: string;
  piezas: Record<string, string>;
}

/** Los cuatro colores de un modo, más los tres de aviso. */
export interface Base {
  fondo: string;
  superficie: string;
  texto: string;
  acento: string;
  atencion?: string;
  peligro?: string;
  exito?: string;
}

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Un número dentro de su rango (si no es un número, el de la base). */
const limita = (v: unknown, a: number, b: number, defecto: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : defecto;

/** El color en rgb (0-255). */
export function aRgb(color: string): number[] {
  const c = color.trim().replace("#", "");
  const f =
    c.length === 3
      ? c
          .split("")
          .map((x) => x + x)
          .join("")
      : c;
  if (!/^[0-9a-fA-F]{6}$/.test(f)) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
}

/** La luminancia relativa (WCAG). */
export function lum(c: string): number {
  const [r, g, b] = aRgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** El contraste entre dos colores (1 a 21). */
export function contraste(a: string, b: string): number {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

let specCacheada: SpecPiel | null = null;

/** La spec de la piel, leída del fichero (la verdad es el fichero, no el código). */
export function cargaSpecPiel(ruta: string): SpecPiel {
  if (specCacheada && ruta.endsWith("piel.spec.yaml")) return specCacheada;
  const crudo = yaml.load(readFileSync(ruta, "utf8")) as SpecPiel;
  if (!specCacheada && ruta.endsWith("piel.spec.yaml")) specCacheada = crudo;
  return crudo;
}

/** La base (Tinta y Luz): de aquí sale lo que una piel no dice. */
export function pielBase(spec: SpecPiel): Piel {
  return structuredClone(spec.base);
}

/**
 * EL JUEZ DE LA PIEL — ¿esta piel puede entrar en la tienda?
 *
 * El guard de la identidad. La arquitectura (§12) dice que «la estética ES el
 * producto, no skinneable», y el mecanismo que lo protege es un juez: una
 * piel que trae una opción que no existe, o que no se lee, no entra.
 *
 * Lo que comprueba (todo lo que dice estandar/piel.spec.yaml):
 *
 *   1. la FORMA: los campos son los que la spec dice, y las opciones están
 *      en la lista cerrada (una piel no inventa: «aproximar» no es una opción);
 *   2. la LECTURA: el texto contrasta con el fondo y con la superficie, de
 *      día y de noche (WCAG AA). Una piel que nadie lee no es una piel;
 *   3. lo que falta se hereda de la base (Tinta y Luz) — por eso una piel
 *      puede ser sólo un color.
 *
 * POR QUÉ VIVE AQUÍ Y NO EN `scripts/`: porque el juez de una piel es del
 * que la piel habla — y el módulo que trae una piel lo verifica al entrar.
 * Un tercero que publica su módulo desde el kit instalado tiene que poder
 * ser juzgado por las mismas reglas que la casa.
 *
 * Referencia: estandar/piel.spec.yaml, docs/TIENDA.md.
 */
export interface ResultadoPiel {
  /** ¿La piel es válida? */
  ok: boolean;
  /** Los errores (qué arreglar). */
  errores: string[];
  /** La piel completa (con lo heredado de la base). */
  piel: unknown;
  /** La ruta de la spec usada. */
  spec: string;
}

/** La spec de la piel (la de la casa, si no se dice otra). */
export function specDe(ruta?: string): SpecPiel {
  return cargaSpecPiel(ruta ?? join(raizDelPaquete(), "estandar", "piel.spec.yaml"));
}

/** Juzga una piel (el objeto ya leído). */
export function juzgaPiel(x: unknown, spec?: SpecPiel): ResultadoPiel {
  const s = spec ?? specDe();
  const { piel, errores } = validaPiel(x, s);
  return { ok: errores.length === 0, errores, piel, spec: "estandar/piel.spec.yaml" };
}

/**
 * Juzga la piel de un MÓDULO.
 *
 * Un módulo de categoría `theme` tiene que traer su piel (`piel.json`): sin
 * ella, el tema no es un tema (es una promesa).
 */
export function juzgaPielDeModulo(
  dirModulo: string,
  categoria: string,
  spec?: SpecPiel
): ResultadoPiel {
  const dir = resolve(dirModulo);
  if (categoria !== "theme") {
    return { ok: true, errores: [], piel: null, spec: "estandar/piel.spec.yaml" };
  }
  const ruta = join(dir, "piel.json");
  if (!existsSync(ruta)) {
    return {
      ok: false,
      errores: ["es un módulo de tema y no trae piel.json (la piel es un documento, no una promesa)"],
      piel: null,
      spec: "estandar/piel.spec.yaml",
    };
  }
  try {
    return juzgaPiel(JSON.parse(readFileSync(ruta, "utf8")), spec);
  } catch (e) {
    return {
      ok: false,
      errores: [`la piel no se puede leer: ${String((e as Error)?.message || e)}`],
      piel: null,
      spec: "estandar/piel.spec.yaml",
    };
  }
}

/**
 * Valida una piel: la completa con la base y dice qué está mal.
 *
 * Devuelve la piel COMPLETA (así quien publica sabe exactamente lo que va a
 * salir) y los errores (así quien publica sabe qué arreglar).
 */
export function validaPiel(
  x: unknown,
  spec: SpecPiel
): { ok: boolean; piel: Piel; errores: string[] } {
  const errores: string[] = [];
  const p = pielBase(spec);
  if (!objeto(x)) return { ok: false, piel: p, errores: ["una piel es un objeto"] };

  if (x.nombre !== undefined) p.nombre = String(x.nombre).slice(0, 60) || p.nombre;

  if (x.color !== undefined) {
    const c = x.color;
    if (!objeto(c)) errores.push("color: no es un objeto");
    else if (c.tipo === "estilo") {
      if (typeof c.estilo === "string" && spec.opciones.estilos.includes(c.estilo)) {
        p.color = { tipo: "estilo", estilo: c.estilo };
      } else {
        errores.push(`color.estilo: «${String(c.estilo)}» no es un estilo de Esme`);
      }
    } else if (c.tipo === "gustos") {
      const g = objeto(c.gustos) ? c.gustos : {};
      p.color = {
        tipo: "gustos",
        gustos: {
          tono: limita(g.tono, 0, 360, 165),
          papel: limita(g.papel, 0, 100, 30),
          fuerza: limita(g.fuerza, 0, 100, 70),
        },
      };
    } else if (c.tipo === "libre") {
      const noche = validaBase(c.noche, "noche", errores);
      const dia = validaBase(c.dia, "dia", errores);
      if (noche && dia) p.color = { tipo: "libre", noche, dia };
    } else {
      errores.push("color: tipo desconocido");
    }
  }

  if (x.letra !== undefined) {
    const l = objeto(x.letra) ? x.letra : {};
    for (const k of ["titulos", "texto"] as const) {
      if (l[k] === undefined) continue;
      if (typeof l[k] === "string" && spec.opciones.letras.includes(l[k])) {
        p.letra[k] = l[k] as string;
      } else {
        errores.push(`letra.${k}: «${String(l[k])}» no es una letra de Esme`);
      }
    }
    p.letra.escala = limita(l.escala, 0.85, 1.2, p.letra.escala);
  }

  if (x.forma !== undefined) {
    const f = objeto(x.forma) ? x.forma : {};
    p.forma.radio = limita(f.radio, 0, 2.5, p.forma.radio);
    if (f.sombra !== undefined) {
      if (spec.opciones.sombras.includes(String(f.sombra))) p.forma.sombra = String(f.sombra);
      else errores.push("forma.sombra: desconocida");
    }
  }

  const enumera = (k: keyof Piel, lista: string[]): void => {
    const v = (x as Record<string, unknown>)[k as string];
    if (v === undefined) return;
    if (lista.includes(String(v))) (p as unknown as Record<string, unknown>)[k as string] = v;
    else errores.push(`${k}: «${String(v)}» no es una opción`);
  };
  enumera("densidad", spec.opciones.densidades);
  enumera("movimiento", spec.opciones.movimientos);
  enumera("fondo", spec.opciones.fondos);
  enumera("navegacion", spec.opciones.navegaciones);
  enumera("caracter", spec.opciones.caracteres);
  enumera("portada", spec.opciones.portadas);
  enumera("escena", spec.opciones.escenas);
  enumera("presencia", spec.opciones.presencias);

  // las piezas: lo que no existe no se inventa
  const piezas = { ...p.piezas };
  if (x.piezas !== undefined) {
    if (!objeto(x.piezas)) errores.push("piezas: tiene que ser un objeto");
    else {
      for (const [k, v] of Object.entries(x.piezas)) {
        const variantes = spec.piezas[k];
        if (!variantes) {
          errores.push(`piezas.${k}: no es un hueco`);
          continue;
        }
        if (typeof v === "string" && variantes.includes(v)) piezas[k] = v;
        else errores.push(`piezas.${k}: «${String(v)}» no es una variante`);
      }
    }
  }
  p.piezas = piezas;

  // la regla que no se negocia: se tiene que LEER
  if (p.color.tipo === "libre") {
    const min = spec.reglas.legibilidad.minimo;
    for (const modo of spec.reglas.legibilidad.modos) {
      const base = p.color[modo as "noche" | "dia"];
      if (!base) continue;
      for (const [a, b] of spec.reglas.legibilidad.pares) {
        const ca = a === "texto" ? base.texto : base[a as keyof Base];
        const cb = b === "fondo" ? base.fondo : base[b as keyof Base];
        if (typeof ca !== "string" || typeof cb !== "string") continue;
        const k = contraste(ca, cb);
        if (k < min) {
          errores.push(
            `no se lee (${modo}): ${a} sobre ${b} contrasta ${k.toFixed(2)} y hace falta ${min}`
          );
        }
      }
    }
  }

  return { ok: errores.length === 0, piel: p, errores };
}

/** Los cuatro colores (y los de aviso) de un modo. */
function validaBase(x: unknown, modo: string, errores: string[]): Base | null {
  if (!objeto(x)) {
    errores.push(`color.${modo}: no es un objeto`);
    return null;
  }
  const REQUIRED = ["fondo", "superficie", "texto", "acento"] as const;
  const base: Record<string, string> = {};
  let ok = true;
  for (const k of REQUIRED) {
    const v = x[k];
    if (typeof v !== "string" || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim())) {
      errores.push(`color.${modo}.${k}: no es un color (#hex)`);
      ok = false;
      continue;
    }
    base[k] = v.trim();
  }
  for (const k of ["atencion", "peligro", "exito"] as const) {
    const v = x[k];
    if (v === undefined) continue;
    if (typeof v !== "string" || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim())) {
      errores.push(`color.${modo}.${k}: no es un color (#hex)`);
      ok = false;
      continue;
    }
    base[k] = v.trim();
  }
  return ok ? (base as unknown as Base) : null;
}
