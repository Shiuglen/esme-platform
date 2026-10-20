// publicar-catalogo.ts — el catálogo de productos de la Tienda, firmado y publicado donde la app lo busca.
//   npm run tienda:publicar -- --productos <ruta-del-catalogo-sin-firmar> [--repo <ruta>] [--push]
//
// La app NUNCA firma: el que publica es el kit, con la llave de la Tienda (la de release si el entorno la apunta,
// si no la dev key local). El fichero que entra es el que genera la app sin firmar
// (app/scripts/catalogo-productos.mjs → app/src/main/tienda/productos.json).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { firmarCatalogo, verificarCatalogo, type Producto } from "../tienda/catalogo.ts";
import { claveDeFirma } from "../tienda/claves.ts";

const raiz = resolve(import.meta.dirname, "..");
const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const tiene = (flag: string) => process.argv.includes(flag);

const repo = resolve(
  arg("--repo") ?? process.env.ESME_TIENDA_REPO ?? join(homedir(), "esme-tienda"),
);
if (!existsSync(join(repo, ".git"))) {
  console.error(
    `no hay un repo en ${repo} — clónalo o pasa --repo <ruta> (ESME_TIENDA_REPO)`,
  );
  process.exit(1);
}

const rutaProductos =
  arg("--productos") ??
  process.env.ESME_PRODUCTOS ??
  join(raiz, "..", "esme-app", "app", "src", "main", "tienda", "productos.json");
if (!existsSync(rutaProductos)) {
  console.error(
    `no encuentro el catálogo de productos (--productos o ESME_PRODUCTOS): ${rutaProductos}`,
  );
  console.error(
    "  en la app: node scripts/catalogo-productos.mjs  (lo deja sin firmar en src/main/tienda/productos.json)",
  );
  process.exit(1);
}

// El fichero que entra puede ser el JSON suelto {version, productos} o el catálogo
// firmado que se firmó antes (en ese caso se vuelve a firmar con la llave de ahora).
const crudo = JSON.parse(readFileSync(rutaProductos, "utf8")) as {
  productos?: Producto[];
  firma?: string;
};
const productos = Array.isArray(crudo.productos) ? crudo.productos : null;
if (!productos || !productos.length) {
  console.error(`el catálogo ${rutaProductos} no trae productos`);
  process.exit(1);
}

const { priv, pub, huella, ruta } = claveDeFirma();
const firmado = firmarCatalogo(productos, priv);

// No se publica lo que no se puede comprobar: la misma puerta que tiene la app delante.
const comprobado = verificarCatalogo(firmado, pub);
if (!comprobado.ok) {
  console.error(`el catálogo no se puede comprobar: ${comprobado.motivo}`);
  process.exit(1);
}

const destino = join(repo, "catalogo.json");
writeFileSync(destino, `${firmado}\n`);
console.log(`catálogo firmado (${productos.length} productos)`);
console.log(`  llave: ${huella} (${ruta})`);
console.log(`  → ${destino}`);

if (tiene("--push")) {
  execFileSync("git", ["add", "catalogo.json"], { cwd: repo, stdio: "inherit" });
  execFileSync(
    "git",
    ["commit", "-m", `el catálogo de la Tienda: ${productos.length} productos, firmados`],
    { cwd: repo, stdio: "inherit" },
  );
  execFileSync("git", ["push"], { cwd: repo, stdio: "inherit" });
  console.log("publicado: la app lo verá en la próxima vez que abra la Tienda");
}
