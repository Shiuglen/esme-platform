/**
 * IMPORTAR UNA SESIÓN DE CLAUDE CODE — su `.jsonl`, hecho registro de Esme.
 *
 * Lo que se prueba, con tres sesiones sintéticas escritas a mano
 * (tests/fixtures/sesiones/claude-code/: ninguna es de nadie) y con líneas
 * sueltas para los casos raros:
 *
 *   1. el registro que sale verifica, empieza con un `dueno` que dice de
 *      dónde viene (`origen: "claude-code"`) y se reproduce en sus turnos: lo
 *      que pidió la persona, lo que pensó y dijo el motor, sus herramientas
 *      (con su clase, sus rutas, su diff y su error), el plan de TodoWrite y
 *      el `fin` de cada turno; la traza del Taller sale de él igual;
 *   2. el uso se cuenta una vez por mensaje (Claude Code lo repite en cada
 *      línea del mismo mensaje), con la caché aparte, y el `uso` va acumulado;
 *   3. la sesión es el hilo que acaba en el último mensaje: lo que quedó al
 *      rebobinar, las ramas de los subagentes y lo repetido no entran, el
 *      informe lo cuenta, y el hilo cruza las compactaciones;
 *   4. lo que la persona escribe con el turno en marcha lo corrige; pulsar
 *      Esc lo para; un error de la API con reintento es un `reintento`; un
 *      aviso que compuso el sistema abre turno, pero no corta uno en marcha;
 *   5. lo raro no rompe nada (líneas rotas, mensajes sintéticos, resultados
 *      sin llamada), y lo mismo da siempre lo mismo.
 *
 * Referencia: core/sesiones/claude-code.ts, estandar/sesion.spec.yaml (dueno: `origen`).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { importarClaudeCode, ORIGEN_CLAUDE_CODE } from "../core/sesiones/claude-code.ts";
import { compactar } from "../core/sesiones/compactar.ts";
import { estadoDe } from "../core/sesiones/reductor.ts";
import { leer, sinSobre } from "../core/sesiones/registro.ts";
import { trazaDe } from "../core/sesiones/traza.ts";

const fixture = (nombre: string) => readFileSync(new URL(`./fixtures/sesiones/claude-code/${nombre}`, import.meta.url), "utf8");
const hora = (iso: string) => Date.parse(iso);
const importa = (jsonl: string, sesion?: string) => importarClaudeCode(jsonl, { de: "pc", ...(sesion ? { sesion } : {}) });
const eventosDe = (texto: string) => leer(texto).eventos.map(sinSobre);

const modelo = (actual: string, ...valores: string[]) => ({
  tipo: "opciones",
  opciones: [{ id: "modelo", nombre: "Modelo", actual, valores: (valores.length ? valores : [actual]).map((v) => ({ id: v, nombre: v })) }],
});

describe("una sesión con sus turnos", () => {
  const imp = importa(fixture("turnos.jsonl"));
  const l = leer(imp.texto);
  const t = (s: string) => hora(`2026-03-02T${s}Z`);

  it("sale un registro que verifica, de la sesión de Claude Code, con su dueño", () => {
    expect(l.valida).toBe(true);
    expect(l.formato).toBe(2);
    expect(imp.sesion).toBe("cc-sintetica-1");
    expect(l.eventos[0]).toMatchObject({ tipo: "dueno", n: 0, epoca: 1, de: "pc", sesion: "cc-sintetica-1", origen: ORIGEN_CLAUDE_CODE });
    expect(imp.cadena).toEqual(l.cadena);
  });

  it("cada cosa en su evento, en el orden del hilo", () => {
    const sitio = "/proyecto/src/reloj.ts";
    expect(eventosDe(imp.texto)).toEqual([
      { tipo: "dueno", sesion: "cc-sintetica-1", origen: "claude-code", ts: t("10:00:00.000") },
      { tipo: "orden", que: "mensaje", texto: "El reloj del panel va una hora tarde. ¿Lo miras?", ts: t("10:00:00.000") },
      { ...modelo("claude-sintetico-1"), ts: t("10:00:02.000") },
      { tipo: "pensamiento", texto: "Primero miro dónde se calcula la hora.", ts: t("10:00:02.000") },
      { tipo: "texto", texto: "Voy a leer el reloj.", ts: t("10:00:03.000") },
      { tipo: "herramienta", id: "toolu_01", titulo: `Read ${sitio}`, estado: "pending", clase: "read", nombre: "Read", rutas: [sitio], ts: t("10:00:04.000") },
      { tipo: "herramienta", id: "toolu_01", estado: "completed", ts: t("10:00:05.000") },
      {
        tipo: "herramienta",
        id: "toolu_02",
        titulo: `Edit ${sitio}`,
        estado: "pending",
        clase: "edit",
        nombre: "Edit",
        rutas: [sitio],
        diff: [{ ruta: sitio, antes: "export const desfase = -1;", despues: "export const desfase = 0;" }],
        ts: t("10:00:07.000"),
      },
      { tipo: "herramienta", id: "toolu_02", estado: "completed", ts: t("10:00:08.000") },
      { tipo: "herramienta", id: "toolu_03", titulo: "Bash npm test", estado: "pending", clase: "execute", nombre: "Bash", ts: t("10:00:09.000") },
      { tipo: "herramienta", id: "toolu_03", estado: "failed", detalle: "1 prueba falla: alarma.test.ts", ts: t("10:00:12.500") },
      // otro bloque de texto del mismo turno: separado del anterior
      { tipo: "texto", texto: "\n\nArreglado: el desfase era -1. Queda una prueba de la alarma que falla por otra cosa.", ts: t("10:00:14.000") },
      { tipo: "uso", entrada: 19, salida: 115, pensamiento: 6, cacheLectura: 750, cacheEscritura: 250, ts: t("10:00:14.000") },
      { tipo: "fin", motivo: "end_turn", ms: 14_000, tokens: { entrada: 19, salida: 115, pensamiento: 6 }, ts: t("10:00:14.000") },
      { tipo: "orden", que: "mensaje", texto: "Apunta lo que falta en un plan.", ts: t("10:05:00.000") },
      // TodoWrite es el plan, como en ACP: ni herramienta ni resultado
      {
        tipo: "plan",
        pasos: [
          { texto: "Ver la prueba de la alarma", estado: "in_progress" },
          { texto: "Arreglarla", estado: "pending" },
        ],
        ts: t("10:05:02.000"),
      },
      { tipo: "texto", texto: "Hecho: dos pasos, y el primero en marcha.", ts: t("10:05:04.000") },
      // el uso va acumulado; lo de cada turno, en su fin
      { tipo: "uso", entrada: 26, salida: 187, pensamiento: 6, cacheLectura: 1370, cacheEscritura: 250, ts: t("10:05:04.000") },
      { tipo: "fin", motivo: "end_turn", ms: 4_000, tokens: { entrada: 7, salida: 72, pensamiento: 0 }, ts: t("10:05:04.000") },
    ]);
  });

  it("se reproduce en sus turnos, y la traza del Taller sale igual", () => {
    const s = estadoDe(l);
    expect(s).toMatchObject({ sesion: "cc-sintetica-1", bifurca: null, dueno: "pc", uso: { entrada: 26, salida: 187, pensamiento: 6 } });
    expect(s.opciones).toEqual(modelo("claude-sintetico-1").opciones);
    expect(s.turnos.map((x) => [x.pedido, x.respuesta, x.fin?.motivo])).toEqual([
      ["El reloj del panel va una hora tarde. ¿Lo miras?", "Voy a leer el reloj.\n\nArreglado: el desfase era -1. Queda una prueba de la alarma que falla por otra cosa.", "end_turn"],
      ["Apunta lo que falta en un plan.", "Hecho: dos pasos, y el primero en marcha.", "end_turn"],
    ]);
    expect(s.turnos[0].pensamiento).toBe("Primero miro dónde se calcula la hora.");
    expect(s.turnos[0].pasos.map((p) => [p.nombre, p.clase, p.estado])).toEqual([
      ["Read", "read", "completed"],
      ["Edit", "edit", "completed"],
      ["Bash", "execute", "failed"],
    ]);
    expect(s.turnos[1].plan).toHaveLength(2);
    const tr = trazaDe(l);
    expect(tr.turnos).toHaveLength(2);
    expect(tr.porClase.find((c) => c.clase === "execute")).toMatchObject({ veces: 1, fallidas: 1 });
  });

  it("el informe cuenta lo que no entra", () => {
    expect(imp.informe).toEqual({
      lineas: 18,
      rotas: 0,
      hilo: 15,
      fueraDelHilo: 0,
      laterales: 0,
      repetidos: 0,
      aMedias: false,
      empalmes: 0,
      meta: 0,
      resumenes: 0,
      otros: { summary: 1, "file-history-snapshot": 1, "last-prompt": 1, attachment: 1 },
      turnos: 2,
      herramientas: 3,
      sinResultado: 0,
      imagenes: 0,
    });
  });
});

describe("el hilo: rebobinar, subagentes y repetidos", () => {
  const imp = importa(fixture("ramas.jsonl"));
  const l = leer(imp.texto);

  it("la sesión es el hilo que acaba en el último mensaje", () => {
    expect(l.valida).toBe(true);
    const s = estadoDe(l);
    expect(s.turnos.map((x) => [x.pedido, x.respuesta, x.fin?.motivo ?? null])).toEqual([
      ["Escribe un saludo.", "Hola, mundo.", "end_turn"],
      ["Mejor más corto, y busca ideas.", "Hola.", "end_turn"],
      // una orden local (/model): el motor no responde, y el turno no tiene fin
      ["<command-name>/model</command-name>\n            <command-message>model</command-message>\n            <command-args></command-args>", "", null],
      ["[imagen]\n\n¿Y este saludo?", "Es un saludo de mano.", "end_turn"],
    ]);
    // lo que se dejó al rebobinar no está, y el subagente es una herramienta del hilo
    expect(imp.texto).not.toContain("Hello, world.");
    expect(s.turnos[1].pasos).toEqual([{ id: "toolu_01", titulo: "Task Buscar saludos cortos", estado: "completed", clase: "think", nombre: "Task" }]);
    // el modelo cambió: las opciones lo dicen
    expect(s.opciones).toEqual(modelo("claude-sintetico-2", "claude-sintetico-1", "claude-sintetico-2").opciones);
  });

  it("el informe cuenta las ramas, los subagentes, lo repetido y lo oculto", () => {
    expect(imp.informe).toMatchObject({
      lineas: 16,
      hilo: 11,
      fueraDelHilo: 2,
      laterales: 2,
      repetidos: 1,
      meta: 2, // el aviso oculto (isMeta) y la salida de la orden local
      otros: {},
      turnos: 4,
      herramientas: 1,
      imagenes: 1,
    });
  });
});

describe("compactar, corregir, reintentar y parar", () => {
  const imp = importa(fixture("compactada.jsonl"));
  const t = (s: string) => hora(`2026-03-04T${s}Z`);

  it("el hilo cruza la compactación, y el resumen no es de nadie", () => {
    expect(leer(imp.texto).valida).toBe(true);
    expect(eventosDe(imp.texto)).toEqual([
      { tipo: "dueno", sesion: "cc-sintetica-3", origen: "claude-code", ts: t("12:00:00.000") },
      { tipo: "orden", que: "mensaje", texto: "Ordena las fotos por fecha.", ts: t("12:00:00.000") },
      { ...modelo("claude-sintetico-1"), ts: t("12:00:02.000") },
      { tipo: "herramienta", id: "toolu_01", titulo: "Bash ls fotos", estado: "pending", clase: "execute", nombre: "Bash", ts: t("12:00:02.000") },
      // lo que devuelve una orden se queda en su detalle
      { tipo: "herramienta", id: "toolu_01", estado: "completed", detalle: "a.jpg\nb.jpg\nb-copia.jpg", ts: t("12:00:03.000") },
      // escrito con el turno en marcha: lo corrige, no abre otro
      { tipo: "orden", que: "corregir", texto: "Y quita las repetidas.", ts: t("12:00:04.000") },
      { tipo: "reintento", ms: 2000, motivo: "Overloaded", ts: t("12:00:05.000") },
      { tipo: "herramienta", id: "toolu_02", titulo: "Bash rm fotos/b-copia.jpg", estado: "pending", clase: "execute", nombre: "Bash", ts: t("12:00:08.000") },
      { tipo: "herramienta", id: "toolu_02", estado: "completed", ts: t("12:00:09.000") },
      // (aquí se compactó: el resumen es del motor, y el turno sigue)
      { tipo: "texto", texto: "Listo: ordenadas por fecha y sin la repetida.", ts: t("12:00:12.000") },
      { tipo: "uso", entrada: 322, salida: 60, pensamiento: 0, cacheLectura: 100, cacheEscritura: 600, ts: t("12:00:12.000") },
      { tipo: "fin", motivo: "end_turn", ms: 12_000, tokens: { entrada: 322, salida: 60, pensamiento: 0 }, ts: t("12:00:12.000") },
      { tipo: "orden", que: "mensaje", texto: "Súbelas a la nube.", ts: t("12:01:00.000") },
      { tipo: "herramienta", id: "toolu_03", titulo: "Bash rclone copy fotos nube:fotos", estado: "pending", clase: "execute", nombre: "Bash", ts: t("12:01:01.000") },
      {
        tipo: "herramienta",
        id: "toolu_03",
        estado: "failed",
        detalle:
          "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.",
        ts: t("12:01:05.000"),
      },
      // Esc: la persona paró el turno
      { tipo: "orden", que: "parar", ts: t("12:01:05.000") },
      { tipo: "uso", entrada: 327, salida: 78, pensamiento: 0, cacheLectura: 900, cacheEscritura: 600, ts: t("12:01:05.000") },
      { tipo: "fin", motivo: "cancelled", ms: 5_000, tokens: { entrada: 5, salida: 18, pensamiento: 0 }, ts: t("12:01:05.000") },
    ]);
  });

  it("la última línea, cortada a medias, se cuenta y no rompe nada", () => {
    expect(imp.informe).toMatchObject({ lineas: 14, rotas: 1, hilo: 13, resumenes: 1, otros: { "system:compact_boundary": 1 }, turnos: 2, herramientas: 3 });
  });
});

// ---- los casos raros, con líneas sueltas ----

let reloj = Date.parse("2026-03-05T09:00:00.000Z");
const sobre = (uuid: string, padre: string | null, extra: Record<string, unknown> = {}) => ({
  parentUuid: padre,
  isSidechain: false,
  sessionId: "cc-sintetica-4",
  uuid,
  timestamp: new Date((reloj += 1000)).toISOString(),
  ...extra,
});
const persona = (uuid: string, padre: string | null, content: unknown, extra: Record<string, unknown> = {}) => ({
  ...sobre(uuid, padre, extra),
  type: "user",
  message: { role: "user", content },
});
const motor = (uuid: string, padre: string | null, bloques: unknown[], extra: { id?: string; stop?: string; model?: string; usage?: Record<string, number> } = {}, mas: Record<string, unknown> = {}) => ({
  ...sobre(uuid, padre, mas),
  type: "assistant",
  message: {
    id: extra.id ?? `msg-${uuid}`,
    type: "message",
    role: "assistant",
    model: extra.model ?? "claude-sintetico-1",
    content: bloques,
    stop_reason: extra.stop ?? "end_turn",
    usage: extra.usage ?? { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 },
  },
});
const resultado = (uuid: string, padre: string, id: string, content: unknown, error = false) =>
  persona(uuid, padre, [{ type: "tool_result", tool_use_id: id, content, ...(error ? { is_error: true } : {}) }]);
const texto = (t: string) => ({ type: "text", text: t });
const usa = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input });
/** Una compactación: no tiene padre, y apunta a la línea donde se compactó (`logicalParentUuid`), si la apunta. */
const compacta = (uuid: string, logico?: string) => ({
  ...sobre(uuid, null, logico === undefined ? {} : { logicalParentUuid: logico }),
  type: "system",
  subtype: "compact_boundary",
  content: "Conversation compacted",
  compactMetadata: { trigger: "auto", preTokens: 1000 },
});
/** Una línea que no es un mensaje: lo que dejó un hook, lo que llegó a la cola… */
const adjunto = (uuid: string, padre: string | null, attachment: Record<string, unknown>) => ({ ...sobre(uuid, padre), type: "attachment", attachment });
const resumen = (uuid: string, padre: string, extra: Record<string, unknown> = {}) =>
  persona(uuid, padre, "Resumen de lo de antes.", { isCompactSummary: true, isVisibleInTranscriptOnly: true, ...extra });
