/**
 * EL CONOCIMIENTO DE REA — de la evidencia a lo que la mente sabe.
 *
 * Qué es esto. La Evidencia de REA es un grafo: 33.436 nodos, 25.173
 * relaciones, 10.061 desconocidos. Eso NO es conocimiento: es ruido con
 * forma. Si cada nodo fuese un recuerdo, la mente llenaría su presupuesto con
 * expresiones y vínculos que nadie pregunta.
 *
 * La regla que gobierna este fichero: **un hecho por entidad, no por nodo.**
 * De un módulo se dice qué módulo es y qué funciones con nombre declara; de
 * las funciones sin módulo se dice lo que se sepa; de los 22.510 nodos de
 * expresión, un número en la composición y nada más. El resultado son decenas
 * de filas, no decenas de miles.
 *
 * La segunda regla, más importante: **lo que no se vio también es
 * conocimiento.** Los límites que declara el análisis, los desconocidos por
 * familia y la cobertura por familia salen como hechos propios. Una mente que
 * sabe lo que no puede afirmar vale más que una que afirma de más.
 *
 * Referencia: docs/REA.md, core/rea/evidencia.ts.
 */
import type { EvidenciaRea, NodoRea } from "./evidencia.ts";

/** Los tipos de hecho. Cerrados: un hecho es de un tipo y de uno solo. */
export const TIPOS_HECHO = [
  "sujeto",
  "composicion",
  "limite",
  "desconocido",
  "cobertura",
  "superficie",
  "modulo",
  "funcion",
  "endpoint",
  "proceso",
  "configuracion",
  "evento",
  "temporizador",
  "frontera",
] as const;

export type TipoHechoRea = (typeof TIPOS_HECHO)[number];

/** Un hecho: lo que la mente puede afirmar, y con qué respaldo. */
export interface HechoRea {
  /** El tipo (cerrado). */
  tipo: TipoHechoRea;
  /** La clave estable del hecho (para que el id del recuerdo no cambie). */
  clave: string;
  /** La frase: lo que se sabe, en castellano y de forma legible. */
  texto: string;
  /** De dónde viene (fichero y línea, si el nodo lo sabe). */
  modulo: string | null;
  linea: number | null;
  /** La confianza con que se observó («exact», «derived»…). */
  confianza: string | null;
}

/** El resultado: los hechos y el recuento de lo que se dejó fuera. */
export interface ConocimientoRea {
  hechos: HechoRea[];
  /** Cuántos hechos se construyeron antes de aplicar el presupuesto. */
  total: number;
  /** Cuántos se quedaron fuera por presupuesto (0 si cabían todos). */
  fuera: number;
}

const cuenta = (nodos: NodoRea[], kind: string): NodoRea[] => nodos.filter((n) => n.kind === kind);

const etiquetaConfianza = (c: string | null): string => (c ? ` (confianza: ${c})` : "");

/** Los nombres de las funciones con nombre que cuelgan de un módulo. */
function funcionesDe(nodos: NodoRea[], modulo: string): string[] {
  return nodos
    .filter((n) => n.kind === "function" && n.modulo === modulo && typeof n.label === "string" && n.label.length > 0)
    .map((n) => n.label as string);
}

/** Los tipos de nodo que merecen un hecho propio (los demás van a la composición). */
const TIPOS_DETALLE = [
  "endpoint",
  "request",
  "response",
  "child-process",
  "config-source",
  "listener",
  "event",
  "timer",
  "boundary",
] as const;

/**
 * Construye el conocimiento de una evidencia.
 *
 * @param ev La evidencia verificada.
 * @param maxHechos El presupuesto de hechos (los que no caben se cuentan, no se
 *   pierden en silencio: el resumen dice cuántos fueron).
 */
