/**
 * IMPORTAR UNA SKILL SUELTA — una carpeta con su SKILL.md (el estándar abierto
 * de Agent Skills), como un paquete de Esme con una skill en «.».
 *
 * El nombre y la descripción salen de su cabecera; el autor, de
 * `metadata.author` o `author` (si no lo dice, `--autor`); la licencia, de
 * `license`, de su LICENSE o de `--licencia`. Del SKILL.md se quitan
 * `allowed-tools` (da permisos sin pasar por los del paquete) y `hooks`
 * (código en cada paso), y `${CLAUDE_SKILL_DIR}` pasa a `${ESME_PAQUETE}`.
 * Si trae scripts (una carpeta `scripts/`, código, u órdenes que corren al
 * leer su SKILL.md) se dice: `scripts: true` sube su nivel de aislamiento.
 *
 * Referencia: tienda/importa-comun.ts, tienda/skill-md.ts, docs/PAQUETES.md.
 */
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { esObjeto, paquete, slug } from "../core/paquetes/adaptadores/comun.ts";
import { leerSkillMd } from "./skill-md.ts";
import {
  MOTIVOS,
  aEsme,
  cierra,
  descripcionDe,
  eligeAutor,
  eligeLicencia,
  esFichero,
  falla,
  ficherosDe,
  idDe,
  noSeQuita,
  nombreDeAutor,
  partesMd,
  quitaClaves,
  sinSustituir,
  traeScripts,
  versionImportada,
  type Descartado,
  type Importe,
  type OpcionesImporte,
} from "./importa-comun.ts";

/** Una skill suelta (la carpeta de su SKILL.md), como paquete. */
export function importaCarpetaSkill(dir: string, opts: OpcionesImporte = {}): Importe {
  const carpeta = basename(resolve(dir));
  if (!esFichero(join(dir, "SKILL.md")))
    return falla(`«${dir}» no trae SKILL.md (un fichero de verdad, no un enlace): una skill es una carpeta con su SKILL.md`);
  const original = readFileSync(join(dir, "SKILL.md"), "utf8");
  const l = leerSkillMd(original, carpeta);
  if (!l.ok) return falla(`SKILL.md: ${l.error}`);

  const { cabecera } = partesMd(original);
  const meta = esObjeto(cabecera.metadata) ? cabecera.metadata : {};
  const avisos = l.avisos.map((a) => `SKILL.md: ${a}`);
  const descartado: Descartado[] = [];

  const errores: string[] = [];
  const autor = eligeAutor(nombreDeAutor(meta.author) ?? nombreDeAutor(cabecera.author), opts.autor, "la skill", avisos);
  if (!autor) errores.push("la skill no dice su autor: dalo con --autor «Tu Nombre»");
  const lic = eligeLicencia({ escrita: cabecera.license ?? l.skill.licencia, carpeta: dir, opcion: opts.licencia, quien: "la skill" });
  if ("error" in lic) errores.push(lic.error);
  if (!autor || "error" in lic) return falla(...errores);

  const nombre = l.skill.name;
  const id = idDe(autor, nombre);
  const skill = slug(nombre) || slug(carpeta);
  if (!id || !skill) return falla(`«${autor}» y «${nombre}» no dan un id (esme.<autor>.<nombre>): dalo con --autor`);

  const q = quitaClaves(original, ["allowed-tools", "hooks"]);
  if (q.quedan.length) return falla(`SKILL.md: ${noSeQuita(q.quedan)}`);
  for (const k of q.quitadas) {
    if (k === "hooks") descartado.push({ que: "SKILL.md: hooks", motivo: MOTIVOS.hooks });
    else avisos.push(`SKILL.md: «${k}» no viaja: da permisos sin pasar por los del paquete`);
  }
  const skillMd = aEsme(q.texto, ".");
  for (const v of sinSustituir(skillMd)) avisos.push(`SKILL.md: ${v}`);

  const f = ficherosDe(dir);
  descartado.push(...f.descartado);
  const p = paquete(
    {
      id,
      version: versionImportada(meta.version ?? cabecera.version, "la skill", avisos),
      name: nombre,
      description: descripcionDe(l.skill.description, `La skill «${nombre}».`, "la skill", avisos),
      author: autor,
      license: lic.licencia,
      source: { from: "skill", ref: carpeta },
    },
    { skills: [{ id: skill, path: ".", scripts: traeScripts(f.ficheros, original) }] },
    [],
    { ...f.ficheros, "SKILL.md": skillMd }
  );
  return cierra(p, [...lic.avisos, ...avisos], descartado);
}
