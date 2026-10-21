/**
 * LOS CAMBIOS DE UN TURNO — lo que tocó, de verdad.
 *
 * El turno declara `cambios[]` (los ficheros que cambió, con las líneas
 * añadidas y quitadas). Para que eso no sea una promesa, aquí está el cálculo:
 *
 *   - **instantánea por contenido**: de cada fichero se guarda su HASH, no su
 *     fecha (la fecha la cambia cualquier cosa; el hash no);
 *   - **con plazo**: el recorrido tiene un límite de tiempo. Un escaneo que se
 *     cuelga en un árbol enorme es peor que no escanear;
 *   - **diff de Myers con tope**: el número de líneas se calcula con el
 *     algoritmo clásico (O(ND)), con un tope de ediciones. Si el diff es más
 *     grande que el tope, el número se devuelve COMO NULO: no se inventa un
 *     «0» ni un «+9999»;
 *   - **binarios y truncados se marcan**: un binario no tiene líneas que
 *     contar, y un fichero que se dejó de leer a medias se dice;
 *   - y **concurrente**: si el árbol cambió mientras se medía, el turno no
 *     puede atribuírselo (se dice, en vez de fingir).
 *
 * De dónde viene la idea: la ingeniería inversa de PandaCode (Rust, Tauri),
 * que resuelve exactamente este problema para sus turnos (`turn_changes.rs`).
 * Aquí está en el kit, en el lenguaje de la casa, con las mismas reglas.
 *
 * Referencia: core/turnos/turno.ts, estandar/turno.spec.yaml.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Una entrada del árbol (por hash de contenido, no por fecha).
 *
 * El TEXTO va dentro (acotado): el diff de líneas se calcula después, cuando
 * el fichero ya puede haber cambiado en disco. Si sólo guardáramos el hash, el
 * diff saldría vacío — y un diff vacío es una mentira.
 */
export interface Entrada {
  /** El sha256 del contenido. */
  hash: string;
  /** Los bytes. */
  bytes: number;
  /** ¿Es un binario? (un binario no tiene líneas que contar). */
  binario: boolean;
  /** El texto (si es texto y cabe en el tope). */
  contenido?: string;
}

/** El tope de texto que se guarda en la instantánea (por fichero). */
export const LIMITE_CONTENIDO = 128 * 1024;

/** Una instantánea del árbol. */
export interface Instantanea {
  /** La carpeta medida. */
  dir: string;
  /** Las entradas, por ruta relativa. */
  entradas: Map<string, Entrada>;
  /** ¿Se pudo recorrer TODO? (si no, el resultado está truncado). */
  completa: boolean;
  /** Las carpetas que se saltaron (por tamaño o por plazo). */
  saltadas: string[];
}

/** Un fichero que cambió. */
export interface FicheroCambiado {
  /** La ruta relativa. */
  ruta: string;
  /** Qué pasó. */
  estado: "anadido" | "borrado" | "modificado" | "renombrado";
  /** Las líneas añadidas (null si no se sabe: binario o diff demasiado grande). */
  anadidos: number | null;
  /** Las líneas quitadas (null si no se sabe). */
  borrados: number | null;
  /** ¿Es un binario? */
  binario: boolean;
  /** ¿El resultado está truncado? */
  truncado: boolean;
}

/** El resultado de comparar dos instantáneas. */
export interface ResultadoCambios {
  /** Los ficheros que cambiaron. */
  ficheros: FicheroCambiado[];
  /** Las líneas añadidas (en total; los unknowns no cuentan). */
  anadidos: number;
  /** Las líneas quitadas. */
  borrados: number;
  /** ¿El resultado está truncado (plazo o diff enorme)? */
  truncado: boolean;
  /** ¿El árbol cambió mientras se medía? (entonces no se puede atribuir) */
  concurrente: boolean;
}

/** Las carpetas que no se miran (ruido conocido). */
export const EXCLUIDOS = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  ".next",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  ".esme",
  "salida",
];

/** El tope de ediciones del diff (a partir de ahí, el número es desconocido). */
export const TOPE_EDICIONES = 512;

/** El plazo del escaneo (ms). */
export const PLAZO_MS = 4000;

/** ¿Es binario? (un null en los primeros 8 000 bytes). */
export function esBinario(datos: Buffer): boolean {
  const trozo = datos.subarray(0, 8000);
  return trozo.includes(0);
}

