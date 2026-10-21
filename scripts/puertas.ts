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
import { creaModulo } from "./crear-modulo.ts";
import { verificaModulo } from "./verificar-modulo.ts";
import { publicaModulo } from "./publicar-modulo.ts";
import { juzgaAgenteDeModulo, juzgaAgente } from "./estandar/agente-check.ts";
import { juzgaPielDeModulo } from "./estandar/piel-check.ts";
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
import { construyeModulo } from "./construir-modulos.ts";

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

await puerta("cambios (el diff de verdad)", async () => {
  const dir = casa();
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

await puerta("puntos (el estado de tu PC, medido)", async () => {
  const lista = puntos({ pids: [process.pid] });
  if (!lista.length) throw new Error("no se midió nada");
  if (lista[0].memoria_mb === null) throw new Error("no se midió la memoria");
  return `${lista[0].memoria_mb} MiB (pid ${lista[0].pid})`;
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
