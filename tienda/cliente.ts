// cliente — el consumidor FORASTERO: no vive en este repo, no comparte
// ficheros, no comparte claves. Baja por HTTP y verifica con la raíz que
// él fijó un día. Si la tienda mentira en la red, el cliente lo nota.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as yaml from "js-yaml";
import { verificarIndex, verificarBytes } from "./firma.ts";
import { estaRevocada } from "./revocacion.ts";
import { confiaIndexChain, huellaDePub, leerLedger } from "./rotacion.ts";
import { bajar } from "./servidor.ts";

export interface InstaladoRemoto {
  id: string;
  version: string;
  dir: string;
  entrada: string;
  via: "directa" | "cadena";
  /**
   * Lo que el módulo PIDE (los permisos de su manifiesto, ya instalado).
   *
   * La persona lo ve antes de instalar (en la vitrina, que los declara) y
   * después de instalar (aquí, que son los de verdad). Si no coinciden, la
   * instalación se para: ver `permisosDeclarados`.
   */
  permisos: string[];
  /**
   * Lo que el ÍNDICE decía que pedía (lo que se enseñó en la vitrina).
   *
   * Si el módulo real pide más de lo que el índice decía, no se instala: la
   * vitrina mentía, y una vitrina que miente sobre lo que pide un módulo no
   * puede ser la puerta de la decisión de la persona.
   */
  permisosDeclarados: string[];
}

/** Baja índice (y rotaciones si hay) → verifica → baja firma → baja tar → instala. */
export async function instalarRemoto(
  baseUrl: string,
  id: string,
  pubRaiz: string,
  destino: string,
  opts: { photon?: number } = {}
): Promise<InstaladoRemoto> {
  void opts;
  // 1. el índice y el ledger de sucesiones (si la tienda lo publica)
  const indice = JSON.parse((await bajar(`${baseUrl}/index.json`)).toString("utf8"));
  const rutaLedger = join(destino, ".rotaciones.json");
  try {
    // la carpeta puede no existir todavía: sin esto el ledger se perdía en
    // silencio y la tienda parecía no ser de la estirpe (la estirpe es lo
    // que prueba quién firmó).
    mkdirSync(destino, { recursive: true });
    writeFileSync(rutaLedger, (await bajar(`${baseUrl}/rotaciones.json`)).toString("utf8"));
  } catch {
    // 404: la tienda no rota — bien
  }

  // 2. confianza: directa o por la estirpe desde la raíz CONGELADA
  const confianza = confiaIndexChain(
    indice as Record<string, unknown>,
    pubRaiz,
    existsSync(rutaLedger) ? rutaLedger : "/nonexistent"
  );
  if (!confianza.ok) throw new Error("la tienda no es de la estirpe de mi raíz: NO INSTALO");

  // 3. revocación del firmante del índice
  const firmaIndice = (indice as { signature?: { signed_by?: string } }).signature;
  const rutaRevocaciones = join(destino, ".revocaciones.json");
  try {
    mkdirSync(destino, { recursive: true });
    writeFileSync(rutaRevocaciones, (await bajar(`${baseUrl}/revocaciones.json`)).toString("utf8"));
  } catch {
    // sin libro: nada revocado
  }
  if (
    firmaIndice?.signed_by &&
    existsSync(rutaRevocaciones) &&
    estaRevocada(firmaIndice.signed_by, rutaRevocaciones, confianza.pubActiva ?? pubRaiz)
  ) {
    throw new Error(`firmante del índice (${firmaIndice.signed_by}) REVOCADO: no instalo`);
  }
  const claves = ((indice as { claves?: Record<string, string> }).claves ?? {}) as Record<string, string>;

  // 4. la entrada del módulo y su artefacto
  const lista = (indice as { modulos?: Array<{ id: string; version?: string; artefacto?: { tar?: string }; permisos?: string[] }> }).modulos ?? [];
  const entrada = lista.find((m) => m.id === id);
  if (!entrada) throw new Error(`${id} no está en el índice que bajé`);
  const version = entrada.version;
  if (!version) throw new Error(`el índice no dice la versión de ${id}`);
  const permisosDeclarados = [...(entrada.permisos ?? [])].sort();
  const firma = JSON.parse(
    (await bajar(`${baseUrl}/firmas/${id}.artefacto.json`)).toString("utf8")
  ) as { modulo: string; tar: string; firma: Parameters<typeof verificarBytes>[1] };
  if (firma.modulo !== id) throw new Error("la firma baja de otro módulo");
  if (entrada.artefacto?.tar && entrada.artefacto.tar !== firma.tar)
    throw new Error("índice y firma discrepan del tar");

  // 5. los bytes y su firma con la pub del firmante (declarada en el índice confiado)
  const bytesTar = await bajar(
    `${baseUrl}/paquetes/${id.replace(/\./g, "-")}-${version}.tgz`
  );
  const pubFirmante = claves[firma.firma.signed_by];
  if (!pubFirmante) throw new Error(`la clave del artefacto (${firma.firma.signed_by}) no está en el índice`);
  const dictamen = verificarBytes(bytesTar, firma.firma, pubFirmante);
  if (!dictamen.ok) throw new Error(`los bytes no son los firmados: ${dictamen.razon}`);

  // 6. el jardín del forastero: desempaquetar y validar lo que llegó
  const dir = join(destino, id.replace(/\./g, "__"));
  mkdirSync(dir, { recursive: true });
  const rutaTar = join(destino, `${id.replace(/\./g, "-")}-${version}.tgz`);
  writeFileSync(rutaTar, bytesTar);
  execFileSync("tar", ["-xzf", rutaTar, "-C", dir]);
  const manifiesto = yaml.load(
    readFileSync(join(dir, "module.yaml"), "utf8")
  ) as { id: string; version: string; entry: string; permissions?: string[] };
  if (manifiesto.id !== id || manifiesto.version !== version)
    throw new Error("lo que llegó no es lo que el índice decía");
  if (!existsSync(resolve(dir, manifiesto.entry)))
    throw new Error("la entrada del módulo no está tras desempaquetar");

  // 7. lo que PIDE: el manifiesto manda (es lo que se va a instalar), y tiene
  //    que ser lo que el índice enseñó. Si no, la vitrina mentía.
  const permisos = [...(manifiesto.permissions ?? [])].sort();
  if (permisosDeclarados.length && permisos.join(",") !== permisosDeclarados.join(",")) {
    throw new Error(
      `el índice dice que ${id} pide [${permisosDeclarados.join(", ")}] y el módulo pide ` +
        `[${permisos.join(", ")}]: la vitrina no decía la verdad, no se instala`
    );
  }

  return {
    id: manifiesto.id,
    version: manifiesto.version,
    dir,
    entrada: manifiesto.entry,
    via: confianza.via as "directa" | "cadena",
    permisos,
    permisosDeclarados,
  };
}

export { huellaDePub };
