/**
 * LA ABSORCIÓN DE REA — la evidencia entra en la mente.
 *
 * Qué hace. Toma la Evidencia de REA (verificada), la convierte en hechos
 * (core/rea/conocimiento.ts) y los deja como filas que la Lente puede buscar:
 * las mismas filas que produce un importador de texto, con la misma promesa de
 * nunca dejar un secreto dentro.
 *
 * El pipeline es el de siempre y no se negocia: EXCLUIR → REDACTAR → TROCEAR.
 * Lo que cambia es de dónde viene el conocimiento: aquí viene de un programa,
 * no de un fichero de texto.
 *
 * El presupuesto también es el de siempre, pero CONTEADO: si los hechos no
 * caben, se dice cuántos quedaron fuera y se deja una fila que lo recuerda. Un
 * recorte silencioso es una mentira con forma de dato.
 *
 * Referencia: docs/REA.md, core/mind/importers/rea.ts.
 */
import { redacta } from "../mind/redaction.ts";
import type { Trozo } from "../mind/troceo.ts";
import type { EvidenciaRea } from "./evidencia.ts";
import { conocimientoDe, type HechoRea, type TipoHechoRea } from "./conocimiento.ts";

export interface OpcionesAbsorbeRea {
  /** Presupuesto de filas (hechos). Por defecto, generoso. */
  maxTrozos?: number;
  /** Presupuesto de tokens de las filas. Por defecto, generoso. */
  budgetTokens?: number;
  /** El nombre del almacén donde caen las filas. */
  vaultNombre?: string;
}

export interface AbsorcionRea {
  vault: string;
  ficheros: string[];
  excluidos: string[];
  trozos: Trozo[];
  secretosRedactados: number;
  /** Cuántos hechos se construyeron. */
  hechos: number;
  /** Cuántos quedaron fuera por presupuesto (0 si cabían todos). */
  fuera: number;
  /** La nota honesta que viaja con las filas. */
  nota: string;
}

/** La fila: un Trozo del kit más la clase de hecho (para filtrar después). */
export interface FilaRea extends Trozo {
  /** La clase del hecho (composicion, limite, endpoint…). */
  clase: TipoHechoRea;
  /** La clave estable del hecho. */
  clave: string;
}

const tokensDe = (texto: string): number => Math.ceil(texto.length / 4);

/**
 * Absorbe una evidencia de REA en filas de mente.
 *
 * @param ev La evidencia verificada.
 * @param opts El presupuesto.
 */
export function absorbeEvidencia(ev: EvidenciaRea, opts: OpcionesAbsorbeRea = {}): AbsorcionRea {
  const maxTrozos = Math.max(1, opts.maxTrozos ?? 400);
  const budgetTokens = Math.max(1, opts.budgetTokens ?? 20_000);
  const vault = opts.vaultNombre ?? "rea";

  const conocimiento = conocimientoDe(ev, maxTrozos);
  const filas: FilaRea[] = [];
  let secretos = 0;
  let tokens = 0;
  let cortadasPorTokens = 0;

  for (const hecho of conocimiento.hechos) {
    if (filas.length >= maxTrozos) break;
    const { texto: limpio, hallazgos } = redacta(hecho.texto);
    secretos += hallazgos.length;
    const t = tokensDe(limpio);
    if (tokens + t > budgetTokens) {
      cortadasPorTokens += 1;
      continue;
    }
    tokens += t;
    filas.push({
      id: `${vault}/${hecho.clave}`,
      fuente: `${vault}/${hecho.tipo}`,
      texto: limpio,
      tokens: t,
      tipo: "parrafo",
      clase: hecho.tipo,
      clave: hecho.clave,
    });
  }

  const fuera = conocimiento.fuera + cortadasPorTokens;
  const nota =
    `Absorción REA de «${ev.subject.name}»: ${filas.length} fila(s) de ${conocimiento.total} hecho(s) ` +
    `(${fuera} fuera por presupuesto, ${secretos} secreto(s) redactado(s)). ` +
    `Lo que el análisis no vio no se afirma: mira las filas de tipo «limite», «desconocido» y «cobertura».`;

  // La nota viaja con las filas: es el_recordatorio de que esto es un resumen.
  if (filas.length > 0) {
    const { texto: limpio, hallazgos } = redacta(nota);
    secretos += hallazgos.length;
    const t = tokensDe(limpio);
    filas.push({
      id: `${vault}/nota-de-absorcion`,
      fuente: `${vault}/nota`,
      texto: limpio,
      tokens: t,
      tipo: "parrafo",
      clase: "sujeto",
      clave: "nota-de-absorcion",
    });
  }

  return {
    vault,
    ficheros: [],
    excluidos: [],
    trozos: filas,
    secretosRedactados: secretos,
    hechos: conocimiento.total,
    fuera,
    nota,
  };
}

/** Los hechos tal cual, sin pasar por las filas (para quien quiere el dato). */
export function hechosDe(ev: EvidenciaRea, maxHechos = 400): HechoRea[] {
  return conocimientoDe(ev, maxHechos).hechos;
}
