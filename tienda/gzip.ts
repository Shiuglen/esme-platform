/**
 * GZIP DETERMINISTA — el mismo byte en cualquier máquina.
 *
 * Por qué no el `gzipSync` de Node y ya está: porque la cabecera de gzip
 * lleva el byte del SISTEMA OPERATIVO (Unix = 3, Windows = 11, otros = 0).
 * El contenido comprimido es el mismo, pero ese byte cambia el archivo
 * entero… y con él, el `sha256` que el índice firmado fija. Es decir: el
 * mismo módulo, empaquetado en Linux y en Windows, daba dos hashes
 * distintos, y el segundo no era el que estaba firmado.
 *
 * Aquí la cabecera se escribe a mano (con el byte de Unix, que es el que
 * usaba la casa) y el resto es el deflate crudo de zlib. El resultado: los
 * bytes son los mismos en todas partes, y son los MISMOS que los que ya
 * estaban publicados y firmados.
 *
 * Referencia: tienda/tar.ts, tienda/empaque.ts.
 */
import { crc32, deflateRawSync } from "node:zlib";

/** La cabecera gzip: método deflate, sin nombre, sin mtime, mejor compresión. */
const CABECERA = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0x02, 0x03]);

/**
 * Comprime con gzip, byte a byte igual en cualquier máquina.
 *
 * El nivel 9 y la estrategia por defecto son los de siempre: lo que cambia
 * aquí es sólo la cabecera, que es lo que dependía del sistema.
 */
export function gzipDeterminista(bytes: Buffer): Buffer {
  const deflate = deflateRawSync(bytes, { level: 9 });
  const cola = Buffer.alloc(8);
  cola.writeUInt32LE(crc32(bytes) >>> 0, 0); // CRC32
  cola.writeUInt32LE(bytes.length >>> 0, 4); // tamaño original (módulo 2^32)
  return Buffer.concat([CABECERA, deflate, cola]);
}
