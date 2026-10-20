// bench — el ciclo completo en un comando: medir → registrar → firmar → publicar.
//   npm run bench
// Mide el troceo-viejo vs. el troceo-de-filas con el examen real del 12-oct,
// arma el bench.json, lo escribe en el módulo, lo sube al índice, re-firma y
// redacta el panel con el veredicto (entra o fuera con la causa).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { resolve, join } from "node:path";
import { candidatosBase, casosBase, candidatosCon, casosCon } from "../core/bench/examen-real.ts";
import { corre, armaBench, veredicto } from "../core/bench/runner.ts";
import { firmarIndex } from "../tienda/firma.ts";
import { panelDe, render } from "../tienda/panel.ts";

const raiz = resolve(import.meta.dirname, "..");

// 1. MEDIR (determinista: dos veces para demostrar que es estable)
const base = corre(candidatosBase(), casosBase(), { k: 2, budget: 60 });
const con = corre(candidatosCon(), casosCon(), { k: 2, budget: 60 });
const bench = armaBench(
  { modulo: "esme.nucleo.troceo-pro", version: "0.1.0" },
  base,
  con,
  casosBase().length
);
const veredictoEntrada = veredicto(bench);

// 2. REGISTRAR: bench.json en el módulo + entrada en el índice de la tienda
const moduloBench = join(raiz, "modulos", "ejemplo-hola-mundo", "..", "ejemplo-troceo-pro", "bench.json");
void moduloBench;
const rutaBench = join(raiz, "modulos", "ejemplo-troceo-pro", "bench.json");
if (existsSync(join(raiz, "modulos", "ejemplo-troceo-pro"))) {
  writeFileSync(rutaBench, JSON.stringify(bench, null, 2) + "\n");
}

const rutaIndice = join(raiz, "tienda", "index.json");
const indice = JSON.parse(readFileSync(rutaIndice, "utf8")) as Record<string, unknown> & { modulos: unknown[] };
const ya = (indice.modulos as { id: string }[]).findIndex((m) => m.id === bench.modulo);
const entrada = { id: bench.modulo, version: bench.version, bench, firma_ok: veredictoEntrada.entra, published_at: bench.fecha };
if (ya >= 0) (indice.modulos as unknown[])[ya] = entrada;
else (indice.modulos as unknown[]).push(entrada);

// 3. FIRMAR con la clave disponible (release en env, dev en .keys/)
let priv: string | null = null;
if (process.env.ESME_PRIV_KEY && existsSync(process.env.ESME_PRIV_KEY))
  priv = readFileSync(process.env.ESME_PRIV_KEY, "utf8");
else if (existsSync(join(raiz, ".keys", "index-dev.pem")))
  priv = readFileSync(join(raiz, ".keys", "index-dev.pem"), "utf8");
let firmadoCon = "sin clave (índice queda sin firmar)";
if (priv) {
  const firmado = firmarIndex(indice, priv, "esme@bench");
  writeFileSync(rutaIndice, JSON.stringify(firmado, null, 2) + "\n");
  firmadoCon = "firma aplicada";
}

// 4. PUBLICAR el panel con la verificación de la clave pública
let pubKey: string | undefined;
try {
  if (priv) pubKey = createPublicKey(priv).export({ type: "spki", format: "pem" }).toString();
} catch {
  pubKey = undefined;
}
const panel = panelDe(indice, { pubKey });
writeFileSync(join(raiz, "tienda", "panel.md"), render(panel));

console.log(`base     : recall ${base.recall.toFixed(3)} | tokens/caso ${base.tokens.toFixed(1)}`);
console.log(`módulo   : recall ${con.recall.toFixed(3)} | tokens/caso ${con.tokens.toFixed(1)}`);
console.log(`veredicto: ${veredictoEntrada.entra ? "ENTRA" : "FUERA"} — ${veredictoEntrada.causa}`);
console.log(`índice   : ${firmadoCon} · panel: ${panel.filas.map((f) => `${f.id.split(".").pop()} ${f.entra ? "✓" : "✗"}`).join(" ")}`);
