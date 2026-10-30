/**
 * EL CHAT COMO SESIÓN — el Hilo de la app, apuntado en su registro.
 *
 * Hoy el chat de la app guarda cada conversación entera en un JSON (su
 * `Hilo`) al terminar cada respuesta. Mientras siga así, además apunta en
 * sombra los eventos que salen de comparar cada guardado con lo que ya dice
 * su registro; y reproducir el registro da el mismo Hilo, campo por campo:
 *
 *   - el id del Hilo es el `sesion` de su primer `dueno` (o el de la
 *     bifurcación que lo estrenó, si salió de otro);
 *   - un turno del usuario es un `orden {mensaje}`; uno del asistente, un
 *     `texto`. El resto de campos del turno va tal cual en `chat` (y el del
 *     asistente lo lleva siempre, aunque sea vacío: así compactar no junta
 *     dos respuestas seguidas);
 *   - lo demás del Hilo (el título, las fechas, el motor y el modelo) es un
 *     `punto {chat}`, al final de cada guardado que cambió algo;
 *   - un recuerdo que sirvió es un `orden {juzgar}`; cualquier otro cambio en
 *     un turno ya apuntado es un `orden {rebobinar}` hasta antes de ese
 *     turno, y los turnos de ahí en adelante, otra vez.
 *
 * La comparación se cura sola: se compara con lo que el registro DICE (no con
 * el guardado anterior), y se repite hasta que reproducirlo da el Hilo nuevo.
 * Si eso no pasa, se dice: nunca se apunta un registro que no lo reproduce.
 *
 * Referencia: estandar/sesion.spec.yaml (chat), app/src/main/hilos/hilos.ts.
 */
import { sesionTras, type DatosChat, type Evento, type Lectura, type Linea } from "./registro.ts";

/** Un turno del chat: quién habla y qué dice, y lo demás tal cual. */
export type TurnoHilo = { role: string; content: string } & Record<string, unknown>;

/** Una conversación del chat de la app. */
export interface Hilo {
  id: string;
  titulo: string;
  creado: number;
  actualizado: number;
  motor: string;
  modelo: string;
  turnos: TurnoHilo[];
}

/** Las claves del Hilo (las de la spec). */
export const CLAVES_HILO = ["id", "titulo", "creado", "actualizado", "motor", "modelo", "turnos"] as const satisfies ReadonlyArray<keyof Hilo>;

/** Lo que va en el `punto` de cada guardado: el Hilo sin su id ni sus turnos. */
export const CLAVES_PUNTO_CHAT = ["titulo", "creado", "actualizado", "motor", "modelo"] as const satisfies ReadonlyArray<keyof Hilo>;

/** El Hilo que dice un registro, con el evento que apuntó cada turno. */
export interface VistaHilo {
  /** El Hilo (null si aún no hay ningún guardado). */
  hilo: Hilo | null;
  /** El id (aunque aún no haya guardado). */
  id: string | null;
  /** Los turnos (aunque aún no haya un punto con lo demás). */
  turnos: TurnoHilo[];
  /** Lo demás del Hilo: el último punto. */
  meta: DatosChat | null;
  /** El evento que apuntó cada turno. */
  posiciones: number[];
}

interface Foto {
  turnos: TurnoHilo[];
  posiciones: number[];
  meta: DatosChat | null;
}

const posicion = (e: Linea, i: number) => e.n ?? i;

/** El Hilo que dice un registro (null si aún no hay ningún guardado). */
export function hiloDe(entrada: Lectura | readonly Linea[]): Hilo | null {
  return vistaDe(entrada).hilo;
}

/** El Hilo que dice un registro, con el evento que apuntó cada turno. */
export function vistaDe(entrada: Lectura | readonly Linea[]): VistaHilo {
  const eventos: readonly Linea[] = Array.isArray(entrada) ? entrada : (entrada as Lectura).eventos;
  // las fotos que hará falta sacar: las de los eventos a los que se rebobina
  const objetivos = new Set<number>();
  for (const [i, e] of eventos.entries()) {
    if (e.tipo === "orden" && e.que === "rebobinar" && Number.isInteger(e.hasta) && e.hasta! >= 0 && e.hasta! < posicion(e, i)) objetivos.add(e.hasta!);
  }
  const fotos = new Map<number, Foto>();
  let id: string | null = null;
  let f: Foto = { turnos: [], posiciones: [], meta: null };
  let anterior = -1;
  const foto = (): Foto => ({ turnos: [...f.turnos], posiciones: [...f.posiciones], meta: f.meta });

  for (const [i, e] of eventos.entries()) {
    const p = posicion(e, i);
    // un evento al que se rebobina y que no está (una línea rechazada): la foto es la de antes
    for (const o of objetivos) if (o > anterior && o < p && !fotos.has(o)) fotos.set(o, foto());
    anterior = p;
    switch (e.tipo) {
      case "dueno":
        id = sesionTras(id, e);
        break;
      case "orden":
        if (e.que === "mensaje") {
          f.turnos.push({ role: "user", content: e.texto ?? "", ...(e.chat ?? {}) });
          f.posiciones.push(p);
        } else if (e.que === "juzgar" && e.turno !== undefined && f.turnos[e.turno]) {
          f.turnos[e.turno] = { ...f.turnos[e.turno], judged: true };
        } else if (e.que === "rebobinar" && Number.isInteger(e.hasta) && e.hasta! < p) {
          const vuelta = e.hasta! < 0 ? { turnos: [], posiciones: [], meta: null } : fotos.get(e.hasta!);
          if (vuelta) f = { turnos: [...vuelta.turnos], posiciones: [...vuelta.posiciones], meta: vuelta.meta };
        }
        break;
      case "texto":
        if (e.chat !== undefined) {
          const { role, ...resto } = e.chat as { role?: unknown } & DatosChat;
          f.turnos.push({ role: typeof role === "string" ? role : "assistant", content: e.texto, ...resto });
          f.posiciones.push(p);
        } else {
          // un trozo suelto (un motor que escribe en vivo): sigue la respuesta en marcha
          const u = f.turnos[f.turnos.length - 1];
          if (u && u.role !== "user") f.turnos[f.turnos.length - 1] = { ...u, content: u.content + e.texto };
          else {
            f.turnos.push({ role: "assistant", content: e.texto });
            f.posiciones.push(p);
          }
        }
        break;
      case "punto":
        if (e.chat !== undefined) f.meta = e.chat;
        break;
    }
    if (objetivos.has(p)) fotos.set(p, foto());
  }

  const hilo = id !== null && f.meta !== null ? ({ id, ...f.meta, turnos: f.turnos } as unknown as Hilo) : null;
  return { hilo, id, turnos: f.turnos, meta: f.meta, posiciones: f.posiciones };
}

