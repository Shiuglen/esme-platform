/**
 * rea — la herramienta del kit que habla con REA.
 *   npm run rea -- catalogo
 *   npm run rea -- analiza <ruta> [--salida evidencia.json]
 *
 * Qué es esto. REA es el motor de ingeniería inversa que el kit usa como
 * sensor: mira dentro de un programa y devuelve una Evidencia (qué vio y qué
 * NO vio). Esta herramienta habla con él **por la puerta**, no por la consola:
 * el mismo camino que un módulo tomaría.
 *
 * Por qué por la puerta. La puerta `proc:spawn` sólo lanza lo que la persona
 * puso en el libro de los programas (`npm run programas -- concede rea`).
 * Si REA no está en el libro, esta herramienta lo dice y para: no hay atajos
 * que esquiven la decisión de la persona, ni siquiera desde la terminal del
 * propio kit.
 *
 * Referencia: docs/REA.md, core/extension-host/proc.ts, core/rea/forma.ts.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { ProgramasPermitidos, rutaProgramasDe } from "../core/modulos/programas.ts";
import { ejecutaPrograma } from "../core/extension-host/proc.ts";
import { leeCatalogoRea, leeEvidenciaReaJson } from "../core/rea/forma.ts";
import { capacidadesExigidas, operacionPermitida, resumenCatalogo } from "../core/rea/capacidades.ts";

const dirCasa = process.env.ESME_CASA ?? join(homedir(), ".esme");
const rutaLibro = process.env.ESME_PROGRAMAS ?? join(dirCasa, "programas.json");

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
};

/** El libro de la casa: lo que la persona ha dicho que se puede lanzar. */
const permitidos = new ProgramasPermitidos(rutaLibro).lista();

/** Lanza REA por la puerta (o explica por qué no se puede). */
async function lanzaRea(args: string[], cwd?: string): Promise<string> {
  const r = await ejecutaPrograma(
    { programa: "rea", args },
    { permitidos, proyecto: cwd ?? null, timeoutPorDefecto: 900_000, maxBytesPorDefecto: 512 * 1_048_576 }
  );
  if (r.timeout) throw new Error("REA tardó demasiado y lo mataron (¿una app de 100 MB?)");
  if (r.codigo !== 0) throw new Error(`REA salió con código ${r.codigo}: ${r.stderr.slice(0, 300)}`);
  return r.stdout;
}

/** Lo que hace falta para que REA esté en la puerta. */
function sinPermiso(): never {
  console.error("✗ REA no está en el libro de los programas (la puerta está cerrada)");
  console.error("");
  console.error('  npm run programas -- concede rea --desc "el motor de ingeniería inversa"');
  console.error("");
  console.error(`  libro: ${rutaLibro}`);
  process.exit(1);
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [verbo, ...resto] = process.argv.slice(2);
  if (!permitidos.some((p) => p.nombre === "rea")) sinPermiso();

  switch (verbo) {
    case "catalogo": {
      const salida = await lanzaRea(["capabilities", "--format", "json"]);
      const lectura = leeCatalogoRea(JSON.parse(salida));
      if (!lectura.ok) {
        console.error("✗ el catálogo de REA no encaja en la forma del kit:");
        for (const e of lectura.errores) console.error(`  · ${e}`);
        process.exit(1);
      }
      const cat = lectura.catalogo;
      console.log(`REA ${cat.operaciones.length} operaciones · ${cat.operaciones.filter((o) => o.disponible).length} disponibles`);
      console.log(`  ${resumenCatalogo(cat)}`);
      const desconocidos = new Set(cat.operaciones.flatMap((o) => o.efectos_desconocidos));
      if (desconocidos.size) {
        console.log(`  efectos que el kit no conoce: ${[...desconocidos].join(", ")}`);
      }
      console.log("");
      console.log("  operación                          efectos                          necesita");
      for (const o of cat.operaciones.filter((x) => x.disponible).slice(0, 40)) {
        const req = capacidadesExigidas(cat, o.operacion);
        const cap = req.ok ? req.capacidades.join(", ") || "nada" : "?";
        console.log(
          `  ${o.operacion.padEnd(34)} ${(o.efectos.join(", ") || "-").padEnd(32)} ${cap}`
        );
      }
      break;
    }

    case "analiza": {
      const ruta = resto[0];
      if (!ruta) {
        console.error("uso: rea analiza <ruta> [--salida evidencia.json]");
        process.exit(2);
      }
      const destino = arg("--salida") ?? "evidencia.json";
      console.log(`analizando ${ruta} (esto tarda: una app de 100 MB son minutos)…`);
      const salida = await lanzaRea(["analyze", ruta, "--format", "json"], dirname(ruta));
      const lectura = leeEvidenciaReaJson(salida);
      if (!lectura.ok) {
        console.error("✗ REA no devolvió una evidencia que encaje:");
        for (const e of lectura.errores.slice(0, 10)) console.error(`  · ${e}`);
        process.exit(1);
      }
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, salida, "utf8");
      const ev = lectura.evidencia;
      console.log(`✓ evidencia de «${ev.subject.name}»`);
      console.log(`  nodos: ${ev.nodes.length} · relaciones: ${ev.relations.length} · desconocidos: ${ev.unknowns.length}`);
      console.log(`  limitaciones declaradas: ${ev.limitations.length}`);
      console.log(`  escrita en: ${destino}`);
      console.log("");
      console.log("  para absorberla en la mente:");
      console.log(`    npm run mind -- absorber ${destino} absorbido.json`);
      break;
    }

    default:
      console.log("hablar con REA, por la puerta");
      console.log("");
      console.log("  catalogo                          qué sabe hacer REA aquí, y qué cuesta");
      console.log("  analiza <ruta> [--salida f.json]  lo mira dentro y escribe la evidencia");
      console.log("");
      console.log(`  libro de los programas: ${rutaLibro}`);
  }
}
