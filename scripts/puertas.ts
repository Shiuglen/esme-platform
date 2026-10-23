/**
 * puertas — todas las puertas de la casa, en una sola carrera.
 *   npm run puertas
 *
 * Lo que hay aquí son muchas puertas: crear y verificar un módulo, publicarlo
 * en el índice firmado, juzgar una skill, medir la compatibilidad con los
 * motores, juzgar una piel, una receta de agente y un bot, medir el ahorro del
 * contexto, ejecutar un turno de verdad, calcular un diff, delegar la
 * publicación, juzgar los deseos y ver lo que aprendió el router.
 *
 * Cada puerta se prueba con material de juguete, en carpetas temporales: si
 * alguna se rompe, esta carrera dice cuál y por qué. Y la CI la corre en cada
 * PR, porque una puerta que no se prueba se pudre (y no te enteras hasta que
 * alguien la usa).
 *
 * Referencia: docs/ENTRADA.md, docs/TIENDA.md.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { creaModulo } from "../tienda/crea.ts";
import { verificaModulo } from "../tienda/verifica.ts";
import { publicaModulo } from "../tienda/publica.ts";
import { juzgaAgenteDeModulo, juzgaAgente } from "../tienda/agente.ts";
import { juzgaPielDeModulo } from "../tienda/piel.ts";
import { validaBot } from "../core/bot.ts";
import { juzgaLocal as juzgaSkillLocal } from "../core/skills/puerta.ts";
import { compatMotores } from "../motores/compat.ts";
import { cargaMotorCached } from "../motores/laya-adapter.ts";
import { comparaModos } from "../core/talamus/modos.ts";
import { ejecutaTurno } from "../core/turnos/ejecuta.ts";
import { instantanea, compara } from "../core/turnos/cambios.ts";
import { crearDelegacion, leerLedger, guardarLedger } from "../tienda/rotacion.ts";
import { juzgaDeseos } from "../core/tienda/deseos.ts";
import { aprendeDe, eligeConAprendido } from "../core/router/aprende.ts";
import { puntos } from "../core/motores/puntos.ts";
import { construyeModulo } from "../tienda/construye.ts";

const raizKit = join(import.meta.dirname, "..");

/** El resultado de una puerta. */
interface Puerta {
  nombre: string;
  ok: boolean;
  detalle: string;
}

const puertas: Puerta[] = [];
const casa = (): string => mkdtempSync(join(tmpdir(), "esme-puertas-"));

/** Corre una puerta y anota el resultado (nunca lanza: un fallo es un dato). */
async function puerta(nombre: string, fn: () => Promise<string> | string): Promise<void> {
  try {
    const detalle = await fn();
    puertas.push({ nombre, ok: true, detalle });
  } catch (e) {
    puertas.push({ nombre, ok: false, detalle: String((e as Error)?.message || e) });
  }
}

// ——— 1. la puerta de los módulos (crear, verificar, publicar) ———
const dirModulo = join(casa(), "mi-modulo");
await puerta("crear:modulo (herramienta)", async () => {
  await creaModulo({ id: "esme.prueba.mi-modulo", nombre: "Mi módulo", dir: dirModulo }, raizKit);
  if (!existsSync(join(dirModulo, "module.yaml"))) throw new Error("no se creó el manifiesto");
  return "manifiesto, código y prueba creados";
});

await puerta("crear:modulo (memoria)", async () => {
  const dir = join(casa(), "mi-memoria");
  await creaModulo(
    { id: "esme.prueba.mi-memoria", nombre: "Mi memoria", categoria: "memory", dir },
    raizKit
  );
  return "con su convención de troceo";
});

await puerta("crear:modulo (tema)", async () => {
  const dir = join(casa(), "mi-tema");
  await creaModulo(
    { id: "esme.prueba.mi-tema", nombre: "Mi tema", categoria: "theme", dir },
    raizKit
  );
  if (!existsSync(join(dir, "piel.json"))) throw new Error("el tema no trae su piel");
  return "con su piel";
});

await puerta("verificar:modulo (entra)", async () => {
  const r = await verificaModulo(dirModulo);
  if (!r.veredicto?.entra) throw new Error(r.veredicto?.causa ?? "no entró");
  return `ENTRA — ${r.veredicto.causa}`;
});

