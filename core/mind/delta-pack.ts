// delta-pack — dos estados de mente en disco, un delta de por medio.
// El flujo que hace la mente VIAJAR SIN RE-EMBEDDING:
//   escribeDelta  : base .mind + estado nuevo → fichero delta.json (sin tocar nada)
//   actualizaMind : base .mind + delta.json → .mind nuevo, verificado 3 veces
//                   (base del delta, resultado contra cognición, exclusión mínima)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { escribeMind, leeMind, cognicionDe, type RecuerdoPortatil } from "./mind-file.ts";
import { deltaDe, aplicaDelta, type DeltaMind } from "./delta.ts";

/** Serializa el delta entre una .mind en disco y el estado nuevo (en memoria). */
export function escribeDelta(
  baseMindRuta: string,
  nuevos: RecuerdoPortatil[],
  deltaRuta: string
): DeltaMind {
  const base = leeMind(baseMindRuta).recuerdos; // si la base no verifica, NADIE escribe
  if (!existsSync(join(baseMindRuta, "metadata.json")))
    throw new Error("la base no parece una .mind (falta metadata.json)");
  const d = deltaDe(base, nuevos);
  writeFileSync(deltaRuta, JSON.stringify(d, null, 2) + "\n");
  return d;
}

/** Punto a punto: aplica delta y produce una .mind NUEVA, nunca muta la base. */
export function actualizaMind(
  baseMindRuta: string,
  deltaRuta: string,
  destino: string
): { ruta: string | null; violaciones: string[] } {
  const meta = JSON.parse(
    readFileSync(join(baseMindRuta, "metadata.json"), "utf8")
  ) as Record<string, unknown>;
  const base = leeMind(baseMindRuta).recuerdos;
  if (!existsSync(deltaRuta)) return { ruta: null, violaciones: [`no existe el delta: ${deltaRuta}`] };
  const d = JSON.parse(readFileSync(deltaRuta, "utf8")) as DeltaMind;

  const { recuerdos, violaciones } = aplicaDelta(base, d);
  const cognicionResultado = cognicionDe(recuerdos);
  if (cognicionResultado !== d.actual_cognicion)
    violaciones.push("el resultado no cuadra con la cognición del delta");
  if (violaciones.length || !d.actual_cognicion)
    return { ruta: null, violaciones: violaciones.filter(Boolean) };

  const { ruta } = escribeMind(destino, {
    recuerdos,
    motor: String(meta.motor),
    recall: Number(meta.recall),
    vault: typeof meta.vault === "string" ? meta.vault : undefined,
  });
  return { ruta, violaciones: [] };
}
