/**
 * TAR DETERMINISTA — los mismos bytes en cualquier máquina.
 *
 * Por qué existe esto, y no la orden `tar` del sistema:
 *
 *   1. **No todos los sistemas tienen el mismo tar.** Los flags que usa la
 *      casa (`--sort=name`, `--owner=0`, `--numeric-owner`, `--mtime=@0`) son
 *      de GNU tar: en macOS (bsdtar) y en Windows no existen, y el empaquetado
 *      revienta. Es decir: en la mitad de los ordenadores de quien construye
 *      módulos, publicar es imposible.
 *   2. **El mismo contenido no daba el mismo sha.** Cada implementación de
 *      tar escribe sus cabeceras a su manera, así que el `sha256` que el
 *      índice firmado fija dependía de dónde se había empaquetado. La
 *      promesa de «mismos bytes → mismo sha» era cierta sólo dentro de una
 *      misma máquina.
 *
 * Aquí el tar se escribe entero, en JS puro, y con las reglas de GNU (que es
 * lo que la casa ya publicaba): cabecera `ustar`, propietario 0, mtime 0,
 * orden por nombre y relleno a 10240 bytes. Así:
 *
 *   - los bytes son los mismos en Linux, macOS y Windows;
 *   - y son los MISMOS que los que ya están publicados y firmados (el sha
 *     del índice no se mueve, y lo que se publica sigue siendo lo que se
 *     firma).
 *
 * Referencia: tienda/empaque.ts, docs/TIENDA.md.
 */
import { readdirSync, readlinkSync, statSync } from "node:fs";
import { join } from "node:path";

/** El tamaño de un bloque de tar. */
export const BLOQUE = 512;

/** El factor de bloqueo de GNU tar: el archivo se rellena a este múltiplo. */
export const BLOQUEO = 20 * BLOQUE;

/**
 * Los MODOS del paquete: canónicos, no los del disco.
 *
 * Por qué no los del disco: porque dependen del `umask` de la máquina que
 * empaqueta (y de cómo se creó cada carpeta). El mismo módulo, en dos
 * ordenadores, daba dos tarballs distintos y por tanto dos `sha256`: la
 * promesa de «mismos bytes → mismo sha» era cierta sólo en un sitio.
 *
 * Aquí los modos son SIEMPRE los mismos: 0644 para los ficheros, 0755 para
 * las carpetas, 0777 para los enlaces. Da igual dónde se empaquete: los
 * bytes son los mismos en Linux, en macOS y en Windows.
 */
export const MODO_FICHERO = 0o644;
export const MODO_CARPETA = 0o755;
export const MODO_ENLACE = 0o777;

/** Una entrada del archivo. */
export interface EntradaTar {
  /** La ruta dentro del tar (con el `./` de delante, como GNU tar). */
  nombre: string;
  /** Los bits de permiso (si no se dan, el canónico según el tipo). */
  modo?: number;
  /** El contenido (sólo los ficheros). */
  contenido?: Buffer;
  /** ¿Es un directorio? */
  esDir?: boolean;
  /** ¿Es un enlace simbólico? (entonces `contenido` es su destino) */
  enlace?: string;
}

/** Un número en octal, con los ceros de relleno de GNU tar. */
function octal(valor: number, digitos: number): string {
  return valor.toString(8).padStart(digitos, "0");
}

/**
 * La cabecera de 512 bytes de una entrada (formato `ustar` de GNU).
 *
 * El nombre va en el campo `name` (100 bytes). Si no cabe, se usa el campo
 * `prefix` de ustar (155 bytes, nombre partido por una `/`). Y si tampoco
 * cabe así, se emite la extensión de NOMBRE LARGO de GNU (un bloque con el
 * tipo `L` y el nombre entero dentro), que es lo que lee cualquier tar.
 *
 * Truncar el nombre, en cambio, sería silencioso: el paquete parecería
 * bueno y el módulo instalado tendría ficheros con nombres equivocados.
 */