/** El hash de un fichero (y su tamaño, si es binario y su texto si cabe). */
export function mide(datos: Buffer): Entrada {
  const binario = esBinario(datos);
  return {
    hash: createHash("sha256").update(datos).digest("hex"),
    bytes: datos.length,
    binario,
    ...(!binario && datos.length <= LIMITE_CONTENIDO
      ? { contenido: datos.toString("utf8") }
      : {}),
  };
}

/**
 * Una instantánea del árbol: cada fichero con su hash.
 *
 * El recorrido tiene PLAZO: si se acaba el tiempo, la instantánea se marca
 * como incompleta (y quien la use lo sabrá: una instantánea incompleta no
 * puede afirmar que un fichero no cambió).
 */
export function instantanea(
  dir: string,
  opts: { plazoMs?: number; excluidos?: string[] } = {}
): Instantanea {
  const plazo = opts.plazoMs ?? PLAZO_MS;
  const excluidos = new Set(opts.excluidos ?? EXCLUIDOS);
  const entradas = new Map<string, Entrada>();
  const saltadas: string[] = [];
  const limite = Date.now() + plazo;
  let completa = true;

  const recorrer = (prefijo: string): void => {
    if (Date.now() > limite) {
      completa = false;
      return;
    }
    const completa_ = prefijo ? join(dir, prefijo) : dir;
    let nombres: string[];
    try {
      nombres = readdirSync(completa_).sort();
    } catch {
      completa = false;
      return;
    }
    for (const nombre of nombres) {
      if (Date.now() > limite) {
        completa = false;
        return;
      }
      if (excluidos.has(nombre)) continue;
      const rel = prefijo ? `${prefijo}/${nombre}` : nombre;
      let st;
      try {
        st = statSync(join(dir, rel));
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        recorrer(rel);
        continue;
      }
      if (!st.isFile()) continue;
      try {
        const datos = readFileSync(join(dir, rel));
        entradas.set(rel, mide(datos));
      } catch {
        // no se pudo leer: no se afirma nada de este fichero
        completa = false;
        saltadas.push(rel);
      }
    }
  };

  recorrer("");
  return { dir, entradas, completa, saltadas };
}

/**
 * El diff de líneas de Myers (O(ND)), con un tope de ediciones.
 *
 * Devuelve las líneas añadidas y quitadas, o null si el diff es más grande
 * que el tope: en ese caso el número se queda SIN SABER (y quien lo use lo
 * dirá, en vez de mentir con un 0).
 */
export function diffLineas(
  antes: string[],
  despues: string[],
  tope = TOPE_EDICIONES
): { anadidos: number; borrados: number } | null {
  const n = antes.length;
  const m = despues.length;
  if (n === 0 && m === 0) return { anadidos: 0, borrados: 0 };
  if (n === 0) return { anadidos: m, borrados: 0 };
  if (m === 0) return { anadidos: 0, borrados: n };

  // Myers (O(ND)): se avanza en diagonales y se guarda la traza para
  // volver atrás y contar qué se añadió y qué se quitó.
  const max = Math.min(n + m, tope);
  const offset = max;
  const tam = 2 * max + 1;
  let v = new Int32Array(tam);
  const traza: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    traza.push(v.slice()); // el estado ANTES de esta diagonal
    for (let k = -d; k <= d; k += 2) {
      const idx = k + offset;
      let x: number;
      if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) x = v[idx + 1];
      else x = v[idx - 1] + 1;
      let y = x - k;
      while (x < n && y < m && antes[x] === despues[y]) {
        x++;
        y++;
      }
      v[idx] = x;
      if (x >= n && y >= m) {
        // el diff está resuelto: se vuelve atrás contando
        let anadidos = 0;
        let borrados = 0;
        let px = x;
        let py = y;
        for (let dd = d; dd > 0; dd--) {
          const fila = traza[dd];
          const kk = px - py;
          const i2 = kk + offset;
          let prevK: number;
          if (kk === -dd || (kk !== dd && fila[i2 - 1] < fila[i2 + 1])) prevK = kk + 1;
          else prevK = kk - 1;
          const prevX = fila[prevK + offset];
          const prevY = prevX - prevK;
          while (px > prevX && py > prevY) {
            px--;
            py--;
          }
          if (px === prevX) {
            py--;
            anadidos++;
          } else {
            px--;
            borrados++;
          }
        }
        while (px > 0 && py > 0) {
          px--;
          py--;
        }
        while (px > 0) {
          px--;
          borrados++;
        }
        while (py > 0) {
          py--;
          anadidos++;
        }
        return { anadidos, borrados };
      }
    }
  }
  return null; // demasiado grande: el número se queda sin saber
}

