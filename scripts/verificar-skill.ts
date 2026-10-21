/**
 * verificar-skill — una skill de cualquiera, juzgada en local.
 *   npm run verificar:skill -- <carpeta> [--id mi-skill] [--nombre "Mi skill"]
 *
 * Las skills son instrucciones, no módulos: se juzgan por HECHOS (la licencia,
 * la huella del árbol, el peso del SKILL.md). El juez de la tienda ya
 * existía, pero medía el catálogo de la app: aquí se mide una skill LOCAL —
 * la que estás escribiendo — con el mismo juez.
 *
 * Referencia: core/skills/puerta.ts, tienda/skills.ts.
 */
import { existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { juzgaLocal, mideLocal } from "../core/skills/puerta.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const dir = arg("--dir") ?? process.argv[2];
  if (!dir || dir.startsWith("--")) {
    console.error(
      'uso: npm run verificar:skill -- <carpeta> [--id mi-skill] [--nombre "Mi skill"] [--json]'
    );
    process.exit(2);
  }
  if (!existsSync(resolve(dir))) {
    console.error(`no encuentro la skill: ${dir}`);
    process.exit(1);
  }

  const id = arg("--id") ?? basename(resolve(dir)).toLowerCase().replace(/[^a-z0-9._/-]+/g, "-");
  const nombre = arg("--nombre") ?? id;
  const v = juzgaLocal(resolve(dir), id, nombre);
  const m = mideLocal(resolve(dir));

  if (tiene("--json")) {
    console.log(JSON.stringify({ veredicto: v, medidas: m }, null, 2));
  } else {
    console.log(`skill    : ${nombre} (${id})`);
    console.log(`medida   : ${m.ficheros} ficheros · ${(m.bytes / 1024).toFixed(1)} KiB · licencia ${m.licencia || "sin licencia"}`);
    console.log(`contexto : ${m.tokens === null ? "sin SKILL.md" : `${m.tokens} tokens`}`);
    console.log(`veredicto: ${v.entra ? "ENTRA" : "FUERA"} (${v.nivel}) — ${v.causa}`);
    if (!v.entra && /commit/i.test(v.causa)) {
      console.log(
        "  ↳ en local no se puede fijar un commit: publica la skill en un repo y vuelve a juzgarla desde el catálogo (`npm run skills:juzgar`)"
      );
    }
  }
  process.exit(v.entra ? 0 : 1);
}
