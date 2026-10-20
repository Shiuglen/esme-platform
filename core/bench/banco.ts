/**
 * banco — el banco REAL de la Prueba 0.
 *
 * La constitution (docs/PRUEBA-0.md) lo dice: las preguntas son las que el
 * usuario hizo a las IAs, y la respuesta correcta se propone desde lo que pasó
 * después en esa misma sesión. Aquí se automatiza esa propuesta: el ORO de un
 * caso es el trozo del fichero que la IA leyó de verdad después de la pregunta.
 *
 * Por qué esto NO es hacer trampa: el oro NO sale del recuperador que se va a
 * medir (si saliera de ahí, el recall sería 1 por construcción y el número no
 * mediría nada). Sale de un hecho externo y comprobable: en la transcripción,
 * tras esta pregunta, la IA abrió ESTE fichero. El hilo de la conversación es
 * la evidencia; el recuperador no participa.
 *
 * El humano sigue pudiendo revisar (y corregir) el banco: el constructor
 * propone, la persona manda. Pero el banco ya nace con oro apoyado en hechos,
 * no en_SUPOSICIONES.
 *
 * Y es PRIVADO: las preguntas del usuario y su Vault no van a un repo.
 */
import { puntua, type Caso, type Candidato } from "./examen.ts";
import { trocea } from "../mind/troceo.ts";
import { corre, type ResultadoExamen } from "./runner.ts";

export interface DocumentoReal {
  id: string;
  texto: string;
}

/** Un candidato propuesto para el oro (lo elige el humano, o lo respalda la evidencia). */
export interface OpcionOro {
  texto: string;
  origen: string;
  score: number;
}

export interface CasoReal {
  id: string;
  pregunta: string;
  /** Qué mide: el saber (la nota) o la sesión (la respuesta). */
  tipo?: TipoCaso;
  /** Lo que el constructor propone (para que el humano elija). */
  opciones: OpcionOro[];
  /** El trozo que el humano eligió (vacío = caso descartado). */
  oro: string;
  /** El humano lo validó: sin esto, el caso no cuenta. */
  validado: boolean;
  /** De dónde salió la propuesta (para que el humano la juzgue). */
  origen?: string;
  /** La evidencia: el hecho que respalda el oro (la IA leyó este fichero). */
  evidencia?: string;
}

export interface BancoReal {
  version: 1;
  creado: string;
  documentos: DocumentoReal[];
  casos: CasoReal[];
}

/** Los dos mundos: el documento entero (base) y el troceado por filas (con módulo). */
export function mundosDelBanco(banco: BancoReal): {
  base: Candidato[];
  con: Candidato[];
} {
  // el mundo BASE: el documento entero, sin trocear (la tabla entera nunca
  // pasa el presupuesto: es justo lo que el módulo arregla)
  const base: Candidato[] = banco.documentos.map((d) => ({
    id: d.id,
    texto: d.texto,
    score: 0,
    tokens: Math.ceil(d.texto.length / 4),
  }));
  // el mundo CON: el troceo del módulo (apartados, párrafos y filas)
  const con = puntua(banco.documentos.flatMap((d) => trocea(d.id, d.texto)));
  return { base, con };
}

/** Los casos de un mundo: el oro se resuelve por texto (el trozo que lo contiene). */
export function casosDelBanco(banco: BancoReal, mundo: "base" | "con"): Caso[] {
  const { base, con } = mundosDelBanco(banco);
  const candidatos = mundo === "base" ? base : con;
  return banco.casos
    .filter((c) => c.validado && c.oro.trim())
    .map((c) => {
      const normaliza = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
      const oro = normaliza(c.oro);
      const idsOro = candidatos
        .filter((k) => normaliza(k.texto).includes(oro))
        .map((k) => k.id);
      return { id: c.id, pregunta: c.pregunta, oro: idsOro };
    })
    .filter((c) => c.oro.length > 0); // un caso sin oro resoluble no cuenta
}

