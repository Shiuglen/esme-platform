/**
 * banco — construye el banco REAL de la Prueba 0 con los datos locales.
 *
 *   npm run banco -- --construir     : propone los casos (el humano aún no ha elegido)
 *   npm run banco -- --validar       : el humano elige el oro, caso a caso
 *   npm run banco -- --medir         : mide el banco validado
 *
 * De dónde sale (todo local, todo privado):
 *   - las preguntas: lo que el usuario preguntó a las IAs (las transcripciones)
 *   - los documentos: su Vault (markdown)
 *   - los candidatos: las frases del Vault que mejor responden a la pregunta
 *
 * El humano elige (es la constitution: «valida el oro rápidamente»): el
 * constructor propone cinco y la persona dice cuál es. El banco vive FUERA
 * del repo (es del usuario): nada de sus preguntas en un repositorio.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  correBanco,
  validaBanco,
  opcionesDeOro,
  preguntasDeTranscripcion,
  proyectoDeTranscripcion,
  nombreDeProyecto,
  evidenciaDeTranscripcion,
  casosDesdeSesion,
  casosDesdeNotas,
  oroDesdeLaRespuesta,
  preguntasConHoraDeTranscripcion,
  type BancoReal,
  type CasoReal,
  type NotaMente,
  type EventoMemoria,
  type OpcionOro,
  type PreguntaConHora,
} from "../core/bench/banco.ts";
import { importaMarkdown } from "../core/mind/importers/markdown.ts";

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const tiene = (flag: string) => process.argv.includes(flag);

// el banco es del usuario: fuera del repo
const RUTA_BANCO = arg("--salida") ?? join(homedir(), ".esme", "prueba0-banco.json");

/** Las transcripciones: los ficheros .jsonl de los proyectos de los motores. */
const transcriptores = (): string[] => {
  const bases = [
    join(homedir(), ".claude", "projects"),
    join(homedir(), ".config", "daimon-app", "motores"),
  ];
  const out: string[] = [];
  const camina = (dir: string, prof: number) => {
    if (prof > 6 || !existsSync(dir)) return;
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) camina(p, prof + 1);
      else if (n.endsWith(".jsonl")) out.push(p);
    }
  };
  for (const b of bases) camina(b, 0);
  return out;
};

/**
 * De dónde salen los documentos: las fuentes que dice la constitution
 * (docs/PRUEBA-0.md). El Vault real del usuario es ~/Documentos/Obsidian; el
 * ~/Vault es el volcado de conocimiento (y su windows_import no es escritura
 * del usuario: es un volcado de otra máquina).
 */
export const FUENTES_DOCUMENTOS = [
  join(homedir(), "Documentos", "Obsidian"),
  join(homedir(), "Sakoi"),
  join(homedir(), "Ingresos"),
  join(homedir(), ".local", "share", "sakoi-research"),
];

/**
 * Las transcripciones son de la OTRA máquina (Windows): sus rutas hay que
 * traducirlas a las de aquí. Lo que no se puede traducir, se descarta (no
 * inventes una ruta).
 */
