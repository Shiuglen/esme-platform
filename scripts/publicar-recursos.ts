/**
 * publicar-recursos — el catálogo de piezas, firmado.
 *   npm run publicar:recursos -- [--desde <lista.json>] [--tienda <dir>]
 *
 * Los recursos son las piezas de fuera con las que se construye lo que falta:
 * repos, paquetes, servicios y patrones. El catálogo viaja firmado (como el
 * índice y la lista de deseos) y además dice **cuánto lo ha mirado la casa**
 * (probado / mirado / sin-mirar): un catálogo honesto empieza por admitir lo
 * que no sabe.
 *
 * Referencia: core/tienda/recursos.ts, core/tienda/recursos-firmados.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { claveDeFirma, puedePublicar } from "../tienda/claves.ts";
import { juzgaRecurso, empareja, type Recurso } from "../core/tienda/recursos.ts";
import { firmaCatalogo, verificaCatalogo } from "../core/tienda/recursos-firmados.ts";
import { escribeAtomico } from "../core/escribe.ts";

const raizKit = resolve(import.meta.dirname, "..");
const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
};

export interface ResultadoPublicarRecursos {
  ok: boolean;
  recursos: number;
  firmante: string;
  razon?: string;
  ruta?: string;
}

/** Publica el catálogo: lo juzga, lo firma y lo verifica. */
export function publicaRecursos(
  desde: string,
  tienda: string,
  clave: { priv: string; pub: string; huella: string }
): ResultadoPublicarRecursos {
  const lista = JSON.parse(readFileSync(desde, "utf8")) as unknown;
  if (!Array.isArray(lista)) {
    return { ok: false, recursos: 0, firmante: clave.huella, razon: "el catálogo no es una lista" };
  }
  const recursos: Recurso[] = [];
  const errores: string[] = [];
  for (const [i, r] of lista.entries()) {
    const v = juzgaRecurso(r);
    if (!v.ok) {
      errores.push(`recurso ${i}: ${v.errores.join("; ")}`);
      continue;
    }
    recursos.push(v.recurso!);
  }
  if (errores.length) {
    return { ok: false, recursos: 0, firmante: clave.huella, razon: errores.join(" | ") };
  }

  const firmado = firmaCatalogo(recursos, clave.priv, clave.huella);
  const texto = JSON.stringify(firmado, null, 2) + "\n";
  const check = verificaCatalogo(texto, clave.pub);
  if (!check.ok) {
    return { ok: false, recursos: recursos.length, firmante: clave.huella, razon: check.motivo };
  }
  escribeAtomico(join(tienda, "recursos.json"), texto);
  return {
    ok: true,
    recursos: recursos.length,
    firmante: clave.huella,
    ruta: join(tienda, "recursos.json"),
  };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const desde = resolve(arg("--desde") ?? join(raizKit, "tienda", "recursos-lista.json"));
  const tienda = resolve(arg("--tienda") ?? join(raizKit, "tienda"));
  if (!existsSync(desde)) {
    console.error(`no encuentro el catálogo: ${desde}`);
    process.exit(1);
  }
  const clave = claveDeFirma();
  const derecho = puedePublicar(clave, raizKit);
  if (!derecho.ok) {
    console.error(`esta llave no publica: ${derecho.razon}`);
    process.exit(1);
  }
  const r = publicaRecursos(desde, tienda, clave);
  if (!r.ok) {
    console.error(`el catálogo no se publica: ${r.razon}`);
    process.exit(1);
  }
  console.log(`recursos: ${r.recursos}`);
  console.log(`firmante: ${r.firmante.slice(0, 8)}…`);
  console.log(`fichero : ${r.ruta}`);

  // y el emparejamiento: qué recursos iluminan cada deseo (si hay lista)
  const listaDeseos = join(tienda, "deseos-lista.json");
  if (existsSync(listaDeseos)) {
    const deseos = JSON.parse(readFileSync(listaDeseos, "utf8")) as Array<{
      id: string;
      texto: string;
      etiquetas: string[];
    }>;
    const recursos = JSON.parse(readFileSync(desde, "utf8")) as Recurso[];
    const pares = empareja(deseos, recursos);
    console.log("");
    console.log("qué recursos iluminan cada deseo:");
    for (const p of pares) {
      if (!p.recursos.length) continue;
      console.log(`  · ${p.deseo}: ${p.recursos.map((x) => x.nombre).join(", ")}`);
    }
  }
}
