// bench — el ciclo completo en un comando: medir → registrar → empaquetar → firmar → publicar.
//   npm run bench
// Cada módulo tiene SU prueba según lo que promete:
//   memory → el examen del hallazgo del 12-oct (recall base vs. con filas)
//   tool   → el ciclo recall→inject completo de extremo a extremo
// Después empaqueta cada módulo en tarball reproducible, firma los bytes
// (Ed25519), sube entradas al índice, firma el índice y redacta el panel.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createPublicKey } from "node:crypto";
import {
  candidatosBase,
  casosBase,
  candidatosCon,
  casosCon,
} from "../core/bench/examen-real.ts";
import { corre, armaBench, veredicto } from "../core/bench/runner.ts";
import { validaCiclo, type BenchCiclo } from "../tienda/bench.ts";
import { claveDeFirma, puedePublicar } from "../tienda/claves.ts";
import { empaquetar } from "../tienda/empaque.ts";
import { firmarIndex, firmarBytes, declaraClave } from "../tienda/firma.ts";
import { panelDe, render } from "../tienda/panel.ts";
import { construyeTodos } from "./construir-modulos.ts";
import { abreHost } from "../core/extension-host/host.ts";

const raiz = resolve(import.meta.dirname, "..");
const escribir = (ruta: string, dato: unknown) =>
  writeFileSync(ruta, JSON.stringify(dato, null, 2) + "\n");

// la llave de esta copia: la de release si el entorno la apunta, si no la dev
// key local (que nace sola si no existe). Ver tienda/claves.ts.
const clave = claveDeFirma();
const priv = clave.priv;
// ¿esta llave tiene derecho a firmar la tienda? (la raíz congelada la avala o
// no la avala). Si no: se mide y se mide, pero la tienda PUBLICADA no se toca.
const publicable = puedePublicar(clave, raiz);

// ——— 0. CONSTRUIR: los módulos se compilan antes de medirse ———
// (sin esto, el bench mide un `dist/` que no existe: el número sale falso)
await construyeTodos();

// ——— 1. MEDIR: memoria (el examen del 12-oct) y herramienta (el ciclo) ———
const base = corre(candidatosBase(), casosBase(), { k: 2, budget: 60 });
const con = corre(candidatosCon(), casosCon(), { k: 2, budget: 60 });
const benchPro = armaBench(
  { modulo: "esme.nucleo.troceo-pro", version: "0.1.0" },
  base,
  con,
  casosBase().length
);
const veredictoPro = veredicto(benchPro);

// el ciclo de hola-mundo ha de correr de verdad contra una mente de juguete.
// Ahora el módulo habla POR LA PUERTA (que es la convención de la casa), así
// que se mide en su worker, como el de la puerta: in proceso no hay puerta.
const HOLA_ID = "esme.nucleo.hola-mundo";
const HOLA_PERMISOS = ["mind:read", "mind:write", "ui:render"];
const menteHola = {
  recall: async (q: string) => [{ id: "r1", texto: `recuerdo de ${q}` }],
  remember: async () => ({ id: "m1" }),
};
const hostHola = abreHost(join(raiz, "modulos", "ejemplo-hola-mundo", "dist", "index.js"), {
  permisos: HOLA_PERMISOS,
  concedidas: HOLA_PERMISOS,
  mente: menteHola,
  id: HOLA_ID,
  version: "0.1.0",
});
const consultasHola = [
  "¿qué se decidió sobre el Taller?",
  "¿qué sabe la mente del taller?",
  "¿qué se dijo de la ventana?",
];
let cicloOk = true;
let tokensSum = 0;
for (const consulta of consultasHola) {
  try {
    const r = await hostHola.call("ciclo", consulta);
    if (!r) {
      cicloOk = false;
      continue;
    }
    tokensSum += Math.ceil(JSON.stringify(r).length / 4);
  } catch {
    cicloOk = false;
  }
}
await hostHola.cerrar();
const benchHola: BenchCiclo = {
  modulo: HOLA_ID,
  version: "0.1.0",
  fecha: new Date().toISOString().slice(0, 10),
  casos: consultasHola.length,
  ciclo_ok: cicloOk,
  tokens_ciclo: tokensSum / consultasHola.length,
};
const veredictoHola = validaCiclo(benchHola);

