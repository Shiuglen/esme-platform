/**
 * EL PUBLICADOR — el módulo de cualquiera, en el índice firmado.
 *   npm run publicar:modulo -- <carpeta-del-módulo> [--tienda <dir>] [--firma <artefacto.json>]
 *
 * Qué es esto: la otra mitad de la puerta de entrada. Verificar un módulo es
 * la mitad; la otra es que ENTRE en la tienda. Y entrar significa que el
 * índice firmado lo declare, con su hash y la firma de sus bytes — para que
 * cualquiera que instale desde la red sepa exactamente qué se está
 * instalando.
 *
 * El camino, en orden:
 *
 *   1. VERIFICAR el módulo (tienda/verifica.ts): se construye, se
 *      mide y se juzga. Si el juez no lo acepta, aquí no se publica nada.
 *   2. EMPAQUETAR: el tarball reproducible (los mismos bytes que firma el
 *      libro de firmas).
 *   3. FIRMAR: con la llave de esta máquina, o con la que trae el paquete
 *      (un módulo de cualquiera puede firmar con SU llave: el índice declara
 *      las claves de los que firman, y el consumidor verifica con la que
 *      encuentra ahí).
 *   4. INDEXAR: la entrada del módulo en el índice (id, versión, categoría,
 *      su informe medido, su hash y su tamaño) y la firma del índice, que es
 *      lo que ata todo.
 *
 * Lo que NO hace: publicar en la red. Eso es `npm run tienda:publicar-modulos`
 * (que sube lo firmado al repo de la tienda). Aquí se firma; allí se sube.
 *
 * Referencia: docs/ENTRADA.md, docs/TIENDA.md, tienda/firma.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { claveDeFirma, puedePublicar } from "./claves.ts";
import { declaraClave, firmarIndex } from "./firma.ts";
import { huellaDePub } from "./rotacion.ts";
import { raizDelPaquete } from "../core/paquete.ts";
import { verificaModulo, firmaArtefacto, type ArtefactoFirmado } from "./verifica.ts";
import { leeManifiesto } from "./modulo-manifiesto.ts";
import type { InformeModulo } from "../core/modulos/veredicto.ts";

export interface OpcionesPublicar {
  /** Dónde está la tienda (la carpeta con index.json, paquetes/ y firmas/). */
  tienda?: string;
  /** Una firma ya hecha (la del que construyó el módulo, con su llave). */
  firma?: string;
  /** ¿Se escribe el índice o sólo se dice lo que se escribiría? */
  dry?: boolean;
  /** La llave con la que se firma el índice (si no, la de esta máquina). */
  clave?: { priv: string; pub: string; huella: string };
}

export interface ResultadoPublicar {
  /** ¿Se publicó? */
  ok: boolean;
  /** El módulo. */
  id: string;
  /** La versión. */
  version: string;
  /** Por qué no, si no se publicó. */
  razon?: string;
  /** La entrada que se puso (o se pondría) en el índice. */
  entrada?: Record<string, unknown>;
  /** La ruta del paquete en la tienda. */
  paquete?: string;
  /** La huella de la clave que firmó el artefacto. */
  firmante?: string;
}

const escribir = (ruta: string, dato: unknown): void =>
  writeFileSync(ruta, JSON.stringify(dato, null, 2) + "\n");

/**
 * Los permisos que el módulo pide (los de su manifiesto).
 *
 * Si el manifiesto no se puede leer, se devuelven los que el veredicto
 * guardó: lo que se publica nunca es menos de lo que se pidió.
 */
export function permisosDe(dirModulo: string): string[] {
  try {
    const m = leeManifiesto(dirModulo);
    if (m.ok && Array.isArray(m.manifest?.permissions)) {
      return (m.manifest.permissions as string[]).map(String);
    }
  } catch {
    // sin manifiesto legible: lo dice el veredicto
  }
  return [];
}

/** La entrada de un módulo en el índice, con la forma que la tienda usa. */
export function entradaDe(
  id: string,
  version: string,
  categoria: string,
  descripcion: string | null,
  etiquetas: string[],
  informe: InformeModulo | null,
  tar: string,
  bytes: number,
  firmaOk: boolean,
  procedencia?: { por?: string; en?: string },
  permisos?: string[]
): Record<string, unknown> {
  const forma = informe?.ciclo_ok !== undefined ? "ciclo" : "memoria";
  return {
    id,
    version,
    category: categoria,
    ...(descripcion ? { descripcion } : {}),
    ...(etiquetas.length ? { etiquetas } : {}),
    // lo que el módulo PIDE, en la vitrina: la persona decide antes de
    // instalar, no en el consentimiento que aparece después
    ...(permisos?.length ? { permisos: [...permisos].sort() } : {}),
    ...(forma === "ciclo" ? { bench_ciclo: informe } : { bench: informe }),
    firma_ok: firmaOk,
    artefacto: { tar, bytes },
    // la procedencia: QUIÉN lo publicó y CUÁNDO (la huella, no un nombre:
    // el nombre identifica a la persona, la huella al firmante).
    ...(procedencia?.por ? { publicado_por: procedencia.por } : {}),
    ...(procedencia?.en ? { publicado_en: procedencia.en } : {}),
  };
}

/**
 * Publica un módulo en la tienda: lo verifica, lo firma, lo mete en el
 * índice y firma el índice.
 */
