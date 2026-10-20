/**
 * juzgar-modulos.ts — el juez de los módulos, en persona: mide, dicta y firma.
 *   npm run modulos:juzgar -- [--catalogo <ruta>] [--salida <ruta>]
 *
 * Lo que hace, en este orden:
 *   1. INSTALA cada módulo del catálogo desde la Tienda local (firma verificada).
 *      Se juzga lo que se publica, no lo que hay en el disco del autor.
 *   2. MIDE cada módulo con su puerta real (lo abre, lo ejercita con sus
 *      sondas y mira qué capacidades toca).
 *   3. DICTA (el juez: `core/modulos/veredicto.ts`).
 *   4. FIRMA el documento entero y lo escribe:
 *        modulos/veredictos.json      — el veredicto firmado (lo que la app verifica)
 *        modulos/panel-modulos.md     — el veredicto legible (lo que se publica)
 *
 * La firma cubre la huella del árbol que se miró: si el módulo cambia de
 * bytes, el veredicto deja de aplicar y la app lo vuelve a poner en «sin
 * medir». Referencia: estandar/module-veredicto.spec.yaml.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mideModulo } from "../core/bench/modulos.ts";
import { juzgaModulo } from "../core/modulos/veredicto.ts";
import { claveDeFirma } from "../tienda/claves.ts";
import { arbolSha256 } from "../tienda/empaque.ts";
import { instalar } from "../tienda/receptor.ts";
import { leeModulo } from "../tienda/modulos.ts";
import {
  catalogoModulosSha256,
  firmaVeredictosModulos,
  medidasVacias,
  proyeccionCatalogo,
  renderPanelModulos,
  VEREDICTO_MODULOS_VERSION,
  type ModuloCatalogo,
  type VeredictoModuloFirmado,
} from "../tienda/veredictos-modulos.ts";

const raizKit = resolve(import.meta.dirname, "..");
const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

const salida = resolve(arg("--salida") ?? join(raizKit, "modulos", "veredictos.json"));
const panel = resolve(join(salida, ".."), "panel-modulos.md");

// ——— el catálogo ———
// por defecto: el índice firmado de la Tienda (los módulos que se publican).
const rutaCatalogo = resolve(
  arg("--catalogo") ?? join(raizKit, "tienda", "index.json")
);
if (!existsSync(rutaCatalogo)) {
  console.error(`no encuentro el catálogo de módulos (${rutaCatalogo})`);
  process.exit(1);
}
const crudoCatalogo = JSON.parse(readFileSync(rutaCatalogo, "utf8")) as {
  modulos?: ModuloCatalogo[];
};
const catalogo: ModuloCatalogo[] = Array.isArray(crudoCatalogo.modulos)
  ? crudoCatalogo.modulos
  : Array.isArray(crudoCatalogo)
    ? (crudoCatalogo as ModuloCatalogo[])
    : [];
if (!catalogo.length) {
  console.error(`el catálogo ${rutaCatalogo} no trae módulos`);
  process.exit(1);
}

// ——— medir y dictar ———
// Cada módulo se instala desde la Tienda local: lo que se juzga es el
// artefacto firmado, byte a byte el que se publicará.
const jardin = mkdtempSync(join(tmpdir(), "esme-juez-modulos-"));
const mediciones = new Map<string, VeredictoModuloFirmado>();
const fallos: string[] = [];

for (const entrada of catalogo) {
  const id = typeof entrada?.id === "string" ? entrada.id : "";
  if (!id) continue;
  try {
    const instalacion = instalar(id, raizKit, jardin);
    const leido = leeModulo(instalacion.dir);
    if (!leido.ok || !leido.modulo) {
      throw new Error(leido.errores.join("; ") || "el módulo no se puede leer");
    }
    const { manifiesto, medidas } = await mideModulo(instalacion.dir, leido.modulo.manifiesto);
    const v = juzgaModulo(manifiesto, medidas);
    mediciones.set(id, { ...v, arbolSha256: arbolSha256(instalacion.dir) });
    const marca = v.entra ? (v.nivel === "ok" ? "✓" : "⚠") : "✗";
    console.log(`${marca} ${v.id} v${v.version} — ${v.nivel}: ${v.causa}`);
  } catch (e) {
    fallos.push(`${id}: ${(e as Error)?.message ?? e}`);
    console.error(`✗ ${id}: ${(e as Error)?.message ?? e}`);
  }
}
rmSync(jardin, { recursive: true, force: true });

// ——— el veredicto ———
// La huella del catálogo es la de la proyección estable (qué artefacto se
// juzgó), no la del índice entero: así el veredicto sobrevive a que se
// vuelva a medir el bench.
const proyeccion = proyeccionCatalogo(catalogo);
const veredictos: VeredictoModuloFirmado[] = proyeccion.map((p) => {
  const medido = mediciones.get(p.id);
  if (medido) return medido;
  return {
    id: p.id,
    version: p.version,
    arbolSha256: "0".repeat(64),
    entra: false,
    nivel: "fuera",
    causa: "sin medir: este veredicto no midió el módulo",
    medidas: medidasVacias(),
  };
});

const clave = claveDeFirma();
const documento = firmaVeredictosModulos(
  {
    version: VEREDICTO_MODULOS_VERSION,
    emitido: Date.now(),
    firmante: clave.huella,
    catalogoSha256: catalogoModulosSha256(proyeccion),
    modulos: veredictos,
  },
  clave.priv
);

mkdirSync(join(salida, ".."), { recursive: true });
writeFileSync(salida, JSON.stringify(documento, null, 2) + "\n");
writeFileSync(panel, renderPanelModulos(documento));

const dentro = veredictos.filter((v) => v.entra).length;
const fuera = veredictos.length - dentro;
console.log(`catálogo  : ${rutaCatalogo}`);
console.log(`módulos   : ${veredictos.length} juzgados · ${dentro} entran · ${fuera} fuera`);
console.log(`catálogo  : sha256 ${documento.catalogoSha256.slice(0, 16)}… (atado a los artefactos)`);
console.log(`firmante  : ${clave.huella}`);
console.log(`veredicto : ${salida}`);
console.log(`panel     : ${panel}`);
if (fallos.length) {
  console.log(`sin medir : ${fallos.length} (${fallos.join(" · ")})`);
}