await puerta("verificar:modulo (el que no entra, no entra)", async () => {
  const dir = join(casa(), "roto");
  await creaModulo({ id: "esme.prueba.roto", nombre: "Roto", dir }, raizKit);
  writeFileSync(join(dir, "src", "index.ts"), "export async function ciclo(): Promise<never> { throw new Error('boom'); }\n");
  const r = await verificaModulo(dir);
  if (r.veredicto?.entra) throw new Error("entró un módulo roto");
  return `FUERA — ${r.veredicto?.causa ?? ""}`;
});

await puerta("publicar:modulo (en el índice firmado)", async () => {
  const raiz = casa();
  const tienda = join(raiz, "tienda");
  mkdirSync(join(tienda, "paquetes"), { recursive: true });
  mkdirSync(join(tienda, "firmas"), { recursive: true });
  const { generarPar } = await import("../tienda/firma.ts");
  const clave = generarPar();
  writeFileSync(join(tienda, "raiz.pub.pem"), clave.pub);
  const { firmarIndex } = await import("../tienda/firma.ts");
  writeFileSync(
    join(tienda, "index.json"),
    JSON.stringify(
      firmarIndex({ schema_version: 1, modulos: [] }, clave.priv, clave.huella),
      null,
      2
    ) + "\n"
  );
  const r = await publicaModulo(dirModulo, { tienda, clave });
  if (!r.ok) throw new Error(r.razon ?? "no se publicó");
  const indice = JSON.parse(readFileSync(join(tienda, "index.json"), "utf8")) as {
    modulos: Array<{ id: string }>;
  };
  if (!indice.modulos.find((m) => m.id === "esme.prueba.mi-modulo")) {
    throw new Error("el módulo no llegó al índice");
  }
  return `publicado (${r.firmante})`;
});

// ——— 2. las otras puertas ———
await puerta("verificar:skill", async () => {
  const dir = join(casa(), "mi-skill");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    "---\nname: Mi skill\ndescription: Una skill que hace una cosa y la dice bien.\n---\n\n# Mi skill\n"
  );
  writeFileSync(join(dir, "LICENSE"), "MIT License\n\nPermission is hereby granted, free of charge...\n");
  const v = juzgaSkillLocal(dir, "mi-skill", "Mi skill");
  if (!v.medidas.licencia) throw new Error("no midió la licencia");
  return `medida (${v.medidas.ficheros} ficheros, licencia ${v.medidas.licencia})`;
});

await puerta("compat (qué motores pueden alojarla)", async () => {
  const r = compatMotores(
    { runtime: "nodejs", permisos: ["mind:read"] },
    cargaMotorCached(join(raizKit, "estandar", "motor-capability.spec.yaml"))
  );
  if (!r.some((x) => x.ok)) throw new Error("ningún motor puede alojarla");
  return `${r.filter((x) => x.ok).length} motores pueden`;
});

await puerta("piel:check (el tema trae su piel)", async () => {
  const dir = join(casa(), "tema");
  mkdirSync(dir, { recursive: true });
  const spec = await import("../tienda/piel.ts");
  const { cargaSpecPiel } = spec;
  writeFileSync(
    join(dir, "piel.json"),
    JSON.stringify(cargaSpecPiel(join(raizKit, "estandar", "piel.spec.yaml")).base)
  );
  const v = juzgaPielDeModulo(dir, "theme");
  if (!v.ok) throw new Error(v.errores.join("; "));
  return "la piel de la casa es válida";
});

await puerta("agente:check (la receta del agente)", async () => {
  const v = juzgaAgente({
    id: "esme.prueba.mi-agente",
    nombre: "Mi agente",
    motor: "opencode",
    descripcion: "Un agente que piensa con el motor de la casa y recuerda.",
    memoria: true,
    herramientas: [],
    presupuesto: { tokens: 32000, segundos: 600 },
    encargo: "Piensa lo que te pidan y responde.",
  });
  if (!v.ok) throw new Error(v.errores.join("; "));
  return "la receta es válida";
});