export function conocimientoDe(ev: EvidenciaRea, maxHechos = 400): ConocimientoRea {
  const hechos: HechoRea[] = [];
  const push = (h: HechoRea): void => {
    hechos.push(h);
  };

  const nodos = ev.nodes;
  const porKind = new Map<string, NodoRea[]>();
  for (const n of nodos) {
    const l = porKind.get(n.kind);
    if (l) l.push(n);
    else porKind.set(n.kind, [n]);
  }

  /* --- 1. el sujeto: qué se analizó y con qué autoridad -------------- */
  const s = ev.subject;
  push({
    tipo: "sujeto",
    clave: `sujeto:${s.name}`,
    texto:
      `Programa analizado: «${s.name}»` +
      (s.format ? ` (formato: ${s.format})` : "") +
      (s.sha256 ? ` (sha256: ${s.sha256.slice(0, 16)}…)` : "") +
      `. Lo analizó ${ev.provider.name ?? ev.provider.id}` +
      (ev.operation ? ` con la operación «${ev.operation}»` : "") +
      `. Confianza de la evidencia: «${ev.confidence ?? "desconocida"}»; autoridad: «${ev.authority ?? "desconocida"}».`,
    modulo: null,
    linea: null,
    confianza: ev.confidence,
  });

  /* --- 2. la composición: el inventario completo, en una frase -------- */
  const partes = [...porKind.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([kind, ns]) => `${ns.length} ${kind}`);
  push({
    tipo: "composicion",
    clave: "composicion",
    texto:
      partes.length > 0
        ? `Composición observada en el programa: ${partes.join(", ")}. Son observaciones estáticas del código: no prueban que nada se ejecute en tiempo real.`
        : `Composición observada en el programa: el análisis no retención ningún nodo del grafo semántico.`,
    modulo: null,
    linea: null,
    confianza: ev.confidence,
  });

  /* --- 3. los límites que declara el propio análisis ----------------- */
  for (const [i, limite] of ev.limitations.entries()) {
    push({
      tipo: "limite",
      clave: `limite:${i}`,
      texto: `Límite del análisis (lo que este análisis NO afirma): «${limite}».`,
      modulo: null,
      linea: null,
      confianza: null,
    });
  }

  /* --- 4. lo que no se pudo resolver: por familia y por razón -------- */
  const desconocidos = new Map<string, { familia: string; razon: string; n: number }>();
  for (const u of ev.unknowns) {
    const k = `${u.family}::${u.reason}`;
    const prev = desconocidos.get(k);
    if (prev) prev.n += 1;
    else desconocidos.set(k, { familia: u.family, razon: u.reason, n: 1 });
  }
  for (const [k, d] of [...desconocidos.entries()].sort((a, b) => b[1].n - a[1].n)) {
    push({
      tipo: "desconocido",
      clave: `desconocido:${k}`,
      texto: `Sin resolver: ${d.n} relación(es) de la familia «${d.familia}» (razón: ${d.razon}). Sobre ellas no se afirma nada: lo no visto no es ausencia.`,
      modulo: null,
      linea: null,
      confianza: null,
    });
  }

  /* --- 5. la cobertura por familia ------------------------------------ */
  for (const f of ev.coverage.families) {
    push({
      tipo: "cobertura",
      clave: `cobertura:${f.family}`,
      texto:
        `Cobertura de la familia «${f.family}»: ${f.status ?? "desconocida"} ` +
        `(${f.retained_relations} relación(es) conservadas, ${f.omitted_relations} omitidas).`,
      modulo: null,
      linea: null,
      confianza: null,
    });
  }
  if (ev.coverage.status) {
    push({
      tipo: "cobertura",
      clave: "cobertura:global",
      texto:
        `Cobertura global del grafo: «${ev.coverage.status}»` +
        (ev.coverage.truncated ? ` (truncado: ${ev.coverage.omitted_nodes} nodos y ${ev.coverage.omitted_relations} relaciones omitidos)` : "") +
        `.`,
      modulo: null,
      linea: null,
      confianza: null,
    });
  }

  /* --- 6. la superficie declarada (IPC, ventanas, bridges) ------------ */
  const resumen = ev.summary ?? {};
  const ipc = (resumen.ipc ?? {}) as Record<string, unknown>;
  const superficie: string[] = [];
  const numDe = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const pares: [string, number][] = [
    ["canales IPC literales", numDe(ipc.literal_channels)],
    ["operaciones IPC dinámicas", numDe(ipc.dynamic_channel_operations)],
    ["handlers IPC en el proceso principal", numDe(ipc.main_handlers)],
    ["transmisiones desde el renderer", numDe(ipc.renderer_transmissions)],
    ["ventanas de navegador", numDe(resumen.browser_windows)],
    ["preloads", numDe(resumen.preload_entrypoints)],
    ["puentes de contexto", numDe(resumen.context_bridge_apis)],
    ["miembros expuestos a la ventana", numDe(resumen.exposed_api_members)],
    ["procesos auxiliares", numDe(resumen.utility_processes)],
    ["módulos nativos", numDe(resumen.native_addon_bindings)],
  ];
  for (const [etiqueta, n] of pares) {
    if (n > 0) superficie.push(`${n} ${etiqueta}`);
  }
  if (superficie.length > 0) {
    push({
      tipo: "superficie",
      clave: "superficie",
      texto: `Superficie del programa: ${superficie.join(", ")}.`,
      modulo: null,
      linea: null,
      confianza: ev.confidence,
    });
  }

  /* --- 7. los módulos (o, si no hay, las funciones sueltas) ----------- */
  const modulos = cuenta(nodos, "module");
  if (modulos.length > 0) {
    for (const m of modulos) {
      const nombre = m.label ?? m.modulo ?? m.node_id;
      const funciones = funcionesDe(nodos, m.label ?? m.modulo ?? "");
      const lista = funciones.slice(0, 12);
      push({
        tipo: "modulo",
        clave: `modulo:${nombre}`,
        texto:
          `Módulo «${nombre}»: declara ${funciones.length} función(es) con nombre` +
          (lista.length > 0 ? ` (${lista.join(", ")}${funciones.length > lista.length ? ", …" : ""})` : "") +
          `.`,
        modulo: m.modulo,
        linea: m.linea,
        confianza: m.confianza,
      });
    }
  } else {
    const funciones = nodos
      .filter((n) => n.kind === "function" && typeof n.label === "string" && n.label.length > 0)
      .sort((a, b) => (a.label as string).localeCompare(b.label as string));
    for (const f of funciones) {
      push({
        tipo: "funcion",
        clave: `funcion:${f.label}:${f.modulo ?? ""}:${f.linea ?? ""}`,
        texto: `Función «${f.label}»${f.modulo ? ` (${f.modulo}${f.linea ? `:${f.linea}` : ""})` : ""}.${etiquetaConfianza(f.confianza)}`,
        modulo: f.modulo,
        linea: f.linea,
        confianza: f.confianza,
      });
    }
  }

  /* --- 8. los detalles que merecen nombre: red, procesos, config… ----- */
  for (const kind of TIPOS_DETALLE) {
    const grupo = porKind.get(kind);
    if (!grupo || grupo.length === 0) continue;
    for (const n of grupo) {
      const p = n.properties ?? {};
      const hecho = detalleDe(kind, n, p);
      if (hecho) push(hecho);
    }
  }

  /* --- 9. el presupuesto: lo que no cabe, se cuenta -------------------- */
  const total = hechos.length;
  if (total <= maxHechos) return { hechos, total, fuera: 0 };
  return { hechos: hechos.slice(0, maxHechos), total, fuera: total - maxHechos };
}

