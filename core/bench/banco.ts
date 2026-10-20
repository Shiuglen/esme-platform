/**
 * banco — el banco REAL de la Prueba 0.
 *
 * La constitution (docs/PRUEBA-0.md) lo dice: las preguntas son las que el
 * usuario hizo a las IAs, y la respuesta correcta la valida el humano
 * («valida el oro rápidamente»). Por eso el banco NO decide: el constructor
 * PROPONE cinco candidatos por pregunta y el humano elige uno (o ninguno).
 *
 * El ORO se identifica por TEXTO, no por id de trozo: así el mismo caso vale
 * para los dos mundos (el documento entero y el troceado por filas) y la
 * comparación es honesta.
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

/** Un candidato propuesto para el oro (lo elige el humano). */
export interface OpcionOro {
  texto: string;
  origen: string;
  score: number;
}

export interface CasoReal {
  id: string;
  pregunta: string;
  /** Lo que el constructor propone (para que el humano elija). */
  opciones: OpcionOro[];
  /** El trozo que el humano eligió (vacío = caso descartado). */
  oro: string;
  /** El humano lo validó: sin esto, el caso no cuenta. */
  validado: boolean;
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

/* ————————————————————————————————————————————————————————————
 * Lo puro del banco: cómo se sacan las preguntas de una transcripción,
 * qué palabras cuentan y qué candidatos se proponen para el oro.
 * (El CLI vive en scripts/banco.ts: aquí no hay ni ficheros ni consola.)
 * ———————————————————————————————————————————————————————————— */

/**
 * Las preguntas del usuario: lo que le dijo a las IAs.
 *
 * No son solo las que acaban en interrogación: la mayoría son ENUNCIADOS
 * («ayudame con eso», «ok puedes analizarla toda»). Lo que se descarta es el
 * ruido: los recordatorios del sistema, las interrupciones, las imágenes y
 * los avisos de la herramienta.
 */
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

/** Las palabras que cuentan: las largas y con contenido (las cortas no). */
const RUIDO = new Set([
  "que", "como", "para", "por", "con", "una", "uno", "esta", "este", "todo", "todos",
  "pero", "mas", "muy", "hay", "esta", "cuando", "donde", "porque", "puedes", "puede",
  "hace", "hacer", "quiero", "tengo", "cosa", "cosas", "sabes", "saber", "ves",
]);
const palabrasQueCuentan = (pregunta: string): string[] =>
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
  max = 5
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
      if (s < 0.18) continue;
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
