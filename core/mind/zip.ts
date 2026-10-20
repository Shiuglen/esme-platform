/**
 * zip — el contenedor de UN SOLO FICHERO, en bytes y sin dependencias.
 *
 * Por qué a mano y no con el `zip` del sistema: el formato de la mente
 * (`application/esme.mind+zip`) tiene que ser el mismo en cualquier máquina,
 * y un zip hecho con la CLI depende de su versión. Aquí mandan los bytes:
 * orden canónico, fecha fija (1980-01-01), sin atributos de plataforma y
 * sin metadatos de por medio. La misma mente → el mismo fichero → el mismo
 * sha256.
 *
 * Referencia: estandar/mind-format.spec.yaml, core/mind/mind-zip.ts.
 */

import { deflateRawSync, inflateRawSync } from "node:zlib";

export interface EntradaZip {
  nombre: string; // ruta dentro del zip, con "/" y sin "./"
  datos: Buffer;
}

// fecha fija: el epoch del formato ZIP (1980-01-01 00:00:00)
const FECHA = 0x0021; // fecha DOS (mes/día/año)
const HORA = 0x0000; // hora DOS

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(v: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v & 0xffff, 0);
  return b;
}

function u32(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0, 0);
  return b;
}

/** Comprime entradas en un ZIP. Mismo orden, misma fecha, mismos bytes. */
export function comprime(entradas: EntradaZip[]): Buffer {
  const ordenadas = [...entradas].sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
  const locales: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of ordenadas) {
    const nombre = Buffer.from(e.nombre, "utf8");
    const crc = crc32(e.datos);
    const comprimido = deflateRawSync(e.datos, { level: 9 });
    const metodo = 8; // deflate
    const tam = comprimido.length;

    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20), // versión necesaria
      u16(0), // flags
      u16(metodo),
      u16(HORA),
      u16(FECHA),
      u32(crc),
      u32(tam),
      u32(e.datos.length),
      u16(nombre.length),
      u16(0), // extra
      nombre,
      comprimido,
    ]);
    locales.push(local);

    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20), // versión que hizo el archivo
        u16(20), // versión necesaria
        u16(0),
        u16(metodo),
        u16(HORA),
        u16(FECHA),
        u32(crc),
        u32(tam),
        u32(e.datos.length),
        u16(nombre.length),
        u16(0), // extra
        u16(0), // comentario
        u16(0), // disco
        u16(0), // atributos internos
        u32(0), // atributos externos (nada de unix)
        u32(offset),
        nombre,
      ])
    );
    offset += local.length;
  }

  const centralBytes = Buffer.concat(central);
  const fin = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(ordenadas.length),
    u16(ordenadas.length),
    u32(centralBytes.length),
    u32(offset),
    u16(0), // sin comentario
  ]);
  return Buffer.concat([...locales, centralBytes, fin]);
}

/** Descomprime un ZIP. Si el fichero está roto, lo dice (nunca devuelve medias luces). */
export function descomprime(bytes: Buffer): EntradaZip[] {
  // el EOCD está al final: se busca desde atrás (puede haber un comentario)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("esto no es un zip: no se encuentra el final del índice");

  const total = bytes.readUInt16LE(eocd + 10);
  let cursor = bytes.readUInt32LE(eocd + 16);
  const salida: EntradaZip[] = [];

  for (let i = 0; i < total; i++) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("zip corrupto: el índice central no cuadra");
    const metodo = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16);
    const tam = bytes.readUInt32LE(cursor + 20);
    const sinComprimir = bytes.readUInt32LE(cursor + 24);
    const lenNombre = bytes.readUInt16LE(cursor + 28);
    const lenExtra = bytes.readUInt16LE(cursor + 30);
    const lenComentario = bytes.readUInt16LE(cursor + 32);
    const offsetLocal = bytes.readUInt32LE(cursor + 42);
    const nombre = bytes.subarray(cursor + 46, cursor + 46 + lenNombre).toString("utf8");
    cursor += 46 + lenNombre + lenExtra + lenComentario;

    // la cabecera local: el nombre y el extra pueden diferir del central
    const lenNombreLocal = bytes.readUInt16LE(offsetLocal + 26);
    const lenExtraLocal = bytes.readUInt16LE(offsetLocal + 28);
    const inicio = offsetLocal + 30 + lenNombreLocal + lenExtraLocal;
    const datosCrudos = bytes.subarray(inicio, inicio + tam);
    let datos: Buffer;
    try {
      datos = metodo === 0 ? datosCrudos : inflateRawSync(datosCrudos);
    } catch (e) {
      throw new Error(`zip corrupto: ${nombre} no se puede descomprimir (${(e as Error).message})`);
    }
    if (datos.length !== sinComprimir) throw new Error(`zip corrupto: ${nombre} no descomprime bien`);
    if (crc32(datos) !== crc) throw new Error(`zip corrupto: ${nombre} no cuadra con su CRC`);
    salida.push({ nombre, datos: Buffer.from(datos) });
  }
  return salida;
}
