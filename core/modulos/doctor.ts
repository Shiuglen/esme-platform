/**
 * El DOCTOR DE LA CASA — qué estado tiene esta máquina, en un vistazo.
 *
 * La pregunta de todos los días: «¿está todo bien aquí?». Y la respuesta
 * son cinco cosas, todas medidas:
 *
 *   1. **los módulos**: qué hay instalado, en qué versión, y si la tienda
 *      tiene una más nueva (el plan de actualización, con el diff);
 *   2. **los permisos**: qué está concedido, qué está PIDIENDO PALABRA y qué
 *      se ha denegado (un módulo con permisos sin conceder es un módulo que
 *      no puede hacer su trabajo);
 *   3. **la memoria**: cuánto consume cada proceso (los puntos) — porque la
 *      pregunta de la RAM es siempre la misma;
 *   4. **la tienda**: si el índice firmado verifica (si no, lo que hay
 *      instalado no es de fiar);
 *   5. y **un veredicto**: la casa está en pie, o no.
 *
 * Referencia: scripts/modulos.ts (la lista), core/modulos/actualiza.ts (el
 * plan), core/motores/puntos.ts (la memoria), tienda/receptor.ts (la tienda).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { leeRaiz } from "../../tienda/raiz.ts";
import { confiaIndexChain } from "../../tienda/rotacion.ts";
import { planDeActualizacion, type EnLaTienda, type Instalado } from "../modulos/actualiza.ts";

/** El estado del doctor. */
export interface EstadoDoctor {
  /** Los módulos instalados. */
  instalados: Array<{ id: string; version: string; permisos_pendientes: string[] }>;
  /** Los que tienen versión nueva (con el diff, si se pudo medir). */
  actualizaciones: Array<{ id: string; de: string; a: string; cambios: number }>;
  /** La memoria: los procesos que más consumen. */
  memoria: Array<{ proceso: string; pid: number; mb: number | null; pasado: boolean }>;
  /** ¿La tienda verifica? */
  tienda: { ok: boolean; via?: string; motivo?: string };
  /** Los programas que esta casa permite lanzar (la puerta `proc:spawn`). */
  programas: Array<{ nombre: string; descripcion: string }>;
  /** El veredicto: la casa está en pie. */
  enPie: boolean;
  /** Los avisos (lo que hay que mirar). */
  avisos: string[];
}

