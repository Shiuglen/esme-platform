import { resolve } from "node:path";
import { abreHost } from "../core/extension-host/host.ts";

const dist = resolve(
  import.meta.dirname,
  "../modulos/ejemplo-hola-mundo/dist/index.js"
);

async function main() {
  const host = abreHost(dist);
  try {
    const r = await Promise.race([
      host.call("resumen", ["a", "b"]),
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT en call")), 3000)),
    ]);
    console.log("OK:", JSON.stringify(r));
  } catch (e) {
    console.log("FALLO:", (e as Error).message);
  }
  await host.cerrar();
}
main();
