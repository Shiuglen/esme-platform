/**
 * doctor — cómo está esta máquina, en un vistazo.
 *   npm run doctor [-- --json]
 *
 * Los módulos (y qué versión tienen), los permisos que están PIDIENDO PALABRA,
 * si la tienda verifica, y cuánto consume cada proceso. Con un veredicto al
 * final: la casa está en pie, o tiene cosas que mirar.
 *
 * Referencia: core/modulos/doctor.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { doctorDeLaCasa, renderDoctor, raizDeConfianza } from "../core/modulos/doctor.ts";
import { puntos } from "../core/motores/puntos.ts";
import { instaladosEn } from "../tienda/modulos.ts";
import { planDeActualizacion } from "../core/modulos/actualiza.ts";
import { Consentimientos } from "../core/modulos/consentimiento.ts";
import { ProgramasPermitidos, rutaProgramasDe } from "../core/modulos/programas.ts";

const raizKit = resolve(import.meta.dirname, "..");
const dirModulos = process.env.ESME_MODULOS ?? join(process.env.HOME ?? "/root", ".esme", "modulos");
const tiene = (flag: string): boolean => process.argv.includes(flag);

// lo que hay instalado
const instalados = instaladosEn(dirModulos).map((m) => ({
  id: m.id,
  version: m.version,
  dir: m.dir,
}));

// los permisos pendientes (lo que PIDE PALABRA)
const pendientes: Record<string, string[]> = {};
try {
  const libro = new Consentimientos(join(dirModulos, "consentimientos.json"));
  for (const m of instalados) {
    const estado = libro.estado(m.id, []);
    if (estado.pendientes.length) pendientes[m.id] = estado.pendientes;
  }
} catch {
  // sin libro, no hay pendientes que mirar
}

// la tienda: qué versiones hay
let tienda: Array<{ id: string; version: string }> = [];
const rutaIndice = join(raizKit, "tienda", "index.json");
if (existsSync(rutaIndice)) {
  try {
    const indice = JSON.parse(readFileSync(rutaIndice, "utf8")) as {
      modulos?: Array<{ id: string; version: string }>;
    };
    tienda = indice.modulos ?? [];
  } catch {
    // un índice roto: la tienda no verifica (el doctor lo dirá)
  }
}

// la memoria: los procesos que más consumen
const memoria = puntos({ todos: true })
  .slice(0, 5)
  .map((p) => ({ proceso: p.proceso, pid: p.pid, mb: p.memoria_mb, pasado: p.pasado }));

// los programas que esta casa permite lanzar (la puerta de los programas):
// el libro va junto al de los permisos
const programas = new ProgramasPermitidos(
  rutaProgramasDe(join(dirModulos, "consentimientos.json"))
).lista();

const estado = doctorDeLaCasa({
  instalados,
  pendientes,
  tienda,
  rutaIndice,
  pubRaiz: raizDeConfianza(raizKit),
  rutaLedger: join(raizKit, "tienda", "rotaciones.json"),
  memoria,
  programas: programas.map((p) => ({ nombre: p.nombre, descripcion: p.descripcion })),
});

if (tiene("--json")) console.log(JSON.stringify(estado, null, 2));
else console.log(renderDoctor(estado));
process.exit(estado.enPie ? 0 : 1);
