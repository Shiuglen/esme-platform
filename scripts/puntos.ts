/**
 * puntos — el estado de tu PC, medido.
 *   npm run puntos [-- --json] [--motor opencode] [--pid 1234] [--tope 2048] [--todos] [--arbol]
 *
 * La pregunta de todos los días: «¿qué se está comiendo la memoria ahora
 * mismo?». Aquí se responde con números: un punto por proceso, con su
 * memoria residente y su CPU, MEDIDOS por el sistema operativo (no
 * estimados).
 *
 * Con `--arbol` se ve la FAMILIA: quién engendró a quién (cada punto trae
 * su papa, medida del sistema). Referencia: docs/PUNTOS.md.
 *
 * Con `--todos`, la máquina entera (no sólo los motores): la pregunta de la
 * RAM no es «cuánto usa el agente», es «qué se está comiendo la máquina».
 *
 * Por qué la casa lo trae (y no la app): la era es local. Cada persona tiene
 * SU PC con SUS agentes, y el estado de esa PC es un CONTRATO (estandar/
 * puntos.spec.yaml), no un dibujo: la ventana puede ponerlo como puntos (al
 * estilo Dots) sin que el kit sepa de dibujado.
 *
 * Referencia: docs/PUNTOS.md, estandar/puntos.spec.yaml.
 */
import { puntos, renderPuntos, renderArbolPuntos, TOPE_MB } from "../core/motores/puntos.ts";

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const motores = arg("--motor");
  const pid = arg("--pid");
  const tope = Number(arg("--tope") ?? TOPE_MB);
  const arbol = tiene("--arbol");

  const lista = puntos({
    ...(motores ? { motores: motores.split(",").map((m) => m.trim()) } : {}),
    ...(pid ? { pids: [Number(pid)] } : {}),
    ...(tiene("--todos") ? { todos: true } : {}),
    tope_mb: Number.isFinite(tope) ? tope : TOPE_MB,
  });

  if (arbol) {
    // el árbol necesita la familia entera: si los padres están filtrados
    // fuera, todos parecen raíz y la genealogía se pierde
    const familia = puntos({ todos: true, tope_mb: Number.isFinite(tope) ? tope : TOPE_MB });
    console.log(renderArbolPuntos(familia));
  } else if (tiene("--json")) console.log(JSON.stringify(lista, null, 2));
  else console.log(renderPuntos(lista, Number.isFinite(tope) ? tope : TOPE_MB));
  process.exit(0);
}