await puerta("bot:check (la puerta del mensajero)", async () => {
  const v = validaBot({
    id: "esme.prueba.mi-bot",
    nombre: "Mi bot",
    canal: "telegram",
    agente: "esme.prueba.mi-agente",
    permisos: ["mind:read"],
    presupuesto: { tokens_por_mensaje: 2000, tokens_por_hora: 60000 },
    voz: "Soy la mente de Esme.",
    escribe: false,
  });
  if (!v.ok) throw new Error(v.errores.join("; "));
  return "el bot entra por la puerta";
});

await puerta("talamo (el ahorro medido)", async () => {
  const { examenMemoria } = await import("../core/bench/memoria.ts");
  const { trocea } = await import("../core/mind/troceo.ts");
  const { DOC, PREGUNTAS } = await import("../core/bench/examen-real.ts");
  const trozos = trocea("doc", DOC);
  const candidatos = trozos.map((t) => ({ id: t.id, texto: t.texto, tokens: t.tokens, score: 0 }));
  // el score es POR CASO (la Lente en vivo): sin puntuar, todo es ruido
  const { conScoreDeCaso } = await import("../core/bench/examen.ts");
  const puntuados = conScoreDeCaso(
    candidatos as never,
    { id: "q", pregunta: PREGUNTAS[0].pregunta, oro: [] } as never
  );
  const r = comparaModos(PREGUNTAS[0].pregunta, puntuados as never);
  if (r.ahorro_pct <= 0) throw new Error("el ahorrador no ahorra");
  return `el ahorrador ahorra ${r.ahorro_pct}%`;
});

await puerta("ejecutar (un turno de verdad)", async () => {
  await construyeModulo(dirModulo);
  const r = await ejecutaTurno({ dirModulo, consulta: "¿qué se decidió sobre el Taller?" });
  if (r.error) throw new Error(r.error);
  if (!r.turno.tokens.total) throw new Error("el turno no midió nada");
  return `${r.turno.tokens.total} tokens, limpieza ${Math.round(r.limpieza * 100)}%`;
});

// ——— la puerta de los programas (la séptima pieza) ———
// La puerta se prueba con lo que la persona concede: un programa, un libro y
// un módulo que lo lance. Sin programa en el libro, la puerta no abre nada.
await puerta("programas (el libro: la persona decide)", async () => {
  const dir = casa();
  const { ProgramasPermitidos, rutaProgramasDe } = await import("../core/modulos/programas.ts");
  const ruta = rutaProgramasDe(join(dir, "consentimientos.json"));
  const libro = new ProgramasPermitidos(ruta);
  const sinDescripcion = libro.agrega({ nombre: "rea", descripcion: "" });
  if (sinDescripcion.ok) throw new Error("se concedió un programa sin descripción");
  const ok = libro.agrega({ nombre: "rea", descripcion: "el motor de ingeniería inversa" });
  if (!ok.ok) throw new Error(ok.error);
  if (!libro.permite("rea")) throw new Error("el programa no quedó en el libro");
  return "un programa concedido (con su descripción)";
});

await puerta("proc:spawn (un módulo lanza un programa)", async () => {
  const dir = casa();
  const modulosDir = join(dir, "modulos");
  mkdirSync(modulosDir, { recursive: true });
  const { modulos } = await import("../core/modulos/api.ts");
  const { leeModulo } = await import("../tienda/modulos.ts");
  const carpeta = join(dir, "modulo");
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(
    join(carpeta, "modulo.mjs"),
    `export async function ciclo() {
       const r = await globalThis.esme.proc.ejecutar({ programa: "node", args: ["-e", "process.stdout.write('x')"] });
       return r.stdout;
     }`,
    "utf8"
  );
  writeFileSync(
    join(carpeta, "module.yaml"),
    `schema_version: 1
id: "esme.prueba.puerta-programas"
name: "Programas"
version: "0.1.0"
category: "tool"
description: "Un módulo de prueba que lanza un programa."
author: "esme@prueba"
license: "MIT"
entry: "modulo.mjs"
runtime: "nodejs"
permissions:
  - proc:spawn
`,
    "utf8"
  );
  const leido = leeModulo(carpeta);
  if (!leido.ok) throw new Error(leido.errores.join("; "));
  const runtime = modulos({
    rutaPermisos: join(modulosDir, "consentimientos.json"),
    rutaLanzamientos: join(modulosDir, "lanzamientos.jsonl"),
    programas: [{ nombre: "node", descripcion: "node, para la prueba" }],
  });
  runtime.registro.registra(leido.modulo!);
  runtime.concede("esme.prueba.puerta-programas", ["proc:spawn"]);
  await runtime.activa("esme.prueba.puerta-programas");
  const r = await runtime.llama("esme.prueba.puerta-programas", "ciclo");
  await runtime.cierra();
  if (r !== "x") throw new Error(`el módulo no recibió la salida del programa (${String(r)})`);
  // y la puerta deja rastro
  const { leeLanzamientos } = await import("../core/modulos/lanzamientos.ts");
  const rastros = leeLanzamientos(join(modulosDir, "lanzamientos.jsonl"));
  if (!rastros.length) throw new Error("la puerta no dejó rastro");
  return `el hijo contestó «${String(r)}» y quedó anotado`;
});

