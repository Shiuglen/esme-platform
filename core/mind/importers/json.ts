// Importador de JSON: un volcado de recuerdos de otra herramienta.
//
// Acepta un array de registros ({id?, texto|text, fuente|source, tipo|type})
// o un objeto {recuerdos: [...]}. Cada texto pasa por la redacción ANTES de
// trocearse, y lo que se exclude no se lee: la exclusión y la redacción son
// del pipeline, no del importador.
import { readFileSync } from "node:fs";
import { trocea, type Trozo } from "../troceo.ts";
import { redacta, excluido, EXCLUSION_MINIMA } from "../redaction.ts";

export interface OpcionesImportaJson {
  vaultNombre?: string;
  exclusiones?: string[]; // se SUMAN a la mínima (nunca la sustituyen)
}

export interface RecuerdosImportadosJson {
  vault: string;
  ficheros: string[];
  excluidos: string[];
  trozos: Trozo[];
  secretosRedactados: number;
}

interface RegistroCrudo {
  id?: unknown;
  texto?: unknown;
  text?: unknown;
  fuente?: unknown;
  source?: unknown;
  tipo?: unknown;
  type?: unknown;
}

const textoDe = (r: RegistroCrudo): string => {
  const v = r.texto ?? r.text;
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
};

const fuenteDe = (r: RegistroCrudo, porDefecto: string): string => {
  const v = r.fuente ?? r.source;
  return typeof v === "string" && v.trim() ? v : porDefecto;
};

export function importaJson(
  ruta: string,
  opts: OpcionesImportaJson = {}
): RecuerdosImportadosJson {
  const vaultNombre = opts.vaultNombre ?? "json";
  const exclusiones = [...EXCLUSION_MINIMA, ...(opts.exclusiones ?? [])];
  const trozos: Trozo[] = [];
  const excluidos: string[] = [];
  let secretos = 0;

  const crudo = JSON.parse(readFileSync(ruta, "utf8")) as unknown;
  const registros: RegistroCrudo[] = Array.isArray(crudo)
    ? (crudo as RegistroCrudo[])
    : Array.isArray((crudo as { recuerdos?: unknown })?.recuerdos)
      ? ((crudo as { recuerdos: RegistroCrudo[] }).recuerdos)
      : [];

  for (const r of registros) {
    if (!r || typeof r !== "object") continue;
    const fuente = fuenteDe(r, `${vaultNombre}/registro`);
    if (excluido(fuente, exclusiones)) {
      excluidos.push(fuente);
      continue;
    }
    const { texto: limpio, hallazgos } = redacta(textoDe(r));
    secretos += hallazgos.length;
    if (!limpio.trim()) continue;
    trozos.push(...trocea(fuente, limpio));
  }

  return {
    vault: vaultNombre,
    ficheros: [ruta],
    excluidos,
    trozos,
    secretosRedactados: secretos,
  };
}
