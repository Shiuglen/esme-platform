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
import { medirSkill, type MedidaSkill } from "../tienda/medir.ts";
import {
  catalogoSha256,
  conservaEvidencia,
  firmaVeredictos,
  juzgaCatalogo,
  renderPanelSkills,
  VEREDICTO_VERSION,
  type VeredictosSkills,
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

/** El veredicto anterior en disco (si lo hay y se puede leer). */
const leerVeredictos = (ruta: string): VeredictosSkills | null => {
  if (!existsSync(ruta)) return null;
  try {
    const doc = JSON.parse(readFileSync(ruta, "utf8")) as VeredictosSkills;
    if (!doc || !Array.isArray(doc.skills) || typeof doc.catalogoSha256 !== "string")
      return null;
    return doc;
  } catch {
    return null;
  }
};

// ——— juzgar ———
const catalogo = JSON.parse(readFileSync(rutaCatalogo, "utf8")) as unknown;

// con --medir se baja el SKILL.md de cada skill del commit fijado y se mide de
// verdad: si se lee, cuánto ocupa y si dice lo que dice. Sin red, sin medir.
const medir = process.argv.includes("--medir");
const mediciones = new Map<string, MedidaSkill>();
if (medir) {
  const lista = Array.isArray(catalogo) ? catalogo : [];
  for (const crudo of lista) {
    const c = (crudo ?? {}) as Record<string, string>;
    if (!c.id) continue;
    try {
      const m = await medirSkill(
        { repo: c.repo, ruta: c.ruta, commit: c.commit },
        { carpeta: c.nombre }
      );
      mediciones.set(c.id, m);
    } catch (e) {
      console.error(`  ${c.id}: no se pudo medir (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  console.log(`medidas   : ${mediciones.size} ficheros leídos`);
}

const { veredictos: judged, dentro, avisos, fuera } = juzgaCatalogo(catalogo, mediciones);
if (!judged.length) {
  console.error(`el catálogo ${rutaCatalogo} no trae skills`);
  process.exit(1);
}

// La evidencia NO se pierde: si esta vuelta no midió (sin red, sin --medir) y
// el veredicto anterior era del MISMO catálogo, el veredicto anterior manda:
// medido es medido. Solo si el catálogo cambió la evidencia vieja queda
// fuera (era de otro catálogo).
const previo = leerVeredictos(salida);
const { veredictos, conservados } = conservaEvidencia(
  judged,
  previo,
  catalogoSha256(catalogo)
);
if (conservados) console.log(`evidencia  : ${conservados} veredictos medidos conservados (mismo catálogo)`);

// ——— firmar ———
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

mkdirSync(join(salida, ".."), { recursive: true });
writeFileSync(salida, JSON.stringify(documento, null, 2) + "\n");
mkdirSync(join(panel, ".."), { recursive: true });
writeFileSync(panel, renderPanelSkills(documento));

console.log(`catálogo  : ${rutaCatalogo}`);
console.log(`skills    : ${veredictos.length} juzgadas · ${dentro} entran · ${avisos} con aviso · ${fuera} fuera`);
console.log(`catálogo  : sha256 ${documento.catalogoSha256.slice(0, 16)}… (el veredicto queda atado a este catálogo)`);
console.log(`firmante  : ${clave.huella}`);
console.log(`veredicto : ${salida}`);
console.log(`panel     : ${panel}`);