/** La medición completa: los dos mundos, con los mismos casos. */
export function correBanco(
  banco: BancoReal,
  opts: { k?: number; budget?: number } = {}
): { base: ResultadoExamen; con: ResultadoExamen; casos: number } {
  const base = mundosDelBanco(banco).base;
  const con = mundosDelBanco(banco).con;
  const casosBase = casosDelBanco(banco, "base");
  const casosCon = casosDelBanco(banco, "con");
  return {
    base: corre(base, casosBase, opts),
    con: corre(con, casosCon, opts),
    casos: casosBase.length,
  };
}

/** Valida el banco: lo que no vale, se dice. */
export function validaBanco(banco: unknown): { ok: boolean; errores: string[] } {
  const errores: string[] = [];
  if (!banco || typeof banco !== "object") return { ok: false, errores: ["el banco no es un objeto"] };
  const b = banco as Partial<BancoReal>;
  if (b.version !== 1) errores.push(`versión de banco desconocida: ${String(b.version)}`);
  if (!Array.isArray(b.documentos)) errores.push("el banco no tiene documentos");
  if (!Array.isArray(b.casos)) errores.push("el banco no tiene casos");
  if (Array.isArray(b.casos))
    for (const c of b.casos) {
      if (!c?.pregunta?.trim()) errores.push("un caso sin pregunta");
      if (!Array.isArray(c?.opciones)) errores.push(`el caso ${c?.id ?? "?"} no tiene opciones`);
    }
  return { ok: errores.length === 0, errores };
}

/* ————————————————————————————————————————————————————————————————
 * Lo puro del banco: cómo se sacan las preguntas de una transcripción, qué
 * palabras cuentan, qué candidatos se proponen para el oro y —lo importante—
 * qué evidencia dejó la IA al leer un fichero después de la pregunta.
 * (El CLI vive en scripts/banco.ts: aquí no hay ni ficheros ni consola.)
 * ———————————————————————————————————————————————————————————————— */

/** Las preguntas del usuario: lo que le dijo a las IAs. */
export function preguntasDeTranscripcion(texto: string): string[] {
  const preguntas: string[] = [];
  const RUIDO = [
    "<system-reminder",
    "<command-name",
    "[Request interrupted",
    "[Image:",
    "[Image #",
    "Caveat:",
    "This session is being continued",
    "API Error",
    "<local-command",
    "<command-message",
    "Your response above was stopped",
    "Alcancé mi límite de uso",
    "Continúa donde lo dejaste",
    "El usuario ha solicitado",
  ];
  for (const linea of texto.split("\n")) {
    if (!linea.trim()) continue;
    let j: { type?: string; message?: { role?: string; content?: unknown } };
    try {
      j = JSON.parse(linea) as typeof j;
    } catch {
      continue;
    }
    if (j.type !== "user" || j.message?.role !== "user") continue;
    const c = j.message.content;
    const contenido =
      typeof c === "string"
        ? c
        : Array.isArray(c)
          ? c
              .filter((x) => x && typeof x === "object" && (x as { type?: string }).type === "text")
              .map((x) => String((x as { text?: unknown }).text ?? ""))
              .join(" ")
          : "";
    const t = contenido.trim();
    if (t.length < 12 || t.length > 400) continue; // los prompts largos son encargos, no preguntas
    if (RUIDO.some((r) => t.startsWith(r))) continue;
    if (t.startsWith("```") || t.startsWith("/")) continue; // comandos, no preguntas
    preguntas.push(t.replace(/\s+/g, " "));
  }
  return [...new Set(preguntas)];
}

/** El proyecto de una transcripción: el cwd del jsonl (dónde vivía la sesión). */
export function proyectoDeTranscripcion(texto: string): string {
  for (const linea of texto.split("\n")) {
    if (!linea.includes('"cwd"')) continue;
    const m = /"cwd"\s*:\s*"([^"]+)"/.exec(linea);
    if (m) return m[1];
  }
  return "";
}