/** Un hecho de detalle, según el tipo de nodo. */
function detalleDe(kind: string, n: NodoRea, p: Record<string, unknown>): HechoRea | null {
  const texto = (v: unknown): string => (typeof v === "string" ? v : "");
  const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const mod = n.modulo ? ` (${n.modulo}${n.linea ? `:${n.linea}` : ""})` : "";
  const conf = etiquetaConfianza(n.confianza);

  switch (kind) {
    case "endpoint":
    case "request": {
      const endpoint = texto(p.endpoint);
      const metodo = texto(p.method) || texto(p.operation_kind);
      if (!endpoint && !metodo) return null;
      return {
        tipo: "endpoint",
        clave: `endpoint:${n.node_id}`,
        texto: `Petición de red${endpoint ? ` a «${endpoint}»` : " (destino no resuelto en el análisis estático)"} por ${metodo || "método desconocido"}${mod}.${conf}`,
        modulo: n.modulo,
        linea: n.linea,
        confianza: n.confianza,
      };
    }
    case "response": {
      const endpoint = texto(p.endpoint);
      return {
        tipo: "endpoint",
        clave: `response:${n.node_id}`,
        texto: `Respuesta consumida${endpoint ? ` de «${endpoint}»` : ""} por ${texto(p.method) || "un método sin nombre"}${mod}.${conf}`,
        modulo: n.modulo,
        linea: n.linea,
        confianza: n.confianza,
      };
    }
    case "child-process": {
      const comando = texto(p.command);
      const argv = numero(p.argv_count);
      const env = p.environment_supplied === true;
      return {
        tipo: "proceso",
        clave: `proceso:${n.node_id}`,
        texto:
          `El programa lanza un proceso${comando ? ` «${comando}»` : " (comando no resuelto en el análisis estático)"}` +
          (argv !== null ? ` con ${argv} argumento(s)` : "") +
          (env ? " y le pasa el entorno" : " sin pasarle el entorno") +
          ` (stdio: ${texto(p.stdio_mode) || "sin modo"}, método: ${texto(p.method) || "sin nombre"})${mod}.${conf}`,
        modulo: n.modulo,
        linea: n.linea,
        confianza: n.confianza,
      };
    }
    case "config-source": {
      // El VALOR no sale nunca: una variable de entorno puede ser una llave.
      const clase = texto(p.source_kind) || "desconocida";
      const clave = texto(p.key);
      return {
        tipo: "configuracion",
        clave: `configuracion:${n.node_id}`,
        texto: `El programa lee configuración de ${clase}${clave ? ` (clave «${clave}»)` : ""}${mod}. El valor no se guarda.${conf}`,
        modulo: n.modulo,
        linea: n.linea,
        confianza: n.confianza,
      };
    }
    case "listener": {
      const evento = texto(p.event_name);
      if (!evento) return null;
      return {
        tipo: "evento",
        clave: `listener:${n.node_id}`,
        texto: `El programa escucha el evento «${evento}» con ${texto(p.method) || "un método"}${mod}.${conf}`,
        modulo: n.modulo,
        linea: n.linea,
        confianza: n.confianza,
      };
    }
    case "event": {
      const evento = texto(p.event_name);
      if (!evento) return null;
      return {
        tipo: "evento",
        clave: `evento:${n.node_id}`,
        texto: `El programa emite el evento «${evento}»${mod}.${conf}`,
        modulo: n.modulo,
        linea: n.linea,
        confianza: n.confianza,
      };
    }
    case "timer": {
      const ms = numero(p.delay_milliseconds);
      return {
        tipo: "temporizador",
        clave: `temporizador:${n.node_id}`,
        texto: `El programa programa un temporizador con ${texto(p.method) || "setTimeout"}${ms !== null ? ` a ${ms} ms` : ""}${mod}.${conf}`,
        modulo: n.modulo,
        linea: n.linea,
        confianza: n.confianza,
      };
    }
    case "boundary": {
      const clase = texto(p.boundary_kind);
      const campo = texto(p.field);
      return {
        tipo: "frontera",
        clave: `frontera:${n.node_id}`,
        texto: `Frontera de datos (${clase || "sin clase"}${campo ? ` del campo «${campo}»` : ""}) resuelta por ${texto(p.method) || "un método"}${mod}.${conf}`,
        modulo: n.modulo,
        linea: n.linea,
        confianza: n.confianza,
      };
    }
    default:
      return null;
  }
}
