/**
 * bot-check — ¿este bot entra en la casa?
 *   npm run bot:check -- <bot.json> [--concedidos mind:read,mind:write] [--json]
 *
 * Un bot es una puerta hacia la mente desde un mensajero. Lo que puede hacer
 * es lo que la persona ha concedido, lo que gasta tiene techo, y lo que
 * hace queda escrito como un turno más.
 *
 * Referencia: core/bot.ts, estandar/bot.spec.yaml.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { validaBot, type Canal } from "../core/bot.ts";
import { CAPABILITIES, type Capability } from "../core/extension-host/capability.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const ruta = arg("--bot") ?? process.argv[2];
  if (!ruta || ruta.startsWith("--")) {
    console.error(
      "uso: npm run bot:check -- <bot.json> [--concedidos mind:read,mind:write] [--json]"
    );
    process.exit(2);
  }
  if (!existsSync(resolve(ruta))) {
    console.error(`no encuentro el bot: ${ruta}`);
    process.exit(1);
  }

  const argConcedidos = arg("--concedidos");
  const concedidos = argConcedidos
    ? (argConcedidos.split(",").map((p) => p.trim()).filter(Boolean) as Capability[])
    : undefined;
  for (const c of concedidos ?? []) {
    if (!(CAPABILITIES as readonly string[]).includes(c)) {
      console.error(`capacidad desconocida: ${c} (valen: ${CAPABILITIES.join(", ")})`);
      process.exit(2);
    }
  }

  const v = validaBot(JSON.parse(readFileSync(resolve(ruta), "utf8")), concedidos);

  if (tiene("--json")) console.log(JSON.stringify(v, null, 2));
  else {
    console.log(`bot    : ${v.bot?.nombre ?? "?"} (${v.bot?.id ?? "?"})`);
    console.log(`canal  : ${v.bot?.canal ?? "?"}`);
    console.log(`permisos: ${(v.bot?.permisos ?? []).join(", ") || "ninguno"}`);
    console.log(
      `presupuesto: ${v.bot?.presupuesto.tokens_por_mensaje ?? 0} por mensaje · ${v.tokens_por_hora} por hora`
    );
    console.log(`veredicto: ${v.ok ? "ENTRA" : "FUERA"}`);
    for (const e of v.errores) console.log(`  ✗ ${e}`);
  }
  process.exit(v.ok ? 0 : 1);
}
