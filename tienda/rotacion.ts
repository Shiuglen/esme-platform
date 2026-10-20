// rotacion — el certificado de sucesión entre claves mandantes.
//
// El rompecabezas: el consumidor fija UNA clave raíz puesta en el repo. Si la
// llave rota ¿cómo sabe que la nueva es legitima y no un hijack? Respuesta:
// la VIEJA firma «me sucede la nueva» Y la NUEVA firma el mismo papel
// (doble atestación). El consumidor camina la cadena de certificados desde
// su raíz congelada hasta el firmante actual del índice. Sincoe, no hay
// camino que valga: la nueva clave no es de la estirpe.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { createPublicKey, sign, verify } from "node:crypto";
import { generarPar, verificarIndex } from "./firma.ts";

export interface ClaveDeclarada {
  huella: string; // 16 hex
  pub: string; // pem spki
}

export interface CertRotacion {
  vieja: ClaveDeclarada;
  nueva: ClaveDeclarada;
  motivo: string;
  fecha: string; // ISO
  firmaVieja: string; // base64 — atestigua la que muere
  firmaNueva: string; // base64 — atestigua la que nace
}

export interface LedgerRotaciones {
  sucesiones: CertRotacion[];
}

export const huellaDePub = (pubPem: string): string =>
  createHash("sha256")
    .update(createPublicKey(pubPem).export({ type: "spki", format: "pem" }))
    .digest("hex")
    .slice(0, 16);

export const bytesDe = (c: CertRotacion): Buffer =>
  Buffer.from(
    JSON.stringify({
      vieja: c.vieja,
      nueva: c.nueva,
      motivo: c.motivo,
      fecha: c.fecha,
    }),
    "utf8"
  );

/** Doble atestación: expira una y nace otra, y las DOS firman el papel. */
export function crearCertificado(
  huellaV: string,
  pubV: string,
  huellaN: string,
  pubN: string,
  privV: string,
  privN: string,
  motivo: string
): CertRotacion {
  if (huellaDePub(pubV) !== huellaV)
    throw new Error("la huella vieja no corresponde a su pub");
  if (huellaDePub(pubN) !== huellaN)
    throw new Error("la huella nueva no corresponde a su pub");
  if (huellaDePub(pubV) === huellaDePub(pubN))
    throw new Error("misma clave a ambos lados: un certificado a sí mismo no rota nada");

  const base = {
    vieja: { huella: huellaV, pub: pubV },
    nueva: { huella: huellaN, pub: pubN },
    motivo,
    fecha: new Date().toISOString(),
  };
  const bytes = Buffer.from(JSON.stringify(base), "utf8");
  return {
    ...base,
    firmaVieja: sign(null, bytes, privV).toString("base64"),
    firmaNueva: sign(null, bytes, privN).toString("base64"),
  };
}

/** Ambas firmas valen contra las pubs que el CERTIFICADO declara. */
export function certificadoValido(c: CertRotacion): boolean {
  const bytes = bytesDe(c);
  try {
    const v = (firma: string, pub: string) => verify(null, bytes, createPublicKey(pub), Buffer.from(firma, "base64"));
    return v(c.firmaVieja, c.vieja.pub) && v(c.firmaNueva, c.nueva.pub);
  } catch {
    return false;
  }
}

/** ¿Hay un camino dual-firmado desde la raíz pegada hasta esta huella?
 * pubAncla: la pub CONGELADA que el consumidor fijó — el primer salto debe
 * mostrar esa pub física, no una que el certificado se declare a sí mismo. */
export function llevaDeRaiz(
  huellaInicial: string,
  huellaObjetivo: string,
  certs: CertRotacion[],
  pubAncla?: string
): { ok: boolean; pasos: string[] } {
  const pasos: string[] = [];
  let actual = huellaInicial;
  let pubActual: string | null = pubAncla ?? null;
  for (let i = 0; i < 16; i++) {
    // max 16 saltos: si hay más, algo está podrido
    // el ancla se compara por HUELLA canónica, no por texto del pem
    // (env y ficheros no siempre traen el mismo salto de línea)
    const huellaAncla = pubActual ? huellaDePub(pubActual) : null;
    const salto = certs.find(
      (c) =>
        c.vieja.huella === actual &&
        certificadoValido(c) &&
        (!huellaAncla || huellaDePub(c.vieja.pub) === huellaAncla)
    );
    if (!salto) return { ok: actual === huellaObjetivo, pasos };
    actual = salto.nueva.huella;
    pubActual = salto.nueva.pub;
    pasos.push(`${salto.vieja.huella.slice(0, 8)}→${salto.nueva.huella.slice(0, 8)}`);
    if (actual === huellaObjetivo) return { ok: true, pasos };
  }
  return { ok: false, pasos };
}

export function leerLedger(ruta: string): LedgerRotaciones {
  if (!existsSync(ruta)) return { sucesiones: [] };
  const crudo = JSON.parse(readFileSync(ruta, "utf8")) as LedgerRotaciones;
  return { sucesiones: Array.isArray(crudo.sucesiones) ? crudo.sucesiones : [] };
}

export function guardarLedger(ruta: string, ledger: LedgerRotaciones): void {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(ledger, null, 2) + "\n");
}

/** Rotación completa de un solo golpe: par nuevo + certificado dual. */
export function rotarYCertificar(
  privVieja: string,
  rutaLedger: string,
  motivo: string
): { par: ReturnType<typeof generarPar>; cert: CertRotacion } {
  const pubVieja = createPublicKey(privVieja).export({ type: "spki", format: "pem" }).toString();
  const huellaVieja = huellaDePub(pubVieja);
  const par = generarPar();
  const cert = crearCertificado(
    huellaVieja,
    pubVieja,
    par.huella,
    par.pub,
    privVieja,
    par.priv,
    motivo
  );
  const ledger = leerLedger(rutaLedger);
  guardarLedger(rutaLedger, { sucesiones: [...ledger.sucesiones, cert] });
  return { par, cert };
}

export const rutaRotaciones = (raiz: string) => join(raiz, "tienda", "rotaciones.json");

/** ¿El índice es confiable para QUIEN fija esa raíz? Directa, o por la
 * estirpe de rotaciones. Devuelve la pub ACTIVA que declaró el índice */
export function confiaIndexChain(
  indice: Record<string, unknown>,
  pubRaiz: string,
  rutaLedger: string
): { ok: boolean; via: "directa" | "cadena" | "ninguna"; pubActiva?: string } {
  if (verificarIndex(indice, pubRaiz).ok)
    return { ok: true, via: "directa", pubActiva: pubRaiz };
  const huellaFirmante = (indice.signature as { signed_by?: string } | undefined)?.signed_by;
  if (!huellaFirmante) return { ok: false, via: "ninguna" };
  const claves = indice.claves as Record<string, string> | undefined;
  const pubFirmante = claves?.[huellaFirmante];
  if (!pubFirmante || huellaDePub(pubFirmante) !== huellaFirmante)
    return { ok: false, via: "ninguna" };
  const paseo = llevaDeRaiz(
    huellaDePub(pubRaiz),
    huellaFirmante,
    leerLedger(rutaLedger).sucesiones,
    pubRaiz
  );
  if (!paseo.ok) return { ok: false, via: "ninguna" };
  // la pub declarada INSIDE the índice firmado ya vale: la cadena la avala
  return verificarIndex(indice, pubFirmante).ok
    ? { ok: true, via: "cadena", pubActiva: pubFirmante }
    : { ok: false, via: "ninguna" };
}
