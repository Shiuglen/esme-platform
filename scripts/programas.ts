/**
 * programas — la lista de programas que esta casa permite lanzar.
 *   npm run programas -- lista
 *   npm run programas -- concede rea [--ruta /usr/local/bin/rea] [--desc "…"]
 *   npm run programas -- revoca rea
 *
 * Qué es esto. La puerta `proc:spawn` deja que un módulo pida al anfitrión
 * que lance un programa. El anfitrión sólo lanza los de esta lista. Esta lista
 * es una decisión DE LA PERSONA: por eso vive en un fichero (en
 * `~/.esme/programas.json`), se lee a mano y se cambia desde aquí.
 *
 * Lo que NO hace. Conceder un programa NO da ningún permiso a ningún módulo:
 * el permiso (`proc:spawn`) lo pide el módulo y lo concede la persona, en el
 * libro de los permisos. Aquí sólo se decide QUÉ se puede lanzar.
 *
 * Referencia: core/modulos/programas.ts, core/extension-host/proc.ts, docs/REA.md.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { ProgramasPermitidos } from "../core/modulos/programas.ts";

const dirCasa = process.env.ESME_CASA ?? join(homedir(), ".esme");
const ruta = process.env.ESME_PROGRAMAS ?? join(dirCasa, "programas.json");
const libro = new ProgramasPermitidos(ruta);

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
};

if (import.meta.url === new URL(`file://${process.argv[1]}`, "file:///").href) {
  const [verbo, ...resto] = process.argv.slice(2);
  switch (verbo) {
    case "lista": {
      const programas = libro.lista();
      if (!programas.length) {
        console.log("no hay ningún programa permitido (la puerta de los programas está cerrada)");
        console.log("");
        console.log("  npm run programas -- concede rea --desc \"el motor de ingeniería inversa\"");
      } else {
        for (const p of programas) {
          console.log(`  ${p.nombre.padEnd(14)} ${p.descripcion}`);
          console.log(`  ${" ".repeat(14)} ${p.ruta ?? "(se busca en el PATH)"}`);
          if (p.envPermitidas?.length) {
            console.log(`  ${" ".repeat(14)} entorno: ${p.envPermitidas.join(", ")}`);
          }
        }
      }
      console.log("");
      console.log(`libro: ${ruta}`);
      break;
    }

    case "concede": {
      const nombre = resto[0];
      if (!nombre) {
        console.error("uso: programas concede <nombre> [--ruta <ruta>] [--desc \"qué hace\"] [--env CLAVE…]");
        process.exit(2);
      }
      const env = process.argv.reduce<string[]>((acc, a, i, arr) => {
        if (a === "--env" && arr[i + 1]) acc.push(arr[i + 1] as string);
        return acc;
      }, []);
      const r = libro.agrega({
        nombre,
        descripcion: arg("--desc") ?? "",
        ...(arg("--ruta") ? { ruta: arg("--ruta") as string } : {}),
        ...(env.length ? { envPermitidas: env } : {}),
      });
      if (!r.ok) {
        console.error(`✗ ${r.error}`);
        process.exit(1);
      }
      console.log(`✓ ${nombre} se puede lanzar en esta casa`);
      console.log("  (recuerda: esto NO da permiso a ningún módulo; el permiso lo pide el módulo)");
      break;
    }

    case "revoca": {
      const nombre = resto[0];
      if (!nombre) {
        console.error("uso: programas revoca <nombre>");
        process.exit(2);
      }
      if (!libro.quita(nombre)) {
        console.error(`✗ no estaba: ${nombre}`);
        process.exit(1);
      }
      console.log(`✓ ${nombre} ya no se puede lanzar en esta casa`);
      break;
    }

    default:
      console.log("los programas que esta casa permite lanzar");
      console.log("");
      console.log("  lista                            qué se puede lanzar");
      console.log("  concede <nombre> [--ruta] [--desc \"…\"] [--env CLAVE…]");
      console.log("                                   la persona dice qué se puede lanzar");
      console.log("  revoca <nombre>                  la persona cambia de idea");
      console.log("");
      console.log(`libro: ${ruta}`);
  }
}