export function rutaLocal(ruta: string): string | null {
  const r = ruta.replace(/\\/g, "/");
  const casa = process.env.HOME ?? "";
  // si la ruta ya es de aquí (esta máquina), se queda como está
  if (r.startsWith("/") && existsSync(r)) return r;
  const mapear = (prefijo: string, destino: string): string | null =>
    r.toLowerCase().startsWith(prefijo.toLowerCase())
      ? join(destino, r.slice(prefijo.length).replace(/^\//, ""))
      : null;
  return (
    mapear("C:/Users/sifuc/Documents/", join(casa, "Documentos")) ??
    mapear("C:/Users/sifuc/", casa) ??
    mapear("C:/tmp/", casa) ??
    mapear("/mnt/c/Users/sifuc/Documents/", join(casa, "Documentos")) ??
    mapear("/mnt/c/Users/sifuc/", casa) ??
    null
  );
}

/** El hogar de la mente: el mismo que usa la app. */
export function hogarDeLaMente(): string {
  const env = process.env.DAIMON_HOME;
  if (env) return resolve(env);
  return join(homedir(), "Daimon", "data", "mente_v2");
}

/**
 * Los recuerdos de la mente (los trozos que tiene dentro), tal cual: con su
 * hora, su sesión y su origen. Se leen de una COPIA de la base (nunca de la
 * viva) y con el python del cerebro: el kit no habla SQL.
 */
export function recuerdosDeLaMente(): EventoMemoria[] {
  const home = hogarDeLaMente();
  if (!existsSync(join(home, "mem.db"))) return [];
  const python = process.env.DAIMON_PYTHON ?? join(homedir(), "Daimon", ".venv", "bin", "python");
  const codigo = [
    "import sqlite3, json, sys",
    "c = sqlite3.connect(sys.argv[1])",
    "for ts, kind, source, text in c.execute('SELECT ts, kind, source, text FROM events WHERE deleted=0'):",
    "    print(json.dumps({'ts': ts, 'kind': kind, 'source': source, 'texto': text}))",
  ].join("\n");
  const copia = join(mkdtempSync(join(tmpdir(), "banco-mem-")), "mem.db");
  try {
    copyFileSync(join(home, "mem.db"), copia);
    const r = spawnSync(python, ["-c", codigo, copia], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) return [];
    const salida: EventoMemoria[] = [];
    for (const linea of r.stdout.split("\n")) {
      if (!linea.trim()) continue;
      try {
        salida.push(JSON.parse(linea) as EventoMemoria);
      } catch {
        /* una línea rota no para el banco */
      }
    }
    return salida;
  } finally {
    rmSync(copia, { recursive: true, force: true });
  }
}

/**
 * Las notas de la mente: sus recuerdos agrupados por documento, y solo los
 * que son del Vault del usuario (las conversaciones no son su saber escrito).
 */
export function notasDeLaMente(): NotaMente[] {
  const porFuente = new Map<string, NotaMente["trozos"]>();
  for (const e of recuerdosDeLaMente()) {
    if (!/\.md$|Obsidian|Sakoi|Ingresos|sakoi-research/.test(e.source)) continue;
    const id = e.source.split("#")[0];
    const lista = porFuente.get(id);
    const trozo = { id: e.source, texto: e.texto, ancla: e.source.split("#")[1] ?? "" };
    if (lista) lista.push(trozo);
    else porFuente.set(id, [trozo]);
  }
  return [...porFuente.entries()].map(([source, trozos]) => ({ source, trozos }));
}

/**
 * El control: una pregunta cuya respuesta está en la mente (el documento de
 * la Prueba 0), con el oro tomado de ese mismo documento. Si la mente no lo
 * encuentra, el problema es del aparato de medición, no de la mente.
 */
export function controlDeLaMente(): CasoReal | null {
  const notas = notasDeLaMente();
  const nota = notas.find((n) => /prueba.?0/i.test(n.source));
  if (!nota) return null;
  return {
    id: "control",
    pregunta: "¿qué es la Prueba 0?",
    // el oro es LITERAL: comprueba el aparato (que la mente conteste y que la
    // respuesta llegue), no el acierto (que el fragmento sea este u otro)
    opciones: [{ texto: "Prueba 0", origen: nota.source, score: 1 }],
    oro: "Prueba 0",
    validado: true,
    tipo: "saber",
    evidencia: `control: ${nota.source.split("/").pop() ?? nota.source}`,
  };
}

/** Construye el banco propuesto. */
export function construyeBanco(maxCasos = 40): BancoReal {
  // 1. los documentos: las fuentes que dice la constitution
  const documentos: BancoReal["documentos"] = [];
  for (const raizDocs of FUENTES_DOCUMENTOS) {
    if (!existsSync(raizDocs)) continue;
    const r = importaMarkdown(raizDocs, { vaultNombre: raizDocs.split("/").pop() ?? "docs" });
    for (const t of r.trozos) {
      if (t.tipo !== "parrafo" || t.texto.trim().length <= 80) continue;
      if (!tiene("--con-importacion") && /windows_import|\.ai_brain_dump/.test(t.id)) continue;
      documentos.push({ id: t.id, texto: t.texto });
    }
  }

  // 2. las preguntas del usuario y el proyecto de cada sesión
  const preguntas: { texto: string; proyecto: string }[] = [];
  const conHora: PreguntaConHora[] = [];
  // 3. la EVIDENCIA: tras cada pregunta, qué ficheros leyó la IA
  const porEvidencia = new Map<string, string[]>();
  for (const f of transcriptores()) {
    try {
      const texto = readFileSync(f, "utf8");
      const proyecto = nombreDeProyecto(proyectoDeTranscripcion(texto));
      for (const q of preguntasDeTranscripcion(texto)) preguntas.push({ texto: q, proyecto });
      conHora.push(...preguntasConHoraDeTranscripcion(texto, f));
      for (const e of evidenciaDeTranscripcion(texto)) {
        const locales = e.ficheros
          .map(rutaLocal)
          .filter((x): x is string => !!x)
          .filter((x) => existsSync(x));
        if (!locales.length) continue;
        porEvidencia.set(e.pregunta, [...new Set([...(porEvidencia.get(e.pregunta) ?? []), ...locales])]);
      }
    } catch {
      /* un jsonl roto no para el banco */
    }
  }

  // 3-bis. LOS CASOS DE VERDAD: la respuesta que la IA dio a esa pregunta,
  // unida por sesión y hora. El oro sale del hilo, no del recuperador.
  const deLaSesion = casosDesdeSesion(conHora, recuerdosDeLaMente());
  // LAS NOTAS DEL USUARIO: sus preguntas escritas y el fragmento de su nota
  const notas = notasDeLaMente();
  const deLasNotas = casosDesdeNotas(notas);

  // el oro, del saber: el fragmento del documento que la respuesta cita. Si
  // la respuesta no cita nada (conversación), NO hay oro: ese caso no cuenta
  // (lo cuenta el humano, si lo quiere).
  for (const c of deLaSesion) {
    // el oro de la sesión es la RESPUESTA (mide la herencia: ¿la mente
    // recuerda dónde lo dejamos?). Si además cita una nota, esa cita es el
    // oro del saber y el caso mide el recall.
    const cita = oroDesdeLaRespuesta(c.oro, documentos);
    if (cita) {
      c.opciones = [{ texto: cita.oro, origen: cita.origen, score: 1 }];
      c.oro = cita.oro;
      c.tipo = "saber";
    } else {
      c.tipo = "sesion";
    }
  }

  // 4. los casos: primero los que tienen EVIDENCIA (el oro sale del fichero
  // que la IA leyó: un hecho externo, no el recuperador que se va a medir),
  // después los que solo se parecen a algo.
  const propuestas: { pregunta: string; opciones: OpcionOro[]; evidencia?: string; tipo?: string }[] = [];
  const vistas = new Set<string>(); // el bucle decide el tipo: saber > sesion
  const nombreDe = (ruta: string): string =>
    (ruta.split("#")[0].replace(/:\d+$/, "").split("/").pop() ?? "").toLowerCase();

  for (const p of preguntas) {
    if (vistas.has(p.texto)) continue;
    const leidos = porEvidencia.get(p.texto);
    const conRespuesta = deLaSesion.find((c) => c.pregunta === p.texto);
    const conNota = deLasNotas.find((c) => c.pregunta === p.texto);

    // 1. el SABER: la IA leyó un fichero tras la pregunta → el fragmento de
    //    ese fichero es el oro. Mide el RECALL.
    if (leidos?.length) {
      const leidosNombres = new Set(leidos.map(nombreDe));
      const deLosLeidos = documentos.filter((d) => leidosNombres.has(nombreDe(d.id)));
      // el fragmento se puntúa contra la RESPUESTA de la IA (qué entendió al
      // leer ese fichero), no contra la pregunta: la pregunta es vaga y la
      // respuesta dice qué pasó
      const referencia = conRespuesta?.oro ?? p.texto;
      const candidatas = opcionesDeOro(referencia, deLosLeidos, "", 5, 0.05);
      if (candidatas.length) {
        vistas.add(p.texto);
        propuestas.push({
          pregunta: p.texto,
          opciones: candidatas,
          evidencia: `la IA leyó ${leidos.join(", ")}`,
          tipo: "saber",
        });
        continue;
      }
    }

    // 2. la NOTA: la pregunta está escrita en su propia nota → el trozo que
    //    va detrás es el oro. Mide el RECALL.
    if (conNota) {
      vistas.add(p.texto);
      propuestas.push({
        pregunta: p.texto,
        opciones: conNota.opciones,
        evidencia: conNota.evidencia,
        tipo: "saber",
      });
      continue;
    }

    // 3. la SESIÓN: la respuesta que la IA dio después. Mide la HERENCIA
    //    (¿la mente recuerda dónde lo dejamos?).
    if (conRespuesta) {
      vistas.add(p.texto);
      propuestas.push({
        pregunta: p.texto,
        opciones: conRespuesta.opciones,
        evidencia: conRespuesta.evidencia,
        tipo: "sesion",
      });
      continue;
    }

    // 4. sin evidencia: la búsqueda general, por parecido (el humano juzga)
    let opciones = opcionesDeOro(p.texto, documentos, p.proyecto);
    if (!opciones.length) opciones = opcionesDeOro(p.texto, documentos);
    if (!opciones.length) continue;
    vistas.add(p.texto);
    propuestas.push({ pregunta: p.texto, opciones });
  }

  // los que tienen evidencia van primero: son los casos con respaldo
  // las de saber van primero: el recall del saber es la medición de la constitution
  const conOro = propuestas.filter((p) => p.opciones.length > 0);
  conOro.sort((a, b) => {
    // primero los que tienen cita del saber (respuesta real de la IA)
    const conCita = (p: { evidencia?: string; opciones: OpcionOro[] }) =>
      !!p.evidencia && p.evidencia.startsWith("la IA respondió");
    if (conCita(a) !== conCita(b)) return conCita(a) ? -1 : 1;
    return b.opciones[0].score - a.opciones[0].score;
  });

  const deLaSesionIds = new Set(deLaSesion.map((c) => c.pregunta));
  // los casos con cita del saber van primero: son los que la constitution
  // quiere (la respuesta correcta, propuesta desde lo que pasó después)
  if (false) console.error("DEBUG mapas: preguntas", preguntas.length, "evidencia", porEvidencia.size, "sesion", deLaSesion.length, "notas", deLasNotas.length, "memoria", recuerdosDeLaMente().length);
  if (false) console.error("DEBUG conOro:", conOro.length, "tipos:", JSON.stringify(conOro.slice(0,6).map(x=>x.tipo)));
  // EL CONTROL: una pregunta que la mente DEBE acertar (está en su memoria).
  // Si el control falla, el 0 de los demás es del aparato, no de la mente.
  const control = controlDeLaMente();
  if (control) conOro.unshift(control);

  const casos: CasoReal[] = conOro.slice(0, maxCasos).map((p, i) => ({
    id: `p${String(i + 1).padStart(3, "0")}`,
    pregunta: p.pregunta,
    opciones: p.opciones,
    oro: p.opciones[0]?.texto ?? "",
    // con evidencia (nota o respuesta): el caso nace validado
    validado: p.tipo === "saber" || p.tipo === "sesion",
    tipo: (p.tipo as "saber" | "sesion" | undefined) ?? "sesion",
    ...(p.evidencia ? { evidencia: p.evidencia } : {}),
  }));

  // el banco guarda SOLO los documentos que usa: el banco es del usuario y
  // no tiene por qué pesar 7 MB
  const usados = new Set(casos.flatMap((c) => c.opciones.map((o) => o.origen)));
  return {
    version: 1,
    creado: new Date().toISOString(),
    documentos: documentos.filter((d) => usados.has(d.id)),
    casos,
  };
}

const lee = (): BancoReal | null => {
  if (!existsSync(RUTA_BANCO)) return null;
  try {
    return JSON.parse(readFileSync(RUTA_BANCO, "utf8")) as BancoReal;
  } catch {
    return null;
  }
};

const guarda = (banco: BancoReal): void => {
  mkdirSync(resolve(RUTA_BANCO, ".."), { recursive: true });
  writeFileSync(RUTA_BANCO, JSON.stringify(banco, null, 2) + "\n");
};

// ——— qué hacer ———
if (tiene("--construir")) {
  const banco = construyeBanco(Number(arg("--max") ?? 40));
  guarda(banco);
  console.log(`banco     : ${RUTA_BANCO}`);
  console.log(`documentos: ${banco.documentos.length}`);
  console.log(`propuestas: ${banco.casos.length} (el humano elige el oro: --validar)`);
  console.log(`siguiente : npm run banco -- --validar`);
} else if (tiene("--validar")) {
  const banco = lee();
  if (!banco) {
    console.error(`no hay banco en ${RUTA_BANCO} (primero: npm run banco -- --construir)`);
    process.exit(1);
  }
  // sin TTY (o --no-preguntar): se elige la mejor opción y se avisa (el número
  // miente: el oro sin validar no vale como prueba)
  const interactivo = process.stdin.isTTY && !tiene("--no-preguntar");
  if (!interactivo) {
    for (const c of banco.casos) {
      c.oro = c.opciones[0]?.texto ?? "";
      c.validado = !!c.oro;
    }
    guarda(banco);
    console.log(`elegidos  : ${banco.casos.filter((c) => c.validado).length} (a ciegas: el número miente)`);
  } else {
    const rl = await import("node:readline/promises");
    const io = rl.createInterface({ input: process.stdin, output: process.stdout });
    for (const c of banco.casos) {
      console.log(`\n❓ ${c.pregunta}`);
      c.opciones.forEach((o, i) => {
        console.log(`  [${i + 1}] ${o.texto.slice(0, 160).replace(/\n+/g, " ")}`);
        console.log(`      (${o.origen})`);
      });
      const r = await io.question("  ¿cuál responde? (número, o ENTER para descartar) > ");
      const n = Number(r.trim());
      const elegida = Number.isInteger(n) && n >= 1 && n <= c.opciones.length ? c.opciones[n - 1] : null;
      c.oro = elegida?.texto ?? "";
      c.validado = !!elegida;
      console.log(elegida ? "  ✓" : "  — descartado");
    }
    io.close();
    guarda(banco);
    console.log(`\nelegidos  : ${banco.casos.filter((c) => c.validado).length}/${banco.casos.length}`);
  }
} else if (tiene("--medir")) {
  const banco = lee();
  if (!banco) {
    console.error(`no hay banco en ${RUTA_BANCO} (primero: npm run banco -- --construir)`);
    process.exit(1);
  }
  const v = validaBanco(banco);
  if (!v.ok) {
    console.error(`el banco no vale: ${v.errores.join("; ")}`);
    process.exit(1);
  }
  const r = correBanco(banco, { k: 2, budget: 60 });
  if (!r.casos) {
    console.log("casos     : 0 validados — el número sin oro elegido no mide nada (valida primero)");
    process.exit(1);
  }
  console.log(`casos     : ${r.casos} validados`);
  console.log(`base      : recall ${r.base.recall.toFixed(3)} · ${r.base.tokens.toFixed(1)} tokens`);
  console.log(`con módulo: recall ${r.con.recall.toFixed(3)} · ${r.con.tokens.toFixed(1)} tokens`);
  console.log(
    r.con.recall >= r.base.recall
      ? "✓ el módulo no empeora"
      : "✗ el módulo empeora: el número manda"
  );
} else {
  console.log("uso: npm run banco -- --construir | --validar | --medir");
  console.log(`banco: ${RUTA_BANCO} (privado: fuera del repo)`);
}
