/**
 * UNA TAREA SINTÉTICA — un registro del Taller inventado, con la forma de los de verdad.
 *
 * El kit es público: sus pruebas no pueden usar las tareas de nadie. Esto
 * inventa una con la misma forma que las del Taller de hoy (formato 1): cada
 * turno empieza con un `usuario`, el motor piensa y escribe a trozos (con la
 * hora solo en los latidos), llama a herramientas que tardan, a veces en
 * paralelo, te pide permiso, espera al proveedor, se calla un rato, y acaba
 * con su `fin` (o con un fallo). Con la misma semilla sale la misma tarea.
 *
 * Sirve para medir (el listón de la spec: 110.484 eventos en menos de 200 ms)
 * y para comparar dos implementaciones con casos que nadie eligió a mano.
 *
 * Referencia: estandar/sesion.spec.yaml (reglas.eventos_referencia).
 */
import { LATIDO_MS, type Linea } from "./registro.ts";

/** Números al azar con semilla (mulberry32): la misma semilla da la misma serie. */
export function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cómo es la tarea inventada. */
export interface OpcionesSintetico {
  /** La semilla (la misma da la misma tarea). */
  semilla?: number;
  /** Cuántos eventos, exactos (el último turno se queda a medias, como una tarea en marcha). */
  eventos?: number;
  /** Cuántos turnos, si no se dicen los eventos. */
  turnos?: number;
  /** Si lleva hora (las tareas de antes del 25-oct no la llevan). */
  conHora?: boolean;
  /** Cuándo empieza (ms desde 1970). */
  inicio?: number;
  /** Cuántas cosas hace el motor en cada turno (entre). */
  acciones?: [number, number];
  /** Cuántos trozos tiene cada ráfaga de texto o pensamiento (entre). */
  rafaga?: [number, number];
}

const PALABRAS = [
  "el",
  "reloj",
  "fichero",
  "prueba",
  "falla",
  "porque",
  "la",
  "hora",
  "se",
  "lee",
  "antes",
  "de",
  "tiempo",
  "cambio",
  "función",
  "vuelve",
  "un",
  "valor",
  "nulo",
  "y",
  "ahora",
  "sí",
  "pasa",
];
const HERRAMIENTAS: Array<[string, string]> = [
  ["Leer src/reloj.ts", "read"],
  ["Editar src/reloj.ts", "edit"],
  ["npm test", "execute"],
  ["Buscar «hora»", "search"],
  ["Leer package.json", "read"],
  ["git diff", "execute"],
  ["Abrir la documentación", "fetch"],
  ["Pensar el plan", "think"],
  ["Crear src/alarma.ts", "edit"],
];

