// receptor — el circuito final: tienda → verificar → instalar → cargar.
// Un consumidor recibe un paquete, se asegura de que los bytes cuadran con
// lo firmado (firma de artefacto + hash del índice + firma del índice),
// desempaqueta en su jardín de instalaciones y deja el módulo listo para el
// extension host. Si algo no cuadra, NO se instala: el veredicto es la puerta.
import { execFileSync } from "node:child_process";
import { createHash, createPublicKey } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { verificarBytes, verificarIndex } from "./firma.ts";

export interface Instalacion {
  id: string;
  version: string;
  dir: string;
  entrada: string;
}

type Veredicto =
  | { ok: true; bytes: number; sha256: string }
  | { ok: false; razon: string };

/** Verifica un paquete contra el índice y el libro de firmas. Cero confianzas. */
export function verificarPaquete(
  id: string,
  version: string,
  raiz: string,
  pubPem: string,
  rutas: { tar?: string; firma?: string; indice?: string } = {}
): Veredicto {
  const rutaTar = rutas.tar ?? join(
    raiz,
    "tienda",
    "paquetes",
    `${id.replace(/\./g, "-")}-${version}.tgz`
  );
  const rutaFirma = rutas.firma ?? join(raiz, "tienda", "firmas", `${id}.artefacto.json`);
  const rutaIndice = rutas.indice ?? join(raiz, "tienda", "index.json");

  if (!existsSync(rutaTar)) return { ok: false, razon: `no hay paquete: ${rutaTar}` };
  if (!existsSync(rutaFirma)) return { ok: false, razon: "sin artefacto firmado en el libro" };
  if (!existsSync(rutaIndice)) return { ok: false, razon: "sin índice de la tienda" };

  const indice = JSON.parse(readFileSync(rutaIndice, "utf8")) as Record<string, unknown>;
  const posturaIndice = verificarIndex(indice, pubPem);
  if (!posturaIndice.ok) return { ok: false, razon: `índice no confiable: ${posturaIndice.razon}` };

  const entrada = (inicioModulos(indice).find((m) => m.id === id) ?? {}) as {
    version?: string;
    artefacto?: { tar?: string };
  };
  if (entrada.version && entrada.version !== version)
    return { ok: false, razon: `el índice publica ${entrada.version}, pediste ${version}` };

  const bytes = readFileSync(rutaTar);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const art = JSON.parse(readFileSync(rutaFirma, "utf8")) as {
    modulo: string;
    tar: string;
    firma: Parameters<typeof verificarBytes>[1];
  };
  if (art.modulo !== id) return { ok: false, razon: "el libro firma otro módulo" };
  if (entrada.artefacto?.tar && entrada.artefacto.tar !== art.tar)
    return { ok: false, razon: "el índice y el libro discrepan del tar" };

  const firma = verificarBytes(bytes, art.firma, pubPem);
  if (!firma.ok) return { ok: false, razon: `firma del paquete: ${firma.razon}` };
  if (sha256 !== art.tar) return { ok: false, razon: "los bytes no son los firmados" };
  return { ok: true, bytes: bytes.length, sha256 };
}

function inicioModulos(indice: Record<string, unknown>): { id: unknown }[] {
  return Array.isArray(indice.modulos) ? (indice.modulos as { id: unknown }[]) : [];
}

/** Instala: verifica y desempaqueta en el jardín local del consumidor. */
export function instalar(
  id: string,
  raiz: string,
  destino: string,
  opts: { version?: string; pubPem?: string } = {}
): Instalacion {
  // qué versión: la pedida, o la última que publica el índice
  const indice = JSON.parse(
    readFileSync(join(raiz, "tienda", "index.json"), "utf8")
  ) as Record<string, unknown>;
  const entrada = inicioModulos(indice).find((m) => m.id === id) as
    | { id: string; version?: string }
    | undefined;
  const version = opts.version ?? entrada?.version;
  if (!version) throw new Error(`el índice no publica ${id}`);

  const pubPem = opts.pubPem ?? clavePub(raiz);
  const v = verificarPaquete(id, version, raiz, pubPem);
  if (!v.ok) throw new Error(`instalación rechazada: ${v.razon}`);

  const rutaTar = join(
    raiz,
    "tienda",
    "paquetes",
    `${id.replace(/\./g, "-")}-${version}.tgz`
  );
  const dir = join(destino, id.replace(/\./g, "__"));
  mkdirSync(dir, { recursive: true });
  execFileSync("tar", ["-xzf", rutaTar, "-C", dir]);

  // el módulo desempaquetado ha de ser el que decía el manifiesto
  const manifiesto = yaml.load(
    readFileSync(join(dir, "module.yaml"), "utf8")
  ) as { id: string; version: string; entry: string };
  if (manifiesto.id !== id || manifiesto.version !== version)
    throw new Error(
      `el paquete trae ${manifiesto.id}@${manifiesto.version}, pediste ${id}@${version}`
    );
  if (!existsSync(resolve(dir, manifiesto.entry)))
    throw new Error(`la entrada '${manifiesto.entry}' no está tras desempaquetar`);

  return { id: manifiesto.id, version: manifiesto.version, dir, entrada: manifiesto.entry };
}

/** Clave pública: env o la de desarrollo del repo. */
export function clavePub(raiz: string): string {
  if (process.env.ESME_PUB_KEY) return process.env.ESME_PUB_KEY;
  return createPublicKey(readFileSync(join(raiz, ".keys", "index-dev.pem"), "utf8"))
    .export({ type: "spki", format: "pem" })
    .toString();
}