await puerta("cambios (el diff de verdad)", async () => {  const dir = casa();
  writeFileSync(join(dir, "a.txt"), "uno\ndos\n");
  const antes = instantanea(dir);
  writeFileSync(join(dir, "a.txt"), "uno\ndos\ntres\n");
  const despues = instantanea(dir);
  const r = compara(antes, despues);
  const f = r.ficheros.find((x) => x.ruta === "a.txt");
  if (f?.anadidos !== 1) throw new Error(`el diff no cuadra (${String(f?.anadidos)})`);
  return "+1 línea (Myers)";
});

await puerta("delegar (la tienda federada)", async () => {
  const { generarPar } = await import("../tienda/firma.ts");
  const mandante = generarPar();
  const delegado = generarPar();
  const cert = crearDelegacion(mandante.pub, delegado.pub, mandante.priv, "prueba");
  const ruta = join(casa(), "rotaciones.json");
  guardarLedger(ruta, { sucesiones: [], delegaciones: [cert] });
  const leido = leerLedger(ruta);
  if (!leido.delegaciones?.[0]) throw new Error("la delegación no se guardó");
  return `delegada (${cert.delegado.huella.slice(0, 8)}…)`;
});

await puerta("deseos (la lista de deseos)", async () => {
  const v = juzgaDeseos([
    {
      id: "d1",
      url: "https://x.com/alguien/status/1",
      autor: "@alguien",
      texto: "Quiero un panel que muestre la memoria de cada agente.",
      etiquetas: ["puntos"],
      estado: "nuevo",
      ts: 1,
    },
  ]);
  if (!v.ok) throw new Error(v.errores.join("; "));
  return "el deseo entra";
});

await puerta("router (lo aprendido de tus veredictos)", async () => {
  const a = aprendeDe([
    { ts: 1, tarea: "arregla el fallo de la puerta", ruta: "opencode", confianza: 0.7, veredicto: "corregido", ruta_correcta: "claude-code" },
  ]);
  const e = eligeConAprendido("arregla el fallo de la puerta", a, () => "opencode");
  if (e.ruta !== "claude-code" || e.de !== "persona") throw new Error("no mandan los veredictos");
  return "lo aprendido va por delante";
});

await puerta("publicar:deseos (la lista firmada)", async () => {
  const raiz = casa();
  const tienda = join(raiz, "tienda");
  mkdirSync(join(tienda, "paquetes"), { recursive: true });
  mkdirSync(join(tienda, "firmas"), { recursive: true });
  const { generarPar } = await import("../tienda/firma.ts");
  const clave = generarPar();
  writeFileSync(join(tienda, "raiz.pub.pem"), clave.pub);
  const { firmarIndex } = await import("../tienda/firma.ts");
  writeFileSync(
    join(tienda, "index.json"),
    JSON.stringify(firmarIndex({ schema_version: 1, modulos: [] }, clave.priv, clave.huella), null, 2) + "\n"
  );
  const lista = join(tienda, "lista.json");
  writeFileSync(
    lista,
    JSON.stringify([
      {
        id: "esme.deseo.prueba",
        url: "https://x.com/alguien/status/1",
        autor: "@alguien",
        texto: "Quiero que los puntos se puedan ver desde la ventana.",
        etiquetas: ["puntos"],
        estado: "nuevo",
        ts: 1,
      },
    ])
  );
  const { publicaDeseos } = await import("./publicar-deseos.ts");
  const r = publicaDeseos(lista, tienda, clave);
  if (!r.ok) throw new Error(r.razon ?? "no se publicó");
  return `${r.deseos} deseos firmados por ${r.firmante.slice(0, 8)}…`;
});

