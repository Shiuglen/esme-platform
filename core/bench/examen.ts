// examen — el banco que mide si algo mejora. Pura y determinista:
// misma pregunta, mismos candidatos, mismo número. Sin semilla que mentir.
export interface Candidato {
  id: string;
  texto: string;
  score: number; // lo que la Lente puso: matching de contenido
  tokens: number;
}

export interface Caso {
  id: string;
  pregunta: string;
  oro: string[]; // ids que el humano medio como correctos
}

/** El scorer de contenido: solapamiento de lexico normalizado (0-1). */
export function scoreDe(pregunta: string, texto: string): number {
  const norm = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  const pq = new Set(norm(pregunta));
  if (pq.size === 0) return 0;
  const ct = new Set(norm(texto));
  let hit = 0;
  for (const t of pq) if (ct.has(t)) hit++;
  return hit / pq.size;
}

/** Candidatos desde un documento: el scorer real aplica sobre cada trozo. */
export function puntua(
  trozos: { id: string; texto: string }[]
): Candidato[] {
  return trozos.map((t) => ({
    id: t.id,
    texto: t.texto,
    tokens: Math.ceil(t.texto.length / 4),
    score: 0, // el score real se pone por caso (depende de la pregunta)
  }));
}

/** Por caso: los candidatos con su score DE ESA PREGUNTA (la Lente en vivo). */
export function conScoreDeCaso(candidatos: Candidato[], caso: Caso): Candidato[] {
  return candidatos.map((c) => ({ ...c, score: scoreDe(caso.pregunta, c.texto) }));
}