/** El nombre del proyecto en una ruta (Daimon, Sakoi…): lo que se busca en los documentos. */
export function nombreDeProyecto(cwd: string): string {
  const partes = cwd.split("/").filter(Boolean);
  return partes.length ? partes[partes.length - 1] : "";
}

/** Una pregunta y los ficheros que la IA leyó DESPUÉS de ella. */
export interface SesionEvidenciada {
  pregunta: string;
  ficheros: string[];
}

/**
 * La evidencia: por cada pregunta, los ficheros markdown que la IA leyó o
 * editó a continuación. Es el hecho externo que respalda el oro (la
 * constitution: «la respuesta correcta se propone desde lo que pasó después en
 * esa misma sesión»).
 */
export function evidenciaDeTranscripcion(texto: string): SesionEvidenciada[] {
  const salida: SesionEvidenciada[] = [];
  let pendiente: string | null = null;
  let ficheros: string[] = [];
  const cerrar = () => {
    if (pendiente && ficheros.length) salida.push({ pregunta: pendiente, ficheros: [...new Set(ficheros)] });
    pendiente = null;
    ficheros = [];
  };
  for (const linea of texto.split("\n")) {
    if (!linea.trim()) continue;
    let j: {
      type?: string;
      message?: { role?: string; content?: unknown };
    };
    try {
      j = JSON.parse(linea) as typeof j;
    } catch {
      continue;
    }
    if (j.type === "user" && j.message?.role === "user") {
      const c = j.message.content;
      const contenido =
        typeof c === "string"
          ? c
          : Array.isArray(c)
            ? c
                .filter((x) => x && typeof x === "object" && (x as { type?: string }).type === "text")
                .map((x) => String((x as { text?: unknown }).text ?? ""))
                .join(" ")
            : "";
      const t = contenido.trim();
      if (t.length < 12 || t.length > 400) continue;
      if (t.startsWith("<") || t.startsWith("[")) continue;
      cerrar();
      pendiente = t.replace(/\s+/g, " ");
      continue;
    }
    if (j.type === "assistant" && Array.isArray(j.message?.content)) {
      for (const b of j.message.content as unknown[]) {
        if (!b || typeof b !== "object") continue;
        const bloque = b as { type?: string; name?: string; input?: Record<string, unknown> };
        if (bloque.type !== "tool_use") continue;
        if (!["Read", "Edit", "Write", "Grep", "NotebookEdit"].includes(bloque.name ?? "")) continue;
        const ruta = String(bloque.input?.file_path ?? bloque.input?.path ?? "");
        if (ruta.toLowerCase().endsWith(".md")) ficheros.push(ruta);
      }
    }
  }
  cerrar();
  return salida;
}

/** Las palabras que cuentan: las largas y con contenido (las cortas no). */
const RUIDO = new Set([
  "que", "como", "para", "por", "con", "una", "uno", "esta", "este", "todo", "todos",
  "pero", "mas", "muy", "hay", "cuando", "donde", "porque", "puedes", "puede",
  "hace", "hacer", "quiero", "tengo", "cosa", "cosas", "sabes", "saber", "ves",
]);
export const palabrasQueCuentan = (pregunta: string): string[] =>
  pregunta
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !RUIDO.has(w));

/**
 * Cuánto responde un fragmento a la pregunta: la fracción de sus PALABRAS QUE
 * CUENTAN que aparecen en el fragmento (las cortas y de ruido no cuentan: una
 * pregunta real es larga y sus palabras importantes son pocas).
 */
export function respuestaDe(pregunta: string, texto: string): number {
  const palabras = palabrasQueCuentan(pregunta);
  if (!palabras.length) return 0;
  const destino = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
  let hit = 0;
  for (const w of palabras) if (destino.includes(w)) hit++;
  return hit / palabras.length;
}

