/**
 * EL DOCUMENTO FIRMADO — la forma de todo lo que la tienda publica.
 *
 * La tienda publica tres cosas con la misma forma: el índice (los módulos),
 * la lista de deseos (la demanda) y el catálogo de recursos (las piezas). Y
 * las tres se firman igual: la firma va sobre los bytes EXACTOS de un JSON con
 * las claves en un orden fijo, y el consumidor los rehace y los verifica.
 *
 * Por qué un módulo genérico y no tres copias: porque el orden de las claves
 * ES parte del contrato, y si cada documento lo tiene por su cuenta, un día
 * uno se olvida de una clave y la firma deja de quadrar (sin que nadie se entere
 * hasta que la tienda deje de verificar).
 *
 * Referencia: core/tienda/deseos-firmados.ts, tienda/firma.ts.
 */
import { createHash } from "node:crypto";
import { firmarBytes, verificarBytes, type FirmaBytes } from "../../tienda/firma.ts";
import {
  llevaDeRaiz,
  llevaDeRaizConDelegados,
  leerLedger,
  huellaDePub,
} from "../../tienda/rotacion.ts";

/**
 * Un documento con su firma encima, tal y como viaja.
 *
 * Los elementos van bajo SU clave («deseos», «recursos»), que es la misma
 * que se firma: el documento en el disco y los bytes firmados son lo mismo.
 */
export type DocumentoFirmado<T> = {
  version: number;
  emitido: number;
  firmante: string;
  firma: FirmaBytes;
} & Record<string, unknown>;

/** Los bytes que se firman (las claves, en este orden FIJO). */
export function cuerpoDocumento(
  clave: string,
  elementos: unknown[],
  version: number,
  emitido: number,
  firmante: string
): string {
  return JSON.stringify({ version, emitido, firmante, [clave]: elementos });
}

/** La huella del cuerpo (hex): qué documento exacto se firmó. */
export function huellaDocumento(
  clave: string,
  elementos: unknown[],
  version: number,
  emitido: number,
  firmante: string
): string {
  return createHash("sha256")
    .update(Buffer.from(cuerpoDocumento(clave, elementos, version, emitido, firmante), "utf8"))
    .digest("hex");
}

/** Firma un documento. */
export function firmaDocumento<T>(
  clave: string,
  elementos: T[],
  version: number,
  privPem: string,
  firmante: string,
  emitido = Date.now()
): DocumentoFirmado<T> {
  const cuerpo = cuerpoDocumento(clave, elementos, version, emitido, firmante);
  return {
    version,
    emitido,
    firmante,
    [clave]: elementos,
    firma: firmarBytes(Buffer.from(cuerpo, "utf8"), privPem, firmante),
  };
}

/**
 * Verifica un documento firmado contra una clave (o varias: la estirpe).
 *
 * Lo que comprueba: que la firma sea de la clave, que el firmante sea quien
 * dice, y que los bytes del cuerpo no hayan cambiado (el hash va dentro de la
 * firma).
 */
