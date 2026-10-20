/**
 * skills.ts — el juez de las skills de la Tienda.
 *
 * Qué hace: mira el catálogo de skills (el mismo JSON que consume la app) y
 * dicta, skill por skill, si entra en la Tienda, con qué riesgo y por qué.
 * Dicta con hechos, no con opiniones: hay commit fijado, hay huella del
 * árbol, la licencia deja redistribuir, no trae scripts, no pesa una barbaridad.
 *
 * Lo que lo hace serio: FIRMA su veredicto, y la firma cubre la huella del
 * árbol que juzgó. La app puede entonces negarse a instalar un árbol que no
 * sea exactamente el que el juez miró (hoy se compara contra el catálogo, que
 * puede cambiar de mano entre la revisión y la descarga).
 *
 * Regla de oro (docs/PRUEBA-0.md): si el número no mejora, no entra. Aquí los
 * números son bytes, ficheros, licencia e integridad. Lo que la skill te
 * ahorra en contexto NO se estima aquí: eso lo mide la app en la vista previa,
 * con el SKILL.md delante.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { canonical, firmarBytes, type FirmaBytes } from "./firma.ts";

/** La versión del veredicto. Cambia si cambia el formato firmado. */
export const VEREDICTO_VERSION = 1;

/** La entrada del catálogo que la app publica (app/src/main/skills/catalogo.json). */
export interface SkillCatalogo {
  id: string;
  nombre: string;
  grupo: string;
  descripcionEs?: string;
  descripcion?: string;
  repo: string;
  ruta: string;
  commit: string;
  arbolSha256: string;
  licencia: string;
  tieneScripts: boolean;
  ficheros: number;
  bytes: number;
  revisadoEl?: string;
}

/** ok = entra sin reservations · aviso = entra pero se avisa · fuera = no entra. */
export type Nivel = "ok" | "aviso" | "fuera";

/** Los hechos con los que se juzgó. Lo que no se puede medir, no se cuenta. */
export interface MedidasSkill {
  arbolSha256: string;
  licencia: string;
  commit: string;
  ficheros: number;
  bytes: number;
  ejecutables: boolean;
}

export interface VeredictoSkill {
  id: string;
  entra: boolean;
  nivel: Nivel;
  causa: string;
  medidas: MedidasSkill;
}

/** El veredicto entero, antes de firmarlo. */
export interface VeredictosSkills {
  version: number;
  emitido: number;
  firmante: string; // la huella de la clave (16 hex)
  catalogoSha256: string; // el catálogo EXACTO que se juzgó (64 hex)
  skills: VeredictoSkill[];
}

/** El veredicto con su firma encima. Esto es lo que viaja. */
export interface VeredictosSkillsFirmados extends VeredictosSkills {
  firma: FirmaBytes;
}

/** Las licencias que dejan redistribuir lo que contienen. */
export const LICENCIAS_PERMITIDAS = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Unlicense",
];

/** Por encima de esto, el árbol se avisa (1 MiB). */
export const TOPE_BYTES = 1024 * 1024;

/** Por encima de esto, el árbol se avisa. */
export const TOPE_FICHEROS = 40;

const ID_OK = /^[a-z0-9][a-z0-9._/-]{2,119}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const cuenta = (n: unknown): number => {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
};

const veredicto = (
  id: string,
  entra: boolean,
  nivel: Nivel,
  causa: string,
  medidas: MedidasSkill
): VeredictoSkill => ({ id, entra, nivel, causa, medidas });

/**
 * Juega una skill. Primero la puerta de la forma (sin commit, sin huella o sin
 * licencia que redistribuir, no hay juicio posible), después los avisos.
 */
