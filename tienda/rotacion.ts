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
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
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
  /**
   * Las DELEGACIONES: llaves a las que la casa da derecho a publicar.
   *
   * Una sucesión es «esta llave muere y nace otra»: una sola línea, la que
   * publica. Una delegación es «esta llave sigue, y además otra puede
   * publicar»: hace falta para que la tienda sea federada (que cualquiera
   * pueda publicar, sin que el mantenedor firme cada módulo).
   */
  delegaciones?: CertDelegacion[];
}

/**
 * Una delegación: la mandante avala a la delegada.
 *
 * `ambito` dice hasta dónde llega: «publicar» (firmar el índice de la tienda)
 * es lo único que se delega hoy. Delegar el índice ES delegar la tienda, así
 * que se puede revocar (tienda/revocacion.ts) y se escribe en el ledger,
 * que es público.
 */
export interface CertDelegacion {
  /** La llave que delega. */
  mandante: ClaveDeclarada;
  /** La llave a la que se delega. */
  delegado: ClaveDeclarada;
  /** Hasta dónde llega la delegación. */
  ambito: "publicar";
  /** Por qué se delegó (queda escrito, para siempre). */
  motivo: string;
  /** Cuándo. */
  fecha: string;
  /** La firma de la mandante (base64). */
  firma: string;
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
  if (!existsSync(ruta)) return { sucesiones: [], delegaciones: [] };
  const crudo = JSON.parse(readFileSync(ruta, "utf8")) as LedgerRotaciones;
  return {
    sucesiones: Array.isArray(crudo.sucesiones) ? crudo.sucesiones : [],
    delegaciones: Array.isArray(crudo.delegaciones) ? crudo.delegaciones : [],
  };
}

export function guardarLedger(ruta: string, ledger: LedgerRotaciones): void {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify(ledger, null, 2) + "\n");
}

/** Los bytes que firma una delegación (la mandante avala a la delegada). */
export function bytesDeDelegacion(d: CertDelegacion): Buffer {
  return Buffer.from(
    JSON.stringify({
      mandante: d.mandante,
      delegado: d.delegado,
      ambito: d.ambito,
      motivo: d.motivo,
      fecha: d.fecha,
    }),
    "utf8"
  );
}

/**
 * Crea una delegación: la mandante avala a la delegada.
 *
 * La firma es de la MANDANTE (no de las dos): delegar es un acto de la
 * mandante, y la delegada no tiene por qué saber que le van a delegar.
 */
export function crearDelegacion(
  pubMandante: string,
  pubDelegado: string,
  privMandante: string,
  motivo: string,
  ambito: CertDelegacion["ambito"] = "publicar"
): CertDelegacion {
  const mandante = {
    huella: huellaDePub(pubMandante),
    pub: pubMandante,
  };
  const delegado = {
    huella: huellaDePub(pubDelegado),
    pub: pubDelegado,
  };
  if (mandante.huella === delegado.huella) {
    throw new Error("delegarse a sí misma no delega nada");
  }
  const cert: CertDelegacion = {
    mandante,
    delegado,
    ambito,
    motivo,
    fecha: new Date().toISOString().slice(0, 10),
    firma: "",
  };
  const bytes = bytesDeDelegacion(cert);
  cert.firma = sign(null, bytes, createPrivateKey(privMandante)).toString("base64");
  return cert;
}

/** ¿La delegación está bien firmada por su mandante? */
export function delegacionValida(d: CertDelegacion): boolean {
  try {
    return verify(
      null,
      bytesDeDelegacion(d),
      createPublicKey(d.mandante.pub),
      Buffer.from(d.firma, "base64")
    );
  } catch {
    return false;
  }
}

/**
 * El camino desde la raíz hasta una llave, contando las DELEGACIONES.
 *
 * El grafo es: la raíz confunde (sucesiones) y además delega (delegaciones).
 * Se camina en anchura: desde la raíz se llega a sus sucesoras y a sus
 * delegadas; desde cada una de ésas, a las suyas. Una llave delegada puede
 * delegar a su vez.
 *
 * Lo que NO se comprueba aquí: el ámbito. Eso lo comprueba quien llama (el
 * índice sólo lo acepta con ámbito «publicar»).
 */