/**
 * Los candidatos del oro: las frases del Vault que mejor responden a la
 * pregunta. El humano elige una (o ninguna): el constructor no decide.
 */
export function opcionesDeOro(
  pregunta: string,
  documentos: { id: string; texto: string }[],
  proyecto = "",
  max = 5,
  umbral = 0.12
): OpcionOro[] {
  const opciones: OpcionOro[] = [];
  const vistas = new Set<string>();
  for (const d of documentos) {
    // el proyecto de la sesión manda: una pregunta sobre la app se busca en la app
    const delProyecto =
      proyecto &&
      (d.id.toLowerCase().includes(proyecto.toLowerCase()) ||
        d.texto.toLowerCase().includes(proyecto.toLowerCase()));
    if (proyecto && !delProyecto) continue;
    for (const frase of d.texto.split(/\n{1,}/)) {
      const t = frase.trim();
      if (t.length < 40 || t.length > 400) continue;
      if (t.startsWith("|")) continue; // una fila de tabla: el troceo las separa
      if (vistas.has(t)) continue;
      const s = respuestaDe(pregunta, t);
      if (s < umbral) continue;
      vistas.add(t);
      opciones.push({ texto: t.slice(0, 300), origen: d.id, score: Number(s.toFixed(3)) });
    }
  }
  return opciones.sort((a, b) => b.score - a.score).slice(0, max);
}

/* ————————————————————————————————————————————————————————————————
 * La mecánica de la medición real: el oro se busca en lo que respondió la
 * mente (el cerebro la devuelve con su prefijo y sus comillas), y el hogar
 * de la mente es el de la app.
 * ———————————————————————————————————————————————————————————————— */

/** Normaliza para comparar: el cerebro puede reponer espacios o acentos. */
export function normalizaParaComparar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿El oro está en lo que respondió la mente? (una ventana de 60 caracteres) */
export function oroEnContexto(oro: string, contexto: string): boolean {
  const o = normalizaParaComparar(oro).slice(0, 60);
  if (!o) return false;
  return normalizaParaComparar(contexto).includes(o);
}

/* ————————————————————————————————————————————————————————————————
 * El banco por la constitution: la respuesta correcta se propone desde lo que
 * pasó después en esa misma sesión.
 *
 * El oro sale de la RESPUESTA que la IA dio a esa pregunta (un recuerdo de la
 * mente, con su hora y su sesión). No sale del recuperador que se va a medir:
 * por eso el número no es un 1 por construcción.
 * ———————————————————————————————————————————————————————————————— */

/** Una pregunta con su hora y su sesión (para poder unirla con la respuesta). */
export interface PreguntaConHora {
  texto: string;
  ts: string;
  source: string;
}

/** Un recuerdo de la mente: un trozo, con su hora, su sesión y su origen. */
export interface EventoMemoria {
  ts: string;
  kind: string;
  source: string;
  texto: string;
}

/**
 * Los casos con oro de verdad: por cada pregunta, la respuesta que la IA dio
 * después en esa misma sesión. La evidencia es la sesión entera, así que el
 * caso nace validado (el humano puede revisarlo igual: --validar).
 */
export function casosDesdeSesion(
  preguntas: PreguntaConHora[],
  eventos: EventoMemoria[]
): CasoReal[] {
  const porFuente = new Map<string, EventoMemoria[]>();
  for (const e of eventos) {
    if (e.kind !== "ai_msg") continue;
    const lista = porFuente.get(e.source);
    if (lista) lista.push(e);
    else porFuente.set(e.source, [e]);
  }
  for (const lista of porFuente.values())
    lista.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  const salida: CasoReal[] = [];
  for (const p of preguntas) {
    const lista = porFuente.get(p.source);
    if (!lista) continue;
    // la respuesta: lo primero que dijo la IA después de esta pregunta
    const respuesta = lista.find((e) => e.ts > p.ts && e.texto.trim().length > 60);
    if (!respuesta) continue;
    const oro = respuesta.texto.trim().slice(0, 300);
    salida.push({
      id: `p${String(salida.length + 1).padStart(3, "0")}`,
      pregunta: p.texto,
      opciones: [{ texto: oro, origen: respuesta.source, score: 1 }],
      oro,
      validado: true, // la evidencia es la sesión: el hilo lo respalda
      evidencia: `la IA respondió esto en ${respuesta.source.split("/").pop() ?? respuesta.source}`,
    });
  }
  return salida;
}

