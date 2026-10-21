/**
 * LA CONFORMIDAD — la spec y el código son la misma cosa.
 *
 * La casa promete que «entre dos lenguajes sólo sobrevive lo que está
 * escrito». Eso, promises, es una frase: lo que la sostiene es que la spec y
 * el código se comprueban entre sí.
 *
 * Aquí está esa comprobación, en UN sitio (la usan el lint de specs y el
 * test): los estados, las opciones y los topes que la spec declara tienen que
 * ser los que el código usa — ni uno más, ni uno menos. Si alguien añade un
 * estado al código y no lo escribe en la spec, esto lo dice (y dice al revés
 * también: una spec que promete un estado que el código no tiene es una
 * promesa rota).
 *
 * Referencia: estandar/*.spec.yaml, docs/ARQUITECTURA.md §8.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import * as yaml from "js-yaml";
import { cargaMotorCached, MOTORES_CONOCIDOS } from "../../motores/laya-adapter.ts";
import { ROLES } from "../../core/equipo.ts";
import { MODOS } from "../../core/talamus/modos.ts";
import { CANALES } from "../../core/bot.ts";
import { ESTADOS_DESEO } from "../../core/tienda/deseos.ts";
import { CAPABILITIES } from "../../core/extension-host/capability.ts";
import { CATEGORIES, RUNTIMES } from "../../core/ipc/module-schema.ts";
import { LICENCIAS_PERMITIDAS, TOPE_BYTES, TOPE_FICHEROS, TOPE_TOKENS } from "../../tienda/skills.ts";

/** Un fallo de conformidad. */
export interface FalloConformidad {
  /** Qué spec. */
  spec: string;
  /** Qué no cuadra. */
  problema: string;
}

const raiz = (): string => resolve(import.meta.dirname, "..", "..");
const dirSpecs = (): string => join(raiz(), "estandar");

/** Las specs que hay. */
export function listaSpecs(): string[] {
  return readdirSync(dirSpecs()).filter((f) => f.endsWith(".spec.yaml"));
}

/** Lee una spec (la multi-documento se lee con su primer motor). */
export function leeSpec(f: string): Record<string, unknown> {
  const texto = readFileSync(join(dirSpecs(), f), "utf8");
  if (f === "motor-capability.spec.yaml") {
    const docs = yaml.loadAll(texto) as Array<Record<string, unknown> | null>;
    return (docs.find((d) => d && d.id) ?? {}) as Record<string, unknown>;
  }
  return (yaml.load(texto) ?? {}) as Record<string, unknown>;
}

/** Las opciones que la spec declara para una sección. */
function opciones(spec: Record<string, unknown>, seccion: string, clave: string): string[] {
  const s = spec[seccion] as Record<string, unknown> | undefined;
  const v = s?.[clave];
  return Array.isArray(v) ? v.map(String) : [];
}

/**
 * Comprueba que las specs y el código dicen lo mismo.
 *
 * Devuelve los fallos (vacío = la casa está en pie).
 */
