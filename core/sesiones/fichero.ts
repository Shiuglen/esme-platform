/**
 * EL FICHERO DE UNA SESIÓN — `eventos.jsonl` en disco, con un solo escritor.
 *
 * Abrir un registro es leerlo entero y comprobarlo; si un apagón dejó la
 * última línea cortada, se quita (y se dice), y si el que abre no es el dueño,
 * se apunta un `dueno`: en un fichero nuevo o del Taller de hoy, sin más; en
 * uno de otro aparato o cerrado, solo si se pide (`tomar`), porque eso es
 * quitarle la sesión a otro.
 *
 * Después, cada evento se sella y se añade de UNA sola escritura (la línea
 * con su salto): un corte a mitad deja como mucho una línea cortada, que el
 * siguiente que abra quitará. Y antes de cada escritura se mira el tamaño: si
 * alguien escribió por fuera, el escritor se para en vez de mezclar dos
 * historias.
 *
 * Los trozos de texto y pensamiento no van cada uno en su línea: se juntan
 * hasta el siguiente latido (ver core/sesiones/compactar.ts). Lo que espera
 * sin escribir (menos de un latido de texto) se escribe con el siguiente
 * evento, al vaciar o al sincronizar; si el proceso muere antes, eso es lo
 * que se pierde.
 *
 * Lo que este fichero NO hace: decidir quién escribe entre procesos de un
 * mismo aparato (eso es de quien lo usa: un proceso por sesión).
 *
 * Referencia: core/sesiones/registro.ts, estandar/sesion.spec.yaml.
 */
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, statSync, truncateSync } from "node:fs";
import { dirname } from "node:path";
import { juntarUno } from "./compactar.ts";
import { LATIDO_MS, leer, sellar, validarEvento, type Cadena, type Evento, type Lectura, type Linea, type Problema } from "./registro.ts";

/** Un registro que no verifica: no se escribe en él. */
export class ErrorRegistro extends Error {
  constructor(
    readonly ruta: string,
    readonly problemas: Problema[],
  ) {
    super(`El registro ${ruta} no verifica: ${problemas.map((p) => `línea ${p.linea}: ${p.problema}`).join("; ")}`);
    this.name = "ErrorRegistro";
  }
}

/** Cómo se abre un registro para escribir. */
export interface OpcionesEscritor {
  /** El aparato que escribe. */
  de: string;
  /** El id de la sesión (lo lleva el primer `dueno`). */
  sesion?: string;
  /** Quién la empezó, si no fue Esme (lo lleva el primer `dueno`). */
  origen?: string;
  /** Tomar la sesión aunque sea de otro aparato o esté cerrada. */
  tomar?: boolean;
  /** El reloj (en las pruebas, uno a mano). */
  ahora?: () => number;
  /** Cada cuánto llevan hora los trozos de texto. */
  latidoMs?: number;
  /** Comprobar la forma de cada evento antes de escribirlo (sí, salvo que se diga). */
  validar?: boolean;
  /** Juntar los trozos hasta el siguiente latido (sí, salvo que se diga). */
  juntar?: boolean;
}

/** Lo que hubo que hacer al abrir. */
export interface Apertura {
  /** Los bytes de una última línea cortada que se quitaron. */
  quitados: number;
  /** Si se puso el salto final que faltaba. */
  salto: boolean;
  /** Si se apuntó un `dueno`. */
  dueno: boolean;
  /** Lo que se leyó. */
  lectura: Lectura;
}

/** Lee un `eventos.jsonl` (vacío si no existe). */
export function leerFichero(ruta: string, opciones?: { cabeza?: string; n?: number }): Lectura {
  return leer(existsSync(ruta) ? readFileSync(ruta, "utf8") : "", opciones);
}

/** El que escribe un registro: el dueño de la sesión. */
export class Escritor {
  private ultimaHora: number | undefined;
  /** Los trozos de este latido, que aún no se escribieron. */
  private pendiente: Evento | null = null;

  private constructor(
    readonly ruta: string,
    private c: Cadena,
    private bytes: number,
    private readonly o: OpcionesEscritor,
    readonly apertura: Apertura,
  ) {}

