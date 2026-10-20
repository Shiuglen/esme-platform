/**
 * veredictos-modulos.ts — el veredicto de los módulos, firmado.
 *
 * El juez (`core/modulos/veredicto.ts`) dicta módulo por módulo: entra o no
 * entra, con qué nivel y por qué. Aquí se juntan TODOS esos dictámenes en un
 * documento, se atan al catálogo exacto que se juzgó y se FIRMAN.
 *
 * Es el mismo camino que el juez de las skills (`tienda/skills.ts`), con una
 * diferencia que importa: el juez de los módulos MIDE (abre el módulo en su
 * worker, lo ejercita con su puerta real y mira lo que toca). Por eso su
 * veredicto lleva la huella del ÁRBOL que se miró: la app puede negarse a
 * activar un árbol que no sea exactamente el que el juez miró.
 *
 * El bytes que se firman son un JSON con las claves en un orden FIJO: el
 * orden es parte del contrato (`estandar/module-veredicto.spec.yaml`). Quien
 * verifica tiene que sacar los mismos bytes que quien firmó, y el hash que
 * va dentro de la firma lo comprueba sin preguntar a nadie.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { canonical, firmarBytes, type FirmaBytes } from "./firma.ts";
import type { VeredictoModulo } from "../core/modulos/veredicto.ts";

/** La versión del veredicto de módulos. Cambia si cambia el formato firmado. */
export const VEREDICTO_MODULOS_VERSION = 1;

/** Un veredicto con la huella del árbol que se miró. */
export type VeredictoModuloFirmado = VeredictoModulo & { arbolSha256: string };

/** El documento: el veredicto de cada módulo del catálogo. */
export interface VeredictosModulos {
  version: number;
  emitido: number;
  firmante: string;
  catalogoSha256: string;
  modulos: VeredictoModuloFirmado[];
}

/** El documento con su firma: lo que se publica y lo que la app verifica. */
export interface VeredictosModulosFirmados extends VeredictosModulos {
  firma: FirmaBytes;
}

