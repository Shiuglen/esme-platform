// empaque — el tarball reproducible de un módulo.
// Misma carpeta → mismos bytes → mismo sha256. Nada de fechas de compresión
// ni propietarios del tar: si el artefacto no se reproduce byte a byte, no
// hay firma que valga.
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import * as yaml from "js-yaml";

export interface Paquete {
  ruta: string;
  sha256: string; // hex
  bytes: number;
  modulo: string;
  version: string;
}

/** Empaqueta un módulo (module.yaml, dist, bench, README…) en un .tgz determinista. */
export function empaquetar(dirModulo: string, dirDestino: string, nombreTar?: string): Paquete {
  const manifiesto = yaml.load(
    readFileSync(`${dirModulo}/module.yaml`, "utf8")
  ) as { id: string; version: string };
  const nombre =
    nombreTar ?? `${manifiesto.id.replace(/\./g, "-")}-${manifiesto.version}.tgz`;
  mkdirSync(dirDestino, { recursive: true });
  const ruta = `${dirDestino}/${nombre}`;

  // tar estable: orden canónico, propietarios numéricos cero, mtime fijo.
  const tarBytes = execFileSync(
    "tar",
    [
      "--sort=name",
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "--mtime=@0",
      "-cf",
      "-",
      "-C",
      dirModulo,
      ".",
    ],
    { maxBuffer: 64e6 }
  );
  const gz = gzipSync(tarBytes, { level: 9 });
  writeFileSync(ruta, gz);
  return {
    ruta,
    sha256: createHash("sha256").update(gz).digest("hex"),
    bytes: gz.length,
    modulo: manifiesto.id,
    version: manifiesto.version,
  };
}

export function sha256De(ruta: string): string {
  return createHash("sha256").update(readFileSync(ruta)).digest("hex");
}

/**
 * La huella de un ÁRBOL: mismos ficheros, mismos bytes → misma huella.
 *
 * No es el sha256 del tarball (ese lo da la Tienda al publicar): es la huella
 * de lo que hay DESEMPAQUETADO, que es lo que el juez mira y lo que la app
 * activa. Si alguien cambia un byte del módulo después del juicio, la
 * huella cambia y el veredicto deja de aplicar.
 *
 * El recorrido es en orden (ruta → contenido): el mismo árbol da siempre los
 * mismos bytes, sin importar el orden del disco.
 */
export function arbolSha256(dir: string): string {
  const h = createHash("sha256");
  for (const rel of ficherosRelativos(dir)) {
    h.update(rel);
    h.update("\0");
    h.update(sha256De(join(dir, rel)));
    h.update("\n");
  }
  return h.digest("hex");
}

/** Los ficheros de una carpeta, en orden, con su ruta relativa. */
function ficherosRelativos(dir: string, prefijo = ""): string[] {
  const salida: string[] = [];
  const entradas = readdirSync(join(dir, prefijo), { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
  for (const e of entradas) {
    const rel = prefijo ? `${prefijo}/${e.name}` : e.name;
    if (e.isDirectory()) {
      salida.push(...ficherosRelativos(dir, rel));
      continue;
    }
    if (e.isFile() || e.isSymbolicLink()) salida.push(rel);
  }
  return salida.sort();
}