export async function publicaModulo(
  dirModulo: string,
  opts: OpcionesPublicar = {}
): Promise<ResultadoPublicar> {
  const dir = resolve(dirModulo);
  const tienda = resolve(opts.tienda ?? join(raizDelPaquete(), "tienda"));
  // la llave con la que se firma: la de esta máquina, o la que le digan
  // (quien mantiene la tienda tiene la suya; el que prueba, la de su tienda).
  const clave = opts.clave ?? claveDeFirma();

  // 1. verificar: sin veredicto, no hay publicación.
  const verificado = await verificaModulo(dir);
  if (!verificado.veredicto?.entra || !verificado.paquete) {
    return {
      ok: false,
      id: verificado.veredicto?.id ?? "<?>",
      version: verificado.veredicto?.version ?? "<?>",
      razon: verificado.veredicto
        ? `el juez no lo acepta: ${verificado.veredicto.causa}`
        : "el módulo no se pudo verificar",
    };
  }
  const v = verificado.veredicto;

  // 2-3. la firma del artefacto: la que trae el paquete, o la de esta máquina.
  let artefacto: ArtefactoFirmado | null = null;
  if (opts.firma && existsSync(opts.firma)) {
    artefacto = JSON.parse(readFileSync(opts.firma, "utf8")) as ArtefactoFirmado;
    if (artefacto.tar !== verificado.paquete.sha256) {
      return {
        ok: false,
        id: v.id,
        version: v.version,
        razon: "la firma que trae no es de estos bytes (el paquete cambió)",
      };
    }
  } else {
    artefacto = firmaArtefacto(
      verificado.paquete,
      v.id,
      v.version,
      clave.priv,
      clave.huella,
      clave.pub
    );
  }

  const entrada = entradaDe(
    v.id,
    v.version,
    categoriaDe(dir),
    descripcionDe(dir),
    etiquetasDe(dir),
    verificado.informe,
    verificado.paquete.sha256,
    verificado.paquete.bytes,
    v.entra,
    {
      por: artefacto.firma.signed_by,
      en: new Date().toISOString().slice(0, 10),
    },
    permisosDe(dir)
  );

  // el paquete va a la tienda con el nombre que el receptor busca
  const nombreTar = `${v.id.replace(/\./g, "-")}-${v.version}.tgz`;
  const rutaPaquete = join(tienda, "paquetes", nombreTar);
  const rutaFirma = join(tienda, "firmas", `${v.id}.artefacto.json`);

  if (opts.dry) {
    return {
      ok: true,
      id: v.id,
      version: v.version,
      entrada,
      paquete: rutaPaquete,
      firmante: artefacto.firma.signed_by,
    };
  }

  // 4. escribir en la tienda y firmAR EL ÍNDICE (lo que ata todo).
  mkdirSync(join(tienda, "paquetes"), { recursive: true });
  mkdirSync(join(tienda, "firmas"), { recursive: true });
  copyFileSync(verificado.paquete.ruta, rutaPaquete);
  escribir(rutaFirma, artefacto);

  const rutaIndice = join(tienda, "index.json");
  const indice = JSON.parse(readFileSync(rutaIndice, "utf8")) as {
    modulos: Array<{ id: string } & Record<string, unknown>>;
  } & Record<string, unknown>;

  const i = indice.modulos.findIndex((m) => m.id === v.id);
  if (i >= 0) indice.modulos[i] = entrada as { id: string } & Record<string, unknown>;
  else indice.modulos.push(entrada as { id: string } & Record<string, unknown>);

  // el índice declara las claves de los que firman: sin esta declaración el
  // consumidor no puede verificar el artefacto de un firmante nuevo.
  const derecho = puedePublicar(clave, join(tienda, ".."));
  const pubArtefacto = artefacto.pub ?? clave.pub;
  let conClaves = declaraClave(indice, pubArtefacto, huellaDePub(pubArtefacto));
  // y también la del firmante del índice (que puede ser otra)
  conClaves = declaraClave(conClaves, clave.pub, clave.huella);

  const firmado = firmarIndex(conClaves, clave.priv, clave.huella);
  escribir(rutaIndice, firmado);

  return {
    ok: true,
    id: v.id,
    version: v.version,
    entrada,
    paquete: rutaPaquete,
    firmante: artefacto.firma.signed_by,
    ...(derecho.ok ? {} : { razon: `publicado, pero tu llave no está en la estirpe: ${derecho.razon}` }),
  };
}

/** La descripción del módulo (la lee de su manifiesto: sin ella no se puede buscar). */
function descripcionDe(dir: string): string | null {
  const d = leeManifiesto(dir, { exigirEntrada: false });
  return d.manifest?.description ?? null;
}

/** Las etiquetas del módulo (su vocabulario semántico: lo que el módulo dice que es). */
function etiquetasDe(dir: string): string[] {
  const d = leeManifiesto(dir, { exigirEntrada: false });
  const criterios = d.manifest?.decision_criteria ?? [];
  return [...new Set(criterios.flatMap((c) => c.tags))].filter(Boolean);
}

/** La categoría del módulo (la lee de su manifiesto). */
function categoriaDe(dir: string): string {
  return leeManifiesto(dir, { exigirEntrada: false }).manifest?.category ?? "tool";
}

