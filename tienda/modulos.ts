/**
 * LOS MÓDULOS DE LA TIENDA — la capa que sabe de disco, de YAML y de red.
 *
 * El runtime (`core/modulos/api.ts`) es el motor y no sabe de nada de esto:
 * no lee YAML, no baja nada y no sabe lo que es una firma. Esta capa sí, y
 * por eso vive en la Tienda y no en el núcleo (el núcleo no arrastra
 * dependencias: quien consume el kit no paga un parser de YAML).
 *
 * Con lo de aquí, la puerta se abre con una línea:
 *
 *   const runtime = creaRuntimeTienda({ dirModulos, mente });
 *
 * Referencia: tienda/cliente.ts (la confianza), tienda/modulo-manifiesto.ts
 * (el contrato en disco), core/modulos/api.ts (el motor).
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicKey } from "node:crypto";
import { instalarRemoto } from "./cliente.ts";
import { leeManifiesto, rutaEntrada } from "./modulo-manifiesto.ts";
import { modulos, type OpcionesRuntime, type RuntimeModulos } from "../core/modulos/api.ts";
import type { ModuloInstalado } from "../core/modulos/registro.ts";

/** La URL por defecto de la Tienda pública (la que el kit publica). */
export const TIENDA_PUBLICA = "https://raw.githubusercontent.com/Shiuglen/esme-tienda/main";

/** El nombre de la carpeta de cada módulo instalado: `esme.x.y` → `esme__x__y`. */
export const carpetaDe = (id: string): string => id.replace(/\./g, "__");

/**
 * Lee un módulo YA INSTALADO: valida su manifiesto y confine su entrada.
 *
 * Si el manifiesto no vale o la entrada se sale de la carpeta, el módulo NO
 * está instalado: no se registra y no se activa. Un módulo con la entrada
 * apuntando fuera de su carpeta es un módulo que no se instala.
 */
export function leeModulo(dirModulo: string): {
  ok: boolean;
  modulo?: ModuloInstalado;
  errores: string[];
} {
  const dictamen = leeManifiesto(dirModulo);
  if (!dictamen.ok || !dictamen.manifest) {
    return { ok: false, errores: dictamen.errores };
  }
  const entrada = rutaEntrada(dirModulo, dictamen.manifest);
  if ("error" in entrada) return { ok: false, errores: [entrada.error] };
  return {
    ok: true,
    errores: [],
    modulo: {
      id: dictamen.manifest.id,
      version: dictamen.manifest.version,
      dir: resolve(dirModulo),
      entrada: entrada.ruta,
      manifiesto: dictamen.manifest,
    },
  };
}

/** Los módulos instalados en una carpeta (los que valen; los demás, fuera). */
export function instaladosEn(dirModulos: string): ModuloInstalado[] {
  if (!existsSync(dirModulos)) return [];
  const salida: ModuloInstalado[] = [];
  for (const nombre of readdirSync(dirModulos)) {
    const dir = join(dirModulos, nombre);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    const leido = leeModulo(dir);
    if (leido.ok && leido.modulo) salida.push(leido.modulo);
  }
  return salida;
}

/**
 * Instala un módulo de la Tienda pública y lo devuelve ya validado.
 *
 * La confianza no se negocia (tienda/cliente.ts): índice firmado, estirpe de
 * rotaciones desde la raíz congelada, firma del artefacto y revocación. Si
 * algo de eso falla, no se instala nada.
 */
export async function instalaModulo(
  id: string,
  opts: { baseUrl?: string; pubRaiz?: string; destino: string }
): Promise<ModuloInstalado> {
  const pubRaiz = opts.pubRaiz ?? "";
  if (!pubRaiz) throw new Error("sin raíz de confianza no se instala nada");
  const pub = pubRaiz.includes("BEGIN")
    ? createPublicKey(pubRaiz).export({ type: "spki", format: "pem" }).toString()
    : pubRaiz;
  const instalacion = await instalarRemoto(
    opts.baseUrl ?? TIENDA_PUBLICA,
    id,
    pub,
    opts.destino
  );
  const leido = leeModulo(instalacion.dir);
  if (!leido.ok || !leido.modulo) {
    throw new Error(`lo que llegó no es un módulo válido: ${leido.errores.join("; ")}`);
  }
  return leido.modulo;
}

/** Quita un módulo del disco (y su permiso: desinstalar no es olvidar). */
export function desinstalaModulo(dirModulos: string, id: string): boolean {
  const dir = join(dirModulos, carpetaDe(id));
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

/**
 * La puerta de los módulos CON TODO MONTADO: la Tienda sabe buscar, instalar
 * y verificar; el motor sabe activar y llamar.
 */
export function creaRuntimeTienda(
  opts: Omit<OpcionesRuntime, "cargar" | "instalar"> & {
    /** La raíz de confianza (la congelada del repo, o la que se le pase). */
    pubRaiz: string;
    /** Dónde viven los módulos instalados (la carpeta que la Tienda crea). */
    dirModulos: string;
    /** La Tienda de la que se baja (por defecto, la pública). */
    baseUrl?: string;
  }
): RuntimeModulos {
  return modulos({
    ...opts,
    cargar: async () => instaladosEn(opts.dirModulos),
    instalar: async (id, io) =>
      instalaModulo(id, {
        baseUrl: io?.baseUrl ?? opts.baseUrl,
        pubRaiz: opts.pubRaiz,
        destino: opts.dirModulos,
      }),
  });
}
