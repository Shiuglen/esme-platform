/**
 * mind-zip — la mente portable en UN SOLO FICHERO.
 *
 * La spec admite dos formas: un directorio `.mind/` o un fichero
 * (`application/esme.mind+zip`). El directorio sirve para trabajar dentro;
 * el fichero sirve para viajar (sync, backup, pasar la mente a otro equipo).
 *
 * El ZIP es solo el contenedor: dentro está exactamente la misma mente, con
 * las mismas garantías (exclusión mínima, redacción, cognición firmada). Por
 * eso al importar se descomprime y se lee como una `.mind` de siempre: la
 * verificación no se salta porque el contenedor haya cambiado.
 *
 * Referencia: estandar/mind-format.spec.yaml, core/mind/mind-file.ts.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { escribeMind, leeMind, type MenteAExportar, type RecuerdoPortatil } from "./mind-file.ts";
import { DIRECTORIOS_MENTE } from "./portable-format.ts";
import { comprime, descomprime, type EntradaZip } from "./zip.ts";
import type { Rumbo } from "./rumbo.ts";

export interface MindZip {
  ruta: string;
  bytes: number;
  sha256: string; // hex
  entradas: string[];
}

export interface MindLeida {
  recuerdos: RecuerdoPortatil[];
  exclusions: string[];
  rumbo: Rumbo | null;
}

/** Los ficheros del directorio, en orden canónico y con rutas con "/". */
function recoge(dir: string, base = dir): EntradaZip[] {
  const salida: EntradaZip[] = [];
  for (const nombre of readdirSync(dir).sort()) {
    const ruta = join(dir, nombre);
    const st = statSync(ruta);
    if (st.isDirectory()) salida.push(...recoge(ruta, base));
    else
      salida.push({
        nombre: relative(base, ruta).split(sep).join("/"),
        datos: readFileSync(ruta),
      });
  }
  return salida;
}

/** Exporta la mente a un solo fichero. La misma mente → el mismo fichero. */
export function escribeMindZip(rutaDestino: string, mente: MenteAExportar): MindZip {
  const dir = mkdtempSync(join(tmpdir(), "mind-zip-"));
  try {
    escribeMind(dir, mente);
    const entradas = recoge(dir);
    const bytes = comprime(entradas);
    const destino = resolve(rutaDestino);
    mkdirSync(resolve(destino, ".."), { recursive: true });
    writeFileSync(destino, bytes);
    return {
      ruta: destino,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      entradas: entradas.map((e) => e.nombre),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Importa de un solo fichero. Verifica como si fuera un directorio. */
export function leeMindZip(rutaZip: string): MindLeida {
  const dir = mkdtempSync(join(tmpdir(), "mind-unzip-"));
  try {
    const entradas = descomprime(readFileSync(rutaZip));
    for (const e of entradas) {
      const destino = join(dir, e.nombre);
      mkdirSync(resolve(destino, ".."), { recursive: true });
      writeFileSync(destino, e.datos);
    }
    // un ZIP guarda ficheros, no carpetas vacías: los directorios que el
    // formato exige se crean aquí (son parte del formato, no del contenido)
    for (const d of DIRECTORIOS_MENTE) mkdirSync(join(dir, d), { recursive: true });
    return leeMind(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