/**
 * Las preguntas CON su hora y su sesión: sin eso no se puede unir una
 * pregunta con la respuesta que dio después (que es el oro).
 */
export function preguntasConHoraDeTranscripcion(
  texto: string,
  source: string
): PreguntaConHora[] {
  const salida: PreguntaConHora[] = [];
  for (const linea of texto.split("\n")) {
    if (!linea.trim()) continue;
    let j: {
      type?: string;
      timestamp?: string;
      message?: { role?: string; content?: unknown };
    };
    try {
      j = JSON.parse(linea) as typeof j;
    } catch {
      continue;
    }
    if (j.type !== "user" || j.message?.role !== "user") continue;
    const c = j.message.content;
    const contenido =
      typeof c === "string"
        ? c
        : Array.isArray(c)
          ? c
              .filter((x) => x && typeof x === "object" && (x as { type?: string }).type === "text")
              .map((x) => String((x as { text?: unknown }).text ?? ""))
              .join(" ")
          : "";
    const t = contenido.trim();
    if (t.length < 12 || t.length > 400) continue;
    if (t.startsWith("<") || t.startsWith("[")) continue;
    if (!j.timestamp) continue;
    salida.push({ texto: t.replace(/\s+/g, " "), ts: j.timestamp, source });
  }
  return salida;
}

/**
 * El oro de verdad: el fragmento del documento que la RESPUESTA cita.
 *
 * La respuesta de la IA suele traer copiado elFragmento del saber (la cita
 * de la nota, la línea del fichero). Ese fragmento es el oro: es el
 * conocimiento, no la conversación. Y está en el Vault, que es donde la
 * mente lo tiene (por eso la mente puede recuperar esa respuesta).
 */
export function oroDesdeLaRespuesta(
  respuesta: string,
  documentos: { id: string; texto: string }[]
): { oro: string; origen: string } | null {
  const r = normalizaParaComparar(respuesta);
  if (!r) return null;
  for (const d of documentos) {
    for (const trozo of d.texto.split(/\n{1,}/)) {
      const t = trozo.trim();
      if (t.length < 40 || t.length > 400) continue;
      const ventana = normalizaParaComparar(t).slice(0, 60);
      if (!ventana) continue;
      if (r.includes(ventana)) return { oro: t.slice(0, 300), origen: d.id };
    }
  }
  return null;
}

/* ————————————————————————————————————————————————————————————————
 * El banco del saber propio: las preguntas que están ESCRITAS en las notas
 * del usuario y el fragmento de esa misma nota que las responde.
 *
 * Por qué esto mide de verdad: el oro sale de la nota (un hecho del
 * documento) y la pregunta sale de la misma nota. El recuperador que se mide
 * es OTRO distinto (el recall semántico del cerebro, sobre todas las
 * memorias). Nada se puntúa contra sí mismo.
 * ———————————————————————————————————————————————————————————————— */

/** Una nota de la mente: sus trozos (los recuerdos) y su texto. */
export interface NotaMente {
  source: string;
  trozos: { id: string; texto: string; ancla: string }[];
}

/** Las preguntas escritas en un texto (las del usuario, en sus notas). */
export function preguntasDeNota(texto: string): string[] {
  const salida: string[] = [];
  for (const linea of texto.split("\n")) {
    const t = linea.trim();
    if (t.length < 15 || t.length > 200) continue;
    if (!/[?¿]/.test(t)) continue;
    if (t.startsWith("|") || t.startsWith("```")) continue;
    if (/^https?:/i.test(t)) continue;
    salida.push(t.replace(/\s+/g, " "));
  }
  return [...new Set(salida)];
}

