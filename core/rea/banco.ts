/**
 * EL CASO DE REA EN EL BANCO — la mente con ojos, medida.
 *
 * Qué es esto. La puerta `proc:spawn` permite que la mente mire dentro de un
 * programa. Eso es una MEJORA, y la casa no admite mejoras sin número: todo
 * se mide contra la Prueba 0 (docs/PRUEBA-0.md).
 *
 * Por qué un caso del banco. El banco de la Prueba 0 es la lista de preguntas
 * con su oro. Un caso de REA es: se mira un programa, se guarda lo que se
 * vio, y se pregunta «¿qué viste dentro de esta app?». El oro es MECÁNICO:
 * es lo que el análisis produjo, no una suposición de un humano. Eso no lo
 * hace trampa: lo que se mide es si la mente RECUERDA lo que aprendió (que
 * es justamente lo que la mide de verdad).
 *
 * Y lo que el caso deja escrito, sin querer: lo que el análisis NO vio. Si
 * la mente contesta con seguridad sobre lo que no se vio, el número sube y
 * la mente miente. Por eso el oro incluye las limitaciones.
 *
 * Referencia: docs/PRUEBA-0.md, core/bench/banco.ts, core/rea/conocimiento.ts.
 */
import type { CasoReal, DocumentoReal } from "../bench/banco.ts";
import { conocimientoDe, type HechoRea } from "./conocimiento.ts";
import type { EvidenciaRea } from "./evidencia.ts";

/** El caso que sale de una evidencia. */
export interface CasoRea {
  /** El documento: lo que la mente aprendió del programa. */
  documento: DocumentoReal;
  /** El caso: la pregunta y su oro. */
  caso: CasoReal;
}

/** La pregunta: la misma para todos los programas. */
export const PREGUNTA_REA = "qué viste dentro de este programa";

/**
 * Cuántas funciones con nombre declara un hecho de módulo.
 *
 * («declara 10 función(es) con nombre» → 10). Si no lo dice, cero: no se
 * presume nada.
 */
export function funcionesDeclaradas(texto: string): number {
  const m = /declara (\d+) función/.exec(texto);
  return m ? Number(m[1]) : 0;
}

/**
 * El oro de un caso de REA.
 *
 * Por qué UNA cosa y no todo. El banco se mide así: se pregunta, se recupera
 * un poco de contexto (unos 60 tokens) y se mira si el ORO está dentro. Un
 * oro de 6.000 caracteres (el análisis entero) no se puede encontrar nunca:
 * el caso mediría siempre cero, y un caso que no puede pasar no mide nada.
 *
 * El oro es, por tanto, el hecho más informativo que quepa en un contexto:
 * el módulo con más funciones con nombre (o, si no hay módulos, la
 * superficie). Y la pregunta lo nombra, para que haya una respuesta sola.
 */
export function oroDeEvidencia(ev: EvidenciaRea): { pregunta: string; oro: string } {
  const hechos = conocimientoDe(ev).hechos;
  const nombre = ev.subject.name;

  const modulos = hechos
    .filter((h) => h.tipo === "modulo")
    .map((h) => ({ hecho: h, funciones: funcionesDeclaradas(h.texto) }))
    .sort((a, b) => b.funciones - a.funciones);
  const principal = modulos[0]?.hecho;
  if (principal) {
    const modulo = principal.clave.replace(/^modulo:/, "");
    return {
      pregunta: `qué funciones declara el módulo «${modulo}» de ${nombre}`,
      oro: principal.texto,
    };
  }

  const superficie = hechos.find((h) => h.tipo === "superficie");
  if (superficie) {
    return {
      pregunta: `qué superficie tiene ${nombre}`,
      oro: superficie.texto,
    };
  }

  const sujeto = hechos.find((h) => h.tipo === "sujeto");
  return {
    pregunta: `qué es ${nombre}`,
    oro: sujeto?.texto ?? nombre,
  };
}

/**
 * Construye el caso de una evidencia.
 *
 * El documento es todo lo que se vio (incluido lo que no se vio: las
 * limitaciones y los desconocidos son hechos, y van al documento). El oro es
 * el hecho que la pregunta busca.
 */
export function casoDeEvidencia(ev: EvidenciaRea, id?: string): CasoRea {
  const conocimiento = conocimientoDe(ev);
  const hechos = conocimiento.hechos;
  const texto = hechos.map((h) => h.texto).join("\n");
  const nombre = ev.subject.name;
  const casoId = id ?? `rea-${nombre.replace(/[^\w.-]+/g, "-").toLowerCase()}`;
  const { pregunta, oro } = oroDeEvidencia(ev);

  const documento: DocumentoReal = {
    id: `doc-${casoId}`,
    texto: `# ${nombre}\n\n${texto}`,
  };

  const caso: CasoReal = {
    id: casoId,
    pregunta,
    tipo: "saber",
    opciones: [{ texto: oro, origen: `rea: ${ev.provider.id} · ${ev.operation ?? "analyze"}`, score: 1 }],
    oro,
    // el oro es mecánico: es lo que el análisis produjo. No hay que elegirlo.
    validado: true,
    origen: `rea: ${ev.provider.id}${ev.operation ? ` (${ev.operation})` : ""}`,
    evidencia: `${ev.subject.name} · ${ev.nodes.length} nodos · ${hechos.length} hechos`,
  };

  return { documento, caso };
}

/** Los hechos que salen de una evidencia (para el que quiera el dato). */
export function hechosDeEvidencia(ev: EvidenciaRea): HechoRea[] {
  return conocimientoDe(ev).hechos;
}
