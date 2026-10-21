/**
 * talamo — el contexto, en tres modos, y el ahorro MEDIDO.
 *   npm run talamo -- [--pregunta "..."] [--json]
 *
 * La pregunta de todos los días: «¿cuánto me cuesta esta pregunta?». Y la
 * otra: «¿cuánto me AHORRA el modo ahorrador?».
 *
 * Aquí se responde con números, sobre el examen de la casa (el documento con
 * la tabla y las preguntas): los tres modos, los tokens de cada uno y el
 * ahorro real. No hay porcentajes escritos a mano: se miden.
 *
 * Referencia: core/talamus/modos.ts, estandar/contexto.spec.yaml.
 */
import { comparaModos, MODOS, type ModoContexto } from "../core/talamus/modos.ts";
import { conScoreDeCaso, type Candidato } from "../core/bench/examen.ts";
import { PREGUNTAS, DOC } from "../core/bench/examen-real.ts";
import { trocea } from "../core/mind/troceo.ts";
import type { Recuerdo } from "../core/talamus/context-packager.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  // los candidatos: el documento del examen troceado (los mismos trozos que
  // ve el juez)
  const trozos = trocea("doc", DOC);
  const candidatos: Recuerdo[] = trozos.map((t) => ({
    id: t.id,
    texto: t.texto,
    tokens: t.tokens,
    score: 0, // el score real se pone por caso (depende de la pregunta)
  }));

  const pregunta = arg("--pregunta") ?? PREGUNTAS[0].pregunta;
  const caso = { id: "q", pregunta, oro: [] as string[] };
  const conScore = conScoreDeCaso(candidatos as Candidato[], caso) as Recuerdo[];

  const r = comparaModos(pregunta, conScore);

  if (tiene("--json")) {
    console.log(
      JSON.stringify(
        {
          pregunta,
          estandar: { tokens: r.estandar.tokens_gastados, n: r.estandar.seleccionados.length },
          ahorrador: { tokens: r.ahorrador.tokens_gastados, n: r.ahorrador.seleccionados.length },
          equipo: { tokens: r.equipo.tokens_gastados, n: r.equipo.seleccionados.length },
          ahorro_pct: r.ahorro_pct,
          tokens_ahorrados: r.tokens_ahorrados,
        },
        null,
        2
      )
    );
  } else {
    console.log(`pregunta : ${pregunta}`);
    console.log("");
    for (const modo of ["estandar", "ahorrador", "equipo"] as ModoContexto[]) {
      const p = modo === "estandar" ? r.estandar : modo === "ahorrador" ? r.ahorrador : r.equipo;
      const regla = MODOS[modo];
      console.log(
        `  ${regla.nombre.padEnd(10)} ${String(p.tokens_gastados).padStart(5)} tokens · ` +
          `${p.seleccionados.length} recuerdos · presupuesto ${regla.budget}`
      );
    }
    console.log("");
    console.log(
      `ahorro   : ${r.ahorro_pct}% (${r.tokens_ahorrados} tokens) — el ahorrador frente al estándar`
    );
  }
  process.exit(0);
}