export function juzgaSkill(c: Partial<SkillCatalogo>): VeredictoSkill {
  const id = typeof c?.id === "string" ? c.id : "";
  const medidas: MedidasSkill = {
    arbolSha256: typeof c?.arbolSha256 === "string" ? c.arbolSha256 : "",
    licencia: typeof c?.licencia === "string" ? c.licencia : "",
    commit: typeof c?.commit === "string" ? c.commit : "",
    ficheros: cuenta(c?.ficheros),
    bytes: cuenta(c?.bytes),
    ejecutables: c?.tieneScripts === true,
  };

  if (!ID_OK.test(id))
    return veredicto(id, false, "fuera", "id inválido: ni se puede nombrar", medidas);
  if (!HEX40.test(medidas.commit))
    return veredicto(id, false, "fuera", "no hay commit fijado: no se puede probar qué es", medidas);
  if (!HEX64.test(medidas.arbolSha256))
    return veredicto(id, false, "fuera", "no hay huella del árbol: no se puede probar qué se descarga", medidas);
  if (!LICENCIAS_PERMITIDAS.includes(medidas.licencia))
    return veredicto(
      id,
      false,
      "fuera",
      `licencia ${medidas.licencia || "desconocida"}: sin permiso claro para redistribuir`,
      medidas
    );

  const avisos: string[] = [];
  if (medidas.ejecutables) avisos.push("trae scripts ejecutables: hay que pedirlos");
  if (medidas.bytes > TOPE_BYTES)
    avisos.push(`el árbol pesa ${(medidas.bytes / 1024 / 1024).toFixed(1)} MiB`);
  if (medidas.ficheros > TOPE_FICHEROS)
    avisos.push(`trae ${medidas.ficheros} ficheros`);

  if (avisos.length)
    return veredicto(id, true, "aviso", avisos.join(" · "), medidas);
  return veredicto(
    id,
    true,
    "ok",
    "commit fijado, huella del árbol y licencia que deja redistribuir",
    medidas
  );
}

/**
 * Juega el catálogo entero. Un id repetido no juzga dos veces: la segunda
 * repite es fuera (el catálogo no puede decidir cuál de las dos vale).
 */
export function juzgaCatalogo(catalogo: unknown): {
  veredictos: VeredictoSkill[];
  dentro: number;
  avisos: number;
  fuera: number;
} {
  const lista = Array.isArray(catalogo) ? catalogo : [];
  const vistos = new Set<string>();
  const veredictos: VeredictoSkill[] = [];
  for (const crudo of lista) {
    const c = (crudo ?? {}) as Partial<SkillCatalogo>;
    const id = typeof c.id === "string" ? c.id : "";
    const v = juzgaSkill(c);
    if (vistos.has(id)) {
      veredictos.push(
        veredicto(id, false, "fuera", "id repetido en el catálogo", v.medidas)
      );
      continue;
    }
    vistos.add(id);
    veredictos.push(v);
  }
  veredictos.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    veredictos,
    dentro: veredictos.filter((v) => v.entra).length,
    avisos: veredictos.filter((v) => v.nivel === "aviso").length,
    fuera: veredictos.filter((v) => !v.entra).length,
  };
}

/**
 * La huella del catálogo: qué catálogo exacto se juzgó. El canónico (claves
 * ordenadas) para que el formato del fichero no altere la huella — la app
 * calcula la misma con el mismo catálogo en memoria.
 */
export function catalogoSha256(catalogo: unknown): string {
  return createHash("sha256").update(canonical(catalogo)).digest("hex");
}

/**
 * El cuerpo firmado: JSON con las claves en un orden FIJO. No se ordena nada
 * (el orden de las claves es parte de la spec): el que verifica tiene que
 * sacar los mismos bytes que el que firmó.
 * Ver `estandar/skill-veredicto.spec.yaml`.
 */
export function cuerpoVeredictos(v: VeredictosSkills): string {
  return JSON.stringify({
    version: v.version,
    emitido: v.emitido,
    firmante: v.firmante,
    catalogoSha256: v.catalogoSha256,
    skills: v.skills.map((s) => ({
      id: s.id,
      entra: s.entra,
      nivel: s.nivel,
      causa: s.causa,
      medidas: {
        arbolSha256: s.medidas.arbolSha256,
        licencia: s.medidas.licencia,
        commit: s.medidas.commit,
        ficheros: s.medidas.ficheros,
        bytes: s.medidas.bytes,
        ejecutables: s.medidas.ejecutables,
      },
    })),
  });
}

/** Firma el veredicto: los bytes firmados son el cuerpo, sin la firma. */
export function firmaVeredictos(
  v: VeredictosSkills,
  privPem: string
): VeredictosSkillsFirmados {
  const bytes = Buffer.from(cuerpoVeredictos(v), "utf8");
  return { ...v, firma: firmarBytes(bytes, privPem, v.firmante) };
}

