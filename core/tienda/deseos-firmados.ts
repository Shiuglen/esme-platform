/**
 * LOS DESEOS, FIRMADOS — la lista de deseos de la tienda, con su firma.
 *
 * Lo que guardas en tu X es la demanda: lo que le falta a Esme. Y una demanda
 * sin firmar no es demanda: es ruido (nadie podría saber si la lista es
 * cierta). Así que la lista viaja FIRMADA, como el índice, y el consumidor la
 * verifica con la raíz congelada antes de fiarse de ella.
 *
 * Los bytes que se firman son un JSON con las claves en un orden FIJO (el
 * orden es parte del contrato: el que verifica tiene que rehacer los bytes
 * exactos). Referencia: tienda/veredictos-modulos.ts (el mismo patrón).
 */
import { firmarBytes, verificarBytes, type FirmaBytes } from "../../tienda/firma.ts";
import {
  llevaDeRaiz,
  llevaDeRaizConDelegados,
  leerLedger,
  huellaDePub,
} from "../../tienda/rotacion.ts";
import { createHash } from "node:crypto";
import type { Deseo } from "./deseos.ts";

/** La versión del documento de deseos. */
export const DESEOS_VERSION = 1;

/** El documento con su firma: lo que viaja. */
export interface DeseosFirmados {
  version: number;
  emitido: number;
  firmante: string;
  deseos: Array<Deseo & { entra: boolean }>;
  firma: FirmaBytes;
}

/** Los bytes que se firman (las claves, en este orden). */
export function cuerpoDeseos(deseos: Deseo[], emitido: number, firmante: string): string {
  return JSON.stringify({
    version: DESEOS_VERSION,
    emitido,
    firmante,
    deseos: deseos.map((d) => ({
      id: d.id,
      url: d.url,
      autor: d.autor,
      texto: d.texto,
      etiquetas: d.etiquetas,
      estado: d.estado,
      modulo: d.modulo,
      ts: d.ts,
    })),
  });
}

/**
 * La huella del cuerpo: qué lista exacta se firmó (sha256 en hex).
 *
 * Es el mismo convenio del resto de la casa: el hash va en HEX (como el árbol
 * de un módulo) y la firma lleva el suyo en base64.
 */
export function deseosSha256(deseos: Deseo[], emitido: number, firmante: string): string {
  return createHash("sha256")
    .update(Buffer.from(cuerpoDeseos(deseos, emitido, firmante), "utf8"))
    .digest("hex");
}

/** Firma la lista. */
export function firmaDeseos(
  deseos: Deseo[],
  privPem: string,
  firmante: string,
  emitido = Date.now()
): DeseosFirmados {
  const cuerpo = cuerpoDeseos(deseos, emitido, firmante);
  return {
    version: DESEOS_VERSION,
    emitido,
    firmante,
    deseos: deseos.map((d) => ({ ...d, entra: true })),
    firma: firmarBytes(Buffer.from(cuerpo, "utf8"), privPem, firmante),
  };
}

/**
 * Verifica la lista firmada contra una clave (o varias: la estirpe).
 *
 * Lo que comprueba: que la firma sea de la clave, que el firmante sea quien
 * dice, y que los bytes del cuerpo no hayan cambiado.
 */
export function verificaDeseos(
  texto: string,
  pubPem: string | string[]
): { ok: true; deseos: Array<Deseo & { entra: boolean }>; emitido: number; firmante: string } | { ok: false; motivo: string } {
  let doc: Partial<DeseosFirmados>;
  try {
    doc = JSON.parse(texto) as Partial<DeseosFirmados>;
  } catch {
    return { ok: false, motivo: "la lista no se lee" };
  }
  if (!doc || typeof doc !== "object") return { ok: false, motivo: "la lista no se lee" };
  if (doc.version !== DESEOS_VERSION) {
    return { ok: false, motivo: `versión ${String(doc.version)} (se espera ${DESEOS_VERSION})` };
  }
  if (typeof doc.emitido !== "number") return { ok: false, motivo: "sin fecha de emisión" };
  if (typeof doc.firmante !== "string" || !doc.firmante) {
    return { ok: false, motivo: "sin firmante" };
  }
  if (!Array.isArray(doc.deseos)) return { ok: false, motivo: "la lista no tiene deseos" };
  if (!doc.firma || typeof doc.firma.signature !== "string" || typeof doc.firma.hash !== "string") {
    return { ok: false, motivo: "sin firma" };
  }

  // los bytes se rehacen EXACTOS (el orden de las claves es parte del
  // contrato) y se verifican contra la firma: si un byte cambió, no vale.
  const cuerpo = cuerpoDeseos(
    doc.deseos.map(({ entra: _entra, ...d }) => d),
    doc.emitido,
    doc.firmante
  );
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

  return {
    ok: true,
    deseos: doc.deseos as Array<Deseo & { entra: boolean }>,
    emitido: doc.emitido,
    firmante: doc.firmante,
  };
}


/**
 * La confianza en la lista firmada: ¿quién la firmó y le creo?
 *
 * Igual que con el índice: la lista la firma la llave VIVA (la que publica),
 * y el consumidor la verifica caminando la estirpe desde su raíz congelada
 * (o por una delegación). La lista se verifica como el índice: mismo camino,
 * mismas reglas.
 */
export function confiaDeseos(
  texto: string,
  pubRaiz: string,
  rutaLedger: string
): { ok: boolean; via: "directa" | "cadena" | "delegada" | "ninguna"; publicKey?: string } {
  const v = verificaDeseos(texto, pubRaiz);
  if (v.ok) return { ok: true, via: "directa", publicKey: pubRaiz };

  // el firmante de la lista
  let firmante: string | undefined;
  try {
    firmante = (JSON.parse(texto) as { firmante?: string }).firmante;
  } catch {
    return { ok: false, via: "ninguna" };
  }
  if (!firmante) return { ok: false, via: "ninguna" };

  // la pub de ese firmante: la del ledger (las claves declaradas viven en
  // el índice y en el libro de rotaciones)
  const ledger = leerLedger(rutaLedger);
  const pub = pubDeFirmante(firmante, ledger);
  if (!pub) return { ok: false, via: "ninguna" };

  const huellaRaiz = huellaDePub(pubRaiz);
  const paseo = llevaDeRaiz(huellaRaiz, firmante, ledger.sucesiones, pubRaiz);
  if (paseo.ok) {
    const check = verificaDeseos(texto, pub);
    return check.ok ? { ok: true, via: "cadena", publicKey: pub } : { ok: false, via: "ninguna" };
  }
  const delegada = llevaDeRaizConDelegados(
    huellaRaiz,
    firmante,
    ledger.sucesiones,
    (ledger.delegaciones ?? []).filter((d) => d.ambito === "publicar"),
    pubRaiz
  );
  if (delegada.ok) {
    const check = verificaDeseos(texto, pub);
    return check.ok ? { ok: true, via: "delegada", publicKey: pub } : { ok: false, via: "ninguna" };
  }
  return { ok: false, via: "ninguna" };
}

/** La clave pública de un firmante (la del ledger: sucesiones y delegaciones). */
function pubDeFirmante(
  huella: string,
  ledger: { sucesiones: Array<{ vieja: { huella: string; pub: string }; nueva: { huella: string; pub: string } }>; delegaciones?: Array<{ mandante: { huella: string; pub: string }; delegado: { huella: string; pub: string } }> }
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
