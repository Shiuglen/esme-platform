#!/usr/bin/env node
/**
 * create-modulo — el andamio del colaborador: module.yaml + src + test.
 * `pnpm create:modulo mi-modulo` y después de borrar cero cosas.
 */
import { mkdirSync, writeFileSync, existsSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const slug = process.argv[2];
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error("uso: npm run create:modulo -- <slug-en-minúsculas>");
  process.exit(1);
}
const raiz = resolve(import.meta.dirname, "..");
const plantilla = join(raiz, "modulos", "ejemplo-hola-mundo");
const destino = join(raiz, "modulos", `ejemplo-${slug}`);
if (existsSync(destino)) {
  console.error(`ya existe ${destino}`);
  process.exit(1);
}
cpSync(plantilla, destino, { recursive: true });

const id = `esme.${process.env.USER || "anon"}.${slug}`;
const archivo = join(destino, "module.yaml");
let yml = await import("node:fs").then((m) => m.readFileSync(archivo, "utf8"));
yml = yml
  .replace(`esme.nucleo.hola-mundo`, id)
  .replace(`name: "Hola Mundo"`, `name: "${slug}"`);
writeFileSync(archivo, yml);
writeFileSync(
  join(destino, "src", "index.ts"),
  `export const MODULO_ID = ${JSON.stringify(id)};\n`
);
const huella = createHash("sha256").update(id).digest("hex").slice(0, 12);
console.log(`✓ ${destino}`);
console.log(`  id: ${id} (huella ${huella})`);
console.log(`  siguiente: pnpm build dentro del módulo, luego pnpm spec:lint`);
