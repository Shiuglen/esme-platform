/**
 * LA PUERTA DE LAS SKILLS — una skill de cualquiera, juzgada en local.
 *
 * Las skills son instrucciones, no módulos: no se miden por el recall, sino
 * por HECHOS (que el commit esté fijado, que el árbol tenga huella, que la
 * licencia deje redistribuir, que el SKILL.md no se coma el contexto). El
 * juez de la tienda ya existía (`tienda/skills.ts`), pero medía un catálogo
 * que vive en la app: un Contributor de fuera no tenía puerta.
 *
 * Aquí sí: se mide una skill LOCAL (la que estás escribiendo) y se juzga con
 * el mismo juez. Lo que sale es el mismo veredicto que saldría del catálogo,
 * sin tocar la app.
 *
 * Referencia: tienda/skills.ts, tienda/empaque.ts, docs/ENTRADA.md.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, relative, resolve } from "node:path";
import { juzgaSkill, type SkillCatalogo, type VeredictoSkill } from "../../tienda/skills.ts";
import { leerSkillMd, type LecturaSkill } from "../../tienda/skill-md.ts";
import type { MedidaSkill } from "../../tienda/medir.ts";

/** Lo que se mide de una skill local. */
export interface MedidaLocal {
  /** La huella del árbol (mismos ficheros → misma huella). */
  arbolSha256: string;
  /** La licencia (del fichero LICENSE, si está). */
  licencia: string;
  /** El commit: si la skill es local, es «local» (no hay commit que fijar). */
  commit: string;
  /** Cuántos ficheros tiene. */
  ficheros: number;
  /** Cuántos bytes tiene. */
  bytes: number;
  /** ¿Tiene scripts ejecutables? */
  ejecutables: boolean;
  /** Los tokens que ocupa su SKILL.md (null si no lo tiene). */
  tokens: number | null;
  /** El sha256 del SKILL.md ("" si no lo hay). */
  skillMdSha256: string;
  /** Lo que se leyó del SKILL.md (la forma que el juez espera). */
  lectura: LecturaSkill;
  /** La medida del SKILL.md, como la del juez (sha, bytes, tokens). */
  medida: MedidaSkill;
}

/** Los ficheros de una carpeta, en orden (ruta → contenido). */
function ficherosDe(dir: string, prefijo = ""): string[] {
  const salida: string[] = [];
  const completa = prefijo ? join(dir, prefijo) : dir;
  let entradas: string[];
  try {
    entradas = readdirSync(completa).sort();
  } catch {
    return salida;
  }
  for (const e of entradas) {
    if (e === ".git" || e === "node_modules") continue;
    const rel = prefijo ? `${prefijo}/${e}` : e;
    let st;
    try {
      st = statSync(join(dir, rel));
    } catch {
      continue;
    }
    if (st.isDirectory()) salida.push(...ficherosDe(dir, rel));
    else if (st.isFile()) salida.push(rel);
  }
  return salida.sort();
}

/** La huella del árbol: mismos ficheros, mismos bytes → misma huella. */
export function arbolDe(dir: string): string {
  const h = createHash("sha256");
  for (const rel of ficherosDe(dir)) {
    h.update(rel);
    h.update("\0");
    h.update(createHash("sha256").update(readFileSync(join(dir, rel))).digest("hex"));
    h.update("\n");
  }
  return h.digest("hex");
}

/** La licencia de la skill (del fichero LICENSE, si está). */
export function licenciaDe(dir: string): string {
  for (const nombre of ["LICENSE", "LICENSE.md", "LICENSE.txt", "licencia"]) {
    const ruta = join(dir, nombre);
    if (!existsSync(ruta)) continue;
    const texto = readFileSync(ruta, "utf8").slice(0, 400);
    if (/MIT License|Permission is hereby granted, free of charge/i.test(texto)) return "MIT";
    if (/Apache License/i.test(texto)) return "Apache-2.0";
    if (/BSD 3-Clause|Redistribution and use in source and binary forms/i.test(texto)) return "BSD-3-Clause";
    if (/BSD 2-Clause/i.test(texto)) return "BSD-2-Clause";
    if (/ISC License/i.test(texto)) return "ISC";
    if (/This is free and unencumbered software released into the public domain/i.test(texto)) {
      return "Unlicense";
    }
    return "desconocida";
  }
  return "";
}

/** La medida completa de una skill local. */
export function mideLocal(dir: string): MedidaLocal {
  const ficheros = ficherosDe(dir);
  const bytes = ficheros.reduce((n, rel) => {
    try {
      return n + statSync(join(dir, rel)).size;
    } catch {
      return n;
    }
  }, 0);
  const ejecutables = ficheros.some((rel) => {
    try {
      const st = statSync(join(dir, rel));
      return (st.mode & 0o111) !== 0 && /\.(sh|py|js|mjs|ts)$/.test(rel);
    } catch {
      return false;
    }
  });

  let tokens: number | null = null;
  let skillMdSha256 = "";
  let lectura: LecturaSkill = { ok: false, error: "no hay SKILL.md en esta skill" };
  let medida: MedidaSkill = { sha256: "", bytes: 0, tokens: 0, lectura };
  const skillMd = join(dir, "SKILL.md");
  if (existsSync(skillMd)) {
    const datos = readFileSync(skillMd);
    const texto = datos.toString("utf8");
    skillMdSha256 = createHash("sha256").update(datos).digest("hex");
    tokens = Math.round(texto.length / 4);
    lectura = leerSkillMd(texto, basename(resolve(dir)));
    medida = { sha256: skillMdSha256, bytes: datos.length, tokens, lectura };
  }

  return {
    arbolSha256: arbolDe(dir),
    licencia: licenciaDe(dir),
    commit: "local",
    ficheros: ficheros.length,
    bytes,
    ejecutables,
    tokens,
    skillMdSha256,
    lectura,
    medida,
  };
}

/** La entrada de catálogo de una skill local (lo que el juez consume). */
export function catalogoDe(
  dir: string,
  id: string,
  nombre: string,
  grupo = "casa",
  repo = "local"
): SkillCatalogo {
  const m = mideLocal(dir);
  return {
    id,
    nombre,
    grupo,
    repo,
    ruta: relative(process.cwd(), dir) || dir,
    commit: m.commit,
    arbolSha256: m.arbolSha256,
    licencia: m.licencia,
    tieneScripts: m.ejecutables,
    ficheros: m.ficheros,
    bytes: m.bytes,
  };
}

/**
 * Juzga una skill local con el MISMO juez de la tienda.
 *
 * Lo que cambia respecto a juzgar un catálogo: la procedencia (aquí es local,
 * no hay commit que fijar) y que la huella del árbol se calcula aquí (en el
 * catálogo viene ya hecha).
 */
export function juzgaLocal(
  dir: string,
  id: string,
  nombre: string,
  grupo = "casa"
): VeredictoSkill {
  const medida = mideLocal(dir);
  const entrada = catalogoDe(dir, id, nombre, grupo);
  // el juez recibe la medida del SKILL.md (sha, bytes, tokens y la lectura)
  return juzgaSkill(entrada, medida.medida);
}
