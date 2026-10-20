// panel CLI — redacta tienda/panel.md desde el índice actual.
//   npm run panel
// Con la clave de release en el env, la firma se verifica; si no, el panel
// lo declara ("sin verificar") — el mantenedor decide si icuncu lo firma.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicKey } from "node:crypto";
import { panelDe, render } from "../tienda/panel.ts";

const raiz = resolve(import.meta.dirname, "..");
const indice = JSON.parse(readFileSync(join(raiz, "tienda", "index.json"), "utf8")) as Record<string, unknown>;

const envKey = process.env.ESME_RELEASE_PUB;

let pubKey: string | undefined;
if (envKey && existsSync(envKey)) {
  pubKey = readFileSync(envKey, "utf8");
} else if (existsSync(join(raiz, ".keys", "index-dev.pem"))) {
  try {
    pubKey = createPublicKey(readFileSync(join(raiz, ".keys", "index-dev.pem"), "utf8"))
      .export({ type: "spki", format: "pem" })
      .toString();
  } catch {
    pubKey = undefined;
  }
}

const p = panelDe(indice, { pubKey });
writeFileSync(join(raiz, "tienda", "panel.md"), render(p));
console.log(`✓ tienda/panel.md: ${p.filas.length} entradas juzgadas, firma ${p.firmaVerifica}`);