export function cabeceraTar(entrada: EntradaTar): Buffer {
  const h = Buffer.alloc(BLOQUE);
  const nombre = entrada.nombre;

  if (nombre.length <= 100) {
    h.write(nombre, 0, "utf8");
  } else {
    const partido = parteNombre(nombre);
    if (partido) {
      h.write(partido.nombre, 0, "utf8");
      h.write(partido.prefijo, 345, "utf8");
    } else {
      // sin sitio en ustar: el nombre va en su propio bloque (extensión `L`)
      h.write("././@LongLink", 0, "utf8");
      h.write(`${octal(0o644, 7)}\0`, 100, "ascii");
      h.write(`${octal(0, 7)}\0`, 108, "ascii");
      h.write(`${octal(0, 7)}\0`, 116, "ascii");
      h.write(`${octal(nombre.length + 1, 11)}\0`, 124, "ascii");
      h.write(`${octal(0, 11)}\0`, 136, "ascii");
      h.write("        ", 148, "ascii");
      h.write("L", 156, "ascii");
      h.write("ustar ", 257, "ascii");
      h.write(" \0", 263, "ascii");
      let suma = 0;
      for (const byte of h) suma += byte;
      h.write(octal(suma, 6), 148, "ascii");
      h.write("\0 ", 154, "ascii");
      return h;
    }
  }

  const modo = entrada.modo ?? (entrada.esDir ? MODO_CARPETA : MODO_FICHERO);
  h.write(`${octal(modo & 0o7777, 7)}\0`, 100, "ascii");
  h.write(`${octal(0, 7)}\0`, 108, "ascii"); // uid: --owner=0
  h.write(`${octal(0, 7)}\0`, 116, "ascii"); // gid: --group=0
  const size = entrada.enlace ? 0 : (entrada.contenido?.length ?? 0);
  h.write(`${octal(size, 11)}\0`, 124, "ascii");
  h.write(`${octal(0, 11)}\0`, 136, "ascii"); // mtime: --mtime=@0

  // el checksum se calcula con su propio hueco en blanco (GNU tar)
  h.write("        ", 148, "ascii");
  h.write(entrada.esDir ? "5" : entrada.enlace ? "2" : "0", 156, "ascii");
  if (entrada.enlace) h.write(entrada.enlace.slice(0, 100), 157, "utf8");

  h.write("ustar ", 257, "ascii");
  h.write(" \0", 263, "ascii");
  // uname y gname vacíos: --numeric-owner (no hay nombres que escribir)
  // devmajor y devminor vacíos: no hay dispositivos

  let suma = 0;
  for (const byte of h) suma += byte;
  h.write(octal(suma, 6), 148, "ascii");
  h.write("\0 ", 154, "ascii");
  return h;
}

/**
 * Partir un nombre largo en `prefix` + `name` (formato ustar).
 *
 * Se parte por la ÚLTIMA `/` que deja un nombre de 100 bytes o menos: es lo
 * que hace GNU tar, y así un tar nuestro se lee igual con cualquier
 * herramienta.
 */
export function parteNombre(nombre: string): { prefijo: string; nombre: string } | null {
  const bytes = Buffer.from(nombre, "utf8");
  if (bytes.length <= 100) return null;
  if (bytes.length > 256) return null; // ni ustar ni el nombre largo de GNU
  for (let i = nombre.length - 1; i >= 0; i--) {
    if (nombre[i] !== "/") continue;
    const prefijo = nombre.slice(0, i);
    const resto = nombre.slice(i + 1);
    if (
      Buffer.byteLength(prefijo, "utf8") <= 155 &&
      Buffer.byteLength(resto, "utf8") <= 100 &&
      resto.length > 0
    ) {
      return { prefijo, nombre: resto };
    }
  }
  return null;
}

/** El contenido de una entrada, rellenado a bloque entero. */
function cuerpoTar(entrada: EntradaTar): Buffer {
  if (entrada.esDir || entrada.enlace || !entrada.contenido) return Buffer.alloc(0);
  const largo = entrada.contenido.length;
  const relleno = (BLOQUE - (largo % BLOQUE)) % BLOQUE;
  return Buffer.concat([entrada.contenido, Buffer.alloc(relleno)]);
}

