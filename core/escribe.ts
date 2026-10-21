/**
 * ESCRIBIR SIN ROMPER — la escritura atómica.
 *
 * Lo que se aprendió del espejo de openrig (`atomic-text-write.ts`): un
 * fichero que se escribe a medias es un fichero roto. Y en esta casa hay
 * ficheros que NO PUEDEN estar rotos: el índice firmado de la tienda, la lista
 * de deseos, el veredicto. Si el proceso muere mientras los escribe (y este
 * proceso se apaga a menudo), la tienda queda sin verificar — y nadie sabe
 * por qué.
 *
 * La regla es la de siempre: escribir a otro lado y RENOMBRAR (el rename es
 * atómico en el mismo sistema de ficheros). Si se muere antes del rename, el
 * fichero viejo sigue ahí, entero: la casa nunca se queda a medias.
 *
 * Referencia: docs/INCIDENTE.md, tienda/empaque.ts.
 */
import { existsSync, renameSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Escribe un fichero sin que se pueda quedar a medias.
 *
 * Lo que hace: escribe en un temporal al lado, lo renombra encima (atómico)
 * y borra el temporal si algo falla. Devuelve la ruta.
 */
export function escribeAtomico(ruta: string, datos: string | Buffer): string {
  const dir = dirname(ruta);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const temporal = join(dir, `.${randomBytes(6).toString("hex")}.tmp`);
  try {
    writeFileSync(temporal, datos);
    renameSync(temporal, ruta);
  } catch (e) {
    // si algo falla, el temporal no se queda dando vueltas
    try {
      if (existsSync(temporal)) unlinkSync(temporal);
    } catch {
      // y si tampoco se puede borrar, no es para tanto
    }
    throw e;
  }
  return ruta;
}

/** Escribe un JSON (con su salto de línea final) sin quedarse a medias. */
export function escribeJsonAtomico(ruta: string, dato: unknown): string {
  return escribeAtomico(ruta, JSON.stringify(dato, null, 2) + "\n");
}
