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
import { TIPOS_RECURSO, VEREDICTOS_RECURSO } from "../../core/tienda/recursos.ts";
import { CLAVES_RECETA_AGENTE } from "../../tienda/agente.ts";
import { CLAVES_TURNO } from "../../core/turnos/turno.ts";
import { CLAVES_PUNTO } from "../../core/motores/puntos.ts";
import { CLAVES_DECISION } from "../../core/router/aprende.ts";
import { CATEGORIAS_ARENA, CLAVES_ARENA } from "../../core/arena/arena.ts";
import { MINIMO_CATAS } from "../../core/arena/paladar.ts";
import { CAPABILITIES } from "../../core/extension-host/capability.ts";
import { EFECTOS_REA, MAPA_EFECTOS, PEOR_EFECTO } from "../../core/rea/capacidades.ts";
import { TIPOS_HECHO } from "../../core/rea/conocimiento.ts";
import { clavesDeLaEvidencia } from "../../core/rea/forma.ts";
import {
  CLAVES_CONTEXTO,
  CLAVES_DESCONOCIDO,
  CLAVES_NODO,
  CLAVES_RELACION,
} from "../../core/rea/evidencia.ts";
import { CATEGORIES, RUNTIMES } from "../../core/ipc/module-schema.ts";
import { LICENCIAS_PERMITIDAS, TOPE_BYTES, TOPE_FICHEROS, TOPE_TOKENS } from "../../tienda/skills.ts";
import { entradaDe } from "../publicar-modulo.ts";
import { declaraClave, firmarIndex } from "../../tienda/firma.ts";
import { generateKeyPairSync } from "node:crypto";

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

  // 9. los recursos: el tipo y el veredicto son los del código
  const recurso = leeSpec("recurso.spec.yaml");  const reglasRecurso = (recurso.reglas ?? {}) as Record<string, unknown>;
  const cerrados = (reglasRecurso.cerrados as { tipo?: string[]; veredicto?: string[] }) ?? {};
  if ((cerrados.tipo ?? []).join(",") !== [...TIPOS_RECURSO].join(",")) {
    anota(
      "recurso.spec.yaml",
      `los tipos no cuadran: spec [${(cerrados.tipo ?? []).join(", ")}] · código [${TIPOS_RECURSO.join(", ")}]`
    );
  }
  if ((cerrados.veredicto ?? []).join(",") !== [...VEREDICTOS_RECURSO].join(",")) {
    anota(
      "recurso.spec.yaml",
      `los veredictos no cuadran: spec [${(cerrados.veredicto ?? []).join(", ")}] · código [${VEREDICTOS_RECURSO.join(", ")}]`
    );
  }

  // 10. la arena: las categorías cerradas y el mínimo de catas
  const arena = leeSpec("arena.spec.yaml");
  const categoriasSpec = opciones(arena, "reglas", "categorias_cerradas");
  if (categoriasSpec.join(",") !== [...CATEGORIAS_ARENA].join(",")) {
    anota(
      "arena.spec.yaml",
      `las categorías no cuadran: spec [${categoriasSpec.join(", ")}] · código [${CATEGORIAS_ARENA.join(", ")}]`
    );
  }
  const reglasArena = (arena.reglas ?? {}) as Record<string, unknown>;
  if (Number(reglasArena.minimo_catas) !== MINIMO_CATAS) {
    anota(
      "arena.spec.yaml",
      `el mínimo de catas es ${String(reglasArena.minimo_catas)} en la spec y ${MINIMO_CATAS} en el código`
    );
  }

  // 11. REA: los efectos cerrados, el mapa de capacidades y los tipos de hecho
  const rea = leeSpec("rea.spec.yaml");
  const efectosSpec = opciones(rea, "reglas", "efectos_cerrados");
  if (efectosSpec.join(",") !== [...EFECTOS_REA].join(",")) {
    anota(
      "rea.spec.yaml",
      `los efectos no cuadran: spec [${efectosSpec.join(", ")}] · código [${EFECTOS_REA.join(", ")}]`
    );
  }
  const reglasRea = (rea.reglas ?? {}) as Record<string, unknown>;
  const mapaSpec = (reglasRea.efecto_por_capacidad ?? {}) as Record<string, string>;
  for (const m of MAPA_EFECTOS) {
    const declarado = mapaSpec[m.efecto];
    const enCodigo = m.capacidad ?? "";
    if (declarado !== enCodigo) {
      anota(
        "rea.spec.yaml",
        `el efecto «${m.efecto}» exige «${enCodigo || "nada"}» en el código y «${declarado ?? "nada"}» en la spec`
      );
    }
  }
  for (const efecto of Object.keys(mapaSpec)) {
    if (!MAPA_EFECTOS.some((m) => m.efecto === efecto)) {
      anota("rea.spec.yaml", `el efecto «${efecto}» está en la spec y el código no lo conoce`);
    }
  }
  const tiposSpec = opciones(rea, "reglas", "tipos_hecho_cerrados");
  if (tiposSpec.join(",") !== [...TIPOS_HECHO].join(",")) {
    anota(
      "rea.spec.yaml",
      `los tipos de hecho no cuadran: spec [${tiposSpec.join(", ")}] · código [${TIPOS_HECHO.join(", ")}]`
    );
  }
  if (String(reglasRea.peor_efecto ?? "") !== PEOR_EFECTO) {
    anota(
      "rea.spec.yaml",
      `el peor efecto es «${PEOR_EFECTO}» en el código y «${String(reglasRea.peor_efecto ?? "nada")}» en la spec`
    );
  }

  // 11-bis. la forma de la evidencia: la spec y el validador son la misma cosa
  const specRea = leeSpec("rea.spec.yaml");
  const seccionEvidencia = (specRea.evidencia ?? {}) as Record<string, unknown>;
  const rutasDeSpec = (d: unknown, prefijo = ""): string[] => {
    if (!d || typeof d !== "object") return [];
    if (Array.isArray(d)) return [];
    const salida: string[] = [];
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      const camino = prefijo ? `${prefijo}.${k}` : k;
      salida.push(camino);
      salida.push(...rutasDeSpec(v, camino));
    }
    return salida;
  };
  /** Las hojas: las claves que no son el prefijo de otra (un grupo no es una hoja). */
  const hojas = (rutas: string[]): string[] =>
    rutas.filter((c) => !rutas.some((otra) => otra !== c && otra.startsWith(`${c}.`)));
  const declaradas = rutasDeSpec(seccionEvidencia);
  const delValidador = clavesDeLaEvidencia();
  // la spec no puede declarar una clave que el validador no conoce
  for (const c of declaradas) {
    if (!delValidador.includes(c)) {
      anota("rea.spec.yaml", `declara «${c}», que el validador no tiene`);
    }
  }
  // y el validador no puede tener una clave que la spec no declara (las
  // HOJAS: una clave que es el prefijo de otra es un grupo, no una hoja)
  for (const c of hojas(delValidador)) {
    if (!declaradas.includes(c)) {
      anota("rea.spec.yaml", `el validador tiene «${c}» y la spec no la declara`);
    }
  }

  // 11-ter. las formas de cada elemento: la spec y el kit dicen lo mismo
  const formasRea = (specRea.formas ?? {}) as Record<string, unknown>;
  const paresForma: Array<[string, readonly string[]]> = [
    ["nodo", CLAVES_NODO],
    ["relacion", CLAVES_RELACION],
    ["desconocido", CLAVES_DESCONOCIDO],
    ["contexto", CLAVES_CONTEXTO],
  ];
  for (const [seccion, claves] of paresForma) {
    const declarada = (formasRea[seccion] ?? {}) as Record<string, unknown>;
    const deSpec = hojas(rutasDeSpec(declarada));
    if (!deSpec.length) {
      anota("rea.spec.yaml", `no declara la forma «${seccion}»`);
      continue;
    }
    for (const c of claves) {
      if (!deSpec.includes(c)) {
        anota("rea.spec.yaml", `la forma «${seccion}» no declara «${c}», que el kit lee`);
      }
    }
    for (const c of deSpec) {
      if (!claves.includes(c)) {
        anota("rea.spec.yaml", `la forma «${seccion}» declara «${c}», que el kit no lee`);
      }
    }
  }

  // 12. las formas: los campos de la spec son los del código
  const formas: Array<[string, string, readonly string[]]> = [
    ["agente.spec.yaml", "agente", CLAVES_RECETA_AGENTE],
    ["turno.spec.yaml", "turno", CLAVES_TURNO],
    ["puntos.spec.yaml", "punto", CLAVES_PUNTO],
    ["router.spec.yaml", "decision", CLAVES_DECISION],
    ["arena.spec.yaml", "arena", CLAVES_ARENA],
  ];
  for (const [fichero, seccion, claves] of formas) {
    const spec = leeSpec(fichero);
    const forma = (spec[seccion] ?? {}) as Record<string, unknown>;
    const declarados = Object.keys(forma);
    if (!declarados.length) {
      anota(fichero, `no declara la forma «${seccion}»`);
      continue;
    }
    for (const d of declarados) {
      if (!claves.includes(d)) {
        anota(fichero, `${seccion}.${d}: la spec lo declara y el código no lo tiene`);
      }
    }
  }

  // 13. el índice de la tienda: la spec y la entrada que se publica de verdad
  const indice = leeSpec("indice-tienda.spec.yaml");
  const entradaSpec = (indice.entrada ?? {}) as Record<string, unknown>;
  const declaradasEntrada = Object.keys(entradaSpec);
  if (!declaradasEntrada.length) {
    anota("indice-tienda.spec.yaml", "no declara la forma «entrada»");
  } else {
    // la entrada REAL que publica el kit. Se miran las dos formas: una
    // entrada lleva `bench` (módulo de memoria) o `bench_ciclo` (herramienta),
    // según lo que diga el informe — y la spec declara las dos.
    const reales = new Set<string>();
    for (const informe of [
      { casos: 12, recall_base: 0.25, recall_con: 1, tokens_base: 100, tokens_con: 50, modulo: "esme.prueba.modulo", version: "0.1.0" },
      { casos: 3, ciclo_ok: true, tokens_ciclo: 10, modulo: "esme.prueba.modulo", version: "0.1.0" },
    ]) {
      const real = entradaDe(
        "esme.prueba.modulo",
        "0.1.0",
        "tool",
        "una descripción",
        ["etiqueta"],
        informe,
        "a".repeat(64),
        100,
        true,
        { por: "huella", en: "2026-10-21" },
        ["proc:spawn", "mind:read"]
      );
      for (const k of Object.keys(real)) reales.add(k);
    }
    for (const d of declaradasEntrada) {
      if (!reales.has(d)) {
        anota("indice-tienda.spec.yaml", `la entrada declara «${d}», que la publicación no pone`);
      }
    }
    for (const r of reales) {
      if (!declaradasEntrada.includes(r)) {
        anota("indice-tienda.spec.yaml", `la publicación pone «${r}» y la spec no lo declara`);
      }
    }
  }

  // 13-bis. el documento del índice: la spec y lo que se firma de verdad
  const indiceSpec = (indice.indice ?? {}) as Record<string, unknown>;
  const declaradasIndice = Object.keys(indiceSpec);
  if (!declaradasIndice.length) {
    anota("indice-tienda.spec.yaml", "no declara la forma «indice»");
  } else {
    // el documento REAL: se firma con una llave de mentira (el contenido no
    // importa: lo que se comprueba es la FORMA)
    const { privateKey } = generateKeyPairSync("ed25519");
    const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const firmado = firmarIndex(
      { schema_version: 1, firmado: null, modulos: [], ...declaraClave({}, "clave", "huella") },
      privPem,
      "huella"
    );
    for (const d of declaradasIndice) {
      if (!(d in firmado)) {
        anota("indice-tienda.spec.yaml", `el índice declara «${d}», que la firma no pone`);
      }
    }
    for (const r of Object.keys(firmado)) {
      if (!declaradasIndice.includes(r)) {
        anota("indice-tienda.spec.yaml", `la firma pone «${r}» y la spec no lo declara`);
      }
    }
  }

  return fallos;
}

