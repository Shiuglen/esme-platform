// Importador del Vault de Obsidian (y de cualquier árbol de markdown).
// El pipeline (excluir → redactar → trocear) vive en importers/arbol.ts:
// lo que cambia aquí es el nombre del almacén, no las garantías.
import { importaArbol, type OpcionesImporta, type RecuerdosImportados } from "./arbol.ts";

export type { OpcionesImporta, RecuerdosImportados };

export function importaVault(ruta: string, opts: OpcionesImporta = {}): RecuerdosImportados {
  return importaArbol(ruta, { vaultNombre: "vault", ...opts });
}
