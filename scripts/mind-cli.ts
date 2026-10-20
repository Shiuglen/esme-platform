// mind-cli — los verbos de la mente portable desde la terminal.
//   absorber <ruta vault> <out.json>     : Vault → trozos absorbibles (sin vectores)
//   exportar  <records.json> <destino>   : recuerdos (con vector) → .mind firmado
//   importar  <mind> <out.json>          : .mind verificado → recuerdos
//   info <mind>                          : metadatos + exclusión, sin tocar nada
//   rumbo <mind>                         : el para qué de la mente (rumbo.json)
//   zip   <records.json> <destino.zip>   : la mente en un solo fichero
//   unzip <mind.zip> <out.json>          : el fichero verificado → recuerdos
// Ejecución: npx tsx scripts/mind-cli.ts <verbo> ...
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { importaVault } from "../core/mind/importers/obsidian.ts";
import { escribeMind, leeMind, type MenteAExportar, type RecuerdoPortatil } from "../core/mind/mind-file.ts";
import { escribeMindZip, leeMindZip } from "../core/mind/mind-zip.ts";
import { rumboAPng } from "../core/mind/rumbo.ts";

export interface Salida {
  code: number;
  out: string;
}

export function cli(argv: string[]): Salida {
  const [verbo, ...args] = argv;
  switch (verbo) {
    case "absorber": {
      const [ruta, destino] = args;
      if (!ruta || !destino) return fail("uso: absorber <ruta vault> <out.json>");
      const r = importaVault(ruta, { vaultNombre: "vault" });
      const absorbido = {
        vault: r.vault,
        ficheros: r.ficheros,
        excluidos: r.excluidos,
        secretos_redactados: r.secretosRedactados,
        trozos: r.trozos.map((t) => ({ id: t.id, fuente: t.fuente, texto: t.texto, tokens: t.tokens, tipo: t.tipo })),
      };
      writeFileSync(destino, JSON.stringify(absorbido, null, 2) + "\n");
      return ok(`absorbido: ${r.ficheros.length} ficheros → ${r.trozos.length} trozos (excluidos ${r.excluidos.length}, secretos ${r.secretosRedactados})`);
    }
    case "exportar": {
      const [origen, destino] = args;
      if (!origen || !destino) return fail("uso: exportar <records.json> <destino.mind/>");
      const raw = JSON.parse(readFileSync(origen, "utf8")) as MenteAExportar;
      const sinVector = raw.recuerdos.filter((r) => !Array.isArray(r.vector));
      if (sinVector.length)
        return fail(`recuerdos sin vector: ${sinVector.length} (corre la Lente antes de exportar)`);
      const { ruta, excluidos, secretos, cognicion } = escribeMind(destino, raw);
      const rumbo = raw.rumbo ? " (con rumbo)" : "";
      return ok(`mente en ${ruta}: ${raw.recuerdos.length - excluidos.length} recuerdos, excluidos ${excluidos.length}, secretos ${secretos}, cognición ${cognicion.slice(0, 12)}${rumbo}`);
    }
    case "importar": {
      const [origen, destino] = args;
      if (!origen || !destino) return fail("uso: importar <mind> <out.json>");
      if (!existsSync(origen)) return fail(`no existe ${origen}`);
      const { recuerdos } = leeMind(origen);
      writeFileSync(destino, JSON.stringify(recuerdos, null, 2) + "\n");
      return ok(`importados ${recuerdos.length} recuerdos → ${destino}`);
    }
    case "info": {
      const [origen] = args;
      if (!origen) return fail("uso: info <mind>");
      const { recuerdos, exclusions, rumbo } = leeMind(origen);
      const meta = JSON.parse(readFileSync(`${origen}/metadata.json`, "utf8")) as Record<string, unknown>;
      const para = rumbo
        ? ` | rumbo ${rumbo.pilares.length} pilares, ${rumbo.objetivos.length} objetivos`
        : " | sin rumbo";
      return ok(`motor ${meta.motor} | recall ${meta.recall} | recuerdos ${recuerdos.length} | exclusión mínima ${exclusions.length} reglas${para}`);
    }
    case "rumbo": {
      const [origen] = args;
      if (!origen) return fail("uso: rumbo <mind>");
      if (!existsSync(origen)) return fail(`no existe ${origen}`);
      const { rumbo } = leeMind(origen);
      if (!rumbo) return ok("esta mente no tiene rumbo (puede ser una mente vieja)");
      return ok(rumboAPng(rumbo).trimEnd());
    }
    case "zip": {
      const [origen, destino] = args;
      if (!origen || !destino) return fail("uso: zip <records.json> <destino.mind.zip>");
      const raw = JSON.parse(readFileSync(origen, "utf8")) as MenteAExportar;
      const sinVector = raw.recuerdos.filter((r) => !Array.isArray(r.vector));
      if (sinVector.length)
        return fail(`recuerdos sin vector: ${sinVector.length} (corre la Lente antes de exportar)`);
      const z = escribeMindZip(destino, raw);
      return ok(`mente en un fichero: ${z.ruta} (${z.bytes} bytes, sha256 ${z.sha256.slice(0, 12)}…, ${z.entradas.length} entradas)`);
    }
    case "unzip": {
      const [origen, destino] = args;
      if (!origen || !destino) return fail("uso: unzip <mind.zip> <out.json>");
      if (!existsSync(origen)) return fail(`no existe ${origen}`);
      const { recuerdos, rumbo } = leeMindZip(origen);
      writeFileSync(destino, JSON.stringify(recuerdos, null, 2) + "\n");
      const conRumbo = rumbo ? ` (rumbo: ${rumbo.pilares.length} pilares, ${rumbo.objetivos.length} objetivos)` : "";
      return ok(`importados ${recuerdos.length} recuerdos → ${destino}${conRumbo}`);
    }
    default:
      return fail("uso: mind-cli <absorber|exportar|importar|info|rumbo|zip|unzip> ...");
  }
}

const ok = (msg: string): Salida => ({ code: 0, out: `✓ ${msg}` });
const fail = (msg: string): Salida => ({ code: 1, out: `✗ ${msg}` });

if (
  import.meta.url ===
  new URL(`file://${process.argv[1]}`, "file:///").href
) {
  const s = cli(process.argv.slice(2));
  console.log(s.out);
  process.exit(s.code);
}
