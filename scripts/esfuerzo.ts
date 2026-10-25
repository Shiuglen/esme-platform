/**
 * esfuerzo — cuánto piensa cada modelo, pregunta y respuesta.
 *   npm run esfuerzo [--json]                                          (la tabla entera)
 *   npm run esfuerzo -- --motor opencode --modelo glm-5.3-flash-free --modo profundo
 *   npm run esfuerzo -- --encima ~/Daimon/esfuerzo.yaml               (tu documento encima)
 *
 * El mismo cuerpo pregunta y contesta: pediste un modo, salen los
 * parámetros que el motor ya entiende (traídos de la tabla, no adivinados).
 * Un modelo que no declara el modo se dice: «no lo sabe» — y no se le
 * manda nada.
 *
 * Referencia: estandar/esfuerzo.spec.yaml, docs/ESFUERZO.md.
 */
import { resolve } from "node:path";
import { cargaEsfuerzo } from "../motores/esfuerzo-doc.ts";
import { esfuerzoDe, modosDe, MODOS } from "../core/esfuerzo.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
  };
  const json = process.argv.includes("--json");
  const encima = arg("--encima") ?? process.env.ESME_ESFUERZO ?? undefined;
  const tabla = cargaEsfuerzo(resolve(import.meta.dirname, "..", "estandar", "esfuerzo.spec.yaml"), encima);
  const motor = arg("--motor");
  const modelo = arg("--modelo");

  if (motor) {
    const modoStr = arg("--modo") ?? "normal";
    if (!MODOS.includes(modoStr as never)) {
      console.error(`el modo no existe: ${modoStr} (los de la casa: ${MODOS.join(", ")})`);
      process.exit(1);
    }
    if (!modelo) {
      console.error(`falta --modelo (o pide el que sea: la reserva "*" la trae la tabla)`);
      process.exit(1);
    }
    const resuelto = esfuerzoDe(tabla.entradas, motor, modelo, modoStr as never);
    const sabiduria = modosDe(tabla.entradas, motor, modelo);
    if (json) {
      console.log(JSON.stringify({ ...resuelto, modosQueSabe: sabiduria.modos }, null, 2));
    } else {
      const linea = resuelto.params
        ? `${resuelto.motor}/${resuelto.modelo} ${resuelto.modo} → ${JSON.stringify(resuelto.params)}`
        : `${resuelto.motor}/${resuelto.modelo} ${resuelto.modo} → nada (no lo sabe: ${resuelto.parametro === null ? "el motor no habla de esfuerzo" : "el modo no está en su tabla"})`;
      console.log(linea);
      console.log(`los que sabe: ${sabiduria.modos.length ? sabiduria.modos.join(", ") : "ninguno"} · pieza de ${sabiduria.de}`);
    }
  } else if (json) {
    console.log(JSON.stringify(tabla.entradas, null, 2));
  } else {
    console.log(`esfuerzo (${tabla.entradas.length} fichas${encima ? "; con tu documento encima" : ""}):`);
    for (const e of tabla.entradas) {
      const valores = Object.entries(e.valores)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ");
      const que = e.parametro === null ? "no habla de esfuerzo" : e.parametro;
      console.log(`  ${e.motor}/${e.modelo} → ${que}${valores ? ` (${valores})` : ""} [${e.verificado ?? "sin mirar"}, de ${e.de ?? "la casa"}]`);
    }
  }
  process.exit(0);
}
