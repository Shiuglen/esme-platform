/**
 * licensing — la frontera de la licencia, escrita y comprobable.
 *
 * El kit es open core: el núcleo (MIT) se puede usar en cualquier sitio; lo
 * que lleva la identidad (Tinta y Luz), la ventana y el Taller son de la
 * licencia comunitaria. Decisión 1 de docs/ARQUITECTURA.md.
 *
 * Aquí la frontera no es un papel: es una lista. Un núcleo es MIT si su
 * licencia lo dice; una identidad no lo es. `assertNivel` falla con el
 * motivo, para que nadie tenga que adivinar.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Los tres niveles de la casa. */
export type Nivel = "mit" | "comunitaria" | "propia";

/**
 * Las rutas del NÚCLEO: lo que es MIT y se queda MIT. Todo lo que no esté
 * en esta lista (la identidad, la ventana, los servicios) es comunitario.
 */
export const RUTAS_MIT = [
  "core/",
  "motores/",
  "modulos/nucleo/",
  "estandar/",
  "tienda/",
] as const;

/** Lo que NO es MIT, aunque esté en el repo: lleva la identidad o es servicio. */
export const RUTAS_COMUNITARIAS = ["apps/desktop/", "marca/", "backend/sync/"] as const;

/** El nivel de una ruta del repo. */
export function nivelDe(ruta: string): Nivel {
  const normalizada = ruta.replace(/\\/g, "/");
  if (RUTAS_COMUNITARIAS.some((r) => normalizada.startsWith(r))) return "comunitaria";
  if (RUTAS_MIT.some((r) => normalizada.startsWith(r))) return "mit";
  return "propia";
}

export interface Dictamen {
  ok: boolean;
  razon: string;
}

/**
 * Comprueba que una ruta es del núcleo MIT. Si no lo es, lo dice: una
 * dependencia que arrastra la identidad no entra en el núcleo por la puerta
 * de atrás.
 */
export function assertNivel(ruta: string, nivel: Nivel = "mit"): Dictamen {
  const n = nivelDe(ruta);
  if (n === nivel) return { ok: true, razon: `${ruta} es ${n}` };
  return {
    ok: false,
    razon: `${ruta} es ${n} y el núcleo solo admite ${nivel}`,
  };
}

/**
 * La licencia que dice el repo (la que hay en el LICENSE de verdad), no la
 * que dice el manifiesto de un módulo. Si no hay LICENSE, no se presume.
 */
export function licenciaDelRepo(raiz: string): string | null {
  const ruta = join(raiz, "LICENSE");
  if (!existsSync(ruta)) return null;
  const texto = readFileSync(ruta, "utf8");
  if (/MIT License/i.test(texto)) return "MIT";
  return null;
}

/** ¿El repo trae las dos licencias que dice la decisión 1? */
export function licenciasPresentes(raiz = resolve(process.cwd())): {
  mit: boolean;
  comunitaria: boolean;
} {
  return {
    mit: existsSync(join(raiz, "LICENSE")),
    comunitaria: existsSync(join(raiz, "LICENSE-COMMUNITY.md")),
  };
}