/** Una tarea del Taller inventada (formato 1: sin sobre, como las de hoy). */
export function tallerSintetico(o: OpcionesSintetico = {}): Linea[] {
  const r = azar(o.semilla ?? 1);
  const entre = ([a, b]: [number, number]) => a + Math.floor(r() * (b - a + 1));
  const conHora = o.conHora ?? true;
  const acciones = o.acciones ?? [6, 60];
  const rafaga = o.rafaga ?? [4, 90];
  const tope = o.eventos ?? Infinity;
  const turnosTope = o.eventos === undefined ? (o.turnos ?? 5) : Infinity;
  const out: Linea[] = [];
  let t = o.inicio ?? 1_761_350_400_000;
  let ultimaHora: number | undefined;
  let nh = 0;

  // la hora como la pone el Taller: siempre, salvo a los trozos (solo con un latido)
  const apunta = (e: Linea) => {
    if (out.length >= tope) return;
    const trozo = e.tipo === "texto" || e.tipo === "pensamiento";
    if (conHora && (!trozo || ultimaHora === undefined || t - ultimaHora >= LATIDO_MS)) {
      out.push({ ...e, ts: t } as Linea);
      ultimaHora = t;
    } else out.push(e);
  };
  const frase = (n: number) => Array.from({ length: n }, () => PALABRAS[Math.floor(r() * PALABRAS.length)]).join(" ");

  apunta({ tipo: "opciones", opciones: [{ id: "modelo", nombre: "Modelo", actual: "m-1", valores: [{ id: "m-1", nombre: "M 1" }] }] });
  apunta({ tipo: "uso", entrada: 0, salida: 0 });
  apunta({ tipo: "contexto", usado: 0, total: 200_000 });

  for (let turno = 1; turno <= turnosTope && out.length < tope; turno++) {
    t += entre([2_000, 120_000]);
    const inicioTurno = t;
    apunta({ tipo: "usuario", texto: `${frase(entre([3, 12]))}\n${frase(entre([0, 30]))}` });
    if (r() < 0.6) apunta({ tipo: "herencia", tokens: entre([50, 4_000]), recuerdos: entre([0, 8]) });
    const enMarcha: Array<{ id: string; titulo: string; clase: string; acaba: number }> = [];
    const cerrar = (todas: boolean) => {
      enMarcha.sort((a, b) => a.acaba - b.acaba);
      while (enMarcha.length && (todas || enMarcha[0].acaba <= t)) {
        const h = enMarcha.shift()!;
        t = Math.max(t, h.acaba);
        const falla = r() < 0.12;
        apunta({
          tipo: "herramienta",
          id: h.id,
          estado: falla ? "failed" : "completed",
          ...(falla ? { detalle: r() < 0.5 ? "exit 1" : "ENOENT: no existe" } : {}),
        });
      }
    };
    const n = entre(acciones);
    for (let a = 0; a < n && out.length < tope; a++) {
      if (r() < 0.03) t += entre([30_000, 200_000]); // se calla un rato
      const x = r();
      if (x < 0.36 || x >= 0.97) {
        const tipo = x < 0.18 ? "pensamiento" : "texto";
        const m = entre(rafaga);
        for (let k = 0; k < m && out.length < tope; k++) {
          t += entre([10, 70]);
          apunta({ tipo, texto: frase(entre([1, 3])) + " " } as Linea);
        }
      } else if (x < 0.82) {
        const [titulo, clase] = HERRAMIENTAS[Math.floor(r() * HERRAMIENTAS.length)];
        const id = `h${++nh}`;
        t += entre([20, 400]);
        const diff = clase === "edit" && r() < 0.5 ? [{ ruta: titulo.split(" ")[1], antes: `${frase(20)}\n${frase(15)}\n`, despues: `${frase(20)}\n${frase(18)}\n` }] : undefined;
        apunta({ tipo: "herramienta", id, titulo, clase, estado: "pending", ...(r() < 0.3 ? { rutas: ["src/reloj.ts"] } : {}) });
        if (r() < 0.08) {
          const ms = entre([1_000, 90_000]);
          t += ms;
          apunta({ tipo: "permiso", titulo, clase, concedido: r() < 0.85, ms });
        }
        apunta({ tipo: "herramienta", id, estado: "in_progress", ...(diff ? { diff } : {}) });
        enMarcha.push({ id, titulo, clase, acaba: t + entre([30, r() < 0.1 ? 120_000 : 6_000]) });
        if (r() > 0.25) cerrar(false); // a veces la siguiente empieza antes de que acabe esta
      } else if (x < 0.88) {
        cerrar(true);
        apunta({ tipo: "plan", pasos: Array.from({ length: entre([1, 6]) }, (_, i) => ({ texto: frase(4), estado: i === 0 ? "in_progress" : "pending" })) });
      } else if (x < 0.91) {
        const ms = entre([500, 15_000]);
        apunta({ tipo: "reintento", ms, motivo: r() < 0.5 ? "Rate limit" : "503" });
        t += ms;
      } else if (x < 0.95) {
        apunta({ tipo: "uso", entrada: entre([1_000, 90_000]), salida: entre([100, 9_000]) });
      } else {
        apunta({ tipo: "contexto", usado: entre([1_000, 190_000]), total: 200_000 });
      }
    }
    cerrar(true);
    t += entre([50, 2_000]);
    if (r() < 0.07) apunta({ tipo: "fallo", mensaje: r() < 0.5 ? "Internal error" : "El motor se cerró sin responder." });
    if (r() < 0.95) {
      apunta({
        tipo: "fin",
        motivo: r() < 0.92 ? "end_turn" : "cancelled",
        ms: t - inicioTurno,
        tokens: { entrada: entre([500, 60_000]), salida: entre([50, 8_000]), pensamiento: entre([0, 4_000]) },
      });
    }
  }
  return out;
}
