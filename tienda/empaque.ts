// empaque — el tarball reproducible de un módulo.
// Misma carpeta → mismos bytes → mismo sha256. Nada de fechas de compresión
// ni propietarios del tar: si el artefacto no se reproduce byte a byte, no
// hay firma que valga.
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";

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