/**
 * Los casos del saber propio: por cada pregunta escrita en una nota, el
 * trozo de esa nota que mejor la responde (el de más palabras en común).
 */
export function casosDesdeNotas(notas: NotaMente[]): CasoReal[] {
  const salida: CasoReal[] = [];
  for (const nota of notas) {
    const texto = nota.trozos.map((t) => t.texto).join("\n");
    for (const pregunta of preguntasDeNota(texto)) {
      // dónde está la pregunta (en qué trozo de la nota)
      const clave = normalizaParaComparar(pregunta).slice(0, 40);
      const idx = nota.trozos.findIndex((t) => normalizaParaComparar(t.texto).includes(clave));
      if (idx < 0) continue;
      // la respuesta: lo que va DESPUÉS en la nota (una pregunta escrita
      // en tus notas se responde en la línea siguiente)
      const candidatos = nota.trozos.slice(idx + 1, idx + 3);
      let mejor: { trozo: NotaMente["trozos"][number]; score: number } | null = null;
      for (const t of candidatos) {
        const sc = respuestaDe(pregunta, t.texto);
        if (sc > 0 && (!mejor || sc > mejor.score)) mejor = { trozo: t, score: sc };
      }
      if (!mejor) continue;
      const oro = mejor.trozo.texto.trim().slice(0, 300);
      if (oro.length < 40) continue;
      salida.push({
        id: `n${String(salida.length + 1).padStart(3, "0")}`,
        pregunta,
        opciones: [{ texto: oro, origen: mejor.trozo.id, score: Number(mejor.score.toFixed(3)) }],
        oro,
        validado: true, // la nota es la evidencia: la pregunta y el oro son suyos
        evidencia: `escrita en ${nota.source.split("/").pop() ?? nota.source}`,
      });
    }
  }
  return salida;
}

/* ————————————————————————————————————————————————————————————————
 * Los dos bancos, y lo que mide cada uno:
 *
 *   "saber"   : la pregunta del usuario + el fragmento de la nota que la IA
 *               leyó después. Mide el RECALL: ¿la mente encuentra el saber?
 *   "sesión"  : la pregunta del usuario + la respuesta que la IA dio después.
 *               Mide la HERENCIA: ¿la mente recuerda dónde lo dejamos?
 *
 * Los dos son reales y los dos se miden por separado (mezclarlos daría un
 * número sin significado).
 * ———————————————————————————————————————————————————————————————— */

/** Qué mide un caso: el saber (la nota) o la sesión (la respuesta). */
export type TipoCaso = "saber" | "sesion";

/** El caso con su tipo (para medir por separado). */
export interface CasoMedible extends CasoReal {
  tipo: TipoCaso;
}

/** El resultado de la medición real, por tipo. */
export interface ResultadoReal {
  saber: { aciertos: number; casos: number };
  sesion: { aciertos: number; casos: number };
}

/** Mide el banco contra lo que respondió la mente, por tipo. */
export function resumeReal(
  banco: BancoReal,
  respuestas: Map<string, { acierto: boolean; tokens: number }>
): ResultadoReal {
  const saber = banco.casos.filter((c) => (c as CasoMedible).tipo === "saber");
  const sesion = banco.casos.filter((c) => (c as CasoMedible).tipo === "sesion");
  const cuenta = (casos: CasoReal[]) => {
    const conRespuesta = casos.filter((c) => respuestas.has(c.id));
    return {
      aciertos: conRespuesta.filter((c) => respuestas.get(c.id)?.acierto).length,
      casos: conRespuesta.length,
    };
  };
  return { saber: cuenta(saber), sesion: cuenta(sesion) };
}
