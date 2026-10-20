// juzgar-skills.ts — el juez en persona: lee el catálogo de skills, dicta y firma.
//   npm run skills:juzgar -- --catalogo /ruta/catalogo.json
//
// El catálogo de skills vive en la app (app/src/main/skills/catalogo.json). Este
// script lo juzga con las reglas de tienda/skills.ts y escribe dos cosas:
//   skills/veredictos.json  — el veredicto firmado (lo que la app verifica)
//   skills/panel.md         — el veredicto legible (lo que se publica)
//
// La firma cubre la huella del árbol de cada skill: la app puede entonces
// negarse a instalar un árbol que no sea exactamente el que se juzgó.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { claveDeFirma } from "../tienda/claves.ts";
import {
  firmaVeredictos,
  juzgaCatalogo,
  renderPanelSkills,
  VEREDICTO_VERSION,
} from "../tienda/skills.ts";

const raiz = resolve(import.meta.dirname, "..");

// ——— argumentos ———
const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

// donde puede estar el catálogo de skills, en orden de preferencia
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
  console.error(
    "no encuentro el catálogo de skills: pásalo con --catalogo <ruta> o pon ESME_SKILLS_CATALOGO"
  );
  process.exit(1);
}

const salida = arg("--salida") ?? join(raiz, "skills", "veredictos.json");
const panel = arg("--panel") ?? join(raiz, "skills", "panel.md");

// ——— juzgar ———
const catalogo = JSON.parse(readFileSync(rutaCatalogo, "utf8")) as unknown;
const { veredictos, dentro, avisos, fuera } = juzgaCatalogo(catalogo);
if (!veredictos.length) {
  console.error(`el catálogo ${rutaCatalogo} no trae skills`);
  process.exit(1);
}

// ——— firmar ———
const clave = claveDeFirma();
const documento = firmaVeredictos(
  {
    version: VEREDICTO_VERSION,
    emitido: Date.now(),
    firmante: clave.huella,
    skills: veredictos,
  },
  clave.priv
);

mkdirSync(join(salida, ".."), { recursive: true });
writeFileSync(salida, JSON.stringify(documento, null, 2) + "\n");
mkdirSync(join(panel, ".."), { recursive: true });
writeFileSync(panel, renderPanelSkills(documento));

console.log(`catálogo  : ${rutaCatalogo}`);
console.log(`skills    : ${veredictos.length} juzgadas · ${dentro} entran · ${avisos} con aviso · ${fuera} fuera`);
console.log(`firmante  : ${clave.huella}`);
console.log(`veredicto : ${salida}`);
console.log(`panel     : ${panel}`);
