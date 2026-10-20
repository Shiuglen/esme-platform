import { candidatosBase, casosBase, candidatosCon, casosCon } from "../core/bench/examen-real.ts";
import { conScoreDeCaso } from "../core/bench/examen.ts";
import { armaRecuperador } from "../core/bench/recuperador.ts";

const args = process.argv.slice(2);
const mundo = args[0] === "con" ? "con" : "base";
const cands = mundo === "con" ? candidatosCon() : candidatosBase();
const casos = mundo === "con" ? casosCon() : casosBase();

for (const c of casos.slice(0, 6)) {
  const scored = conScoreDeCaso(cands, c).sort((a, b) => b.score - a.score);
  const ids = armaRecuperador(scored)(c.pregunta, 2, 60);
  console.log(`\n${c.id} "${c.pregunta.slice(0, 40)}"`);
  console.log("  oro:", c.oro, "| devueltos:", ids);
  scored.slice(0, 3).forEach(s => console.log(`   score ${s.score.toFixed(2)} ${s.tokens}tok ${s.id} :: ${s.texto.slice(0, 46)}`));
}
