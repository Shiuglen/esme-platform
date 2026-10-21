/**
 * publicar-modulos.ts — el store de módulos, publicado donde la app lo busca.
 *   npm run tienda:publicar-modulos -- [--repo <ruta>] [--push]
 *
 * Lo que sale a la tienda (ficheros firmados, nada más):
 *   index.json                    el índice firmado (la lista de módulos)
 *   paquetes/*.tgz                los módulos, byte a byte como los firmó
 *   firmas/*.artefacto.json       la firma de cada paquete (vive FUERA del tar)
 *   rotaciones.json               la estirpe: quién avala al firmante de hoy
 *   deseos.json                   la lista de deseos, firmada (la demanda)
 *
 * Por qué fuera del tar: si la firma viviera dentro, el paquete cambiaría en
 * cada firma y su sha nunca se estabilizaría (elInfierno del churn).
 *
 * La firma es lo que hace que valga: quien no tenga la raíz congelada no
 * instala nada (tienda/receptor.ts lo comprueba).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const tiene = (flag: string) => process.argv.includes(flag);

const repo = resolve(arg("--repo") ?? process.env.ESME_TIENDA_REPO ?? join(homedir(), "esme-tienda"));
if (!existsSync(join(repo, ".git"))) {
  console.error(`no hay un repo en ${repo} — clónalo o pasa --repo <ruta> (ESME_TIENDA_REPO)`);
  process.exit(1);
}

const indiceRuta = join(raiz, "tienda", "index.json");
const indice = JSON.parse(readFileSync(indiceRuta, "utf8")) as {
  signature?: { signed_by?: string; hash?: string };
  modulos: Array<{ id: string; version: string }>;
};

// lo que se publica, tal cual (la firma viaja con el cuerpo)
const copiar = (origen: string, destino: string): void => {
  mkdirSync(join(repo, destino, ".."), { recursive: true });
  writeFileSync(join(repo, destino), readFileSync(origen));
};

copiar(indiceRuta, "index.json");
if (existsSync(join(raiz, "tienda", "rotaciones.json")))
  copiar(join(raiz, "tienda", "rotaciones.json"), "rotaciones.json");
if (existsSync(join(raiz, "tienda", "deseos.json")))
  copiar(join(raiz, "tienda", "deseos.json"), "deseos.json");
if (existsSync(join(raiz, "tienda", "revocaciones.json")))
  copiar(join(raiz, "tienda", "revocaciones.json"), "revocaciones.json");
// el veredicto del juez (firmado): lo que la app verifica antes de activar
if (existsSync(join(raiz, "modulos", "veredictos.json")))
  copiar(join(raiz, "modulos", "veredictos.json"), "veredictos-modulos.json");
if (existsSync(join(raiz, "modulos", "panel-modulos.md")))
  copiar(join(raiz, "modulos", "panel-modulos.md"), "panel-modulos.md");

let publicados = 0;
for (const m of indice.modulos) {
  const id = m.id.replace(/\./g, "-");
  const tar = join(raiz, "tienda", "paquetes", `${id}-${m.version}.tgz`);
  const firma = join(raiz, "tienda", "firmas", `${m.id}.artefacto.json`);
  if (!existsSync(tar)) {
    console.error(`  ${m.id}: no hay paquete en ${tar} (corre npm run bench)`);
    process.exit(1);
  }
  copiar(tar, `paquetes/${id}-${m.version}.tgz`);
  if (existsSync(firma)) copiar(firma, `firmas/${m.id}.artefacto.json`);
  publicados++;
}

// el README cuenta lo que hay (la tienda es un sitio que se lee)
const filas = indice.modulos
  .map((m) => `| \`${m.id}\` | ${m.version} | \`paquetes/${m.id.replace(/\./g, "-")}-${m.version}.tgz\` | la llave del juez |`)
  .join("\n");
const bloque = `
## El store de módulos

Los módulos del extension host (memoria y herramientas), firmados como todo lo
demás. El índice va firmado; la firma de cada paquete vive **fuera** del
tarball (en \`firmas/\`), para que el sha del paquete se pueda estabilizar.

| módulo | versión | paquete | quién lo firma |
|---|---|---|---|
${filas}

Se instala desde fuera con la raíz congelada:

\`\`\`bash
npm run instalar -- --url https://raw.githubusercontent.com/Shiuglen/esme-tienda/main
\`\`\`

Lo que no trae una firma válida no se instala.
`;
const readme = join(repo, "README.md");
const texto = existsSync(readme) ? readFileSync(readme, "utf8") : "# La Tienda de Esme\n";
if (!texto.includes("## El store de módulos")) writeFileSync(readme, texto.trimEnd() + "\n" + bloque);

console.log(`repo      : ${repo}`);
console.log(`módulos   : ${publicados} publicados`);
console.log(`firma     : ${indice.signature?.signed_by ?? "?"}`);
console.log(`próximo   : ${tiene("--push") ? "git push" : "revisar y luego --push"}`);

if (tiene("--push")) {
  execFileSync("git", ["add", "-A"], { cwd: repo, stdio: "inherit" });
  execFileSync("git", ["commit", "-m", "el store de módulos, firmado"], { cwd: repo, stdio: "inherit" });
  execFileSync("git", ["push"], { cwd: repo, stdio: "inherit" });
  console.log("publicado ✓");
}
