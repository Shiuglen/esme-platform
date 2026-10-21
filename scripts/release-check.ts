/**
 * release:check — el pre-vuelo de una publicación del kit.
 *   npm run release:check
 *
 * Qué comprueba. Todo lo que el workflow de la release hace (y que se puede
 * comprobar SIN la llave de release):
 *
 *   1. que la versión ha subido (publicar un número repetido no es publicar);
 *   2. que la calidad está en verde (tipos, pruebas, specs);
 *   3. que el paquete compila y lleva lo que tiene que llevar (el contrato
 *      nuevo, la puerta nueva, su spec y su documento);
 *   4. que la tienda sigue verificando (índice y artefactos).
 *
 * Lo que NO puede comprobar (porque necesita la llave, que no vive en el
 * repo): que el índice se pueda firmar con la llave de release. Eso lo dice el
 * workflow, con su motivo.
 *
 * Referencia: .github/workflows/release.yml, docs/COLABORADOR-KIT/RUNBOOK-DEV.md.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(raiz, "package.json"), "utf8")) as {
  version: string;
  name: string;
};

const problemas: string[] = [];
const ok = (msg: string): void => console.log(`✓ ${msg}`);
const falla = (msg: string): void => {
  problemas.push(msg);
  console.error(`✗ ${msg}`);
};

console.log(`kit       : ${pkg.name} v${pkg.version}\n`);

// 1. la versión
try {
  const ultimo = execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
    cwd: raiz,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const tag = ultimo.replace(/^v/, "");
  if (tag === pkg.version) {
    falla(`la versión sigue siendo ${pkg.version} (la última etiqueta es ${ultimo}): hay que subirla`);
  } else {
    ok(`versión ${pkg.version} (la última etiqueta era ${ultimo})`);
  }
} catch {
  console.log(`· sin etiquetas todavía: la versión ${pkg.version} es la primera`);
}

// 2. la calidad
for (const [nombre, cmd] of [
  ["tipos", ["npx", "tsc", "--noEmit"]],
  ["pruebas", ["npx", "vitest", "run"]],
  ["specs", ["npx", "tsx", "scripts/spec-lint.ts"]],
] as Array<[string, string[]]>) {
  try {
    execFileSync(cmd[0] as string, cmd.slice(1), {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    ok(`${nombre}: en verde`);
  } catch (e) {
    falla(`${nombre}: en rojo (${String((e as Error)?.message).slice(0, 120)})`);
  }
}

// 3. el paquete: compila y lleva lo que tiene que llevar
try {
  execFileSync("npm", ["run", "build"], { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  ok("el paquete compila");
} catch {
  falla("el paquete no compila");
}

const debeLlevar = [
  "dist/core/rea/forma.js",
  "dist/core/rea/evidencia.js",
  "dist/core/rea/conocimiento.js",
  "dist/core/modulos/programas.js",
  "dist/core/modulos/lanzamientos.js",
  "dist/core/extension-host/proc.js",
  "estandar/rea.spec.yaml",
  "estandar/indice-tienda.spec.yaml",
  "docs/REA.md",
];
for (const f of debeLlevar) {
  if (!existsSync(resolve(raiz, f))) falla(`el paquete no lleva ${f}`);
}
if (!problemas.length) ok(`el paquete lleva lo que tiene que llevar (${debeLlevar.length} ficheros)`);

// 4. la tienda
try {
  execFileSync("npx", ["tsx", "scripts/verificar.ts"], {
    cwd: raiz,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  ok("la tienda verifica (índice y artefactos)");
} catch {
  falla("la tienda no verifica: no se publica una tienda rota");
}

console.log("");
if (problemas.length) {
  console.log(`✗ ${problemas.length} cosa(s) que arreglar antes de publicar.`);
  process.exit(1);
}
console.log("✓ todo en verde. Lo que falta es la llave: etiqueta y push (el workflow firma).");
