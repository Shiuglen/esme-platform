import { construyeModulo, construyeTodosLosModulos, modulosDe } from "../tienda/construye.ts";

export { construyeModulo, construyeTodosLosModulos, modulosDe };

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const todos = process.argv.includes("--todos");
  const losDemas = process.argv.slice(2).filter((a) => a !== "--todos");

  try {
    if (todos) {
      // TODOS los de la casa: los de ejemplo y los que trae cualquiera en una PR.
      for (const s of await construyeTodosLosModulos()) console.log(s);
    } else {
      for (const m of losDemas) console.log(await construyeModulo(m));
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