await puerta("actualizar (el plan de versiones)", async () => {
  const { planDeActualizacion } = await import("../core/modulos/actualiza.ts");
  const plan = planDeActualizacion(
    [{ id: "esme.a", version: "0.1.0", dir: "/tmp/a" }],
    [{ id: "esme.a", version: "0.2.0" }]
  );
  if (plan.actualizaciones.length !== 1) throw new Error("el plan no vio la versión nueva");
  return `ve ${plan.actualizaciones[0].de} → ${plan.actualizaciones[0].a}`;
});

await puerta("doctor (¿está todo bien aquí?)", async () => {
  const { doctorDeLaCasa } = await import("../core/modulos/doctor.ts");
  const e = doctorDeLaCasa({
    instalados: [{ id: "esme.a", version: "0.1.0", dir: "/tmp/a" }],
    pendientes: { "esme.a": ["mind:write"] },
    tienda: [{ id: "esme.a", version: "0.2.0" }],
  });
  if (!e.avisos.some((a) => a.includes("PIDIENDO PALABRA"))) throw new Error("no avisó de los permisos");
  return `${e.avisos.length} avisos`;
});

await puerta("talamo (el plan: lo que no cabe, y por qué)", async () => {
  const { planDeEmpaquete, resumenPlan } = await import("../core/talamus/plan.ts");
  const { examenMemoria } = await import("../core/bench/memoria.ts");
  const { trocea } = await import("../core/mind/troceo.ts");
  const { DOC, PREGUNTAS } = await import("../core/bench/examen-real.ts");
  const { conScoreDeCaso } = await import("../core/bench/examen.ts");
  const trozos = trocea("doc", DOC);
  const base = trozos.map((t) => ({ id: t.id, texto: t.texto, tokens: t.tokens, score: 0 }));
  const puntuados = conScoreDeCaso(
    base as never,
    { id: "q", pregunta: PREGUNTAS[0].pregunta, oro: [] } as never
  ) as never;
  const plan = planDeEmpaquete(PREGUNTAS[0].pregunta, puntuados, 400);
  if (!plan.entra.length) throw new Error("el plan no deja entrar nada");
  if (!plan.quedan.length) throw new Error("el plan no dice qué se quedó fuera");
  return resumenPlan(plan);
});

await puerta("escribe (nada a medias)", async () => {
  const { escribeJsonAtomico } = await import("../core/escribe.ts");
  const dir = join(casa(), "escribe");
  const ruta = join(dir, "indice.json");
  escribeJsonAtomico(ruta, { ok: true });
  const leido = JSON.parse(readFileSync(ruta, "utf8")) as { ok: boolean };
  if (!leido.ok) throw new Error("no se escribió bien");
  return "el fichero queda entero";
});

await puerta("publicar:recursos (el catálogo firmado)", async () => {
  const raiz = casa();
  const tienda = join(raiz, "tienda");
  mkdirSync(join(tienda, "paquetes"), { recursive: true });
  mkdirSync(join(tienda, "firmas"), { recursive: true });
  const { generarPar } = await import("../tienda/firma.ts");
  const clave = generarPar();
  writeFileSync(join(tienda, "raiz.pub.pem"), clave.pub);
  const lista = join(tienda, "lista.json");
  writeFileSync(
    lista,
    JSON.stringify([
      {
        id: "openrig",
        nombre: "OpenRig",
        url: "https://github.com/mvschwarz/openrig",
        tipo: "repo",
        para_que: "Un runtime de agentes cuyos pasos se pueden rastrear y probar.",
        etiquetas: ["traza"],
        licencia: "MIT",
        veredicto: "probado",
      },
    ])
  );
  const { publicaRecursos } = await import("./publicar-recursos.ts");
  const r = publicaRecursos(lista, tienda, clave);
  if (!r.ok) throw new Error(r.razon ?? "no se publicó");
  return `${r.recursos} recursos firmados por ${r.firmante.slice(0, 8)}…`;
});

