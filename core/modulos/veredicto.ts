/**
 * EL JUEZ DE LOS MÓDULOS — si un módulo entra, y por qué.
 *
 * Las skills tienen juez (`tienda/skills.ts`): nadie vende una skill que no
 * se ha medido. Los módulos NO lo tenían: el manifiesto pedía un
 * `benchmarks.recall_delta` y nadie lo comprobaba, así que un módulo podía
 * entrar en la Tienda sin haber probado nada.
 *
 * El juez mira cuatro cosas, y ninguna se negocia:
 *
 *  1. **Carga**: el módulo arranca y contesta. Un módulo que no arranca, no
 *     entra (ni de prueba).
 *  2. **Su forma de examen**: cada módulo se mide como lo que es. Un módulo
 *     de memoria se mide por el recall (base vs. con); un módulo de
 *     herramienta, por el ciclo completo (recall→inject) y los tokens que
 *     inyecta. El juez no inventa una forma para el otro: usa la del informe.
 *  3. **Mejora y coste**: la mejora es la que el módulo mismo prometió como
 *     mínimo, y el coste se mide POR PUNTO de acierto (pagar 40 tokens por
 *     0,01 de recall no es mejorar: es un peaje).
 *  4. **Permisos**: lo que USA está dentro de lo que DECLARA, y lo que
 *     declara y no usa se dice (pide más de lo que necesita: eso lo tiene que
 *     saber quien lo va a instalar).
 *
 * El juez no instala nada y no permite nada: dictamina. Quien decide es la
 * persona (o la Tienda, con la firma del veredicto).
 *
 * Referencia: estandar/module-veredicto.spec.yaml, tienda/bench.ts.
 */
import type { Manifest } from "../ipc/module-schema.ts";

/** Una sonda: la función que se llama para ejercitar el módulo. */
export interface Sonda {
  /** La función exportada que se llama. */
  fn: string;
  /** Los argumentos con que se llama. */
  args?: unknown[];
}

/**
 * El informe de examen que un módulo publica (bench.json).
 *
 * Hay dos formas, y son las dos que la Tienda ya conoce:
 *   - la de MÓDULO DE MEMORIA: `recall_base` / `recall_con` / `tokens_*`.
 *   - la de MÓDULO DE HERRAMIENTA: `ciclo_ok` / `tokens_ciclo`.
 */
export interface InformeModulo {
  modulo?: string;
  version?: string;
  fecha?: string;
  casos?: number;
  recall_base?: number;
  recall_con?: number;
  tokens_base?: number;
  tokens_con?: number;
  tokens_ciclo?: number;
  ciclo_ok?: boolean;
  semilla?: number;
  /**
   * Las sondas: qué funciones hay que llamar para ejercitar el módulo de
   * verdad. Sin sondas, la medición sólo sabe que el módulo carga; con ellas,
   * sabe qué capacidades toca (y por eso puede juzgarlo).
   */
  sondas?: Sonda[];
  [k: string]: unknown;
}

/** Lo que el juez MIDIO. */
export interface MedidasModulo {
  /** El módulo cargó y contestó. */
  carga: boolean;
  /** Por qué no cargó (si no cargó). */
  error?: string;
  /** Las capacidades que el módulo usó de verdad (o intentó usar). */
  usadas: string[];
  /** Su informe de examen (bench.json), si lo tiene. */
  informe: InformeModulo | null;
}

/** El veredicto: entra o no entra, con qué nivel y por qué. */
export interface VeredictoModulo {
  id: string;
  version: string;
  /** "ok" entra; "aviso" entra con reparos; "fuera" no entra. */
  nivel: "ok" | "aviso" | "fuera";
  /** Entra o no. */
  entra: boolean;
  /** Por qué, en una frase. */
  causa: string;
  /** Los números del dictamen. */
  medidas: {
    orden: [
      "carga",
      "forma",
      "recallBase",
      "recallCon",
      "delta",
      "tokensBase",
      "tokensCon",
      "tokensCiclo",
      "cicloOk",
      "coste",
      "costePorPunto",
      "declaradas",
      "usadas",
      "casos"
    ];
    carga: boolean;
    /** "ciclo" (herramienta), "memoria" o "sin-medida". */
    forma: "ciclo" | "memoria" | "sin-medida";
    recallBase: number | null;
    recallCon: number | null;
    delta: number | null;
    tokensBase: number | null;
    tokensCon: number | null;
    tokensCiclo: number | null;
    cicloOk: boolean | null;
    coste: number | null;
    costePorPunto: number | null;
    declaradas: string[];
    usadas: string[];
    casos: number;
  };
}

/**
 * El tope de coste: cuántos tokens se pueden gastar por CADA punto de recall
 * que el módulo gana.
 *
 * No es un tope absoluto: un módulo que sube el recall de 0,25 a 1,00 vale
 * cualquier cantidad de tokens (es el módulo de la casa). Uno que sube 0,01
 * por el doble de tokens, no. El coste se mide POR PUNTO: lo que pregunta es
 * «¿cuánto pagas por cada acierto que ganas?».
 */
export const TOPE_COSTE_POR_PUNTO = 10;

/** Los topes del ciclo (los mismos que la Tienda usa, para no tener dos). */
export const MIN_CASOS_CICLO = 3;
export const MAX_TOKENS_CICLO = 500;

/**
 * El dictamen.
 *
 * @param manifiesto el manifiesto del módulo (declara el mínimo que promete)
 * @param medidas lo que se midió de verdad
 */
