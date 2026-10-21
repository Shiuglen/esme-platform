/**
 * DESEMPAQUETAR — el tar de vuelta a ficheros, sin el tar del sistema.
 *
 * Por qué no `tar -xzf`: porque el sistema puede no tenerlo (o no ser el de
 * GNU), y porque desempaquetar es justo el momento en que un paquete ajeno
 * podría escribir FUERA de donde debe. Aquí el confine es explícito:
 *
 *   - un nombre con `..`, absoluto o con enlaces que se salen, se RECHAZA
 *     (no se «limpia»: se dice que no);
 *   - un enlace simbólico se escribe como enlace, apuntando a donde diga,
 *     pero sin dejar que apunte fuera de la carpeta;
 *   - el resto se escribe tal cual, con los bytes que venían firmados.
 *
 * Referencia: tienda/tar.ts, tienda/receptor.ts, core/modulos/rutas.ts.
 */
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";

/** El tamaño de un bloque de tar. */
const BLOQUE = 512;

/** Lo que se extrajo. */
export interface Extraccion {
  /** Los ficheros escritos (rutas relativas). */
  ficheros: string[];
  /** Los directorios creados. */
  carpetas: string[];
  /** Los enlaces simbólicos creados. */
  enlaces: string[];
}

const texto = (buf: Buffer, inicio: number, largo: number): string =>
  buf.subarray(inicio, inicio + largo).toString("utf8").replace(/\0.*$/, "");

/** El número octal de un campo (el tamaño, el modo). */
const octal = (campo: string): number => {
  const limpio = campo.replace(/\0.*$/, "").trim();
  if (!limpio) return 0;
  const n = parseInt(limpio, 8);
  return Number.isNaN(n) ? 0 : n;
};

/**
 * La ruta final de una entrada, o `null` si se sale de la carpeta.
 *
 * El confine es la regla: lo que viene de fuera (un paquete firmado por
 * alguien de otra casa) no puede escribir fuera de la carpeta de
 * instalación.
 */
export function rutaConfinada(destino: string, nombre: string): string | null {
  if (!nombre || nombre.includes("\0")) return null;
  const limpio = nombre.replace(/^\.\//, "").replace(/\/+$/, "");
  if (limpio === "") return null;
  if (isAbsolute(limpio) || /^[a-zA-Z]:/.test(limpio)) return null;
  const partes = limpio.split("/").filter((p) => p !== "" && p !== ".");
  if (partes.some((p) => p === "..")) return null;
  const final = join(destino, ...partes);
  // la comprobación final: el camino tiene que seguir dentro
  const base = normalize(destino);
  if (final !== base && !final.startsWith(base + sep)) return null;
  return final;
}

/**
 * Desempaqueta un tar (bytes pelados) en una carpeta.
 *
 * Si encuentra algo que se sale, PARA y dice cuál: un paquete que no se
 * puede desempaquetar seguro no se instala.
 */
export function desempaceta(tar: Buffer, destino: string): Extraccion {
  const salida: Extraccion = { ficheros: [], carpetas: [], enlaces: [] };
  let i = 0;
  let nombreLargo: string | null = null;

  while (i + BLOQUE <= tar.length) {
    const cabecera = tar.subarray(i, i + BLOQUE);
    if (cabecera.every((b) => b === 0)) break; // el cierre
    i += BLOQUE;

    const nombreCampo = texto(cabecera, 0, 100);
    const prefijo = texto(cabecera, 345, 155);
    const tamano = octal(texto(cabecera, 124, 12));
    const tipo = texto(cabecera, 156, 1) || "0";
    const modo = octal(texto(cabecera, 100, 8));

    // el contenido del bloque (y su relleno)
    const contenido = tar.subarray(i, i + tamano);
    i += Math.ceil(tamano / BLOQUE) * BLOQUE;

    if (tipo === "L") {
      // el nombre largo de GNU: el contenido ES el nombre
      nombreLargo = contenido.subarray(0, tamano).toString("utf8").replace(/\0.*$/, "");
      continue;
    }

    const nombre = nombreLargo ?? (prefijo ? `${prefijo}/${nombreCampo}` : nombreCampo);
    nombreLargo = null;

    // la entrada raíz ("./"): es la carpeta de destino, no un fichero dentro
    const limpio = nombre.replace(/^\.\//, "").replace(/\/+$/, "");
    if (limpio === "" || limpio === ".") {
      mkdirSync(destino, { recursive: true });
      continue;
    }

    const final = rutaConfinada(destino, nombre);
    if (!final) {
      throw new Error(`el paquete intenta escribir fuera de la carpeta: ${nombre}`);
    }

    if (tipo === "5") {
      mkdirSync(final, { recursive: true });
      salida.carpetas.push(nombre);
      continue;
    }
    if (tipo === "2") {
      // un enlace simbólico: se escribe como enlace, pero su destino tiene
      // que quedarse dentro de la carpeta
      const destinoEnlace = texto(cabecera, 157, 100);
      const destinoFinal = rutaConfinada(destino, destinoEnlace);
      if (!destinoFinal) {
        throw new Error(`el paquete trae un enlace que apunta fuera: ${nombre} → ${destinoEnlace}`);
      }
      mkdirSync(dirname(final), { recursive: true });
      symlinkSync(destinoEnlace, final);
      salida.enlaces.push(nombre);
      continue;
    }
    if (tipo === "0" || tipo === "\0" || tipo === "") {
      mkdirSync(dirname(final), { recursive: true });
      writeFileSync(final, contenido);
      if (modo) chmodSync(final, modo & 0o777);
      salida.ficheros.push(nombre);
      continue;
    }
    // los demás tipos (dispositivos, fifos) no se unpackean: no hacen falta
    // para un módulo y no tienen por qué abrir una puerta
  }

  return salida;
}