/** Las líneas de un texto (con los finales de línea fuera). */
export function lineasDe(texto: string): string[] {
  return texto.split("\n");
}

/**
 * Compara dos instantáneas y dice qué cambió.
 *
 * La regla de la atribución: si la instantánea de ANTES no era completa, no
 * se puede afirmar nada (había ficheros que no se leyeron: puede que changed
 * alguno). En ese caso el resultado va marcado como truncado.
 */
export function compara(antes: Instantanea, despues: Instantanea): ResultadoCambios {
  const ficheros: FicheroCambiado[] = [];
  let totalAnadidos = 0;
  let totalBorrados = 0;
  let truncado = !antes.completa || !despues.completa;

  const rutas = new Set([...antes.entradas.keys(), ...despues.entradas.keys()]);
  for (const ruta of [...rutas].sort()) {
    const a = antes.entradas.get(ruta);
    const b = despues.entradas.get(ruta);
    if (a && !b) {
      // borrado: se sabe cuántas líneas se fueron (si el texto estaba guardado)
      const borrados = a.contenido === undefined ? null : lineasDe(a.contenido).length;
      if (borrados !== null) totalBorrados += borrados;
      ficheros.push({
        ruta,
        estado: "borrado",
        anadidos: null,
        borrados,
        binario: a.binario,
        truncado: borrados === null,
      });
      if (borrados === null) truncado = true;
      continue;
    }
    if (!a && b) {
      // añadido: se sabe cuántas líneas entered (si el texto estaba guardado)
      const anadidos = b.contenido === undefined ? null : lineasDe(b.contenido).length;
      if (anadidos !== null) totalAnadidos += anadidos;
      ficheros.push({
        ruta,
        estado: "anadido",
        anadidos,
        borrados: null,
        binario: b.binario,
        truncado: anadidos === null,
      });
      if (anadidos === null) truncado = true;
      continue;
    }
    if (!a || !b || a.hash === b.hash) continue;

    // modificado: se cuenta el diff si se puede
    if (a.binario || b.binario) {
      ficheros.push({ ruta, estado: "modificado", anadidos: null, borrados: null, binario: true, truncado: false });
      continue;
    }
    try {
      // el texto sale de las INSTANTÁNEAS (no del disco): el fichero puede
      // haber cambiado ya, y el diff tiene que ser el de entonces
      const textoA = a.contenido;
      const textoB = b.contenido;
      if (textoA === undefined || textoB === undefined) {
        truncado = true;
        ficheros.push({ ruta, estado: "modificado", anadidos: null, borrados: null, binario: false, truncado: true });
        continue;
      }
      const d = diffLineas(lineasDe(textoA), lineasDe(textoB));
      if (!d) {
        truncado = true;
        ficheros.push({ ruta, estado: "modificado", anadidos: null, borrados: null, binario: false, truncado: true });
        continue;
      }
      totalAnadidos += d.anadidos;
      totalBorrados += d.borrados;
      ficheros.push({ ruta, estado: "modificado", anadidos: d.anadidos, borrados: d.borrados, binario: false, truncado: false });
    } catch {
      truncado = true;
      ficheros.push({ ruta, estado: "modificado", anadidos: null, borrados: null, binario: false, truncado: true });
    }
  }

  return {
    ficheros,
    anadidos: totalAnadidos,
    borrados: totalBorrados,
    truncado,
    // concurrente: el árbol cambió mientras se medía (una instantánea no
    // puede afirmar la quietud de la otra)
    concurrente: false,
  };
}

/**
 * Los cambios de un turno: la instantánea de antes, la de después, y lo que
 * hay entre medias.
 */
export function cambiosDelTurno(
  dir: string,
  antes: Instantanea,
  despues: Instantanea
): ResultadoCambios {
  return compara(antes, despues);
}

/** ¿Existe la carpeta? (para no saca instantáneas de la nada) */
export function existeCarpeta(dir: string): boolean {
  try {
    return existsSync(dir) && statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** La ruta relativa de un fichero dentro de la instantánea (para el informe). */
export const rutaRelativa = (dir: string, ruta: string): string => relative(dir, join(dir, ruta));