await puerta("emparejar (qué recursos iluminan cada deseo)", async () => {
  const { empareja } = await import("../core/tienda/recursos.ts");
  const pares = empareja(
    [{ id: "d1", texto: "Saber qué llamada falló en una ejecución", etiquetas: ["traza"] }],
    [
      {
        id: "openrig",
        nombre: "OpenRig",
        url: "https://github.com/mvschwarz/openrig",
        tipo: "repo",
        para_que: "Un runtime de agentes cuyos pasos se pueden rastrear y probar.",
        etiquetas: ["traza"],
        licencia: "MIT",
        veredicto: "probado",
      },
    ]
  );
  if (!pares[0].recursos.length) throw new Error("no emparejó nada");
  return `${pares[0].recursos[0].nombre} (${pares[0].recursos[0].porque})`;
});

await puerta("tienda:busca (lo que hay, ordenado por lo que mejora)", async () => {
  const { buscaEnTienda } = await import("../tienda/busca.ts");
  const { readFileSync } = await import("node:fs");
  const indice = JSON.parse(
    readFileSync(join(raizKit, "tienda", "index.json"), "utf8")
  );
  const lista = buscaEnTienda(indice);
  if (!lista.length) throw new Error("la tienda no devuelve nada");
  return `${lista.length} módulos, el primero ${lista[0].id}`;
});

await puerta("modo-motor (el presupuesto lo pone quien responde)", async () => {
  const { modoParaMotor } = await import("../core/talamus/modo-motor.ts");
  const { cargaMotorCached } = await import("../motores/laya-adapter.ts");
  const motores = cargaMotorCached(join(raizKit, "estandar", "motor-capability.spec.yaml"));
  const local = motores.find((m) => m.id === "local");
  const nube = motores.find((m) => m.id === "opencode");
  if (!local || !nube) throw new Error("faltan motores");
  if (modoParaMotor(local) !== "ahorrador") throw new Error("el local debería ir en ahorrador");
  if (modoParaMotor(nube) !== "estandar") throw new Error("la nube debería ir en estándar");
  return "local → ahorrador · nube → estándar";
});

await puerta("puntos (el estado de tu PC, medido)", async () => {
  const lista = puntos({ pids: [process.pid] });
  if (!lista.length) throw new Error("no se midió nada");
  if (lista[0].memoria_mb === null) throw new Error("no se midió la memoria");
  return `${lista[0].memoria_mb} MiB (pid ${lista[0].pid})`;
});

await puerta("arena (la cata a ciegas: compromiso y revelación)", async () => {
  const { reparteCiego, compromisoDe } = await import("../core/arena/ciego.ts");
  const { juzgaArena, vistaCiega } = await import("../core/arena/arena.ts");
  const sal = "sal-de-puerta";
  const mapa = reparteCiego(["claude-code", "opencode"], sal);
  const ciega = {
    id: "arena-puerta",
    version: 1,
    emitido: new Date().toISOString(),
    tarea: "arregla la puerta",
    categoria: "codigo" as const,
    participantes: [
      { etiqueta: "A", medidas: { ms: 10, tokens: 20, cambios: 1, ok: true } },
      { etiqueta: "B", medidas: { ms: 20, tokens: 30, cambios: 0, ok: true } },
    ],
    compromiso: { algoritmo: "sha256", hash: compromisoDe(mapa, sal) },
  };
  // el ciego no enseña a nadie
  const vista = vistaCiega(ciega);
  if (JSON.stringify(vista).includes("claude-code")) throw new Error("la vista ciega delató a alguien");
  // se revela: el compromiso verifica
  const revelada = {
    ...ciega,
    veredicto: { elegida: "A" },
    revelacion: { sal, fichas: { A: { motor: mapa.A }, B: { motor: mapa.B } } },
  };
  const juicio = juzgaArena(revelada);
  if (!juicio.ok || juicio.integridad !== "limpia") {
    throw new Error(`la arena no quedó limpia: ${juicio.errores.join("; ")}`);
  }
  // y si el mapa se cambia, la arena se contaminated
  const sucia = {
    ...revelada,
    revelacion: { sal, fichas: { A: { motor: mapa.B }, B: { motor: mapa.A } } },
  };
  if (juzgaArena(sucia).integridad !== "contaminada") {
    throw new Error("el mapa cambiado no se/contaminó");
  }
  return `ciega, revelada y contaminada (que es lo que hay que ver)`;
});

