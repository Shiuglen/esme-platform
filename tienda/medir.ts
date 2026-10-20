/**
 * medir.ts — medir la skill de verdad: bajar su SKILL.md del commit fijado y
 * decir cuánto ocupa, si se lee y si dice lo que dice.
 *
 * El juez no se fía del catálogo: el catálogo es lo que alguien escribió. La
 * medida es del fichero que el usuario va a leer. Y como la medida va dentro
 * del veredicto firmado, la app puede enseñar el coste real de una skill
 * ANTES de descargarla.
 *
 * La cuenta de tokens es la misma que hace la app en la vista previa:
 * caracteres / 4. No es un modelo de tokens: es una comparación honesta entre
 * skills, y la app la recalcula al previsualizar.
 */
import { createHash } from "node:crypto";
import { leerSkillMd, type LecturaSkill } from "./skill-md.ts";

export interface MedidaSkill {
  /** El sha256 del SKILL.md que se leyó (prueba de cuál se midió). */
  sha256: string;
  bytes: number;
  tokens: number;
  /** La forma: si el fichero se lee y qué avisa. */
  lectura: LecturaSkill;
}

export interface FuenteSkill {
  repo: string;
  ruta: string;
  commit: string;
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT = /^[0-9a-f]{40}$/;
const rutaSegura = (r: string) =>
  !!r && !r.startsWith("/") && !r.split("/").some((p) => p === ".." || p === ".");

export type Buscar = (
  url: string,
  opciones: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

/** La URL del SKILL.md dentro del commit fijado. */
export function urlDeSkillMd(f: FuenteSkill): string {
  if (!REPO.test(f.repo)) throw new Error(`el repositorio «${f.repo}» no es válido`);
  if (!COMMIT.test(f.commit))
    throw new Error("la skill tiene que ir fijada a un commit completo");
  const base = f.ruta.replace(/\/+$/, "");
  if (!rutaSegura(base)) throw new Error(`la ruta «${f.ruta}» no es válida`);
  const ruta = `${base}/SKILL.md`
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `https://raw.githubusercontent.com/${f.repo}/${f.commit}/${ruta}`;
}

/**
 * Mide una skill: baja su SKILL.md del commit fijado y lo lee.
 * Si algo falla (no existe, no se baja, no se lee) devuelve la causa: el juez
 * la convierte en «no entra».
 */
export async function medirSkill(
  f: FuenteSkill,
  o: { buscar?: Buscar; carpeta?: string } = {}
): Promise<MedidaSkill> {
  const buscar = o.buscar ?? (fetch as unknown as Buscar);
  const url = urlDeSkillMd(f);
  const r = await buscar(url, {
    headers: { "User-Agent": "esme" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok)
    return {
      sha256: "",
      bytes: 0,
      tokens: 0,
      lectura: {
        ok: false,
        error:
          r.status === 404
            ? "no hay SKILL.md en ese commit"
            : `no se pudo bajar su SKILL.md (${r.status})`,
      },
    };
  const datos = Buffer.from(await r.arrayBuffer());
  const texto = datos.toString("utf8");
  return {
    sha256: createHash("sha256").update(datos).digest("hex"),
    bytes: datos.length,
    tokens: Math.round(texto.length / 4),
    lectura: leerSkillMd(texto, o.carpeta ?? f.ruta.split("/").pop() ?? ""),
  };
}
