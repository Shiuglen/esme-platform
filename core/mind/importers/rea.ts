// Importador de REA: un programa entero se convierte en conocimiento de la mente.
//
// Igual que los demás importadores, éste entrega la misma forma (trozos con su
// texto, su fuente y su presupuesto) y cumple la misma promesa: la exclusión y
// la redacción ocurren ANTES de que exista el trozo.
//
// Lo que cambia es la fuente: aquí el conocimiento no viene de un fichero de
// texto, viene de la Evidencia que REA produjo de un programa. Por eso este
// importador NO ejecuta nada: lee un JSON ya exportado. Ejecutar REA es otra
// historia (la puerta `proc:spawn`), y va por separado.
//
// Referencia: core/rea/evidencia.ts, core/rea/conocimiento.ts, docs/REA.md.
import { readFileSync } from "node:fs";
import { excluido, EXCLUSION_MINIMA } from "../redaction.ts";
import { redacta } from "../redaction.ts";
import type { Trozo } from "../troceo.ts";
import { leeEvidenciaReaJson } from "../../rea/evidencia.ts";
import { absorbeEvidencia } from "../../rea/absorbe.ts";

export interface OpcionesImportaRea {
  vaultNombre?: string;
  exclusiones?: string[]; // se SUMAN a la mínima (nunca la sustituyen)
  maxTrozos?: number;
  budgetTokens?: number;
}

export interface RecuerdosImportadosRea {
  vault: string;
  ficheros: string[];
  excluidos: string[];
  trozos: Trozo[];
  secretosRedactados: number;
  /** Cuántos hechos se construyeron (0 si la evidencia no se pudo leer). */
  hechos: number;
  /** Cuántos quedaron fuera por presupuesto. */
  fuera: number;
  /** Los errores, si los hubo. Vacío = se leyó bien. */
  errores: string[];
}

/**
 * Absorbe una Evidencia de REA (un JSON) en filas de mente.
 *
 * Si el JSON no es una Evidencia válida, lo dice: una importación que se
 * equivoca de fichero en silencio es peor que ninguna.
 */
export function importaRea(ruta: string, opts: OpcionesImportaRea = {}): RecuerdosImportadosRea {
  const vaultNombre = opts.vaultNombre ?? "rea";
  const exclusiones = [...EXCLUSION_MINIMA, ...(opts.exclusiones ?? [])];
  const base: RecuerdosImportadosRea = {
    vault: vaultNombre,
    ficheros: [],
    excluidos: [],
    trozos: [],
    secretosRedactados: 0,
    hechos: 0,
    fuera: 0,
    errores: [],
  };

  if (excluido(ruta, exclusiones)) {
    return { ...base, excluidos: [ruta] };
  }

  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch (e) {
    return { ...base, errores: [`no se puede leer ${ruta}: ${String((e as Error)?.message || e)}`] };
  }

  const lectura = leeEvidenciaReaJson(texto);
  if (!lectura.ok) return { ...base, ficheros: [ruta], errores: lectura.errores };

  const absorcion = absorbeEvidencia(lectura.evidencia, {
    vaultNombre,
    maxTrozos: opts.maxTrozos,
    budgetTokens: opts.budgetTokens,
  });

  // La redacción final: aunque `absorbe` ya la hace, aquí se repite el
  // juramento. Una fila que sale de aquí no lleva un secreto dentro.
  let secretos = absorcion.secretosRedactados;
  const trozos = absorcion.trozos.map((t) => {
    const { texto: limpio, hallazgos } = redacta(t.texto);
    secretos += hallazgos.length;
    return { ...t, texto: limpio };
  });

  return {
    vault: vaultNombre,
    ficheros: [ruta],
    excluidos: [],
    trozos,
    secretosRedactados: secretos,
    hechos: absorcion.hechos,
    fuera: absorcion.fuera,
    errores: [],
  };
}
