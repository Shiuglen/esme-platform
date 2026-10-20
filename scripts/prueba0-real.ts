/**
 * prueba0-real — la Prueba 0 de verdad: el cerebro real, con sus memorias
 * reales y sus embeddings reales.
 *
 *   npm run prueba0:real [-- --casos 20]
 *
 * Cómo:
 *   1. se COPIA el hogar de la mente (memorias + vectores) a un directorio
 *      de trabajo: la mente viva sigue siendo la de siempre, con su candado;
 *      aquí se abre una copia, solo para medir;
 *   2. se arranca un cerebro sobre esa copia (puerto libre, token propio) y
 *      se le pregunta cada caso del banco por su pregunta;
 *   3. se mira si el oro está en lo que respondió: ese es el recall REAL
 *      (con la Lente de verdad, no con el proxy léxico del kit);
 *   4. la copia se borra y el cerebro se para.
 *
 * Lo que no hace: no toca la mente del usuario (ni sus recuerdos ni su
 * candado) y no manda nada a ninguna nube.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { oroEnContexto, validaBanco, resumeReal, type BancoReal } from "../core/bench/banco.ts";
import {
  arrancaCerebro,
  hogarDeLaMente,
  preguntaAlCerebro,
  pythonDelCerebro,
} from "../core/bench/cerebro.ts";

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

/** Los ficheros que hacen falta para que la mente recuerde (sin el candado). */
const FICHEROS = ["mem.db", "mem.vectors.npy", "config.json", "pesos.npz", "thalamus.npy"];

interface RecuerdoReal {
  id: string;
  pregunta: string;
  oro: string;
  acierto: boolean;
  tokens: number;
  ms: number;
}

// ——— la carrera ———
const home = hogarDeLaMente();
const bancoRuta = arg("--banco") ?? join(homedir(), ".esme", "prueba0-banco.json");

if (!existsSync(bancoRuta)) {
  console.error(`no hay banco en ${bancoRuta} (primero: npm run banco -- --construir)`);
  process.exit(1);
}
if (!existsSync(join(home, "mem.db"))) {
  console.error(`no encuentro la mente en ${home} (DAIMON_HOME o ~/Daimon/data/mente_v2)`);
  process.exit(1);
}

const banco = JSON.parse(readFileSync(bancoRuta, "utf8")) as BancoReal;
const v = validaBanco(banco);
if (!v.ok) {
  console.error(`el banco no vale: ${v.errores.join("; ")}`);
  process.exit(1);
}
const casos = banco.casos.filter((c) => c.validado && c.oro.trim());
if (!casos.length) {
  console.error("el banco no tiene casos validados (el oro lo elige el humano: --validar)");
  process.exit(1);
}

const trabajo = mkdtempSync(join(tmpdir(), "prueba0-real-"));
const python = pythonDelCerebro();
let cerebro: { url: string; token: string; proceso: ChildProcess } | null = null;

try {
  // 1. la copia de la mente (la de verdad, intacta)
  for (const f of FICHEROS) {
    const origen = join(home, f);
    if (existsSync(origen)) copyFileSync(origen, join(trabajo, f));
  }

  // 2. el cerebro de verdad sobre la copia
  console.log(`mente     : ${home} (copia de trabajo)`);
  cerebro = await arrancaCerebro(trabajo, python);
  console.log(`cerebro   : ${cerebro.url} (arrancado)`);

  // 3. la carrera
  const recuerdos: RecuerdoReal[] = [];
  for (const c of casos) {
    const t0 = Date.now();
    try {
      const r = await preguntaAlCerebro(cerebro.url, cerebro.token, c.pregunta);
      recuerdos.push({
        id: c.id,
        pregunta: c.pregunta,
        oro: c.oro,
        acierto: oroEnContexto(c.oro, r.context),
        tokens: r.tokens,
        ms: Date.now() - t0,
      });
    } catch (e) {
      console.error(`  ${c.id}: la mente no respondió (${(e as Error).message})`);
    }
  }

  // 4. el veredicto
  const aciertos = recuerdos.filter((r) => r.acierto).length;
  const tokens = recuerdos.length ? recuerdos.reduce((a, r) => a + r.tokens, 0) / recuerdos.length : 0;
  const ms = recuerdos.length ? recuerdos.reduce((a, r) => a + r.ms, 0) / recuerdos.length : 0;
  console.log("");
  const resumen = resumeReal(
    banco,
    new Map(recuerdos.map((r) => [r.id, { acierto: r.acierto, tokens: r.tokens }]))
  );
  console.log(`casos     : ${recuerdos.length} preguntados a la mente de verdad`);
  const control = recuerdos.find((r) => r.id === "control");
  console.log(
    `saber     : ${resumen.saber.aciertos}/${resumen.saber.casos} — ¿la mente encuentra el conocimiento?` +
      (control ? ` (control: ${control.acierto ? "✓ el aparato mide bien" : "✗ el aparato NO mide bien"})` : "")
  );
  console.log(
    `sesión    : ${resumen.sesion.aciertos}/${resumen.sesion.casos} — ¿la mente recuerda dónde lo dejamos?`
  );
  console.log(`contexto  : ${tokens.toFixed(0)} tokens de media · ${ms.toFixed(0)} ms de media`);
  if (aciertos < recuerdos.length) {
    console.log("");
    console.log("faltan:");
    for (const r of recuerdos.filter((x) => !x.acierto))
      console.log(`  ${r.id} ${r.pregunta.slice(0, 70)}`);
  }
} finally {
  cerebro?.proceso.kill();
  rmSync(trabajo, { recursive: true, force: true });
}
