// bench — el ciclo completo en un comando: medir → registrar → empaquetar → firmar → publicar.
//   npm run bench
// Cada módulo tiene SU prueba según lo que promete:
//   memory → el examen del hallazgo del 12-oct (recall base vs. con filas)
//   tool   → el ciclo recall→inject completo de extremo a extremo
// Después empaqueta cada módulo en tarball reproducible, firma los bytes
// (Ed25519), sube entradas al índice, firma el índice y redacta el panel.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash, createPublicKey } from "node:crypto";
import {
  candidatosBase,
  casosBase,
  candidatosCon,
  casosCon,
} from "../core/bench/examen-real.ts";
import { corre, armaBench, veredicto } from "../core/bench/runner.ts";
import { validaCiclo, type BenchCiclo } from "../tienda/bench.ts";
import { empaquetar } from "../tienda/empaque.ts";
import { firmarIndex, firmarBytes, generarPar } from "../tienda/firma.ts";
import { panelDe, render } from "../tienda/panel.ts";

const raiz = resolve(import.meta.dirname, "..");
const escribir = (ruta: string, dato: unknown) =>
  writeFileSync(ruta, JSON.stringify(dato, null, 2) + "\n");

const clavesPem = (): string | null => {
  if (process.env.ESME_PRIV_KEY && existsSync(process.env.ESME_PRIV_KEY))
    return readFileSync(process.env.ESME_PRIV_KEY, "utf8");
  const ruta = join(raiz, ".keys", "index-dev.pem");
  if (existsSync(ruta)) return readFileSync(ruta, "utf8");
  // clon fresco: la dev key nace aquí (la release nunca vive en el repo)
  const par = generarPar();
  mkdirSync(join(raiz, ".keys"), { recursive: true });
  writeFileSync(ruta, par.priv);
  return par.priv;
};

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

// el ciclo de hola-mundo ha de correr de verdad contra una mente de juguete
const { ciclo, MODULO_ID: HOLA_ID } = await import(
  "../modulos/ejemplo-hola-mundo/src/index.ts"
);
const escenarios: ((recordados: string[]) => { id: string }[])[] = [
  // 1. mente vacía: el ciclo no explota
  () => [],
  // 2. mente poblada: el ciclo recuerda y devuelve lo recordado
  () => [{ id: "m-saludo" }, { id: "m-otro" }],
  // 3. mente con historia: devuelve lo primero que hay
  (recordados) => (recordados.length ? [{ id: recordados[0] }] : []),
];
let cicloOk = true;
let tokensSum = 0;
for (const responder of escenarios) {
  try {
    let recordados: string[] = [];
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      const r = ciclo(() => responder(recordados));
      recordados = [...recordados, r.saludo];
      tokensSum += Math.ceil(JSON.stringify(r).length / 4);
    }
  } catch {
    cicloOk = false;
  }
}
const benchHola: BenchCiclo = {
  modulo: HOLA_ID,
  version: "0.1.0",
  fecha: new Date().toISOString().slice(0, 10),
  casos: escenarios.length,
  ciclo_ok: cicloOk,
  tokens_ciclo: tokensSum / (escenarios.length * 2),
};
const veredictoHola = validaCiclo(benchHola);

// ——— 2. EMPAQUETAR: tarball reproducible por módulo ———
const dirPaquetes = join(raiz, "tienda", "paquetes");
const paquetes = [
  empaquetar(join(raiz, "modulos", "ejemplo-hola-mundo"), dirPaquetes),
  empaquetar(join(raiz, "modulos", "ejemplo-troceo-pro"), dirPaquetes),
];

// ——— 3. REGISTRAR Y FIRMAR: bench.json, artefacto.json, índice ———
const priv = clavesPem();
if (priv) {
  // la huella real de la clave: el identificador que revoca o declara
  const pubPem = createPublicKey(priv).export({ type: "spki", format: "pem" }).toString();
  const huella = createHash("sha256").update(pubPem).digest("hex").slice(0, 16);

  escribir(join(raiz, "modulos", "ejemplo-hola-mundo", "bench.json"), benchHola);
  escribir(join(raiz, "modulos", "ejemplo-troceo-pro", "bench.json"), benchPro);

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
    },
    {
      id: benchPro.modulo,
      version: benchPro.version,
      category: "memory",
      bench: benchPro,
      firma_ok: veredictoPro.entra,
      artefacto: { tar: paquetes[1].sha256, bytes: paquetes[1].bytes },
    },
  ];
  for (const e of entradas) {
    const i = indice.modulos.findIndex((m) => m.id === e.id);
    if (i >= 0) indice.modulos[i] = e as { id: string } & Record<string, unknown>;
    else indice.modulos.push(e as { id: string } & Record<string, unknown>);
  }
  // el índice declara SUS claves dentro del cuerpo firmado: el consumidor
  // solo necesita fijar de confianza la raíz, el resto sale de aquí
  indice.claves = { ...((indice.claves as Record<string, string>) ?? {}), [huella]: pubPem };
  escribir(rutaIndice, firmarIndex(indice, priv, huella));
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
console.log(`paquetes   : ${paquetes.map((p) => `${p.sha256.slice(0, 12)}… ${p.bytes}B`).join(" · ")}`);
console.log(`panel      : ${panel.filas.map((f) => `${f.id.split(".").pop()} ${f.entra ? "✓" : "✗"}`).join(" ")}`);
