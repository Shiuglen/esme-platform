// el examen REAL (el hallazgo del 12-oct hecho banco reproducible).
// La pregunta que fallaba: «¿estado de la red neuronal?» — la tabla entera
// nunca pasó el budget; por filas sí. Dos mundos, mismas preguntas:
//   base: la tabla ENTERA como un único trozo (el troceo de la pobre)
//   con módulo: la tabla por FILAS (lo que se decretó)
// Oros por mundo: en base la fila vive dentro de tablas-entera;
// en módulo vive en su propio trozo de fila.
import { puntua, type Candidato, type Caso } from "./examen.ts";
import { trocea } from "../mind/troceo.ts";

export const DOC = `# ESME: la fuente de verdad

## 2. Decisiones del creador
Mente neuronal propia, absorción total, y la regla: si el número no mejora, la mejora no entra.

## Estado real

| Área | Estado | Nota |
|---|---|---|
| Red neuronal en la app | hecha | ONNX EmbeddingGemma 300M int8 en el proceso del cerebro |
| Absorción de la propia Esme | hecha | 2334 recuerdos con el botón absorber |
| Prueba 0 | a medias | recall 0,77; falta validar oro y comparar punta a punta |
| Tálamo que reemplaza los ficheros md | a medias | hay puerta MCP; falta empaquetar el producto |
| Corteza sueño desaprender | pendiente | fases |

## 3. La cuña
La mente sustituye los ficheros de memoria de los agentes por contexto vivo y medido.
Se vende a desarrolladores cuando la Prueba 0 demuestre la mejora.
`;

export interface Pregunta {
  id: string;
  pregunta: string;
  oroEnFila: number; // índice de la fila que responde (o -1 si es párrafo)
  oroParr: number; // 0 = p1 (la regla), 1 = p2 (la cuña); -1 = no aplica
}

export const PREGUNTAS: Pregunta[] = [
  { id: "q1", pregunta: "estado de la red neuronal en la app", oroEnFila: 0, oroParr: -1 },
  { id: "q2", pregunta: "absorción de la propia Esme cuántos recuerdos", oroEnFila: 1, oroParr: -1 },
  { id: "q3", pregunta: "la Prueba 0 y su recall qué falta", oroEnFila: 2, oroParr: -1 },
  { id: "q4", pregunta: "el Tálamo que reemplaza los ficheros md", oroEnFila: 3, oroParr: -1 },
  { id: "q5", pregunta: "corteza sueño desaprender fases", oroEnFila: 4, oroParr: -1 },
  { id: "q6", pregunta: "la regla de oro: si el número no mejora", oroEnFila: -1, oroParr: 0 },
  { id: "q7", pregunta: "contexto vivo y medido para desarrolladores", oroEnFila: -1, oroParr: 1 },
  { id: "q8", pregunta: "¿cuándo se vende? cuando la Prueba demuestre", oroEnFila: -1, oroParr: 1 },
  { id: "q9", pregunta: "APP la red neuronal estado", oroEnFila: 0, oroParr: -1 },
  { id: "q10", pregunta: "recuerdos botón absorber propia", oroEnFila: 1, oroParr: -1 },
  { id: "q11", pregunta: "validar oro comparar punta punta", oroEnFila: 2, oroParr: -1 },
  { id: "q12", pregunta: "puerta MCP falta empaquetar producto", oroEnFila: 3, oroParr: -1 },
];

/** El mundo base: la tabla como UN trozo grande (el budget lo excluye). */
export function candidatosBase(): Candidato[] {
  const trozos = trocea("doc", DOC);
  const apartados = trozos.filter((t) => t.tipo === "parrafo");
  const filas = trozos.filter((t) => t.tipo === "fila-tabla");
  return puntua([
    ...apartados.map((t) => ({ id: t.id, texto: t.texto })),
    { id: "doc:tablas-entera", texto: filas.map((f) => f.texto).join("\n") },
  ]);
}

/** El mundo con módulo: la tabla por filas (el troceo de la regla). */
export function candidatosCon(): Candidato[] {
  const trozos = trocea("doc", DOC);
  const apartados = trozos.filter((t) => t.tipo === "parrafo");
  const filas = trozos.filter((t) => t.tipo === "fila-tabla");
  return puntua([
    ...apartados.map((t) => ({ id: t.id, texto: t.texto })),
    ...filas.map((t) => ({ id: t.id, texto: t.texto })),
  ]);
}

export function casosBase(): Caso[] {
  const trozos = trocea("doc", DOC);
  const parrafos = trozos.filter((t) => t.tipo === "parrafo");
  // en el mundo base la fila válida vive DENTRO del trozo entero
  return PREGUNTAS.map((p) => ({
    id: p.id,
    pregunta: p.pregunta,
    oro:
      p.oroEnFila >= 0 ? ["doc:tablas-entera"] : [parrafos[p.oroParr].id],
  }));
}

export function casosCon(): Caso[] {
  const trozos = trocea("doc", DOC);
  const parrafos = trozos.filter((t) => t.tipo === "parrafo");
  // las FILAS DE DATOS: la cabecera de la tabla no es oro de nadie
  const filas = trozos.filter((t) => t.tipo === "fila-tabla" && !t.texto.startsWith("| Área"));
  return PREGUNTAS.map((p) => ({
    id: p.id,
    pregunta: p.pregunta,
    oro:
      p.oroEnFila >= 0 ? [filas[p.oroEnFila].id] : [parrafos[p.oroParr].id],
  }));
}
