/**
 * LOS CASOS DE LA TRAZA — la `trazaDe` de la app, sobre tareas inventadas.
 *
 * La traza del kit (core/sesiones/traza.ts) tiene que dar, sobre un registro
 * del formato 1, exactamente lo que da la de la app. Esto genera los casos
 * para comprobarlo: tareas sintéticas del kit (nunca las de nadie), resumidas
 * por la `trazaDe` REAL de la app. Se guardan las opciones de cada tarea, la
 * huella de sus eventos (si el generador cambia, la prueba lo dice) y la traza.
 *
 * Uso (con la app al lado):
 *   npx tsx scripts/sesiones/traza-app.ts ../esme/app/src/main/taller/traza.ts
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { azar, tallerSintetico, type OpcionesSintetico } from "../../core/sesiones/sintetico.ts";

/** Las tareas de los casos: una semilla, unas opciones. */
export function opcionesDeLosCasos(): OpcionesSintetico[] {
  const r = azar(20261025);
  const casos: OpcionesSintetico[] = [];
  for (let i = 1; i <= 48; i++) {
    const muchas = i === 7; // un turno con cientos de herramientas (más de las que se pintan)
    casos.push({
      semilla: i,
      turnos: muchas ? 1 : 1 + Math.floor(r() * 11),
      conHora: i % 6 !== 0,
      acciones: muchas ? [320, 320] : [1, 9],
      rafaga: [1, 5],
      inicio: 1_761_350_400_000 + i * 1_000_000,
    });
  }
  return casos;
}

/** La huella de unos eventos (para saber que el generador no cambió). */
export function huellaDe(eventos: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(eventos)).digest("hex");
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error("Uso: npx tsx scripts/sesiones/traza-app.ts <app/src/main/taller/traza.ts>");
    process.exit(2);
  }
  const { trazaDe } = (await import(pathToFileURL(resolve(ruta)).href)) as { trazaDe: (e: unknown[]) => unknown };
  const casos = opcionesDeLosCasos().map((opciones) => {
    const eventos = tallerSintetico(opciones);
    return { opciones, huella: huellaDe(eventos), eventos: eventos.length, traza: trazaDe(eventos) };
  });
  const salida = resolve("tests/fixtures/sesiones/traza-app.json");
  writeFileSync(salida, JSON.stringify({ fuente: "app/src/main/taller/traza.ts", casos }, null, 0) + "\n");
  console.log(`${casos.length} casos, ${casos.reduce((s, c) => s + c.eventos, 0)} eventos → ${salida}`);
}