export function compruebaConformidad(): FalloConformidad[] {
  const fallos: FalloConformidad[] = [];
  const anota = (spec: string, problema: string): void => {
    fallos.push({ spec, problema });
  };

  // 0. todas las specs se leen y declaran su versión
  for (const f of listaSpecs()) {
    const s = leeSpec(f);
    if (!s || typeof s !== "object") {
      anota(f, "no se lee");
      continue;
    }
    if (s.schema_version !== 1) anota(f, `schema_version: ${String(s.schema_version)} (se espera 1)`);
  }

  // 1. los motores: la spec y el código cuentan lo mismo
  const motores = cargaMotorCached(join(dirSpecs(), "motor-capability.spec.yaml"));
  const idsSpec = motores.map((m) => m.id).sort();
  const idsCodigo = [...MOTORES_CONOCIDOS].sort();
  if (idsSpec.join(",") !== idsCodigo.join(",")) {
    anota(
      "motor-capability.spec.yaml",
      `los motores no cuadran: spec [${idsSpec.join(", ")}] · código [${idsCodigo.join(", ")}]`
    );
  }

  // 2. los roles del equipo
  const equipo = leeSpec("equipo.spec.yaml");
  const rolesSpec = opciones(equipo, "reglas", "roles_cerrados");
  if (rolesSpec.join(",") !== [...ROLES].join(",")) {
    anota(
      "equipo.spec.yaml",
      `los roles no cuadran: spec [${rolesSpec.join(", ")}] · código [${ROLES.join(", ")}]`
    );
  }

  // 3. los modos del contexto (con sus presupuestos y umbrales)
  const contexto = leeSpec("contexto.spec.yaml");
  const modos = (contexto.modos ?? {}) as Record<string, { presupuesto?: number; umbral?: number }>;
  const idsModo = Object.keys(modos).sort();
  if (idsModo.join(",") !== Object.keys(MODOS).sort().join(",")) {
    anota(
      "contexto.spec.yaml",
      `los modos no cuadran: spec [${idsModo.join(", ")}] · código [${Object.keys(MODOS).sort().join(", ")}]`
    );
  }
  for (const [id, regla] of Object.entries(modos)) {
    const codigo = MODOS[id as keyof typeof MODOS];
    if (!codigo) continue;
    if (regla.presupuesto !== codigo.budget) {
      anota("contexto.spec.yaml", `${id}: presupuesto ${String(regla.presupuesto)} en la spec, ${codigo.budget} en el código`);
    }
    if (regla.umbral !== codigo.minimo) {
      anota("contexto.spec.yaml", `${id}: umbral ${String(regla.umbral)} en la spec, ${codigo.minimo} en el código`);
    }
  }

  // 4. los canales del bot
  const bot = leeSpec("bot.spec.yaml");
  const textoCanal = String((bot.bot as Record<string, unknown> | undefined)?.canal ?? "");
  for (const canal of CANALES) {
    if (!textoCanal.includes(canal)) anota("bot.spec.yaml", `el canal «${canal}» no está`);
  }

  // 5. los estados del deseo
  const deseo = leeSpec("deseo.spec.yaml");
  const estadosSpec = opciones(deseo, "reglas", "estado_cerrado");
  if (estadosSpec.join(",") !== [...ESTADOS_DESEO].join(",")) {
    anota(
      "deseo.spec.yaml",
      `los estados no cuadran: spec [${estadosSpec.join(", ")}] · código [${ESTADOS_DESEO.join(", ")}]`
    );
  }

  // 6. el manifiesto: las capacidades, las categorías y los runtimes
  const textoManifiesto = readFileSync(join(dirSpecs(), "module-manifest.spec.yaml"), "utf8");
  for (const c of CAPABILITIES) {
    if (!textoManifiesto.includes(c)) anota("module-manifest.spec.yaml", `la capacidad «${c}» no está`);
  }
  for (const c of CATEGORIES) {
    if (!textoManifiesto.includes(c)) anota("module-manifest.spec.yaml", `la categoría «${c}» no está`);
  }
  for (const r of RUNTIMES) {
    if (!textoManifiesto.includes(r)) anota("module-manifest.spec.yaml", `el runtime «${r}» no está`);
  }

  // 7. las skills: los topes y las licencias del juez
  const textoSkills = readFileSync(join(dirSpecs(), "skill-veredicto.spec.yaml"), "utf8");
  for (const [nombre, valor] of [
    ["bytes", TOPE_BYTES],
    ["ficheros", TOPE_FICHEROS],
    ["tokens", TOPE_TOKENS],
  ] as Array<[string, number]>) {
    if (!textoSkills.includes(String(valor))) {
      anota("skill-veredicto.spec.yaml", `el tope de ${nombre} (${valor}) no está escrito`);
    }
  }
  for (const l of LICENCIAS_PERMITIDAS) {
    if (!textoSkills.includes(l)) anota("skill-veredicto.spec.yaml", `la licencia «${l}» no está`);
  }

  // 8. las pieles: las piezas que el juez valida
  const piel = leeSpec("piel.spec.yaml");
  const piezas = (piel.piezas ?? {}) as Record<string, string[]>;
  if (!Object.keys(piezas).length) anota("piel.spec.yaml", "no declara las piezas");

  return fallos;
}
