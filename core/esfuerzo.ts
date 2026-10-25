/**
 * EL ESFUERZO DE LOS MODELOS — cuánto piensa cada uno, POR ESCRITO.
 *
 * La tabla vive en estandar/esfuerzo.spec.yaml (y encima de ella, el
 * documento de la MENTE, que manda). Aquí NO se lee yaml: el núcleo es
 * puro (la casa no arrastra dependencias — ver tests/consumible.test.ts).
 * El que lee el documento y lo convierte en fichas vive en el borde:
 * motores/esfuerzo-doc.ts (la casa del parseo, como laya-adapter).
 *
 * La regla de la honestidad: un modelo que NO declara el modo pedido no
 * recibe nada: se le manda NADA (params null), nunca un valor de rumbo
 * inventado. Y la modificación: cambiar la tabla es editar el documento;
 * nada se recompila.
 *
 * Referencia: estandar/esfuerzo.spec.yaml, docs/ESFUERZO.md, core/motores/puntos.ts.
 */

/** Los modos de la casa (tres, con nombres de casa). */
export const MODOS = ["apretado", "normal", "profundo"] as const;
export type Modo = (typeof MODOS)[number];

/** Las claves de la ficha (la forma que declara estandar/esfuerzo.spec.yaml). */
export const CLAVES_ESFUERZO = [
  "motor",
  "modelo",
  "parametro",
  "valores",
  "fuente",
  "verificado",
] as const;

/** Una ficha de la tabla: un modelo (o "*" = la reserva del motor). */
export interface EntradaEsfuerzo {
  motor: string;
  modelo: string;
  /** string, o `null` si el motor no habla de esfuerzo; `undefined` si no lo dijo (mezcla: lo dicho antes queda) */
  parametro?: string | null;
  valores: Record<string, unknown>;
  fuente?: string;
  verificado?: "probado" | "sin-mirar";
  /** quién escribió esta ficha (la casa o la mente encima) */
  de?: "tabla" | "mente";
}

/** La tabla cargada: fichas y de dónde vino el documento. */
export interface TablaEsfuerzo {
  ruta: string;
  entradas: EntradaEsfuerzo[];
}

/** Un modo resuelto: lo que de verdad se manda (o el NADA justo, dicho). */
export interface EsfuerzoResuelto {
  motor: string;
  modelo: string;
  modo: Modo;
  /** true si la tabla lo declara; false = a este modelo no le digas nada. */
  sabe: boolean;
  /** El nombre del parámetro en el cuerpo (null si el motor no lo habla). */
  parametro: string | null;
  /** El valor del modo pedido (en la lengua del motor). */
  valor: unknown;
  /** El fragmento para el cuerpo de la petición (null = no se manda nada). */
  params: Record<string, unknown> | null;
  /** De dónde salió: "tabla" (la de la casa), "mente" (la escrita encima). */
  de: "tabla" | "mente";
}

/** ¿La ficha trae las piezas con su nombre? (motor, documento por documento) */
export function esFicha(r: unknown): r is Record<string, unknown> {
  return !!r && typeof r === "object" && typeof (r as Record<string, unknown>).motor === "string";
}

/**
 * Convierte los documentos ya PARSEADOS en fichas: los que llevan `motor:`
 * son fichas; el resto (la regla, la spec) no. Esta función es la FRONTERA
 * de la forma: el parseo del yaml vive fuera del núcleo (motores o app),
 * el significado dentro.
 */
export function deDocumento(docs: Iterable<unknown> | null, de: "tabla" | "mente"): EntradaEsfuerzo[] {
  const fichas: EntradaEsfuerzo[] = [];
  for (const doc of docs ?? []) {
    if (!esFicha(doc)) continue;
    const d = doc as Record<string, unknown>;
    fichas.push({
      motor: String(d.motor),
      modelo: typeof d.modelo === "string" ? d.modelo : "*",
      parametro: d.parametro === undefined ? undefined : d.parametro === null ? null : String(d.parametro),
      valores: (d.valores && typeof d.valores === "object" ? { ...(d.valores as Record<string, unknown>) } : {}) as Record<string, unknown>,
      fuente: typeof d.fuente === "string" ? d.fuente : undefined,
      verificado: d.verificado === "probado" || d.verificado === "sin-mirar" ? d.verificado : undefined,
      de,
    });
  }
  return fichas;
}

