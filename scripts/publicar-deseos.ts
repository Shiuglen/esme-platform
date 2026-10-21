/**
 * publicar-deseos — la lista de deseos de la tienda, FIRMADA.
 *   npm run publicar:deseos -- [--desde <lista.json>] [--tienda <dir>]
 *
 * Lo que guardas en tu X es la demanda escrita: lo que le falta a Esme. Y una
 * demanda sin firmar no es demanda. Así que la lista se juzga (los deseos que
 * no valen, no entran), se firma con la llave de la tienda y viaja firmada:
 * el consumidor la verifica con la raíz congelada antes de fiarse.
 *
 * Referencia: core/tienda/deseos.ts, core/tienda/deseos-firmados.ts,
 * estandar/deseo.spec.yaml.
 */
import { escribeAtomico, escribeJsonAtomico } from "../core/escribe.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { claveDeFirma, puedePublicar } from "../tienda/claves.ts";
import { juzgaDeseos } from "../core/tienda/deseos.ts";
import { firmaDeseos, verificaDeseos } from "../core/tienda/deseos-firmados.ts";
import { leeRaiz } from "../tienda/raiz.ts";

const raizKit = resolve(import.meta.dirname, "..");
const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
};

export interface ResultadoPublicarDeseos {
  ok: boolean;
  deseos: number;
  firmante: string;
  razon?: string;
  ruta?: string;
}

/**
 * Publica la lista de deseos: la juzga, la firma y la verifica.
 *
 * Es una FUNCIÓN (no sólo un script): la puerta de la casa la llama igual
 * que un humano, y así se prueba en cada PR.
 */
export function publicaDeseos(
  desde: string,
  tienda: string,
  clave: { priv: string; pub: string; huella: string }
): ResultadoPublicarDeseos {
  // 1. los módulos publicados (un deseo «hecho» por un módulo que no está, miente)
  let publicados: string[] = [];
  try {
    const indice = JSON.parse(readFileSync(join(tienda, "index.json"), "utf8")) as {
      modulos?: Array<{ id: string }>;
    };
    publicados = (indice.modulos ?? []).map((m) => m.id);
  } catch {
    // sin índice, se juzga sin comprobar los módulos
  }

  // 2. el juicio
  const lista = JSON.parse(readFileSync(desde, "utf8")) as unknown;
  const v = juzgaDeseos(lista, publicados);
  if (!v.ok) {
    return { ok: false, deseos: 0, firmante: clave.huella, razon: v.errores.join("; ") };
  }

  // 3. la firma y la comprobación final (lo que sale, se verifica)
  const firmado = firmaDeseos(v.deseos, clave.priv, clave.huella);
  const texto = JSON.stringify(firmado, null, 2) + "\n";
  const check = verificaDeseos(texto, clave.pub);
  if (!check.ok) {
    return { ok: false, deseos: v.deseos.length, firmante: clave.huella, razon: check.motivo };
  }
  escribeAtomico(join(tienda, "deseos.json"), texto);
  return {
    ok: true,
    deseos: v.deseos.length,
    firmante: clave.huella,
    ruta: join(tienda, "deseos.json"),
  };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const desde = resolve(arg("--desde") ?? join(raizKit, "tienda", "deseos-lista.json"));
  const tienda = resolve(arg("--tienda") ?? join(raizKit, "tienda"));
  if (!existsSync(desde)) {
    console.error(`no encuentro la lista: ${desde}`);
    process.exit(1);
  }

  const clave = claveDeFirma();
  const derecho = puedePublicar(clave, raizKit);
  if (!derecho.ok) {
    console.error(`esta llave no publica: ${derecho.razon}`);
    process.exit(1);
  }
  const r = publicaDeseos(desde, tienda, clave);
  if (!r.ok) {
    console.error(`la lista no se publica: ${r.razon}`);
    process.exit(1);
  }
  const lista = JSON.parse(readFileSync(desde, "utf8")) as Array<{ estado: string }>;
  const nuevos = lista.filter((d) => d.estado === "nuevo").length;
  console.log(`deseos  : ${r.deseos} (${nuevos} nuevos, ${r.deseos - nuevos} resueltos)`);
  console.log(`firmante: ${r.firmante.slice(0, 8)}…`);
  console.log(`fichero : ${r.ruta}`);
}