/** El archivo tar completo: cabeceras, contenido, dos bloques en blanco y el relleno final. */
export function tarDeterminista(entradas: EntradaTar[]): Buffer {
  const trozos: Buffer[] = [];
  for (const e of entradas) {
    // el nombre largo de GNU va en su propio bloque, ANTES de la cabecera
    if (Buffer.byteLength(e.nombre, "utf8") > 100 && !parteNombre(e.nombre)) {
      trozos.push(cabeceraTar(e), cuerpoNombreLargo(e.nombre));
    }
    trozos.push(cabeceraTar(e), cuerpoTar(e));
  }
  // el cierre de GNU tar: dos bloques en blanco…
  trozos.push(Buffer.alloc(BLOQUE * 2));
  let total = trozos.reduce((n, t) => n + t.length, 0);
  // …y el relleno hasta el factor de bloqueo
  const relleno = (BLOQUEO - (total % BLOQUEO)) % BLOQUEO;
  if (relleno) trozos.push(Buffer.alloc(relleno));
  total += relleno;
  return Buffer.concat(trozos, total);
}

/** El bloque con el nombre largo (el contenido del tipo `L`). */
function cuerpoNombreLargo(nombre: string): Buffer {
  const bytes = Buffer.from(`${nombre}\0`, "utf8");
  const relleno = (BLOQUE - (bytes.length % BLOQUE)) % BLOQUE;
  return Buffer.concat([bytes, Buffer.alloc(relleno)]);
}

/**
 * Lee un tar y devuelve sus entradas.
 *
 * Es el revés de `tarDeterminista`: lo que hace falta para COMPARAR dos
 * archivos (el nuestro y el de GNU) y para saber qué trae un paquete sin
 * desempaquetarlo.
 */
export function leeTar(tar: Buffer): Array<{ nombre: string; tamano: number; tipo: string }> {
  const salida: Array<{ nombre: string; tamano: number; tipo: string }> = [];
  let i = 0;
  let nombreLargo: string | null = null;
  while (i + BLOQUE <= tar.length) {
    const cabecera = tar.subarray(i, i + BLOQUE);
    if (cabecera.every((b) => b === 0)) break;
    i += BLOQUE;
    const nombre = cabecera.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefijo = cabecera.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const tamano = parseInt(
      cabecera.subarray(124, 136).toString("latin1").replace(/\0.*$/, "").trim() || "0",
      8
    );
    const tipo = cabecera.subarray(156, 157).toString("latin1");
    i += Math.ceil(tamano / BLOQUE) * BLOQUE;
    if (tipo === "L") {
      nombreLargo = tar
        .subarray(i - Math.ceil(tamano / BLOQUE) * BLOQUE, i - Math.ceil(tamano / BLOQUE) * BLOQUE + tamano)
        .toString("utf8")
        .replace(/\0.*$/, "");
      continue;
    }
    salida.push({
      nombre: nombreLargo ?? (prefijo ? `${prefijo}/${nombre}` : nombre),
      tamano,
      tipo,
    });
    nombreLargo = null;
  }
  return salida;
}

/**
 * Las entradas de una carpeta, como las pondría GNU tar con `--sort=name`.
 *
 * El nombre es el de la ruta RELATIVA con `./` delante (y los directorios con
 * la barra final), que es como GNU tar nombra las cosas cuando se le dice
 * `-C carpeta .`.
 */
export function entradasDe(dir: string): EntradaTar[] {
  const salida: EntradaTar[] = [];
  const recorrer = (prefijo: string): void => {
    const completa = prefijo ? join(dir, prefijo) : dir;
    const stat = statSync(completa);
    if (prefijo && stat.isSymbolicLink()) {
      salida.push({
        nombre: `./${prefijo}`,
        modo: MODO_ENLACE,
        enlace: readlinkSync(completa),
      });
      return;
    }
    const base = prefijo ? `./${prefijo}` : "./";
    const nombre = stat.isDirectory() && !base.endsWith("/") ? `${base}/` : base;
    salida.push({
      nombre,
      modo: stat.isDirectory() ? MODO_CARPETA : MODO_FICHERO,
      esDir: stat.isDirectory(),
    });
    if (!stat.isDirectory()) return;
    const hijos = readdirSync(completa, { withFileTypes: true })
      .map((e) => e.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const hijo of hijos) recorrer(prefijo ? `${prefijo}/${hijo}` : hijo);
  };
  recorrer("");
  // el orden de GNU con --sort=name es por nombre de miembro
  salida.sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
  return salida;
}