const esVeredicto = (v: unknown): v is VeredictoSkill => {
  const x = v as Partial<VeredictoSkill>;
  return (
    !!x &&
    typeof x === "object" &&
    typeof x.id === "string" &&
    typeof x.entra === "boolean" &&
    (x.nivel === "ok" || x.nivel === "aviso" || x.nivel === "fuera") &&
    typeof x.causa === "string" &&
    !!x.medidas &&
    typeof x.medidas === "object"
  );
};

/**
 * Comprueba el veredicto firmado contra una clave pública. Tres preguntas:
 * ¿el cuerpo es el que se firmó? (hash) ¿la firma es de esa clave? (Ed25519)
 * ¿la firma es de quien dice firmar? (huella).
 */
export function verificaVeredictos(
  texto: string,
  pubPem: string
):
  | { ok: true; skills: VeredictoSkill[]; emitido: number; firmante: string }
  | { ok: false; motivo: string } {
  let doc: Partial<VeredictosSkillsFirmados>;
  try {
    doc = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: "el veredicto no se puede leer" };
  }
  if (
    !doc ||
    typeof doc !== "object" ||
    !Array.isArray(doc.skills) ||
    !doc.firma ||
    typeof doc.firma.signature !== "string" ||
    typeof doc.firma.hash !== "string"
  )
    return { ok: false, motivo: "el veredicto no tiene la forma esperada" };
  if (doc.version !== VEREDICTO_VERSION)
    return { ok: false, motivo: `versión de veredicto desconocida (${String(doc.version)})` };
  if (!HEX64.test(typeof doc.catalogoSha256 === "string" ? doc.catalogoSha256 : ""))
    return { ok: false, motivo: "el veredicto no dice qué catálogo juzgó" };
  if (!doc.skills.every(esVeredicto))
    return { ok: false, motivo: "el veredicto trae skills sin la forma esperada" };

  const cuerpo: VeredictosSkills = {
    version: doc.version,
    emitido: cuenta(doc.emitido),
    firmante: typeof doc.firmante === "string" ? doc.firmante : "",
    catalogoSha256:
      typeof doc.catalogoSha256 === "string" ? doc.catalogoSha256 : "",
    skills: doc.skills,
  };
  const bytes = Buffer.from(cuerpoVeredictos(cuerpo), "utf8");
  const hash = createHash("sha256").update(bytes).digest("base64");
  if (hash !== doc.firma.hash)
    return { ok: false, motivo: "el cuerpo cambió respecto al hash firmado" };
  let valida = false;
  try {
    valida = verify(
      null,
      bytes,
      createPublicKey(pubPem),
      Buffer.from(doc.firma.signature, "base64")
    );
  } catch {
    valida = false;
  }
  if (!valida) return { ok: false, motivo: "firma Ed25519 inválida" };
  if (doc.firma.signed_by !== cuerpo.firmante)
    return { ok: false, motivo: "la firma no es de quien dice firmar" };
  return { ok: true, skills: cuerpo.skills, emitido: cuerpo.emitido, firmante: cuerpo.firmante };
}

/** El veredicto de una skill concreta (o null si el juez no la miró). */
export function veredictoDe(
  v: VeredictosSkills,
  id: string
): VeredictoSkill | null {
  return v.skills.find((s) => s.id === id) ?? null;
}

const kb = (n: number) =>
  n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;

/** El panel: el veredicto, legible por una persona y por una máquina. */
export function renderPanelSkills(v: VeredictosSkills): string {
  const dentro = v.skills.filter((s) => s.entra).length;
  const avisos = v.skills.filter((s) => s.nivel === "aviso").length;
  const fuera = v.skills.length - dentro;
  const fecha = new Date(v.emitido).toISOString().slice(0, 10);
  const lineas = [
    `# Veredicto de las skills — ${fecha}`,
    "",
    `${v.skills.length} skills juzgadas · ${dentro} entran · ${avisos} con aviso · ${fuera} fuera`,
    `Firmante: ${v.firmante} · versión ${v.version}`,
    "",
    "| skill | veredicto | causa | licencia | peso |",
    "|---|---|---|---|---|",
  ];
  for (const s of v.skills) {
    const marca = s.nivel === "fuera" ? "✗ fuera" : s.nivel === "aviso" ? "⚠ aviso" : "✓ ok";
    lineas.push(
      `| ${s.id} | ${marca} | ${s.causa} | ${s.medidas.licencia} | ${kb(s.medidas.bytes)} |`
    );
  }
  return lineas.join("\n") + "\n";
}
