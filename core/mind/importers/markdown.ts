// Importador de markdown: un fichero suelto (una nota, un artículo, un README)
// o un árbol de notas que no es de Obsidian.
//
// El pipeline es el de siempre: EXCLUIR → REDACTAR → TROCEAR. Lo que entra en
// la mente son unidades que la Lente sí encuentra (apartados, párrafos, filas
// de tabla), no un bloque entero.
import { importaArbol, type OpcionesImporta, type RecuerdosImportados } from "./arbol.ts";

export type { OpcionesImporta, RecuerdosImportados };

export function importaMarkdown(ruta: string, opts: OpcionesImporta = {}): RecuerdosImportados {
  return importaArbol(ruta, { vaultNombre: "markdown", extensiones: [".md", ".markdown"], ...opts });
}