/**
 * LA MEZCLA SUAVE: el documento de la MENTE encima de la tabla de la casa.
 * Misma (motor, modelo): lo que la mente declaró gana pieza por pieza (y
 * una pieza NO dicha no borra la dicha); lo que la mente NOMINÓ y la casa
 * no, entra. El resto, de la casa.
 */
export function mezclaTablas(casa: EntradaEsfuerzo[], encima: EntradaEsfuerzo[]): EntradaEsfuerzo[] {
  const resultado = casa.map((e) => ({ ...e }));
  for (const suya of encima) {
    const misma = resultado.findIndex((e) => e.motor === suya.motor && e.modelo === suya.modelo);
    if (misma >= 0) {
      // Es su ficha la tocada — u esta es la pieza que la mente declaró, gana
      const deLaCasa = resultado[misma];
      resultado[misma] = {
        ...deLaCasa,
        ...suya,
        parametro: suya.parametro !== undefined ? suya.parametro : deLaCasa.parametro,
        de: "mente",
        valores: { ...deLaCasa.valores, ...suya.valores },
      };
    } else {
      resultado.push(suya);
    }
  }
  return resultado;
}

/**
 * RESUELVE el esfuerzo de un modelo (o la reserva "*" de su motor). El
 * modo que la tabla NO declara: null params y sabe false — que se dice,
 * no se disimula con un «medio» inventado.
 */
export function esfuerzoDe(
  tabla: EntradaEsfuerzo[],
  motor: string,
  modelo: string,
  modo: Modo = "normal",
): EsfuerzoResuelto {
  const delModelo = tabla.find((e) => e.motor === motor && e.modelo === modelo);
  const entrada = delModelo ?? tabla.find((e) => e.motor === motor && e.modelo === "*");
  if (!entrada) {
    return { motor, modelo, modo, sabe: false, parametro: null, valor: null, params: null, de: "tabla" };
  }
  if (entrada.parametro == null || !(modo in entrada.valores)) {
    return {
      motor,
      modelo,
      modo,
      sabe: false,
      parametro: entrada.parametro ?? null,
      valor: modo in entrada.valores ? (entrada.valores[modo] as unknown) : null,
      params: null,
      de: entrada.de ?? "tabla",
    };
  }
  const valor = entrada.valores[modo];
  if (modo === "normal" && valor === null) {
    // «normal» es no decir nada de esfuerzo: el punto de fábrica del motor
    return { motor, modelo, modo, sabe: true, parametro: entrada.parametro ?? null, valor, params: null, de: entrada.de ?? "tabla" };
  }
  return {
    motor,
    modelo,
    modo,
    sabe: true,
    parametro: entrada.parametro ?? null,
    valor,
    params: valor === null ? null : { [entrada.parametro as string]: valor },
    de: entrada.de ?? "tabla",
  };
}

/** Los modos que un modelo SABE (y con qué pieza de la tabla los sabe). */
export function modosDe(tabla: EntradaEsfuerzo[], motor: string, modelo: string): { modos: Modo[]; de: "tabla" | "mente" } {
  const delModelo = tabla.find((e) => e.motor === motor && e.modelo === modelo);
  const entrada = delModelo ?? tabla.find((e) => e.motor === motor && e.modelo === "*");
  if (!entrada) return { modos: [], de: "tabla" };
  const modos = MODOS.filter((m) => m in entrada.valores && entrada.parametro != null);
  return { modos, de: entrada.de ?? "tabla" };
}
