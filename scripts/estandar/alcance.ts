/**
 * EL ALCANCE DE LAS PRUEBAS — ¿hay código que nadie prueba?
 *
 * Qué es esto. El kit tiene una regla que se viola sola: se escribe un
 * fichero nuevo (los validadores de REA, por ejemplo) y nadie lo testea. El
 * código funciona, el `tsc` pasa, y nadie se entera hasta que el fichero hace
 * algo raro. Es la forma más común de que un fallo se esconda: no donde se
 * escribe, sino donde nadie mira.
 *
 * Por qué este fichero existe. Para que eso sea IMPOSIBLE de dejar pasar. Se
 * recorre el grafo de imports desde `tests/` y se mira qué ficheros del
 * núcleo quedan fuera: un fichero que ninguna prueba alcanza es un fichero
 * que nadie prueba, y aquí se dice con su nombre.
 *
 * Lo que NO hace. No mide cobertura de líneas (eso mide quién las ejecuta;
 * esto mide quién PUEDE ejecutarlas). No juzga la calidad de una prueba. Lo
 * que hace es una cosa sola y simple: que no exista código del núcleo fuera
 * del alcance de las pruebas. Como la conformidad de las specs, pero del
 * lado del código: «la spec y el código son la misma cosa» se convierte en
 * «el código y las pruebas son la misma cosa».
 *
 * Referencia: scripts/estandar/conformidad.ts, tests/alcance.test.ts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

/** Las carpetas que son el núcleo del kit (lo que tiene que estar probado). */
export const CARPETAS_NUCLEO = ["core", "tienda", "motores"];

/** La carpeta de las pruebas. */
export const CARPETA_PRUEBAS = "tests";

/**
 * Las excepciones: los ficheros del núcleo que ninguna prueba alcanza.
 *
 * Vive AQUÍ, y no en el test, porque la usan dos: el test y el lint de specs.
 * Una excepción sin motivo (o en dos sitios) es un olvido con papel de regla.
 */
export const EXCEPCIONES_ALCANCE: Record<string, string> = {
  // Habla con el cerebro real de Python: necesita la mente viva y sus
  // embeddings. Se prueba con `npm run prueba0:real` (que levanta el cerebro
  // sobre una COPIA de la mente), no con vitest.
  "core/bench/cerebro.ts": "necesita el cerebro real de Python (npm run prueba0:real)",
};

/** Los ficheros que se ignoran al recorrer (los generados, los ajenos). */
const IGNORADOS = new Set(["node_modules", "dist", ".git", "fixtures"]);

/**
 * Los ficheros de una carpeta, recursivamente (los `.ts`).
 *
 * Por qué se ignoran `dist` y `node_modules`: no son código del kit, son lo
 * que sale de compilarlo. Contarlos sería medir el eco, no el ruido.
 */
export function ficherosDe(raiz: string, carpeta: string): string[] {
  const salida: string[] = [];
  const base = join(raiz, carpeta);
  let entradas: string[];
  try {
    entradas = readdirSync(base);
  } catch {
    return salida;
  }
  for (const e of entradas) {
    if (IGNORADOS.has(e)) continue;
    const ruta = join(base, e);
    let st;
    try {
      st = statSync(ruta);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      salida.push(...ficherosDe(raiz, join(carpeta, e)));
    } else if (e.endsWith(".ts")) {
      salida.push(ruta);
    }
  }
  return salida.sort();
}

/**
 * Los imports RELATIVOS de un fichero (los de fuera no son nuestros).
 *
 * Se leen tres formas porque las tres existen en el repo: `import … from`,
 * `export … from` (la reexportación) y `import("…")` (el import dinámico).
 */
export function importsRelativos(fichero: string): string[] {
  let texto: string;
  try {
    texto = readFileSync(fichero, "utf8");
  } catch {
    return [];
  }
  const encontrados = new Set<string>();
  const patrones = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patrones) {
    for (const m of texto.matchAll(re)) {
      const s = m[1] as string;
      if (s.startsWith(".")) encontrados.add(s);
    }
  }
  return [...encontrados];
}

/** Resuelve un import relativo a un fichero real del repo (o null). */
export function resuelveImport(desde: string, spec: string): string | null {
  const base = resolve(dirname(desde), spec);
  const candidatas = [
    base,
    `${base}.ts`,
    `${base}.js`,
    join(base, "index.ts"),
    join(base, "index.js"),
  ];
  for (const c of candidatas) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // no existe: la siguiente
    }
  }
  return null;
}

/**
 * Los ficheros que se alcanzan desde unas entradas, siguiendo los imports.
 *
 * El grafo es transitivo: si una prueba llega a `a.ts`, y `a.ts` llega a
 * `b.ts`, entonces `b.ts` está probado (aunque nadie lo nombre).
 */
export function alcanzablesDesde(raiz: string, entradas: string[]): Set<string> {
  const vistos = new Set<string>();
  const cola = [...entradas];
  while (cola.length) {
    const f = cola.shift() as string;
    if (vistos.has(f)) continue;
    vistos.add(f);
    for (const spec of importsRelativos(f)) {
      const r = resuelveImport(f, spec);
      if (r && !vistos.has(r)) cola.push(r);
    }
  }
  return vistos;
}

/** El núcleo del kit: los ficheros que tienen que estar bajo prueba. */
export function nucleoDelKit(raiz: string): string[] {
  const salida: string[] = [];
  for (const c of CARPETAS_NUCLEO) salida.push(...ficherosDe(raiz, c));
  return salida;
}

/** Las pruebas del kit. */
export function pruebasDelKit(raiz: string): string[] {
  return ficherosDe(raiz, CARPETA_PRUEBAS);
}

/**
 * Los ficheros del núcleo que NINGUNA prueba alcanza.
 *
 * @param excepciones Los que se aceptan sin prueba, con su motivo (para que
 *   la excepción sea una DECISIÓN y no un olvido).
 */
export function huerfanosDelNucleo(
  raiz: string,
  excepciones: Record<string, string> = {}
): string[] {
  const alcanzables = alcanzablesDesde(raiz, pruebasDelKit(raiz));
  const huerfanos: string[] = [];
  for (const f of nucleoDelKit(raiz)) {
    if (alcanzables.has(f)) continue;
    const rel = f.slice(raiz.length + 1);
    if (excepciones[rel]) continue;
    huerfanos.push(rel);
  }
  return huerfanos;
}
