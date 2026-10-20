// revocacion — el libro de las claves caídas.
// Una clave comprometida no se borra: se ANOTA como revocada, con firma de
// la propia clave de raíz. Todo veredicto posterior (índice, artefactos)
// cae con ella: si la clave que firmó el índice aparece en este libro, la
// tienda entera deja de ser confiable hasta que se robe con clave nueva.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { firmarBytes, verificarBytes, type FirmaBytes } from "./firma.ts";

export interface Revocacion {
  huella: string; // la huella de la clave revocada (16 hex)
  motivo: string;
  fecha: string; // ISO
  firma: FirmaBytes; // firmado por la clave de raíz
}

export interface LibroRevocaciones {
  revocaciones: Revocacion[];
}

/** Anota una revocación (la firma la clave que manda sobre la tienda). */
export function anotarRevocacion(
  huella: string,
  motivo: string,
  privPem: string,
  ruta: string
): Revocacion {
  if (!/^[0-9a-f]{16}$/.test(huella))
    throw new Error(`huella inválida: ${huella} (esperadas 16 hex)`);
  const libro = leerRevocaciones(ruta);
  if (libro.revocaciones.some((r) => r.huella === huella))
    throw new Error(`la clave ${huella} ya está revocada`);
  const rev: Revocacion = {
    huella,
    motivo,
    fecha: new Date().toISOString(),
    firma: firmarBytes(Buffer.from(`revocar:${huella}`), privPem, huella),
  };
  const nuevo: LibroRevocaciones = { revocaciones: [...libro.revocaciones, rev] };
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(nuevo, null, 2) + "\n");
  return rev;
}

export function leerRevocaciones(ruta: string): LibroRevocaciones {
  if (!existsSync(ruta)) return { revocaciones: [] };
  const crudo = JSON.parse(readFileSync(ruta, "utf8")) as LibroRevocaciones;
  return { revocaciones: Array.isArray(crudo.revocaciones) ? crudo.revocaciones : [] };
}

/** ¿Tiene esta clave una revocación VALIDADA por la clave de raíz? */
export function estaRevocada(
  huella: string,
  ruta: string,
  pubRaiz: string
): boolean {
  const libro = leerRevocaciones(ruta);
  return libro.revocaciones.some(
    (r) =>
      r.huella === huella &&
      verificarBytes(Buffer.from(`revocar:${huella}`), r.firma, pubRaiz).ok
  );
}

/** Elimina una anotación corrupta o equivocada (solo para mantenimiento). */
export function quitarRevocacion(huella: string, ruta: string): number {
  const libro = leerRevocaciones(ruta);
  const antes = libro.revocaciones.length;
  const nuevo = {
    revocaciones: libro.revocaciones.filter((r) => r.huella !== huella),
  };
  writeFileSync(ruta, JSON.stringify(nuevo, null, 2) + "\n");
  return antes - nuevo.revocaciones.length;
}

export const rutaRevocaciones = (raiz: string) =>
  join(raiz, "tienda", "revocaciones.json");