  /** Abre un registro para escribir (lo crea si no existe). */
  static abrir(ruta: string, o: OpcionesEscritor): Escritor {
    let texto = "";
    if (existsSync(ruta)) texto = readFileSync(ruta, "utf8");
    else mkdirSync(dirname(ruta), { recursive: true });
    const lectura = leer(texto);
    if (!lectura.valida) throw new ErrorRegistro(ruta, lectura.problemas);
    let bytes = Buffer.byteLength(texto);
    let quitados = 0;
    let salto = false;
    if (lectura.cortada) {
      const quedan = Buffer.byteLength(texto.slice(0, lectura.aceptado));
      truncateSync(ruta, quedan);
      quitados = bytes - quedan;
      bytes = quedan;
    }
    if (lectura.sinSalto) {
      appendFileSync(ruta, "\n");
      bytes += 1;
      salto = true;
    }
    const c = lectura.cadena;
    const tomar = c.dueno !== o.de || c.cerrada;
    if (tomar && c.dueno !== null && !o.tomar) {
      throw new Error(
        c.cerrada && c.dueno === o.de
          ? `La sesión de ${ruta} está cerrada: para reabrirla, tómala a propósito.`
          : `La sesión de ${ruta} es de «${c.dueno}», no de «${o.de}»: solo escribe el dueño (para quitársela, tómala a propósito).`,
      );
    }
    const w = new Escritor(ruta, c, bytes, o, { quitados, salto, dueno: tomar, lectura });
    if (tomar) {
      const primero = c.epoca === 0;
      w.anotar({
        tipo: "dueno",
        ...(primero && o.sesion !== undefined ? { sesion: o.sesion } : {}),
        ...(primero && o.origen !== undefined ? { origen: o.origen } : {}),
      });
    }
    return w;
  }

  /** Por dónde va la cadena (lo escrito: un trozo que espera aún no cuenta). */
  get cadena(): Cadena {
    return this.c;
  }

  /**
   * Apunta un evento y devuelve lo que escribió (nada si es un trozo que
   * espera a su latido; antes que él, los trozos que esperaban). La hora la
   * pone el escritor: siempre, salvo a los trozos de texto y pensamiento, que
   * solo la llevan si pasó un latido desde la última (como el Taller). Si el
   * evento ya trae su hora, se respeta.
   */
  anotar(evento: Evento): Linea[] {
    if (this.o.validar !== false) {
      const mal = validarEvento(evento);
      if (mal.length > 0) throw new Error(`El evento no es del contrato: ${mal.join("; ")}.`);
    }
    let e = evento;
    if (e.ts !== undefined) this.ultimaHora = e.ts;
    else {
      const ahora = (this.o.ahora ?? Date.now)();
      const trozo = e.tipo === "texto" || e.tipo === "pensamiento";
      if (!trozo || this.ultimaHora === undefined || ahora - this.ultimaHora >= (this.o.latidoMs ?? LATIDO_MS)) {
        e = { ...e, ts: ahora };
        this.ultimaHora = ahora;
      }
    }
    if (this.o.juntar === false) return [this.escribir(e)];
    const paso = juntarUno(this.pendiente, e);
    const escritas: Linea[] = [];
    for (const x of paso.escribir) {
      escritas.push(this.escribir(x));
      if (x === this.pendiente) this.pendiente = null; // ya está en disco: si lo siguiente falla, no se repite
    }
    this.pendiente = paso.pendiente;
    return escritas;
  }

  /** Escribe ya los trozos que esperan a su latido (si los hay). */
  vaciar(): Linea[] {
    if (this.pendiente === null) return [];
    const escrita = this.escribir(this.pendiente);
    this.pendiente = null;
    return [escrita];
  }

  /** Que todo lo apuntado llegue al disco (al final de un turno, por ejemplo): también lo que esperaba. */
  sincronizar(): void {
    this.vaciar();
    const fd = openSync(this.ruta, "r+");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  /** Sella un evento y lo añade de una sola escritura (si nadie escribió por fuera). */
  private escribir(e: Evento): Linea {
    const r = sellar(this.c, e, this.o.de);
    const tam = existsSync(this.ruta) ? statSync(this.ruta).size : 0;
    if (tam !== this.bytes) {
      throw new Error(`El registro ${this.ruta} cambió por fuera mientras lo escribía: me paro (un solo escritor).`);
    }
    const datos = `${r.linea}\n`;
    appendFileSync(this.ruta, datos);
    this.bytes += Buffer.byteLength(datos);
    this.c = r.cadena;
    return r.evento;
  }
}