/** Un aviso que compuso el sistema, con la marca de Claude Code de que abre el turno `turnIndex`. */
const marcado = (uuid: string, padre: string | null, dice: string, turnIndex: number, extra: Record<string, unknown> = {}) =>
  persona(uuid, padre, dice, { promptSource: "system", origin: { kind: "task-notification" }, turnOrigin: "task_notification", turnPosition: { promptIndex: 0, turnIndex }, ...extra });
const jsonl = (lineas: unknown[]) => lineas.map((x) => JSON.stringify(x)).join("\n") + "\n";
/** El estado del registro importado; y los turnos que cuenta el informe tienen que ser los suyos. */
const reproduce = (imp: ReturnType<typeof importa>) => {
  const s = estadoDe(leer(imp.texto));
  expect(imp.informe.turnos).toBe(s.turnos.length);
  return s;
};

describe("los casos raros", () => {
  it("un aviso que compuso el sistema abre turno; con el turno en marcha, no lo corta", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "hola"),
        motor("a1", "u1", [texto("hola")]),
        persona("u2", "a1", "<aviso>la tarea 7 acabó</aviso>", { promptSource: "system" }),
        motor("a2", "u2", [texto("Vista.")]),
        persona("u3", "a2", "lee el registro"),
        motor("a3", "u3", [usa("t1", "Read", { file_path: "registro.txt" })], { stop: "tool_use" }),
        resultado("u4", "a3", "t1", "todo bien"),
        persona("u5", "u4", "<aviso>otra cosa</aviso>", { origin: { kind: "task-notification" } }),
        motor("a4", "u5", [texto("Leído: todo bien.")]),
      ]),
    );
    const s = reproduce(imp);
    expect(s.turnos.map((x) => [x.pedido, x.respuesta])).toEqual([
      ["hola", "hola"],
      ["<aviso>la tarea 7 acabó</aviso>", "Vista."],
      ["lee el registro", "Leído: todo bien."],
    ]);
    // el primero es lo que recibió el motor (un `usuario`), no una orden de la persona
    expect(eventosDe(imp.texto).filter((e) => e.tipo === "usuario").map((e) => (e as { texto: string }).texto)).toEqual(["<aviso>la tarea 7 acabó</aviso>"]);
    expect(imp.informe.meta).toBe(1);
  });

  it("lo que su origen dice que escribió la persona es suyo: abre su turno y, con el turno en marcha, lo corrige", () => {
    // en los ficheros de verdad solo se ha visto `task-notification`; si un día se marca así lo de la persona, no se pierde como un aviso
    const imp = importa(
      jsonl([
        persona("u1", null, "lee a.txt", { origin: { kind: "user" } }),
        motor("a1", "u1", [usa("t1", "Read", { file_path: "a.txt" })], { stop: "tool_use" }),
        resultado("u2", "a1", "t1", "vacío"),
        persona("u3", "u2", "mejor b.txt", { origin: { kind: "user" } }),
        motor("a2", "u3", [texto("Vale.")]),
      ]),
    );
    expect(eventosDe(imp.texto).filter((e) => e.tipo === "orden").map((e) => [(e as { que: string }).que, (e as { texto?: string }).texto])).toEqual([
      ["mensaje", "lee a.txt"],
      ["corregir", "mejor b.txt"],
    ]);
    expect(imp.informe.meta).toBe(0);
  });

  it("los mensajes sintéticos: un error de la API es un fallo; el resto, nada", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "hola"),
        motor("a1", "u1", [texto("API Error: 500 Internal server error")], { model: "<synthetic>" }, { isApiErrorMessage: true }),
        persona("u2", "a1", "¿sigues?"),
        motor("a2", "u2", [texto("No response requested.")], { model: "<synthetic>" }),
        persona("u3", "a2", "hola otra vez"),
        motor("a3", "u3", [texto("Hola.")]),
      ]),
    );
    const s = reproduce(imp);
    expect(s.turnos.map((x) => [x.pedido, x.error, x.respuesta])).toEqual([
      ["hola", "API Error: 500 Internal server error", ""],
      ["¿sigues?", null, ""],
      ["hola otra vez", null, "Hola."],
    ]);
    // el modelo sintético no es un modelo
    expect(s.opciones).toEqual(modelo("claude-sintetico-1").opciones);
    expect(imp.informe.meta).toBe(1);
  });

  it("las ediciones de varios trozos, los ficheros nuevos y las salidas largas", () => {
    const largo = "x".repeat(3000);
    const imp = importa(
      jsonl([
        persona("u1", null, "arregla"),
        motor(
          "a1",
          "u1",
          [
            { type: "redacted_thinking", data: "cifrado" },
            texto("\n\n"),
            usa("t1", "MultiEdit", { file_path: "a.ts", edits: [{ old_string: "uno", new_string: "1" }, { old_string: "dos", new_string: "2" }] }),
            usa("t2", "Write", { file_path: "b.ts", content: "nuevo\n" }),
            usa("t3", "Bash", { command: "yes | head -c 3000\nexit 0" }),
            usa("t4", "mcp__notas__buscar", { consulta: "reloj" }),
          ],
          { stop: "tool_use" },
        ),
        resultado("u2", "a1", "t1", "ok"),
        resultado("u3", "u2", "t2", "ok"),
        resultado("u4", "u3", "t3", largo),
        resultado("u5", "u4", "t4", [{ type: "image", source: { type: "base64", media_type: "image/png", data: "iVBO" } }]),
        motor("a2", "u5", [texto("Corto.")], { stop: "max_tokens" }),
      ]),
    );
    const s = reproduce(imp);
    const pasos = s.turnos[0].pasos;
    expect(pasos[0]).toMatchObject({ titulo: "MultiEdit a.ts", clase: "edit", rutas: ["a.ts"], diff: [{ ruta: "a.ts", antes: "uno", despues: "1" }, { ruta: "a.ts", antes: "dos", despues: "2" }] });
    expect(pasos[1]).toMatchObject({ titulo: "Write b.ts", clase: "edit", rutas: ["b.ts"], diff: [{ ruta: "b.ts", despues: "nuevo\n" }] });
    expect((pasos[1] as { diff: object[] }).diff[0]).not.toHaveProperty("antes");
    // el título es la primera línea de la orden; la salida larga se recorta y lo dice
    expect(pasos[2]).toMatchObject({ titulo: "Bash yes | head -c 3000", clase: "execute" });
    expect((pasos[2] as { detalle: string }).detalle).toHaveLength(1000);
    expect((pasos[2] as { detalle: string }).detalle.endsWith("…")).toBe(true);
    // una herramienta que no se conoce es «other», y su primer campo de texto la nombra
    expect(pasos[3]).toMatchObject({ titulo: "mcp__notas__buscar reloj", clase: "other", estado: "completed" });
    expect(s.turnos[0].fin?.motivo).toBe("max_tokens");
    expect(s.turnos[0].respuesta).toBe("Corto.");
    expect(imp.informe).toMatchObject({ imagenes: 1, otros: { "bloque:redacted_thinking": 1 } });
  });

  it("Esc antes de que el motor diga nada también para el turno, y el aviso de después es otro", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "hazlo"),
        persona("u2", "u1", "[Request interrupted by user]"),
        persona("u3", "u2", "<aviso>listo</aviso>", { promptSource: "system" }),
        motor("a1", "u3", [texto("Visto.")]),
      ]),
    );
    const s = reproduce(imp);
    expect(s.turnos.map((x) => [x.pedido, x.respuesta, x.fin?.motivo ?? null])).toEqual([
      ["hazlo", "", "cancelled"],
      ["<aviso>listo</aviso>", "Visto.", "end_turn"],
    ]);
    // no gastó nada: su fin no dice tokens
    expect(eventosDe(imp.texto).find((e) => e.tipo === "fin")).not.toHaveProperty("tokens");
  });

  it("un error de la API a mitad de turno lo acaba: lo siguiente es otro turno, no una corrección", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "lee"),
        motor("a1", "u1", [usa("t1", "Read", { file_path: "a.txt" })], { stop: "tool_use" }),
        resultado("u2", "a1", "t1", "hola"),
        motor("a2", "u2", [texto("API Error: Connection error.")], { model: "<synthetic>" }, { isApiErrorMessage: true }),
        persona("u3", "a2", "¿sigues?"),
        motor("a3", "u3", [texto("Sí.")]),
      ]),
    );
    const s = reproduce(imp);
    expect(s.turnos.map((x) => [x.pedido, x.error, x.fin?.motivo ?? null])).toEqual([
      ["lee", "API Error: Connection error.", null],
      ["¿sigues?", null, "end_turn"],
    ]);
    // lo que gastó antes del error sí cuenta
    expect(eventosDe(imp.texto).filter((e) => e.tipo === "uso")).toHaveLength(2);
  });

  it("un error se cuenta siempre; una búsqueda no toca ficheros; un título largo se recorta", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "busca y cambia"),
        motor(
          "a1",
          "u1",
          [
            usa("t1", "Grep", { pattern: "hora", path: "src" }),
            usa("t2", "Edit", { file_path: "a.ts", old_string: "x", new_string: "y" }),
            usa("t3", "Bash", { command: `echo ${"y".repeat(300)}` }),
          ],
          { stop: "tool_use" },
        ),
        resultado("u2", "a1", "t1", "src/a.ts"),
        resultado("u3", "u2", "t2", "String to replace not found in file.", true),
        resultado("u4", "u3", "t3", ""),
        motor("a2", "u4", [texto("No pude.")]),
      ]),
    );
    const [busca, edita, orden] = reproduce(imp).turnos[0].pasos;
    // lo que encuentra una búsqueda no es su detalle, y la carpeta donde busca no es un fichero que toque
    expect(busca).toEqual({ id: "t1", titulo: "Grep hora", estado: "completed", clase: "search", nombre: "Grep" });
    expect(edita).toMatchObject({ estado: "failed", detalle: "String to replace not found in file." });
    expect(orden.titulo).toHaveLength(160);
    expect(orden.titulo?.endsWith("…")).toBe(true);
    expect(orden).not.toHaveProperty("detalle"); // una orden que no dijo nada
  });

  it("volver a un modelo no lo repite en las opciones", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "uno"),
        motor("a1", "u1", [texto("1")], { model: "m-1" }),
        persona("u2", "a1", "dos"),
        motor("a2", "u2", [texto("2")], { model: "m-2" }),
        persona("u3", "a2", "tres"),
        motor("a3", "u3", [texto("3")], { model: "m-1" }),
      ]),
    );
    expect(reproduce(imp).opciones).toEqual(modelo("m-1", "m-1", "m-2").opciones);
    expect(eventosDe(imp.texto).filter((e) => e.tipo === "opciones")).toHaveLength(3);
  });

  it("el motivo del fin es el del último mensaje del turno", () => {
    // las versiones viejas no decían en cada línea por qué paró el mensaje
    const ultimo = motor("a2", "u2", [texto("Hecho.")]);
    ultimo.message.stop_reason = null as unknown as string;
    const imp = importa(
      jsonl([
        persona("u1", null, "lee"),
        motor("a1", "u1", [usa("t1", "Read", { file_path: "a.ts" })], { stop: "max_tokens" }),
        resultado("u2", "a1", "t1", "No se pudo leer.", true),
        ultimo,
      ]),
    );
    expect(reproduce(imp).turnos.map((x) => x.fin?.motivo)).toEqual(["end_turn"]);
  });

  it("un resultado que llega después de Esc va con su herramienta, y lo siguiente es otro turno", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "borra"),
        motor("a1", "u1", [usa("t1", "Bash", { command: "rm -r x" })], { stop: "tool_use" }),
        persona("u2", "a1", "[Request interrupted by user for tool use]"),
        resultado("u3", "u2", "t1", "The user doesn't want to proceed with this tool use.", true),
        persona("u4", "u3", "mejor no"),
        motor("a2", "u4", [texto("Vale.")]),
      ]),
    );
    const s = reproduce(imp);
    expect(s.turnos.map((x) => [x.pedido, x.fin?.motivo ?? null])).toEqual([
      ["borra", "cancelled"],
      ["mejor no", "end_turn"],
    ]);
    expect(s.turnos[0].pasos[0]).toMatchObject({ id: "t1", estado: "failed" });
    // su resultado llegó: no es una herramienta sin resultado
    expect(imp.informe.sinResultado).toBe(0);
  });

  it("lo que no se sabe: un aviso justo detrás de una orden local que el motor no contesta va en el turno de esa orden", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "<command-name>/clear</command-name>"),
        persona("u2", "u1", "<aviso>acabó</aviso>", { promptSource: "system" }),
        motor("a1", "u2", [texto("Visto.")]),
      ]),
    );
    expect(reproduce(imp).turnos.map((x) => [x.pedido, x.respuesta])).toEqual([["<command-name>/clear</command-name>", "Visto."]]);
  });

  it("un plan sin su resultado no es una herramienta sin resultado; un ciclo no da vueltas", () => {
    const plan = importa(jsonl([persona("u1", null, "planea"), motor("a1", "u1", [usa("t1", "TodoWrite", { todos: [{ content: "uno", status: "pending" }] })], { stop: "tool_use" })]));
    expect(plan.informe).toMatchObject({ herramientas: 0, sinResultado: 0 });
    // dos líneas que se apuntan la una a la otra (un fichero roto): el hilo acaba donde se repite
    const ciclo = importa(jsonl([persona("u1", "a1", "hola"), motor("a1", "u1", [texto("hola")])]));
    expect(ciclo.informe).toMatchObject({ hilo: 2, aMedias: false });
  });

  it("lo que no cuadra se cuenta y no rompe nada", () => {
    const lineas = [
      persona("u1", "de-otro-fichero", "sigo donde lo dejé"),
      motor("a1", "u1", [texto("Sigo.")]),
      resultado("u2", "a1", "t-que-no-esta", "¿?"),
      persona("u3", "u2", "[Request interrupted by user]"),
      persona("u4", "u3", "otra cosa"),
      motor("a2", "u4", [usa("t1", "Grep", { pattern: "hora" })], { stop: "tool_use" }),
    ];
    const t = jsonl(lineas).replace("\n", "\n{ esto no es json\n");
    const imp = importa(t);
    expect(leer(imp.texto).valida).toBe(true);
    expect(imp.informe).toMatchObject({ rotas: 1, aMedias: true, otros: { "tool_result sin llamada": 1 }, meta: 1, sinResultado: 1 });
    const s = reproduce(imp);
    // el Esc sin turno en marcha no para nada; el último turno se quedó a medias: sin fin
    expect(s.turnos.map((x) => [x.pedido, x.fin?.motivo ?? null])).toEqual([
      ["sigo donde lo dejé", "end_turn"],
      ["otra cosa", null],
    ]);
    expect(s.turnos[1].pasos[0]).toMatchObject({ titulo: "Grep hora", clase: "search", estado: "pending" });
    // pero lo que gastó sí cuenta: el uso acumulado lo lleva
    expect(eventosDe(imp.texto).at(-1)).toMatchObject({ tipo: "uso", entrada: 2, salida: 2 });
  });

  it("sin mensajes no hay sesión; sin su id, hay que darlo; y hace falta quien escribe", () => {
    expect(() => importa("")).toThrow(/ningún mensaje/);
    expect(() => importa(jsonl([{ type: "summary", summary: "nada", leafUuid: "x" }]))).toThrow(/ningún mensaje/);
    const sinId = jsonl([{ ...persona("u1", null, "hola"), sessionId: undefined }]);
    expect(() => importa(sinId)).toThrow(/qué sesión/);
    expect(importa(sinId, "s-nueva").sesion).toBe("s-nueva");
    expect(importa(fixture("turnos.jsonl"), "s-otra").sesion).toBe("s-otra");
    expect(() => importarClaudeCode(fixture("turnos.jsonl"), { de: "" })).toThrow(/aparato/);
  });

  it("los turnos del informe son los que salen al reproducir", () => {
    for (const nombre of ["turnos.jsonl", "ramas.jsonl", "compactada.jsonl"]) {
      const imp = importa(fixture(nombre));
      expect(imp.informe.turnos, nombre).toBe(reproduce(imp).turnos.length);
    }
  });

  it("una compactación cuyo enlace no está en el fichero sigue por la línea de antes, la que enlazan las demás", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "uno"),
        motor("a1", "u1", [texto("Vale.")]),
        // entre medias, lo que no es del hilo: un subagente y una línea sin uuid
        motor("x1", "a1", [texto("Lo de un subagente.")], {}, { isSidechain: true }),
        { type: "last-prompt", lastPrompt: "uno", sessionId: "cc-sintetica-4" },
        compacta("b1", "no-esta"),
        resumen("s1", "b1"),
        persona("u2", "s1", "dos"),
        motor("a2", "u2", [texto("Hecho.")]),
      ]),
    );
    expect(imp.informe).toMatchObject({ lineas: 8, hilo: 6, fueraDelHilo: 0, laterales: 1, aMedias: false, empalmes: 1, resumenes: 1 });
    expect(reproduce(imp).turnos.map((x) => [x.pedido, x.respuesta])).toEqual([
      ["uno", "Vale."],
      ["dos", "Hecho."],
    ]);
    // sin enlace ninguno, lo mismo
    const sinEnlace = importa(jsonl([persona("u1", null, "uno"), motor("a1", "u1", [texto("Vale.")]), compacta("b1"), persona("u2", "b1", "dos"), motor("a2", "u2", [texto("Hecho.")])]));
    expect(sinEnlace.informe).toMatchObject({ hilo: 5, aMedias: false, empalmes: 1 });
    // con el enlace en el fichero no se empalma nada
    const enlazada = importa(jsonl([persona("u1", null, "uno"), motor("a1", "u1", [texto("Vale.")]), compacta("b1", "u1"), persona("u2", "b1", "dos")]));
    expect(enlazada.informe).toMatchObject({ hilo: 3, fueraDelHilo: 1, empalmes: 0 });
    // si es la primera línea del fichero no hay línea de antes: el hilo empieza a medias
    const primera = importa(jsonl([compacta("b1", "no-esta"), persona("u2", "b1", "dos"), motor("a2", "u2", [texto("Hecho.")])]));
    expect(primera.informe).toMatchObject({ hilo: 3, aMedias: true, empalmes: 0 });
    // solo se empalma una compactación: otra línea cuyo padre no está deja el hilo a medias
    const suelta = importa(jsonl([persona("u1", null, "uno"), motor("a1", "u1", [texto("Vale.")]), persona("u2", "no-esta", "dos")]));
    expect(suelta.informe).toMatchObject({ hilo: 1, fueraDelHilo: 2, aMedias: true, empalmes: 0 });
  });

  it("lo que Claude Code marca como el principio de un turno lo abre, aunque el motor deba una respuesta o venga oculto", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "lee el registro"),
        motor("a1", "u1", [usa("t1", "Read", { file_path: "registro.txt" })], { stop: "tool_use" }),
        resultado("u2", "a1", "t1", "todo bien"),
        // el motor debía contestar a su herramienta, pero Claude Code dice que empieza otro turno
        marcado("u3", "u2", "<aviso>la tarea 7 acabó</aviso>", 2),
        motor("a2", "u3", [texto("Visto.")], { stop: "stop_sequence" }),
        // lo que se ve en la conversación es una copia (no la recibe el motor)…
        persona("u4", "a2", "sigue", { isMeta: true, queueTranscriptOnly: true }),
        // …y lo que recibe el motor viene oculto, pero abre el turno
        // (sin más señas: lo oculto no lo escribió la persona)
        marcado("u5", "u4", "sigue", 3, { isMeta: true, turnOrigin: "peer", promptSource: undefined, origin: undefined }),
        motor("a3", "u5", [texto("Sigo.")]),
      ]),
    );
    const s = reproduce(imp);
    expect(s.turnos.map((x) => [x.pedido, x.respuesta, x.fin?.motivo ?? null])).toEqual([
      ["lee el registro", "", "end_turn"],
      ["<aviso>la tarea 7 acabó</aviso>", "Visto.", "end_turn"],
      ["sigue", "Sigo.", "end_turn"],
    ]);
    // los dos son lo que recibió el motor, no órdenes de la persona; la copia no es de nadie
    expect(eventosDe(imp.texto).filter((e) => e.tipo === "usuario").map((e) => (e as { texto: string }).texto)).toEqual(["<aviso>la tarea 7 acabó</aviso>", "sigue"]);
    expect(imp.informe.meta).toBe(1);
  });

  it("con el mismo número de turno sigue en el suyo: el resumen de una compactación, y lo que la persona añade", () => {
    const imp = importa(
      jsonl([
        marcado("u1", null, "<aviso>revisa el PR</aviso>", 1, { turnOrigin: "peer" }),
        motor("a1", "u1", [usa("t1", "Bash", { command: "gh pr view" })], { stop: "tool_use" }),
        compacta("b1", "a1"),
        // el resumen lleva la marca del turno que continúa
        resumen("s1", "b1", { turnOrigin: "peer", turnPosition: { promptIndex: 0, turnIndex: 1 } }),
        resultado("u2", "s1", "t1", "abierto"),
        motor("a2", "u2", [texto("Está abierto.")]),
        // la persona añade algo al mismo turno: lo corrige, aunque el motor ya hubiera contestado
        persona("u3", "a2", "y mira sus pruebas", { turnPosition: { promptIndex: 1, turnIndex: 1 } }),
        motor("a3", "u3", [texto("Pasan.")]),
        persona("u4", "a3", "gracias", { turnPosition: { promptIndex: 0, turnIndex: 2 } }),
        motor("a4", "u4", [texto("De nada.")]),
      ]),
    );
    const s = reproduce(imp);
    expect(s.turnos.map((x) => [x.pedido, x.respuesta])).toEqual([
      ["<aviso>revisa el PR</aviso>", "Está abierto.\n\nPasan."],
      ["gracias", "De nada."],
    ]);
    expect(eventosDe(imp.texto).filter((e) => e.tipo === "orden").map((e) => [(e as { que: string }).que, (e as { texto?: string }).texto])).toEqual([
      ["corregir", "y mira sus pruebas"],
      ["mensaje", "gracias"],
    ]);
    expect(imp.informe).toMatchObject({ resumenes: 1, empalmes: 0 });
  });

  it("las llamadas en paralelo: cada bloque del mensaje y cada resultado cuelgan de su línea, y entran todos", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "lee los dos"),
        // un mensaje con dos llamadas: una línea por bloque, y cada resultado cuelga de su llamada
        motor("a1", "u1", [usa("t1", "Read", { file_path: "a.ts" })], { id: "msg-1", stop: "tool_use" }),
        motor("a2", "a1", [usa("t2", "Read", { file_path: "b.ts" })], { id: "msg-1", stop: "tool_use" }),
        // lo que dejan los hooks también cuelga de lado: no es rebobinar
        adjunto("h1", "a1", { type: "hook_success", hookEvent: "PostToolUse" }),
        adjunto("h2", "h1", { type: "hook_system_message" }),
        resultado("r1", "a1", "t1", "uno"),
        resultado("r2", "a2", "t2", "dos"),
        motor("a3", "r2", [texto("Leídos.")], { id: "msg-2" }),
      ]),
    );
    const s = reproduce(imp);
    expect(s.turnos[0].pasos.map((p) => [p.id, p.estado])).toEqual([
      ["t1", "completed"],
      ["t2", "completed"],
    ]);
    expect(eventosDe(imp.texto).filter((e) => e.tipo === "herramienta").map((e) => [(e as { id: string }).id, (e as { estado: string }).estado])).toEqual([
      ["t1", "pending"],
      ["t2", "pending"],
      ["t1", "completed"],
      ["t2", "completed"],
    ]);
    expect(imp.informe).toMatchObject({ hilo: 6, fueraDelHilo: 0, otros: { attachment: 2 }, herramientas: 2, sinResultado: 0 });
  });

  it("las llamadas en paralelo, al revés: el hilo sigue por el primer resultado, y la otra llamada entra igual", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "busca"),
        motor("a1", "u1", [usa("t1", "Grep", { pattern: "hora" })], { id: "msg-1", stop: "tool_use" }),
        motor("a2", "a1", [usa("t2", "Glob", { pattern: "*.ts" })], { id: "msg-1", stop: "tool_use" }),
        resultado("r1", "a1", "t1", "a.ts"),
        resultado("r2", "a2", "t2", "b.ts"),
        // una respuesta que se dejó (otro mensaje): esa sí se queda fuera, y su resultado con ella
        motor("x1", "a1", [usa("t3", "Bash", { command: "rm a.ts" })], { id: "msg-dejado", stop: "tool_use" }),
        resultado("x2", "x1", "t3", "borrado"),
        // y lo que cuelga del hilo sin ser de sus llamadas, también
        resultado("x3", "a1", "t-de-otra-rama", "?"),
        persona("x4", "a1", []),
        motor("a3", "r1", [texto("Hecho.")], { id: "msg-2" }),
      ]),
    );
    const s = reproduce(imp);
    expect(s.turnos.map((x) => [x.pedido, x.respuesta])).toEqual([["busca", "Hecho."]]);
    expect(s.turnos[0].pasos.map((p) => [p.nombre, p.estado])).toEqual([
      ["Grep", "completed"],
      ["Glob", "completed"],
    ]);
    expect(imp.texto).not.toContain("rm a.ts");
    expect(imp.informe).toMatchObject({ hilo: 6, fueraDelHilo: 4, herramientas: 2, sinResultado: 0, otros: {} });
    // sin el id del mensaje no se sabe si es el mismo: se queda fuera
    const sinId = (x: ReturnType<typeof motor>) => ({ ...x, message: { ...x.message, id: undefined } });
    const viejo = importa(jsonl([persona("u1", null, "hola"), sinId(motor("x1", "u1", [texto("Una.")])), sinId(motor("a1", "u1", [texto("Otra.")]))]));
    expect(viejo.informe).toMatchObject({ hilo: 2, fueraDelHilo: 1 });
  });

  it("lo que llega a la cola con el turno en marcha: lo de la persona lo corrige, y un aviso no lo corta", () => {
    const imp = importa(
      jsonl([
        persona("u1", null, "ordena las fotos"),
        motor("a1", "u1", [usa("t1", "Bash", { command: "ls fotos" })], { stop: "tool_use" }),
        resultado("r1", "a1", "t1", "a.jpg"),
        adjunto("q1", "r1", { type: "queued_command", prompt: "y por nombre" }),
        adjunto("q2", "q1", { type: "queued_command", prompt: "<aviso>la tarea 3 acabó</aviso>", commandMode: "prompt", isMeta: true }),
        // lo que no es un mensaje (una orden de la terminal en la cola) solo se cuenta
        adjunto("q3", "q2", { type: "queued_command", prompt: "ls", commandMode: "bash" }),
        adjunto("q4", "q3", { type: "queued_command", prompt: "  ", commandMode: "prompt" }),
        motor("a2", "q4", [texto("Ordenadas por fecha y por nombre.")]),
      ]),
    );
    const s = reproduce(imp);
    expect(s.turnos.map((x) => [x.pedido, x.respuesta])).toEqual([["ordena las fotos", "Ordenadas por fecha y por nombre."]]);
    expect(eventosDe(imp.texto).filter((e) => e.tipo === "orden")).toEqual([
      expect.objectContaining({ que: "mensaje", texto: "ordena las fotos" }),
      expect.objectContaining({ que: "corregir", texto: "y por nombre" }),
    ]);
    expect(imp.informe).toMatchObject({ meta: 1, otros: { attachment: 2 } });
    // sin un turno abierto, lo de la cola abre uno
    const sola = importa(jsonl([adjunto("q1", null, { type: "queued_command", prompt: "hola" }), motor("a1", "q1", [texto("Hola.")])]));
    expect(reproduce(sola).turnos.map((x) => [x.pedido, x.respuesta])).toEqual([["hola", "Hola."]]);
  });

  it("lo mismo da siempre lo mismo, y se compacta como cualquier registro", () => {
    const a = importa(fixture("turnos.jsonl"));
    const b = importa(fixture("turnos.jsonl"));
    expect(a.texto).toBe(b.texto);
    const c = compactar(leer(a.texto));
    expect(leer(c.texto).valida).toBe(true);
    expect(estadoDe(leer(c.texto)).turnos).toEqual(estadoDe(leer(a.texto)).turnos);
  });
});