// el módulo de la puerta no se puede medir en proceso: usa `globalThis.esme`,
// que sólo existe dentro de su worker. Se le abre su puerta de verdad y se le
// habla como se le habla a cualquier módulo.
const PUERTA_ID = "esme.nucleo.puerta";
const PUERTA_PERMISOS = ["mind:read", "mind:write", "ipc:emit", "ui:render", "fs:project"];
const registros: string[] = [];
const menteDePrueba = {
  recall: async (q: string) => [{ id: "r1", texto: `recuerdo de ${q}` }],
  remember: async (t: string) => {
    registros.push(t);
    return { id: `m${registros.length}` };
  },
};
const hostPuerta = abreHost(join(raiz, "modulos", "ejemplo-puerta", "dist", "index.js"), {
  permisos: PUERTA_PERMISOS,
  concedidas: PUERTA_PERMISOS,
  mente: menteDePrueba,
  id: PUERTA_ID,
  version: "0.1.0",
});
let cicloPuertaOk = true;
let tokensPuerta = 0;
const consultasPuerta = [
  "¿qué se decidió sobre el Taller?",
  "¿qué sabe la mente del taller?",
  "¿qué se dijo de la ventana?",
];
for (const consulta of consultasPuerta) {
  try {
    const r = (await hostPuerta.call("demuestra", consulta, "el módulo de la puerta escribe esto")) as {
      recuerdo: string | null;
    };
    // el ciclo está completo si la mente devolvió Y se escribió en ella
    if (!r.recuerdo) cicloPuertaOk = false;
    tokensPuerta += Math.ceil(JSON.stringify(r).length / 4);
  } catch {
    cicloPuertaOk = false;
  }
}
await hostPuerta.cerrar();
const benchPuerta: BenchCiclo = {
  modulo: PUERTA_ID,
  version: "0.1.0",
  fecha: new Date().toISOString().slice(0, 10),
  casos: consultasPuerta.length,
  ciclo_ok: cicloPuertaOk,
  tokens_ciclo: tokensPuerta / consultasPuerta.length,
};
const veredictoPuerta = validaCiclo(benchPuerta);

// ——— 1bis. REGISTRAR LA MEDIDA: el informe se escribe ANTES de empaquetar ———
// El paquete tiene que llevar el informe con el que se midió. Si se
// empaqueta antes de escribirlo, el artefacto publicado lleva el informe de
// la corrida ANTERIOR: lo que se firma no es lo que se midió.
escribir(join(raiz, "modulos", "ejemplo-hola-mundo", "bench.json"), benchHola);
escribir(join(raiz, "modulos", "ejemplo-troceo-pro", "bench.json"), benchPro);
escribir(join(raiz, "modulos", "ejemplo-puerta", "bench.json"), {
  ...benchPuerta,
  sondas: [{ fn: "demuestra", args: ["¿qué se decidió sobre el Taller?", "el módulo de la puerta escribe esto"] }],
});

// ——— 2. EMPAQUETAR: tarball reproducible por módulo ———
// si esta llave no puede publicar, los paquetes se montan en un directorio de
// trabajo: la tienda publicada (tarballs firmados) no se toca de lejos.
const dirPaquetes = publicable.ok
  ? join(raiz, "tienda", "paquetes")
  : join(tmpdir(), "esme-paquetes-sin-derecho");
mkdirSync(dirPaquetes, { recursive: true });
const paquetes = [
  empaquetar(join(raiz, "modulos", "ejemplo-hola-mundo"), dirPaquetes),
  empaquetar(join(raiz, "modulos", "ejemplo-troceo-pro"), dirPaquetes),
  empaquetar(join(raiz, "modulos", "ejemplo-puerta"), dirPaquetes),
];

