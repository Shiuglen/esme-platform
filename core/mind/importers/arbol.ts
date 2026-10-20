/**
 * arbol — el pipeline de absorción, en un solo sitio.
 *
 * Pipeline inviolable: caminar → EXCLUIR (empresa y terceros) → REDACTAR
 * (secretos) → TROCEAR. El orden importa: exclusión y redacción ANTES de
 * que exista el trozo, para que ningún trozo exista siquiera con el secreto
 * dentro.
 *
 * Todos los importadores de texto (obsidian, markdown) caminan por aquí: lo
 * que cambia es el nombre del almacén, no las garantías.
 */
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

/**
 * Camina un árbol de ficheros (o un fichero suelto) y devuelve sus trozos.
 * Lo excluido no se lee (ni se cuenta como secreto): lo excluido no existe.
 */
export function importaArbol(ruta: string, opts: OpcionesImporta = {}): RecuerdosImportados {
  const extensiones = (opts.extensiones ?? [".md"]).map((e) => e.toLowerCase());
  const exclusiones = [...EXCLUSION_MINIMA, ...(opts.exclusiones ?? [])];
  const vaultNombre = opts.vaultNombre ?? "vault";
  const trozos: Trozo[] = [];
  const ficheros: string[] = [];
  const excluidos: string[] = [];
  let secretos = 0;

  const absorbe = (abs: string, rel: string): void => {
    if (excluido(rel, exclusiones)) {
      excluidos.push(rel);
      return;
    }
    if (!extensiones.some((e) => rel.toLowerCase().endsWith(e))) return;
    ficheros.push(rel);
    const { texto: limpio, hallazgos } = redacta(readFileSync(abs, "utf8"));
    secretos += hallazgos.length;
    trozos.push(...trocea(`${vaultNombre}/${rel}`, limpio));
  };

  const st = statSync(ruta);
  if (st.isFile()) {
    absorbe(ruta, ruta.split(sep).pop() as string);
  } else {
    const camina = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const abs = join(dir, nombre);
        if (statSync(abs).isDirectory()) {
          camina(abs);
          continue;
        }
        absorbe(abs, relative(ruta, abs).split(sep).join("/"));
      }
    };
    camina(ruta);
  }

  return { vault: vaultNombre, ficheros, excluidos, trozos, secretosRedactados: secretos };
}