/** Una entrada del catálogo de módulos (el índice de la Tienda). */
export interface ModuloCatalogo {
  id: string;
  version: string;
  category?: string;
  firma_ok?: boolean;
  artefacto?: { tar?: string; bytes?: number };
  [k: string]: unknown;
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * La huella del catálogo: qué catálogo exacto se juzgó. El canónico (claves
 * ordenadas) para que el formato del fichero no altere la huella — la app
 * calcula la misma con el mismo catálogo en memoria.
 */
export function catalogoModulosSha256(catalogo: unknown): string {
  return createHash("sha256").update(canonical(catalogo)).digest("hex");
}

/**
 * La proyección ESTABLE del catálogo de módulos: la identidad de lo que se
 * publica, y nada más.
 *
 * El índice de la Tienda lleva dentro los números del bench (el recall, los
 * tokens, la fecha del examen): eso cambia cada vez que se mide, y si la
 * huella del catálogo dependiera de ello, el veredicto dejaría de aplicar
 * cada día sin que nadie hubiera tocado un módulo. La proyección se queda con
 * lo que NO cambia sin que cambie el módulo: qué es, qué versión y qué
 * artefacto exacto (el sha256 del tarball firmado).
 *
 * La app calcula la misma proyección con el índice que tiene en la mano.
 */
export function proyeccionCatalogo(catalogo: unknown): {
  id: string;
  version: string;
  artefacto: string;
}[] {
  const lista = Array.isArray(catalogo) ? (catalogo as ModuloCatalogo[]) : [];
  return lista
    .map((c) => ({
      id: typeof c?.id === "string" ? c.id : "",
      version: typeof c?.version === "string" ? c.version : "",
      artefacto:
        typeof c?.artefacto?.tar === "string" ? c.artefacto.tar : "",
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * El cuerpo firmado: JSON con las claves en un orden FIJO. No se ordena nada
 * (el orden de las claves es parte de la spec): el que verifica tiene que
 * sacar los mismos bytes que el que firmó.
 * Ver `estandar/module-veredicto.spec.yaml`.
 */
export function cuerpoVeredictosModulos(v: VeredictosModulos): string {
  return JSON.stringify({
    version: v.version,
    emitido: v.emitido,
    firmante: v.firmante,
    catalogoSha256: v.catalogoSha256,
    modulos: v.modulos.map((m) => ({
      id: m.id,
      version: m.version,
      arbolSha256: m.arbolSha256,
      entra: m.entra,
      nivel: m.nivel,
      causa: m.causa,
      medidas: {
        orden: m.medidas.orden,
        carga: m.medidas.carga,
        forma: m.medidas.forma,
        recallBase: m.medidas.recallBase,
        recallCon: m.medidas.recallCon,
        delta: m.medidas.delta,
        tokensBase: m.medidas.tokensBase,
        tokensCon: m.medidas.tokensCon,
        tokensCiclo: m.medidas.tokensCiclo,
        cicloOk: m.medidas.cicloOk,
        coste: m.medidas.coste,
        costePorPunto: m.medidas.costePorPunto,
        declaradas: m.medidas.declaradas,
        usadas: m.medidas.usadas,
        casos: m.medidas.casos,
      },
    })),
  });
}

/** Firma el veredicto: los bytes firmados son el cuerpo, sin la firma. */
export function firmaVeredictosModulos(
  v: VeredictosModulos,
  privPem: string
): VeredictosModulosFirmados {
  const bytes = Buffer.from(cuerpoVeredictosModulos(v), "utf8");
  return { ...v, firma: firmarBytes(bytes, privPem, v.firmante) };
}

const esNumeroONulo = (x: unknown): x is number | null =>
  typeof x === "number" || x === null;

const esMedidas = (x: unknown): boolean => {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  return (
    Array.isArray(m.orden) &&
    typeof m.carga === "boolean" &&
    (m.forma === "ciclo" || m.forma === "memoria" || m.forma === "sin-medida") &&
    esNumeroONulo(m.recallBase) &&
    esNumeroONulo(m.recallCon) &&
    esNumeroONulo(m.delta) &&
    esNumeroONulo(m.tokensBase) &&
    esNumeroONulo(m.tokensCon) &&
    esNumeroONulo(m.tokensCiclo) &&
    (typeof m.cicloOk === "boolean" || m.cicloOk === null) &&
    esNumeroONulo(m.coste) &&
    esNumeroONulo(m.costePorPunto) &&
    Array.isArray(m.declaradas) &&
    m.declaradas.every((d) => typeof d === "string") &&
    Array.isArray(m.usadas) &&
    m.usadas.every((u) => typeof u === "string") &&
    typeof m.casos === "number"
  );
};

const esVeredicto = (v: unknown): v is VeredictoModuloFirmado => {
  const x = v as Partial<VeredictoModuloFirmado>;
  return (
    !!x &&
    typeof x === "object" &&
    typeof x.id === "string" &&
    typeof x.version === "string" &&
    typeof x.arbolSha256 === "string" &&
    HEX64.test(x.arbolSha256) &&
    typeof x.entra === "boolean" &&
    (x.nivel === "ok" || x.nivel === "aviso" || x.nivel === "fuera") &&
    typeof x.causa === "string" &&
    !!x.medidas &&
    esMedidas(x.medidas)
  );
};

/**
 * Comprueba el veredicto firmado contra una clave pública (o varias: la
 * app guarda una lista). Cuatro preguntas: ¿el cuerpo es el que se firmó?
 * (hash) ¿la firma es de esa clave? (Ed25519) ¿la firma es de quien dice
 * firmar? (huella) ¿cada módulo trae la forma prometida?
 */
export function verificaVeredictosModulos(
  texto: string,
  pubPem: string | string[]
):
  | {
      ok: true;
      modulos: VeredictoModuloFirmado[];
      emitido: number;
      firmante: string;
      catalogoSha256: string;
    }
  | { ok: false; motivo: string } {
  let doc: Partial<VeredictosModulosFirmados>;
  try {
    doc = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: "el veredicto no se puede leer" };
  }
  if (
    !doc ||
    typeof doc !== "object" ||
    !Array.isArray(doc.modulos) ||
    !doc.firma ||
    typeof doc.firma.signature !== "string" ||
    typeof doc.firma.hash !== "string"
  )
    return { ok: false, motivo: "el veredicto no tiene la forma esperada" };
  if (doc.version !== VEREDICTO_MODULOS_VERSION)
    return {
      ok: false,
      motivo: `versión de veredicto desconocida (${String(doc.version)})`,
    };
  if (!HEX64.test(typeof doc.catalogoSha256 === "string" ? doc.catalogoSha256 : ""))
    return { ok: false, motivo: "el veredicto no dice qué catálogo juzgó" };
  if (!doc.modulos.every(esVeredicto))
    return { ok: false, motivo: "el veredicto trae módulos sin la forma esperada" };

  const cuerpo: VeredictosModulos = {
    version: doc.version,
    emitido: typeof doc.emitido === "number" ? doc.emitido : 0,
    firmante: typeof doc.firmante === "string" ? doc.firmante : "",
    catalogoSha256:
      typeof doc.catalogoSha256 === "string" ? doc.catalogoSha256 : "",
    modulos: doc.modulos,
  };
  const bytes = Buffer.from(cuerpoVeredictosModulos(cuerpo), "utf8");
  const hash = createHash("sha256").update(bytes).digest("base64");
  if (hash !== doc.firma.hash)
    return { ok: false, motivo: "el cuerpo cambió respecto al hash firmado" };

  const claves = typeof pubPem === "string" ? [pubPem] : pubPem;
  let valida = false;
  for (const pem of claves) {
    try {
      if (
        verify(
          null,
          bytes,
          createPublicKey(pem),
          Buffer.from(doc.firma.signature, "base64")
        )
      ) {
        valida = true;
        break;
      }
    } catch {
      valida = false;
    }
  }
  if (!valida) return { ok: false, motivo: "firma Ed25519 inválida" };
  if (doc.firma.signed_by !== cuerpo.firmante)
    return { ok: false, motivo: "la firma no es de quien dice firmar" };
  return {
    ok: true,
    modulos: cuerpo.modulos,
    emitido: cuerpo.emitido,
    firmante: cuerpo.firmante,
    catalogoSha256: cuerpo.catalogoSha256,
  };
}

/** El veredicto de un módulo concreto (o null si el juez no lo miró). */
export function veredictoDeModulo(
  v: { modulos: readonly VeredictoModuloFirmado[] },
  id: string
): VeredictoModuloFirmado | null {
  return v.modulos.find((m) => m.id === id) ?? null;
}

/**
 * Juega el catálogo entero de módulos: por cada entrada, su veredicto. Un id
 * repetido no juzga dos veces: la segunda queda fuera (el catálogo no puede
 * decidir cuál de las dos vale).
 *
 * `mediciones` son las medidas de verdad (por id), si las hay: un módulo que
 * no se pudo medir entra como «sin medida», nunca con un número inventado.
 */
export function juzgaCatalogoModulos(
  catalogo: unknown,
  mediciones?: Map<string, VeredictoModuloFirmado> | null
): {
  veredictos: VeredictoModuloFirmado[];
  dentro: number;
  avisos: number;
  fuera: number;
} {
  const lista = Array.isArray(catalogo) ? (catalogo as ModuloCatalogo[]) : [];
  const vistos = new Set<string>();
  const veredictos: VeredictoModuloFirmado[] = [];
  for (const crudo of lista) {
    const c = (crudo ?? {}) as Partial<ModuloCatalogo>;
    const id = typeof c.id === "string" ? c.id : "";
    const midido = mediciones?.get(id) ?? null;
    if (vistos.has(id)) {
      veredictos.push({
        id,
        version: typeof c.version === "string" ? c.version : "",
        arbolSha256: "0".repeat(64),
        entra: false,
        nivel: "fuera",
        causa: "id repetido en el catálogo",
        medidas: medidasVacias(),
      });
      continue;
    }
    vistos.add(id);
    if (midido) {
      veredictos.push(midido);
      continue;
    }
    veredictos.push({
      id,
      version: typeof c.version === "string" ? c.version : "",
      arbolSha256: "0".repeat(64),
      entra: false,
      nivel: "fuera",
      causa: "sin medir: este veredicto no midió el módulo",
      medidas: medidasVacias(),
    });
  }
  veredictos.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    veredictos,
    dentro: veredictos.filter((v) => v.entra).length,
    avisos: veredictos.filter((v) => v.entra && v.nivel === "aviso").length,
    fuera: veredictos.filter((v) => !v.entra).length,
  };
}

/** Las medidas de un módulo que no se pudo mirar: nada, pero con su forma. */
export function medidasVacias(): VeredictoModulo["medidas"] {
  return {
    orden: [
      "carga",
      "forma",
      "recallBase",
      "recallCon",
      "delta",
      "tokensBase",
      "tokensCon",
      "tokensCiclo",
      "cicloOk",
      "coste",
      "costePorPunto",
      "declaradas",
      "usadas",
      "casos",
    ],
    carga: false,
    forma: "sin-medida",
    recallBase: null,
    recallCon: null,
    delta: null,
    tokensBase: null,
    tokensCon: null,
    tokensCiclo: null,
    cicloOk: null,
    coste: null,
    costePorPunto: null,
    declaradas: [],
    usadas: [],
    casos: 0,
  };
}

/**
 * El panel: el veredicto que se LEE (lo que se publica en la Tienda). Un
 * módulo con su nivel, su causa y sus números. Sin adornos: si no se puede
 * medir, se dice que no se midió.
 */
export function renderPanelModulos(v: VeredictosModulos): string {
  const filas = v.modulos
    .map((m) => {
      const marca = m.nivel === "ok" ? "✓" : m.nivel === "aviso" ? "⚠" : "✗";
      const d = m.medidas;
      const numeros =
        d.forma === "memoria"
          ? `recall ${String(d.recallBase)} → ${String(d.recallCon)} (delta ${String(d.delta)}), coste ${String(d.costePorPunto)} tokens/punto`
          : d.forma === "ciclo"
            ? `ciclo ok: ${String(d.cicloOk)}, ${String(d.tokensCiclo)} tokens/ciclo, ${String(d.casos)} casos`
            : "sin medida";
      return `| ${marca} | ${m.id} | ${m.version} | ${m.nivel} | ${d.forma} | ${numeros} | ${m.causa} |`;
    })
    .join("\n");
  return `# El juez de los módulos

Veredicto firmado por ${v.firmante} (${v.emitido}).
Catálogo juzgado: \`${v.catalogoSha256.slice(0, 16)}…\`

| | módulo | versión | nivel | forma | números | por qué |
|---|---|---|---|---|---|---|
${filas}

La firma cubre el árbol que se miró: si el módulo cambia de bytes, el
veredicto deja de aplicar y la app lo vuelve a poner en «sin medir».
`;
}
