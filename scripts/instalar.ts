// instalar — el circuito completo de un consumidor real:
//   npm run instalar esme.nucleo.troceo-pro
// verifica (índice + firma del artefacto) → desempaqueta en instalaciones/
// → abre el extension host (worker aislado) → llama al módulo de verdad.
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import { resolve, join } from "node:path";
import { instalar } from "../tienda/receptor.ts";
import { abreHost } from "../core/extension-host/host.ts";

const raiz = resolve(import.meta.dirname, "..");
const id = process.argv[2];
if (!id) {
  console.error("uso: npm run instalar <id-del-módulo>");
  process.exit(1);
}

const instalacion = instalar(id, raiz, join(raiz, "instalaciones"));
console.log(`instalado : ${instalacion.id}@${instalacion.version} → ${instalacion.dir}`);
console.log(`verificación: los bytes cuadran con el índice y el libro de firmas`);

// la activación de verdad: el módulo corre en SU worker, con los permisos
// EXACTOS que declara su module.yaml — nada más
const manifiesto = yaml.load(
  readFileSync(join(instalacion.dir, "module.yaml"), "utf8")
) as { permissions?: string[] };
const host = abreHost(join(instalacion.dir, instalacion.entrada), {
  permisos: manifiesto.permissions,
});
try {
  const DOC = `# nota con tabla\n\n| área | estado |\n|---|---|\n| red neuronal | ONNX en proceso |\n| absorción | 2.334 recuerdos |\n`;
  const trozos = (await host.call("troceaConFilas", "nota", DOC)) as {
    id: string;
    tipo: string;
    texto: string;
  }[];
  const filas = (await host.call("filasDe", trozos)) as { texto: string }[];
  console.log(`en el host: ${trozos.length} trozos, ${filas.length} filas —`);
  for (const f of filas) console.log(`  fila: ${f.texto.slice(0, 60)}`);
} finally {
  await host.cerrar();
  console.log("host cerrado: el worker del módulo ya no existe");
}