export function llevaDeRaizConDelegados(
  huellaInicial: string,
  huellaObjetivo: string,
  sucesiones: CertRotacion[],
  delegaciones: CertDelegacion[],
  pubAncla?: string
): { ok: boolean; pasos: string[] } {
  const pasos: string[] = [];
  if (huellaInicial === huellaObjetivo) return { ok: true, pasos };

  // de confianzas: huella → pub (para validar el ancla de cada salto)
  const pubs = new Map<string, string>();
  if (pubAncla) pubs.set(huellaInicial, pubAncla);
  for (const c of sucesiones) {
    pubs.set(c.vieja.huella, c.vieja.pub);
    pubs.set(c.nueva.huella, c.nueva.pub);
  }
  for (const d of delegaciones) {
    pubs.set(d.mandante.huella, d.mandante.pub);
    pubs.set(d.delegado.huella, d.delegado.pub);
  }

  const vistos = new Set<string>([huellaInicial]);
  let frontera = [huellaInicial];
  for (let ronda = 0; ronda < 16 && frontera.length; ronda++) {
    const siguiente: string[] = [];
    for (const actual of frontera) {
      // 1. las sucesiones: esta llave muere y nace otra
      for (const c of sucesiones) {
        if (c.vieja.huella !== actual || !certificadoValido(c)) continue;
        if (!pubs.has(c.nueva.huella)) pubs.set(c.nueva.huella, c.nueva.pub);
        pasos.push(`${c.vieja.huella.slice(0, 8)}→${c.nueva.huella.slice(0, 8)}`);
        if (c.nueva.huella === huellaObjetivo) return { ok: true, pasos };
        if (!vistos.has(c.nueva.huella)) {
          vistos.add(c.nueva.huella);
          siguiente.push(c.nueva.huella);
        }
      }
      // 2. las delegaciones: esta llave sigue, y además otra puede publicar
      for (const d of delegaciones) {
        if (d.mandante.huella !== actual || !delegacionValida(d)) continue;
        if (!pubs.has(d.delegado.huella)) pubs.set(d.delegado.huella, d.delegado.pub);
        pasos.push(`${d.mandante.huella.slice(0, 8)}→${d.delegado.huella.slice(0, 8)} (delega)`);
        if (d.delegado.huella === huellaObjetivo) return { ok: true, pasos };
        if (!vistos.has(d.delegado.huella)) {
          vistos.add(d.delegado.huella);
          siguiente.push(d.delegado.huella);
        }
      }
    }
    frontera = siguiente;
  }
  return { ok: false, pasos };
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
): { ok: boolean; via: "directa" | "cadena" | "delegada" | "ninguna"; pubActiva?: string } {
  if (verificarIndex(indice, pubRaiz).ok)
    return { ok: true, via: "directa", pubActiva: pubRaiz };
  const huellaFirmante = (indice.signature as { signed_by?: string } | undefined)?.signed_by;
  if (!huellaFirmante) return { ok: false, via: "ninguna" };
  const claves = indice.claves as Record<string, string> | undefined;
  const pubFirmante = claves?.[huellaFirmante];
  if (!pubFirmante || huellaDePub(pubFirmante) !== huellaFirmante)
    return { ok: false, via: "ninguna" };
  const ledger = leerLedger(rutaLedger);

  // 1. la cadena de sucesiones (la llave que publica fue sucesora de la raíz)
  const paseo = llevaDeRaiz(
    huellaDePub(pubRaiz),
    huellaFirmante,
    ledger.sucesiones,
    pubRaiz
  );
  if (paseo.ok) {
    return verificarIndex(indice, pubFirmante).ok
      ? { ok: true, via: "cadena", pubActiva: pubFirmante }
      : { ok: false, via: "ninguna" };
  }

  // 2. la delegación: la raíz (o su estirpe) le dio derecho a publicar
  const delegado = llevaDeRaizConDelegados(
    huellaDePub(pubRaiz),
    huellaFirmante,
    ledger.sucesiones,
    (ledger.delegaciones ?? []).filter((d) => d.ambito === "publicar"),
    pubRaiz
  );
  if (delegado.ok) {
    return verificarIndex(indice, pubFirmante).ok
      ? { ok: true, via: "delegada", pubActiva: pubFirmante }
      : { ok: false, via: "ninguna" };
  }

  return { ok: false, via: "ninguna" };
}
