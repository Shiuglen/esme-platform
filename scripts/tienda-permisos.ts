/**
 * tienda:permisos — declara en el índice lo que PIDE cada módulo, y lo firma.
 *   npm run tienda:permisos [-- --dry]
 *
 * Qué hace. La entrada del índice dice qué hace un módulo (su veredicto) y
 * de dónde viene, pero no decía qué PIDE. Y eso es justo lo que la persona
 * necesita para decidir antes de instalar: un módulo que pide lanzar
 * programas tiene que decirlo en la vitrina, no en el consentimiento que
 * aparece después de instalarlo.
 *
 * Qué cambia. Sólo una cosa: cada entrada gana su lista de permisos (la del
 * manifiesto del módulo). Y el índice se vuelve a firmar, porque sus bytes
 * han cambiado. Los artefactos NO cambian: el paquete es el mismo, y su
 * firma sigue valiendo.
 *
 * Referencia: scripts/publicar-modulo.ts, tienda/panel.ts, docs/MODULOS.md.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { leeManifiesto } from "../tienda/modulo-manifiesto.ts";
import { firmaIndice } from "../tienda/firma.ts";
import { claveDeFirma } from "../tienda/claves.ts";
import { escribeJsonAtomico } from "../core/escribe.ts";

const raiz = resolve(import.meta.dirname, "..");
const rutaIndice = join(raiz, "tienda", "index.json");
const dirModulos = join(raiz, "modulos");

const indice = JSON.parse(readFileSync(rutaIndice, "utf8")) as {
  modulos?: Array<{ id?: string } & Record<string, unknown>>;
} & Record<string, unknown>;

const modulos = Array.isArray(indice.modulos) ? indice.modulos : [];
let cambios = 0;

// el mapa id → carpeta: cada módulo del repo dice cuál es su id
const carpetasPorId = new Map<string, string>();
for (const d of readdirSync(dirModulos, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const carpeta = join(dirModulos, d.name);
  if (!existsSync(join(carpeta, "module.yaml"))) continue;
  const leido = leeManifiesto(carpeta, { exigirEntrada: false });
  if (leido.ok && leido.manifest?.id) carpetasPorId.set(leido.manifest.id, carpeta);
}

for (const m of modulos) {
  const id = typeof m.id === "string" ? m.id : "";
  if (!id) continue;
  const carpeta = carpetasPorId.get(id);
  if (!carpeta) {
    console.log(`· ${id}: no está en este repo (su manifiesto no se lee: se deja como está)`);
    continue;
  }
  const leido = leeManifiesto(carpeta, { exigirEntrada: false });
  const permisos = leido.ok && Array.isArray(leido.manifest?.permissions)
    ? [...(leido.manifest.permissions as string[])].sort()
    : [];
  const antes = JSON.stringify(m.permisos ?? null);
  const despues = JSON.stringify(permisos);
  if (antes === despues) continue;
  m.permisos = permisos;
  cambios++;
  console.log(`· ${id}: pide ${permisos.length ? permisos.join(", ") : "nada"}`);
}

if (!cambios) {
  console.log("");
  console.log("el índice ya declara lo que pide cada módulo (no hay nada que firmar)");
  process.exit(0);
}

if (process.argv.includes("--dry")) {
  console.log("");
  console.log(`(--dry: ${cambios} entrada(s) cambiarían; no se firma nada)`);
  process.exit(0);
}

// volver a firmar: los bytes del índice han cambiado
const clave = claveDeFirma();
const firmado = firmaIndice(indice, clave.priv);
escribeJsonAtomico(rutaIndice, firmado);
console.log("");
console.log(`✓ índice firmado (${cambios} entrada(s) con sus permisos)`);
console.log(`  ahora: npm run panel (y publica cuando quieras: npm run tienda:publicar-modulos)`);