export function juzgaModulo(
  manifiesto: Manifest,
  medidas: MedidasModulo
): VeredictoModulo {
  const declaradas: string[] = [...manifiesto.permissions];
  const usadas = [...medidas.usadas];
  const minimo = manifiesto.benchmarks?.recall_delta ?? 0;
  const informe = medidas.informe;

  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  const casos = num(informe?.casos) ?? 0;
  const cicloOk = typeof informe?.ciclo_ok === "boolean" ? informe.ciclo_ok : null;
  const tokensCiclo = num(informe?.tokens_ciclo);
  const recallBase = num(informe?.recall_base);
  const recallCon = num(informe?.recall_con);
  const tokensBase = num(informe?.tokens_base);
  const tokensCon = num(informe?.tokens_con);

  const forma: "ciclo" | "memoria" | "sin-medida" =
    cicloOk !== null ? "ciclo" : recallBase !== null || recallCon !== null ? "memoria" : "sin-medida";

  const delta = recallBase !== null && recallCon !== null ? recallCon - recallBase : null;
  const coste =
    tokensBase !== null && tokensCon !== null && tokensBase > 0 ? tokensCon / tokensBase : null;
  // Lo que se paga por cada punto de acierto que el módulo gana.
  const costePorPunto = coste !== null && delta !== null && delta > 0 ? coste / delta : null;

  const base = {
    id: manifiesto.id,
    version: manifiesto.version,
    medidas: {
      orden: [
        "carga",
        "forma",
        "recallBase",
        "recallCon",
        "delta",
        "tokensBase",
        "tokensCon",
        "tokensCiclo",
        "cicloOk",
        "coste",
        "costePorPunto",
        "declaradas",
        "usadas",
        "casos",
      ] as unknown as VeredictoModulo["medidas"]["orden"],
      carga: medidas.carga,
      forma,
      recallBase,
      recallCon,
      delta,
      tokensBase,
      tokensCon,
      tokensCiclo,
      cicloOk,
      coste,
      costePorPunto,
      declaradas,
      usadas,
      casos,
    },
  };

  // 1. ¿carga?
  if (!medidas.carga) {
    return { ...base, nivel: "fuera", entra: false, causa: `no carga: ${medidas.error ?? "se calló"}` };
  }

  // 2. ¿usa algo que no declaró? (la cápsula lo impide; aquí se deja escrito)
  const noDeclaradas = usadas.filter((u) => !declaradas.includes(u));
  if (noDeclaradas.length) {
    return {
      ...base,
      nivel: "fuera",
      entra: false,
      causa: `usa capacidades que no declaró: ${noDeclaradas.join(", ")}`,
    };
  }

  // 3. ¿hay número? (sin informe no hay veredicto: un módulo sin medir no entra)
  if (forma === "sin-medida") {
    return {
      ...base,
      nivel: "fuera",
      entra: false,
      causa: "sin informe de examen no hay número: un módulo sin medir no entra",
    };
  }

  // 4. el según su forma:
  if (forma === "ciclo") {
    // Un módulo de herramienta: el ciclo tiene que funcionar y noinjectar de más.
    if (cicloOk === false) {
      // el porqué va en la causa: «el ciclo falló» no dice qué arreglar.
      const porque = typeof informe?.error === "string" ? `: ${informe.error}` : "";
      return {
        ...base,
        nivel: "fuera",
        entra: false,
        causa: `el ciclo falló en el examen${porque}`,
      };
    }
    if (casos < MIN_CASOS_CICLO) {
      return {
        ...base,
        nivel: "fuera",
        entra: false,
        causa: `solo ${casos} escenarios: mínimo ${MIN_CASOS_CICLO}`,
      };
    }
    if (tokensCiclo !== null && tokensCiclo > MAX_TOKENS_CICLO) {
      return {
        ...base,
        nivel: "fuera",
        entra: false,
        causa: `el ciclo funciona pero inyecta ${Math.round(tokensCiclo)} tokens (tope ${MAX_TOKENS_CICLO})`,
      };
    }
    return conAviso(
      base,
      declaradas,
      usadas,
      `el ciclo funciona: ${casos} escenarios, ${Math.round(tokensCiclo ?? 0)} tokens por ciclo`
    );
  }

  // Un módulo de memoria: tiene que mejorar lo que prometió y no pagar un peaje.
  if (delta === null) {
    return {
      ...base,
      nivel: "fuera",
      entra: false,
      causa: "sin informe de examen no hay número: un módulo sin medir no entra",
    };
  }
  if (delta < minimo) {
    return {
      ...base,
      nivel: "fuera",
      entra: false,
      causa: `no llega al mínimo que declaró (${delta.toFixed(4)} < ${minimo})`,
    };
  }
  if (costePorPunto !== null && costePorPunto > TOPE_COSTE_POR_PUNTO) {
    return {
      ...base,
      nivel: "fuera",
      entra: false,
      causa:
        `cuesta demasiado por lo que gana: ${costePorPunto.toFixed(1)} tokens por punto ` +
        `de recall (tope ${TOPE_COSTE_POR_PUNTO})`,
    };
  }
  return conAviso(
    base,
    declaradas,
    usadas,
    `mejora ${delta.toFixed(4)} (mínimo ${minimo}) y usa lo que pide`
  );
}

/**
 * El último paso: si el módulo pide más de lo que la medición le vio usar, no
 * se le echa (eso lo decide quien lo instala), pero se dice.
 */
function conAviso(
  base: { id: string; version: string; medidas: VeredictoModulo["medidas"] },
  declaradas: string[],
  usadas: string[],
  causa: string
): VeredictoModulo {
  const deMas = declaradas.filter((d) => !usadas.includes(d));
  if (deMas.length) {
    return {
      ...base,
      nivel: "aviso",
      entra: true,
      causa:
        `${causa}. Pide más de lo que la medición le vio usar: ${deMas.join(", ")} ` +
        `(puede que lo use en otro camino; quien lo instala, lo decide)`,
    };
  }
  return { ...base, nivel: "ok", entra: true, causa };
}