/** El evento que apunta un turno del chat. */
export function eventoDeTurno(t: TurnoHilo): Evento {
  const { role, content, ...resto } = t;
  if (role === "user") return { tipo: "orden", que: "mensaje", texto: content, ...(Object.keys(resto).length ? { chat: resto } : {}) };
  return { tipo: "texto", texto: content, chat: role === "assistant" ? resto : { role, ...resto } };
}

/** Lo que va en el `punto` de un guardado: todo menos el id y los turnos. */
function metaDe(h: Hilo): DatosChat {
  const { id: _id, turnos: _turnos, ...meta } = h;
  return meta;
}

/** El texto de un valor tal como lo guarda un JSON, con las claves en orden (para comparar). */
function canonico(x: unknown): string {
  return JSON.stringify(x, (_k, v: unknown) => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  });
}

const mismo = (a: unknown, b: unknown) => canonico(a) === canonico(b);

function soloJuzgado(antes: TurnoHilo, ahora: TurnoHilo): boolean {
  if (antes.judged || ahora.judged !== true) return false;
  const { judged: _a, ...x } = antes;
  const { judged: _b, ...y } = ahora;
  return mismo(x, y);
}

/**
 * Los eventos que hay que apuntar para que el registro diga `nuevo`: se
 * compara con lo que el registro dice ahora, y se repite hasta que lo dice.
 * Nunca lleva el `dueno`: en un registro nuevo lo apunta quien lo abre, con el
 * id del Hilo como `sesion` (y aquí se cuenta con él).
 */
export function eventosDelGuardado(entrada: Pick<Lectura, "eventos" | "cadena">, nuevo: Hilo): Evento[] {
  const salida: Evento[] = [];
  const trabajo: Linea[] = [...entrada.eventos];
  let siguiente = entrada.cadena.n;
  if (!trabajo.some((e) => e.tipo === "dueno")) trabajo.push({ tipo: "dueno", sesion: nuevo.id, n: siguiente++ } as Linea);
  const id = vistaDe(trabajo).id;
  if (id === null) throw new Error("Este registro no dice de qué conversación es (su `dueno` no lleva `sesion`).");
  if (id !== nuevo.id) throw new Error(`Este registro es de la conversación «${id}», no de «${nuevo.id}».`);
  const anota = (e: Evento) => {
    salida.push(e);
    trabajo.push({ ...e, n: siguiente++ } as Linea);
  };
  const objetivo = canonico({ ...metaDe(nuevo), id: nuevo.id, turnos: nuevo.turnos });
  const turnos = canonico(nuevo.turnos);

  // los turnos, hasta que el registro dice los mismos (al rebobinar se pierden los juicios de después: la vuelta siguiente los repone)
  for (let vuelta = 0; ; vuelta++) {
    const v = vistaDe(trabajo);
    if (canonico(v.turnos) === turnos) break;
    if (vuelta === 4) throw new Error(`La conversación «${nuevo.id}» no se pudo apuntar: su registro no da los mismos turnos.`);
    const viejos = v.turnos;
    const comunes = Math.min(viejos.length, nuevo.turnos.length);
    let cambio = -1;
    for (let k = 0; k < comunes; k++) {
      if (mismo(viejos[k], nuevo.turnos[k])) continue;
      if (soloJuzgado(viejos[k], nuevo.turnos[k])) {
        anota({ tipo: "orden", que: "juzgar", turno: k });
        continue;
      }
      cambio = k;
      break;
    }
    if (cambio === -1 && viejos.length > nuevo.turnos.length) cambio = nuevo.turnos.length;
    if (cambio >= 0) {
      // vuelve a como estaba justo antes de apuntar ese turno, y apunta de ahí en adelante
      anota({ tipo: "orden", que: "rebobinar", hasta: v.posiciones[cambio] - 1 });
      for (const t of nuevo.turnos.slice(cambio)) anota(eventoDeTurno(t));
    } else {
      for (const t of nuevo.turnos.slice(viejos.length)) anota(eventoDeTurno(t));
    }
  }
  // y lo demás, al final
  const meta = vistaDe(trabajo).meta;
  if (meta === null || !mismo(meta, metaDe(nuevo))) anota({ tipo: "punto", chat: metaDe(nuevo) });
  const fin = vistaDe(trabajo).hilo;
  if (!fin || canonico(fin) !== objetivo) throw new Error(`La conversación «${nuevo.id}» no se pudo apuntar: su registro no da el mismo Hilo.`);
  return salida;
}
