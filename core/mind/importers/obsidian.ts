// Importador del Vault de Obsidian (y de cualquier árbol de markdown).
// Pipeline inviolable: caminar → EXCLUIR (empresa y terceros) → REDACTAR
// (secretos) → trocear. El orden importa: exclusión y redacción ANTES de
// trocear, para que ningún trozo exista siquiera con el secreto dentro.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { trocea, type Trozo } from "../troceo.ts";
import { redacta, excluido, EXCLUSION_MINIMA } from "../redaction.ts";

export interface OpcionesImporta {
  extensiones?: string[]; // por defecto solo .md
  exclusiones?: string[]; // se SUMAN a la mínima (nunca la sustituyen)
  vaultNombre?: string;
}

export interface RecuerdosImportados {
  vault: string;
  ficheros: string[];
  excluidos: string[];
  trozos: Trozo[];
  secretosRedactados: number;
}

export function importaVault(ruta: string, opts: OpcionesImporta = {}): RecuerdosImportados {
  const extensiones = opts.extensiones ?? [".md"];
  const exclusiones = [...EXCLUSION_MINIMA, ...(opts.exclusiones ?? [])];
  const vaultNombre = opts.vaultNombre ?? "vault";
  const trozos: Trozo[] = [];
  const ficheros: string[] = [];
  const excluidos: string[] = [];
  let secretos = 0;

  const camina = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const abs = join(dir, nombre);
      if (!statSync(abs).isFile()) {
        camina(abs);
        continue;
      }
      const rel = relative(ruta, abs).split(sep).join("/");
      if (excluido(rel, exclusiones)) {
        excluidos.push(rel);
        continue;
      }
      if (!extensiones.some((e) => rel.toLowerCase().endsWith(e))) continue;
      ficheros.push(rel);
      const { texto: limpio, hallazgos } = redacta(readFileSync(abs, "utf8"));
      secretos += hallazgos.length;
      trozos.push(...trocea(`${vaultNombre}/${rel}`, limpio));
    }
  };
  camina(ruta);

  return { vault: vaultNombre, ficheros, excluidos, trozos, secretosRedactados: secretos };
}
