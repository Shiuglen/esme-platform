// mind-file — la mente portable BIDIRECCIONAL.
// Exporta recuerdos a estructura .mind y los importa de vuelta verificando
// su hash de cognición. Garantías (estandar/mind-format.spec.yaml):
//   1. Exclusión y redacción ANTES de que exista el trozo (v1: por record).
//   2. La exclusión mínima es inviolable: se suma, no se sustituye.
//   3. cognition.sig: hash canónico del estado SEMÁNTICO (ids, textos
//      redactados y vectores, ordenados por id). Otra cuantización del mismo
//      estado cuenta como la misma cognición.
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { redacta, excluido, EXCLUSION_MINIMA } from "./redaction.ts";
import { validaMindDir } from "./portable-format.ts";
import { normalizaRumbo, rumboAPng, redactaRumbo, type Rumbo } from "./rumbo.ts";
import { canonical } from "../../tienda/firma.ts";
import { createHash } from "node:crypto";

export interface RecuerdoPortatil {
  id: string;
  texto: string;
  vector: number[];
  fuente?: string; // "obsidian/notas/idea.md#invariantes"
  tipo?: string;
}

export interface MenteAExportar {
  recuerdos: RecuerdoPortatil[];
  motor: string;
  recall: number;
  exclusionesExtra?: string[]; // se SUMAN a la mínima
  vault?: string;
  /**
   * El rumbo de la mente (para qué trabaja): OPCIONAL y de la mente, no de la
   * app. Si está, viaja con ella. Se normaliza y se redacta como cualquier
   * otro texto que sale del equipo.
   */
  rumbo?: unknown;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("base64");

/** El hash de cognición: SHA256 canónico del estado, ordenado por id. */
export function cognicionDe(recuerdos: RecuerdoPortatil[]): string {
  const lineas = [...recuerdos]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(
      (r) =>
        canonical({
          id: r.id,
          texto: r.texto,
          vector: r.vector,
          fuente: r.fuente ?? null,
          tipo: r.tipo ?? null,
        })
    );
  return sha256(lineas.join("\n"));
}

/** Exporta. Devuelve la ruta de la mente y cuántos se excluyeron/redactaron. */
export function escribeMind(
  rutaDestino: string,
  mente: MenteAExportar
): { ruta: string; excluidos: string[]; secretos: number; cognicion: string } {
  const exclusiones = [...EXCLUSION_MINIMA, ...(mente.exclusionesExtra ?? [])];
  const excluidos: string[] = [];
  let secretos = 0;

  const dentro = mente.recuerdos
    .filter((r) => {
      if (r.fuente && excluido(r.fuente, exclusiones)) {
        excluidos.push(r.fuente);
        return false;
      }
      return true;
    })
    .map((r) => {
      const red = redacta(r.texto);
      secretos += red.hallazgos.length;
      return { ...r, texto: red.texto };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const dir = resolve(rutaDestino);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "embeddings"), { recursive: true });
  mkdirSync(join(dir, "crs-delta"), { recursive: true });

  const lineas = dentro.map(
    (r) => canonical({ id: r.id, texto: r.texto, vector: r.vector, fuente: r.fuente ?? null, tipo: r.tipo ?? null })
  );
  const vectors = join(dir, "embeddings", "vectors.jsonl");
  writeFileSync(vectors, lineas.join("\n") + "\n");

  const cognicion = cognicionDe(dentro);
  writeFileSync(join(dir, "cognition.sig"), cognicion);
  writeFileSync(
    join(dir, "exclusion-list.json"),
    JSON.stringify(exclusiones, null, 2)
  );

  // El rumbo viaja con la mente: si la mente tiene un rumbo, el paquete lo
  // lleva (redactado y normalizado, con los mismos bytes que Python).
  if (mente.rumbo !== undefined && mente.rumbo !== null) {
    const rumbo = redactaRumbo(mente.rumbo, (n) => { secretos += n; });
    writeFileSync(join(dir, "rumbo.json"), rumboAPng(rumbo));
  }

  writeFileSync(
    join(dir, "metadata.json"),
    JSON.stringify(
      {
        schema_version: 1,
        created_at: new Date().toISOString(),
        motor: mente.motor,
        recall: mente.recall,
        counts: { recuerdos: dentro.length, excluidos: excluidos.length, secretos },
        vault: mente.vault ?? null,
      },
      null,
      2
    )
  );
  void dir;
  return { ruta: dir, excluidos, secretos, cognicion };
}

/** Importa. Falla con error si la estructura o la cognición NO verifican. */
export function leeMind(rutaMind: string): {
  recuerdos: RecuerdoPortatil[];
  exclusions: string[];
  /** El rumbo de la mente importada, o null si esta mente no lo tiene. */
  rumbo: Rumbo | null;
} {
  const dictamen = validaMindDir(rutaMind);
  if (!dictamen.ok) throw new Error(`.mind inválido: ${dictamen.errores.join("; ")}`);

  const lineas = readFileSync(join(rutaMind, "embeddings", "vectors.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean);
  const cognicion = cognicionDe(lineas.map((l) => JSON.parse(l) as RecuerdoPortatil));
  const sig = readFileSync(join(rutaMind, "cognition.sig"), "utf8");
  if (cognicion !== sig)
    throw new Error("cognición ALTERADA: el estado no coincide con cognition.sig");

  const recuerdos = lineas.map((l) => JSON.parse(l) as RecuerdoPortatil);
  const exclusions = JSON.parse(
    readFileSync(join(rutaMind, "exclusion-list.json"), "utf8")
  ) as string[];
  // el rumbo es opcional, pero si está, vale (ya lo ha comprobado el dictamen)
  const rutaRumbo = join(rutaMind, "rumbo.json");
  const rumbo = existsSync(rutaRumbo)
    ? normalizaRumbo(JSON.parse(readFileSync(rutaRumbo, "utf8")) as unknown)
    : null;
  return { recuerdos, exclusions, rumbo };
}