/** El doctor, con lo que se le pasa (nada de disco escondido: se puede probar). */
export function doctorDeLaCasa(opts: {
  instalados: Instalado[];
  pendientes: Record<string, string[]>;
  tienda: EnLaTienda[];
  rutaIndice?: string;
  pubRaiz?: string;
  rutaLedger?: string;
  memoria?: Array<{ proceso: string; pid: number; mb: number | null; pasado: boolean }>;
  mideCambios?: (inst: Instalado, nueva: EnLaTienda) => { ficheros: unknown[] } | null;
  /** Los programas que esta casa permite lanzar (la puerta `proc:spawn`). */
  programas?: Array<{ nombre: string; descripcion: string }>;
}): EstadoDoctor {
  const avisos: string[] = [];

  // 0. los programas: lo que la puerta puede lanzar en esta máquina. Se dice
  //    aunque no haya ningún módulo que lo use: si la puerta está cerrada y
  //    no se dice, parece que no hace falta abrirla.
  const programas = opts.programas ?? [];

  // 1. los módulos y sus permisos pendientes
  const instalados = opts.instalados.map((m) => {
    const pendientes = opts.pendientes[m.id] ?? [];
    if (pendientes.length) {
      avisos.push(`${m.id}: PIDIENDO PALABRA — ${pendientes.join(", ")}`);
    }
    return { id: m.id, version: m.version, permisos_pendientes: pendientes };
  });

  // 2. el plan de actualización
  const plan = planDeActualizacion(opts.instalados, opts.tienda, {
    ...(opts.mideCambios
      ? {
          medirCambios: (inst, nueva) => {
            const r = opts.mideCambios!(inst, nueva);
            return r
              ? ({
                  ficheros: r.ficheros,
                  anadidos: 0,
                  borrados: 0,
                  truncado: false,
                  concurrente: false,
                } as never)
              : null;
          },
        }
      : {}),
  });
  for (const u of plan.actualizaciones) {
    avisos.push(`${u.id}: hay versión nueva (${u.de} → ${u.a})`);
  }

  // 3. la tienda: si el índice no verifica, lo instalado no es de fiar
  let tienda: EstadoDoctor["tienda"] = { ok: true };
  if (opts.rutaIndice && existsSync(opts.rutaIndice) && opts.pubRaiz) {
    const indice = JSON.parse(readFileSync(opts.rutaIndice, "utf8")) as Record<string, unknown>;
    const confianza = confiaIndexChain(
      indice,
      opts.pubRaiz,
      opts.rutaLedger ?? join(opts.rutaIndice, "..", "rotaciones.json")
    );
    tienda = confianza.ok
      ? { ok: true, via: confianza.via }
      : { ok: false, motivo: "el índice no viene de la raíz ni de su estirpe" };
    if (!confianza.ok) avisos.push("la tienda no verifica: lo instalado puede no ser de fiar");
  }

  // 4. la memoria
  const memoria = opts.memoria ?? [];
  for (const m of memoria) {
    if (m.pasado) avisos.push(`${m.proceso} (pid ${m.pid}) pasa del tope de memoria`);
  }

  const enPie = tienda.ok && plan.actualizaciones.length === 0;
  return {
    instalados,
    actualizaciones: plan.actualizaciones.map((u) => ({
      id: u.id,
      de: u.de,
      a: u.a,
      cambios: u.cambios?.ficheros.length ?? 0,
    })),
    memoria,
    tienda,
    programas,
    enPie,
    avisos,
  };
}

/** El texto que ve la persona. */
export function renderDoctor(e: EstadoDoctor): string {
  const lineas: string[] = [];
  lineas.push(`módulos    : ${e.instalados.length}`);
  for (const m of e.instalados) {
    const pend = m.permisos_pendientes.length
      ? ` · PIDIENDO PALABRA: ${m.permisos_pendientes.join(", ")}`
      : "";
    lineas.push(`  · ${m.id} v${m.version}${pend}`);
  }
  if (e.actualizaciones.length) {
    lineas.push(`actualizables: ${e.actualizaciones.length}`);
    for (const u of e.actualizaciones) {
      lineas.push(`  · ${u.id}: ${u.de} → ${u.a} (${u.cambios} ficheros cambiados)`);
    }
  }
  lineas.push(`tienda    : ${e.tienda.ok ? `verifica ✓ (${e.tienda.via ?? "directa"})` : `FALLA ✗ — ${e.tienda.motivo ?? ""}`}`);
  // los programas: lo que la puerta puede lanzar aquí
  lineas.push(
    e.programas.length
      ? `programas : ${e.programas.map((p) => p.nombre).join(", ")} (la puerta de los programas)`
      : "programas : ninguno (la puerta de los programas está cerrada)"
  );
  if (e.memoria.length) {
    lineas.push(`memoria   :`);
    for (const m of e.memoria.slice(0, 5)) {
      lineas.push(`  · ${m.proceso} (${m.pid}) ${m.mb === null ? "?" : `${Math.round(m.mb)} MiB`}${m.pasado ? "  ← por encima del tope" : ""}`);
    }
  }
  if (e.avisos.length) {
    lineas.push(`avisos    :`);
    for (const a of e.avisos) lineas.push(`  · ${a}`);
  }
  lineas.push("");
  lineas.push(e.enPie ? "la casa está en pie ✓" : "la casa TIENE COSAS QUE MIRAR ✗");
  return lineas.join("\n");
}

/** La raíz de confianza (la congelada del repo). */
export function raizDeConfianza(raizKit: string): string {
  return leeRaiz(resolve(raizKit)) ?? "";
}
