/**
 * esme.nucleo.puerta — el módulo que demuestra LA PUERTA entera.
 *
 * No hace nada útil: su trabajo es tocar cada pieza de la puerta (la mente,
 * el disco del proyecto, los eventos y la UI) y decir lo que ha tocado. Sirve
 * para dos cosas:
 *
 *   1. Probar que la puerta sirve de verdad (las pruebas del kit lo llaman).
 *   2. Enseñar, con código, cómo se escribe un módulo de Esme.
 *
 * Lo que NO hace (y es lo importante): no usa `fetch`, ni `node:fs`, ni
 * `process.env`. No puede: la cápsula los cierra. Va por la puerta, y la
 * puerta decide qué pasa.
 *
 * Referencia: docs/MODULOS.md, core/extension-host/puerta.ts.
 */
export const MODULO_ID = "esme.nucleo.puerta";

export interface ResultadoPuerta {
  id: string;
  /** Lo que la mente devolvió. */
  recuerdo: string | null;
  /** Si pudo escribir en la mente. */
  escribio: boolean;
  /** Si pudo leer del proyecto. */
  leyo: string | null;
  /** Si emitió el evento. */
  emitio: boolean;
  /** Si pintó la vista. */
  pintó: boolean;
  /** Las capacidades que de verdad se tocaron. */
  tocadas: string[];
}

/**
 * La demostración: toca la puerta entera y devuelve la verdad de lo que pudo
 * hacer. Lo que no está concedido no está: se nota aquí, no con un error
 * raro en otro sitio.
 */
export async function demuestra(
  consulta = "¿qué se decidió sobre el Taller?",
  nota = "el módulo de la puerta escribe esto"
): Promise<ResultadoPuerta> {
  const tocadas: string[] = [];

  // La mente: leer y escribir, si está concedido.
  let recuerdo: string | null = null;
  const puerta = globalThis.esme;
  if (puerta?.mente) {
    tocadas.push("mind:read");
    const r = await puerta.mente.recall({ query: consulta, budget: 400 });
    recuerdo = r[0]?.texto ?? null;
    tocadas.push("mind:write");
    await puerta.mente.remember({ text: nota, kind: "note" });
  }

  // El disco del proyecto: si hay proyecto y está concedido.
  let leyo: string | null = null;
  if (puerta?.fs) {
    tocadas.push("fs:project");
    try {
      leyo = await puerta.fs.leer("LEEME.md");
    } catch {
      leyo = null; // el proyecto puede no tener ese fichero: no es un fallo
    }
  }

  // Los eventos: hablar hacia fuera, con el namespace del módulo.
  let emitio = false;
  if (puerta?.ipc) {
    tocadas.push("ipc:emit");
    await puerta.ipc.emit("demostrado", { id: MODULO_ID });
    emitio = true;
  }

  // La UI: proponer una vista (la app decide si se ve).
  let pintó = false;
  if (puerta?.ui) {
    tocadas.push("ui:render");
    await puerta.ui.render({
      tipo: "texto",
      titulo: "La puerta",
      cuerpo: "El módulo de la puerta tocó lo que le dejaron.",
    });
    pintó = true;
  }

  return {
    id: MODULO_ID,
    recuerdo,
    escribio: tocadas.includes("mind:write"),
    leyo,
    emitio,
    pintó,
    tocadas,
  };
}

/** Lo mismo, pero en corto: para las sondas de la medición. */
export async function resumen(): Promise<{ id: string; puerta: boolean }> {
  return { id: MODULO_ID, puerta: Boolean(globalThis.esme) };
}
