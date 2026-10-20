// publicar-veredictos.ts — el veredicto del juez, publicado donde la app lo busca.
//   npm run skills:publicar -- [ruta-del-repo] [--push]
//
// Genera el veredicto (mismo juez que `npm run skills:juzgar`) y lo deja en el repo
// de la tienda: `veredictos-skills.json` (lo que la app verifica) y `panel.md` (lo que
// se lee). El push solo si se pide: publicar es cosa del creador.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { claveDeFirma } from "../tienda/claves.ts";
import { medirSkill, type MedidaSkill } from "../tienda/medir.ts";
import {
  catalogoSha256,
  firmaVeredictos,
  juzgaCatalogo,
  renderPanelSkills,
  VEREDICTO_VERSION,
} from "../tienda/skills.ts";

const raiz = resolve(import.meta.dirname, "..");
const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const tiene = (flag: string) => process.argv.includes(flag);

const repo = resolve(
  arg("--repo") ??
    process.env.ESME_TIENDA_REPO ??
    join(homedir(), "esme-tienda")
);
if (!existsSync(join(repo, ".git"))) {
  console.error(
    `no hay un repo en ${repo} — clónalo o pasa --repo <ruta> (ESME_TIENDA_REPO)`
  );
  process.exit(1);
}

const candidatosCatalogo = (): string[] => {
  const env = process.env.ESME_SKILLS_CATALOGO;
  return [
    ...(env ? [env] : []),
    arg("--catalogo"),
    join(homedir(), "Daimon", "app", "src", "main", "skills", "catalogo.json"),
    "/tmp/opencode/esme-app/app/src/main/skills/catalogo.json",
  ].filter((p): p is string => !!p);
};
const rutaCatalogo = candidatosCatalogo().find((p) => existsSync(p));
if (!rutaCatalogo) {
  console.error("no encuentro el catálogo de skills (--catalogo o ESME_SKILLS_CATALOGO)");
  process.exit(1);
}

// ——— juzgar y firmar ———
const catalogo = JSON.parse(readFileSync(rutaCatalogo, "utf8")) as unknown;
const mediciones = new Map<string, MedidaSkill>();
if (tiene("--medir")) {
  const lista = Array.isArray(catalogo) ? catalogo : [];
  for (const crudo of lista) {
    const c = (crudo ?? {}) as Record<string, string>;
    if (!c.id) continue;
    try {
      mediciones.set(c.id, await medirSkill({ repo: c.repo, ruta: c.ruta, commit: c.commit }, { carpeta: c.nombre }));
    } catch (e) {
      console.error(`  ${c.id}: no se pudo medir (${e instanceof Error ? e.message : String(e)})`);
    }
  }
}
const { veredictos, dentro, avisos, fuera } = juzgaCatalogo(catalogo, mediciones);
if (!veredictos.length) {
  console.error(`el catálogo ${rutaCatalogo} no trae skills`);
  process.exit(1);
}
const clave = claveDeFirma();
const documento = firmaVeredictos(
  {
    version: VEREDICTO_VERSION,
    emitido: Date.now(),
    firmante: clave.huella,
    catalogoSha256: catalogoSha256(catalogo),
    skills: veredictos,
  },
  clave.priv
);

// ——— publicar (en el repo de la tienda) ———
mkdirSync(repo, { recursive: true });
writeFileSync(
  join(repo, "veredictos-skills.json"),
  JSON.stringify(documento, null, 2) + "\n"
);
writeFileSync(join(repo, "panel.md"), renderPanelSkills(documento));
console.log(`catálogo  : ${rutaCatalogo}`);
console.log(`skills    : ${veredictos.length} juzgadas · ${dentro} entran · ${avisos} con aviso · ${fuera} fuera`);
console.log(`firmante  : ${clave.huella} (${clave.ruta})`);
console.log(`escrito  : ${join(repo, "veredictos-skills.json")}`);

const git = (args: string[]) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

git(["add", "veredictos-skills.json", "panel.md"]);
const hayCambio = git(["status", "--porcelain"]).length > 0;
if (!hayCambio) {
  console.log("sin cambios: el veredicto publicado ya era este");
  process.exit(0);
}
git(["commit", "-q", "-m", `el juez de las skills: ${veredictos.length} juzgadas (${dentro} entran, ${fuera} fuera)`]);
if (tiene("--push")) {
  git(["push", "origin", "HEAD"]);
  console.log("publicado: la app ya lo puede bajar");
} else {
  console.log("commit hecho. Para publicarlo: git -C " + repo + " push origin HEAD");
}
