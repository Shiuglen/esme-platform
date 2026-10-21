/**
 * prueba0:rea — la mente con ojos, medida de punta a punta.
 *   npm run prueba0:rea -- <programa> [--pregunta "…"] [--json]
 *
 * Qué mide. La promesa de la puerta `proc:spawn` es que la mente puede mirar
 * dentro de un programa. La promesa de la casa es que NADA entra sin número.
 * Aquí se mide el número entero:
 *
 *   1. REA mira un programa (por la puerta, con el libro de los programas) y
 *      el kit convierte lo que vio en hechos (decenas de filas, no miles);
 *   2. la mente REAL se copia (la de verdad queda intacta), se le da lo que
 *      vio —como un fichero, y la mente lo trocea y lo embebe—;
 *   3. se le pregunta a la mente de verdad qué vio;
 *   4. el veredicto: ¿contestó lo que vio, o no?
 *
 * Por qué la copia. La mente de la persona no se toca jamás en una medición:
 * se copia su hogar, se trabaja sobre la copia y se borra. Lo que se mide
 * aquí es el RECUERDO de lo aprendido, no la calidad de la evidencia (esa se
 * mide en tests/rea-real.test.ts).
 *
 * Referencia: docs/REA.md, docs/PRUEBA-0.md, core/bench/cerebro.ts.
 */
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ChildProcess } from "node:child_process";
import { leeEvidenciaReaJson } from "../core/rea/forma.ts";
import { oroDeEvidencia } from "../core/rea/banco.ts";
import { conocimientoDe } from "../core/rea/conocimiento.ts";
import type { EvidenciaRea } from "../core/rea/evidencia.ts";
import { programasDeLaCasa } from "../core/modulos/programas.ts";
import { ejecutaPrograma } from "../core/extension-host/proc.ts";
import {
  arrancaCerebro,
  ingiereEnCerebro,
  preguntaAlCerebro,
  pythonDelCerebro,
} from "../core/bench/cerebro.ts";
import { oroEnContexto } from "../core/bench/banco.ts";

/** Los ficheros que hacen falta para que la mente recuerde (sin el candado). */
const FICHEROS = ["mem.db", "mem.vectors.npy", "config.json", "pesos.npz", "thalamus.npy"];

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
};
const tiene = (flag: string): boolean => process.argv.includes(flag);

/** El hogar de la mente: el mismo que usa la app. */
const home = process.env.DAIMON_HOME ?? join(homedir(), "Daimon", "data", "mente_v2");

/** La evidencia de REA, POR LA PUERTA (el libro decide). */
async function evidenciaDe(app: string): Promise<string> {
  const permitidos = programasDeLaCasa();
  if (!permitidos.some((p) => p.nombre === "rea")) {
    console.error("✗ REA no está en el libro de los programas (la puerta está cerrada)");
    console.error('  npm run programas -- concede rea --desc "el motor de ingeniería inversa"');
    process.exit(1);
  }
  const r = await ejecutaPrograma(
    { programa: "rea", args: ["analyze", app, "--format", "json"], timeoutMs: 900_000 },
    { permitidos, maxBytesPorDefecto: 512 * 1_048_576 }
  );
  if (r.timeout) {
    console.error("✗ el análisis tardó demasiado y lo mataron");
    process.exit(1);
  }
  if (r.truncado) {
    console.error("✗ la evidencia llegó cortada (el tope de bytes de la puerta)");
    process.exit(1);
  }
  return r.stdout;
}

const app = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
if (!app) {
  console.error("uso: prueba0:rea -- <programa> [--pregunta \"…\"] [--json]");
  console.error("");
  console.error("  (lo que se mide: si la mente, después de mirar un programa,");
  console.error("   recuerda lo que vio)");
  process.exit(2);
}
if (!existsSync(app)) {
  console.error(`no existe ${app}`);
  process.exit(1);
}
if (!existsSync(join(home, "mem.db"))) {
  console.error(`no encuentro la mente en ${home} (DAIMON_HOME o ~/Daimon/data/mente_v2)`);
  process.exit(1);
}

const trabajo = mkdtempSync(join(tmpdir(), "prueba0-rea-"));
let cerebro: { url: string; token: string; proceso: ChildProcess } | null = null;

try {
  // 1. lo que REA vio (por la puerta) y lo que el kit entendió de ello
  console.log(`programa  : ${app}`);
  const lectura = leeEvidenciaReaJson(await evidenciaDe(app));
  if (!lectura.ok) {
    console.error(`✗ la evidencia no encaja: ${lectura.errores.slice(0, 5).join("; ")}`);
    process.exit(1);
  }
  const { pregunta, oro } = oroDeEvidencia(lectura.evidencia);
  const loQueVio = lectura.evidencia;

  // 2. el informe: lo que la mente va a aprender (un fichero, como el espejo)
  const informe = join(trabajo, "informe.md");
  writeFileSync(
    informe,
    `# Lo que REA vio de ${loQueVio.subject.name}\n\n${textoDelInforme(loQueVio)}`,
    "utf8"
  );
  console.log(`visto     : ${loQueVio.nodes.length} nodos → ${oro.length} caracteres de oro`);

  // 3. la copia de la mente (la de verdad, intacta) y el cerebro sobre ella
  for (const f of FICHEROS) {
    const origen = join(home, f);
    if (existsSync(origen)) copyFileSync(origen, join(trabajo, f));
  }
  cerebro = await arrancaCerebro(trabajo, pythonDelCerebro());

  // 4. la mente aprende (de verdad: trocea, embebe y guarda)
  const ingesta = await ingiereEnCerebro(cerebro.url, cerebro.token, [informe]);
  console.log(`aprendido : ${ingesta.added} recuerdo(s) (la mente ahora tiene ${ingesta.memories})`);

  // 5. la pregunta
  const consulta = arg("--pregunta") ?? pregunta;
  const t0 = Date.now();
  const r = await preguntaAlCerebro(cerebro.url, cerebro.token, consulta);
  const acierto = oroEnContexto(oro, r.context);
  const ms = Date.now() - t0;

  if (tiene("--json")) {
    console.log(
      JSON.stringify(
        {
          app,
          pregunta: consulta,
          acierto,
          tokens: r.tokens,
          ms,
          contexto: r.context,
        },
        null,
        2
      )
    );
  } else {
    console.log("");
    console.log(`pregunta  : ${consulta}`);
    console.log(`respuesta : ${r.context.slice(0, 400).replace(/\n+/g, " ")}`);
    console.log("");
    console.log(
      acierto
        ? `✓ la mente recuerda lo que vio (${r.tokens} tokens, ${ms} ms)`
        : `✗ la mente NO recuerda lo que vio (${r.tokens} tokens, ${ms} ms)`
    );
  }
  process.exitCode = acierto ? 0 : 1;
} catch (e) {
  console.error(`✗ ${(e as Error)?.message ?? e}`);
  process.exitCode = 1;
} finally {
  if (cerebro) cerebro.proceso.kill();
  rmSync(trabajo, { recursive: true, force: true });
}

/** El informe: los hechos del kit, en texto (lo que la mente va a leer). */
function textoDelInforme(ev: EvidenciaRea): string {
  return conocimientoDe(ev)
    .hechos.map((h) => h.texto)
    .join("\n");
}
