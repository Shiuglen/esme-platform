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
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  correBanco,
  validaBanco,
  opcionesDeOro,
  preguntasDeTranscripcion,
  proyectoDeTranscripcion,
  nombreDeProyecto,
  type BancoReal,
  type CasoReal,
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

/** Construye el banco propuesto. */
export function construyeBanco(maxCasos = 40): BancoReal {
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
  const preguntas: { texto: string; proyecto: string }[] = [];
  for (const f of transcriptores()) {
    try {
      const texto = readFileSync(f, "utf8");
      const proyecto = nombreDeProyecto(proyectoDeTranscripcion(texto));
      for (const q of preguntasDeTranscripcion(texto)) preguntas.push({ texto: q, proyecto });
    } catch {
      /* un jsonl roto no para el banco */
    }
  }
  const casos: CasoReal[] = [];
  const vistas = new Set<string>();
  for (const p of preguntas) {
    if (casos.length >= maxCasos) break;
    if (vistas.has(p.texto)) continue;
    // primero el proyecto de la sesión; si no hay nada, cualquier documento
    const opciones = opcionesDeOro(p.texto, documentos, p.proyecto);
    const sueltas = opciones.length ? opciones : opcionesDeOro(p.texto, documentos);
    if (!sueltas.length) continue;
    vistas.add(p.texto);
    casos.push({
      id: `p${String(casos.length + 1).padStart(3, "0")}`,
      pregunta: p.texto,
      opciones: sueltas,
      oro: "", // lo elige el humano
      validado: false,
    });
  }
  return { version: 1, creado: new Date().toISOString(), documentos, casos };
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