export function verificaDocumento<T>(
  clave: string,
  texto: string,
  pubPem: string | string[],
  validaElemento?: (e: unknown) => boolean
): { ok: true; elementos: T[]; emitido: number; firmante: string } | { ok: false; motivo: string } {
  let doc: Partial<DocumentoFirmado<T>> & Record<string, unknown>;
  try {
    doc = JSON.parse(texto) as never;
  } catch {
    return { ok: false, motivo: "el documento no se lee" };
  }
  if (!doc || typeof doc !== "object") return { ok: false, motivo: "el documento no se lee" };
  if (typeof doc.version !== "number") return { ok: false, motivo: "sin versión" };
  if (typeof doc.emitido !== "number") return { ok: false, motivo: "sin fecha de emisión" };
  if (typeof doc.firmante !== "string" || !doc.firmante) {
    return { ok: false, motivo: "sin firmante" };
  }
  const elementos = doc[clave];
  if (!Array.isArray(elementos)) return { ok: false, motivo: `el documento no tiene «${clave}»` };
  if (!doc.firma || typeof doc.firma.signature !== "string" || typeof doc.firma.hash !== "string") {
    return { ok: false, motivo: "sin firma" };
  }

  const cuerpo = cuerpoDocumento(clave, elementos, doc.version, doc.emitido, doc.firmante);
  const bytes = Buffer.from(cuerpo, "utf8");

  const claves = Array.isArray(pubPem) ? pubPem : [pubPem];
  let motivo = "firma Ed25519 inválida";
  let valida = false;
  for (const pem of claves) {
    const v = verificarBytes(bytes, doc.firma, pem);
    if (v.ok) {
      valida = true;
      break;
    }
    motivo = v.razon;
  }
  if (!valida) return { ok: false, motivo };
  if (doc.firma.signed_by !== doc.firmante) {
    return { ok: false, motivo: "la firma no es de quien dice firmar" };
  }
  if (validaElemento) {
    for (const e of elementos) {
      if (!validaElemento(e)) return { ok: false, motivo: "el documento tiene algo que no vale" };
    }
  }

  return {
    ok: true,
    elementos: elementos as T[],
    emitido: doc.emitido,
    firmante: doc.firmante,
  };
}

/**
 * La confianza en el documento: ¿quién lo firmó y le creo?
 *
 * Igual que con el índice: lo firma la llave VIVA (la que publica) y el
 * consumidor verifica caminando la estirpe desde su raíz congelada (o por una
 * delegación).
 */
export function confiaDocumento<T>(
  clave: string,
  texto: string,
  pubRaiz: string,
  rutaLedger: string,
  validaElemento?: (e: unknown) => boolean
): { ok: boolean; via: "directa" | "cadena" | "delegada" | "ninguna"; elementos?: T[] } {
  const v = verificaDocumento<T>(clave, texto, pubRaiz, validaElemento);
  if (v.ok) return { ok: true, via: "directa", elementos: v.elementos };

  let firmante: string | undefined;
  try {
    firmante = (JSON.parse(texto) as { firmante?: string }).firmante;
  } catch {
    return { ok: false, via: "ninguna" };
  }
  if (!firmante) return { ok: false, via: "ninguna" };

  const ledger = leerLedger(rutaLedger);
  const pub = pubDeFirmante(firmante, ledger);
  if (!pub) return { ok: false, via: "ninguna" };

  const huellaRaiz = huellaDePub(pubRaiz);
  const paseo = llevaDeRaiz(huellaRaiz, firmante, ledger.sucesiones, pubRaiz);
  if (paseo.ok) {
    const check = verificaDocumento<T>(clave, texto, pub, validaElemento);
    return check.ok ? { ok: true, via: "cadena", elementos: check.elementos } : { ok: false, via: "ninguna" };
  }
  const delegada = llevaDeRaizConDelegados(
    huellaRaiz,
    firmante,
    ledger.sucesiones,
    (ledger.delegaciones ?? []).filter((d) => d.ambito === "publicar"),
    pubRaiz
  );
  if (delegada.ok) {
    const check = verificaDocumento<T>(clave, texto, pub, validaElemento);
    return check.ok ? { ok: true, via: "delegada", elementos: check.elementos } : { ok: false, via: "ninguna" };
  }
  return { ok: false, via: "ninguna" };
}

/** La clave pública de un firmante (la del ledger). */
function pubDeFirmante(
  huella: string,
  ledger: {
    sucesiones: Array<{ vieja: { huella: string; pub: string }; nueva: { huella: string; pub: string } }>;
    delegaciones?: Array<{ mandante: { huella: string; pub: string }; delegado: { huella: string; pub: string } }>;
  }
): string | null {
  for (const c of ledger.sucesiones) {
    if (c.nueva.huella === huella) return c.nueva.pub;
    if (c.vieja.huella === huella) return c.vieja.pub;
  }
  for (const d of ledger.delegaciones ?? []) {
    if (d.delegado.huella === huella) return d.delegado.pub;
    if (d.mandante.huella === huella) return d.mandante.pub;
  }
  return null;
}