// ——— 3. REGISTRAR Y FIRMAR: bench.json, artefacto.json, índice ———
if (priv && publicable.ok) {
  // la huella real de la clave: el identificador que revoca o declara
  const pubPem = clave.pub;
  const huella = clave.huella;

  for (const p of paquetes) {
    mkdirSync(join(raiz, "tienda", "firmas"), { recursive: true });
    // la firma vive FUERA del paquete: firmar dentro del dir empaquetado
    // cambiaría el tar, y el nuevo tar pediría otra firma (churn infinito)
    const artefacto = {
      modulo: p.modulo,
      version: p.version,
      tar: p.sha256,
      bytes: p.bytes,
      firmado_en: new Date().toISOString().slice(0, 10),
      firma: firmarBytes(readFileSync(p.ruta), priv, huella),
    };
    escribir(join(raiz, "tienda", "firmas", `${p.modulo}.artefacto.json`), artefacto);
  }

  const rutaIndice = join(raiz, "tienda", "index.json");
  const indice = JSON.parse(readFileSync(rutaIndice, "utf8")) as {
    modulos: Array<{ id: string } & Record<string, unknown>>;
  } & Record<string, unknown>;
  const entradas: Array<Record<string, unknown>> = [
    {
      id: benchHola.modulo,
      version: benchHola.version,
      category: "tool",
      bench_ciclo: benchHola,
      firma_ok: veredictoHola.entra,
      artefacto: { tar: paquetes[0].sha256, bytes: paquetes[0].bytes },
      publicado_por: huella,
      publicado_en: new Date().toISOString().slice(0, 10),
    },
    {
      id: benchPro.modulo,
      version: benchPro.version,
      category: "memory",
      bench: benchPro,
      firma_ok: veredictoPro.entra,
      artefacto: { tar: paquetes[1].sha256, bytes: paquetes[1].bytes },
      publicado_por: huella,
      publicado_en: new Date().toISOString().slice(0, 10),
    },
    {
      id: benchPuerta.modulo,
      version: benchPuerta.version,
      category: "tool",
      bench_ciclo: benchPuerta,
      firma_ok: veredictoPuerta.entra,
      artefacto: { tar: paquetes[2].sha256, bytes: paquetes[2].bytes },
      publicado_por: huella,
      publicado_en: new Date().toISOString().slice(0, 10),
    },
  ];
  for (const e of entradas) {
    const i = indice.modulos.findIndex((m) => m.id === e.id);
    if (i >= 0) indice.modulos[i] = e as { id: string } & Record<string, unknown>;
    else indice.modulos.push(e as { id: string } & Record<string, unknown>);
  }
  // el índice declara SUS claves dentro del cuerpo firmado: el consumidor
  // solo necesita fijar de confianza la raíz, el resto sale de aquí
  const conClaves = declaraClave(indice, pubPem, huella);
  escribir(rutaIndice, firmarIndex(conClaves, priv, huella));
}

// ——— 4. PUBLICAR el panel ———
const indiceFinal = JSON.parse(
  readFileSync(join(raiz, "tienda", "index.json"), "utf8")
) as Record<string, unknown>;
let pubKey: string | undefined;
try {
  if (priv)
    pubKey = createPublicKey(priv).export({ type: "spki", format: "pem" }).toString();
} catch {
  pubKey = undefined;
}
const panel = panelDe(indiceFinal, { pubKey });
writeFileSync(join(raiz, "tienda", "panel.md"), render(panel));

console.log(`memoria    : recall ${base.recall.toFixed(3)} → ${con.recall.toFixed(3)} · ${veredictoPro.entra ? "ENTRA" : "FUERA"} (${veredictoPro.causa})`);
console.log(`herramienta: ${veredictoHola.entra ? "ENTRA" : "FUERA"} — ${veredictoHola.causa}`);
console.log(`la puerta  : ${veredictoPuerta.entra ? "ENTRA" : "FUERA"} — ${veredictoPuerta.causa}`);
console.log(`paquetes   : ${paquetes.map((p) => `${p.sha256.slice(0, 12)}… ${p.bytes}B`).join(" · ")}`);
console.log(
  `publico    : ${publicable.ok ? "SÍ — " + publicable.razon : "NO — " + publicable.razon}`
);
console.log(`panel      : ${panel.filas.map((f) => `${f.id.split(".").pop()} ${f.entra ? "✓" : "✗"}`).join(" ")}`);