await puerta("arena (el paladar sólo cuenta catas limpias)", async () => {
  const { compromisoDe } = await import("../core/arena/ciego.ts");
  const { agregaPaladar, proponePaladar, MINIMO_CATAS } = await import("../core/arena/paladar.ts");
  const sal = "sal-de-puerta";
  const mapa = { A: "claude-code", B: "opencode" };
  const cata = (id: string) => ({
    id,
    version: 1,
    emitido: new Date().toISOString(),
    tarea: "arregla la puerta",
    categoria: "pruebas" as const,
    participantes: [
      { etiqueta: "A", medidas: { ms: 10, tokens: 20, cambios: 1, ok: true } },
      { etiqueta: "B", medidas: { ms: 20, tokens: 30, cambios: 0, ok: true } },
    ],
    compromiso: { algoritmo: "sha256", hash: compromisoDe(mapa, sal) },
    veredicto: { elegida: "A" },
    revelacion: { sal, fichas: { A: { motor: "claude-code" }, B: { motor: "opencode" } } },
  });
  const paladar = agregaPaladar([cata("a1"), cata("a2"), cata("a3")]);
  const p = proponePaladar(paladar, "pruebas");
  if (!p || p.motor !== "claude-code") throw new Error("el paladar no propuso con catas de sobra");
  if (p.catas < MINIMO_CATAS) throw new Error("propuso sin catas de sobra");
  // con dos catas no propone
  if (proponePaladar(agregaPaladar([cata("b1"), cata("b2")]), "pruebas")) {
    throw new Error("propuso con pocas catas");
  }
  return `pruebas → ${p.motor} (${p.ganadas}/${p.catas})`;
});

await puerta("arena → router (el paladar llega al router)", async () => {
  const { compromisoDe } = await import("../core/arena/ciego.ts");
  const { aprendeDe, eligeConAprendido } = await import("../core/router/aprende.ts");
  const sal = "sal-de-puerta";
  const mapa = { A: "qwen", B: "claude-code" };
  const cata = (id: string) => ({
    id,
    version: 1,
    emitido: new Date().toISOString(),
    tarea: "arregla las pruebas",
    categoria: "pruebas" as const,
    participantes: [
      { etiqueta: "A", medidas: { ms: 10, tokens: 20, cambios: 1, ok: true } },
      { etiqueta: "B", medidas: { ms: 20, tokens: 30, cambios: 0, ok: true } },
    ],
    compromiso: { algoritmo: "sha256", hash: compromisoDe(mapa, sal) },
    veredicto: { elegida: "A" },
    revelacion: { sal, fichas: { A: { motor: "qwen" }, B: { motor: "claude-code" } } },
  });
  const aprendido = aprendeDe([], { arenas: [cata("a1"), cata("a2"), cata("a3")] });
  if (!aprendido.paladar?.pruebas) throw new Error("el router no aprendió el paladar");
  const eleccion = eligeConAprendido("arregla las pruebas", aprendido, () => "laya", "pruebas");
  if (eleccion.de !== "paladar" || eleccion.ruta !== "qwen") {
    throw new Error("el router no mandó el paladar por delante");
  }
  return `pruebas → ${eleccion.ruta} (${eleccion.de})`;
});

// ——— el resultado ———
const fallos = puertas.filter((p) => !p.ok);
for (const p of puertas) {
  console.log(`${p.ok ? "✓" : "✗"} ${p.nombre.padEnd(42)} ${p.detalle}`);
}
console.log("");
console.log(
  `${puertas.length - fallos.length}/${puertas.length} puertas en pie${fallos.length ? ` — fallan: ${fallos.map((f) => f.nombre).join(", ")}` : ""}`
);
process.exit(fallos.length ? 1 : 0);
