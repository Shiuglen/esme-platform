// Troceo del conocimiento para la Lente.
// El hallazgo del 12-oct: la búsqueda solo-semántica acertaba en unas preguntas
// y fallaba en otras porque las tablas y los fragmentos largos iban enteros.
// La regla nueva: apartados por cabecera, párrafos aparte, y tablas por FILAS.
export interface Trozo {
  id: string;
  fuente: string; // fichero de origen + ancla de sección
  texto: string;
  tokens: number; // presupuesto medido: 4 chars equivalen a ~1 token
  tipo: "apartado" | "parrafo" | "fila-tabla";
}

const tokensDe = (texto: string) => Math.ceil(texto.length / 4);

export function slug(t: string): string {
  return (
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sin-titulo"
  );
}

/** Trocea un documento markdown en unidades que la Lente sí encuentra. */
export function trocea(fuente: string, markdown: string): Trozo[] {
  const trozos: Trozo[] = [];
  let seccionActual = "inicio";
  let apartadoEnCurso: string[] = [];
  let tablaEnCurso: string[] = [];

  const esFilaTabla = (l: string) => l.trim().startsWith("|");

  const cierraApartado = () => {
    if (apartadoEnCurso.length) {
      const texto = apartadoEnCurso.join(" ").trim();
      if (texto) {
        trozos.push({
          id: "",
          fuente: `${fuente}#${slug(seccionActual)}`,
          texto,
          tokens: tokensDe(texto),
          tipo: "parrafo",
        });
      }
      apartadoEnCurso = [];
    }
  };

  const cierraTabla = () => {
    for (let i = 0; i < tablaEnCurso.length; i++) {
      const texto = tablaEnCurso[i].trim();
      if (!texto || texto.startsWith("|---")) continue; // separador de cabecera
      trozos.push({
        id: "",
        fuente: `${fuente}#${slug(seccionActual)}@fila${i}`,
        texto,
        tokens: tokensDe(texto),
        tipo: "fila-tabla",
      });
    }
    tablaEnCurso = [];
  };

  for (const linea of markdown.split("\n")) {
    const cabecera = /^(#{1,6})\s+(.+)$/.exec(linea);
    if (cabecera) {
      cierraTabla();
      cierraApartado();
      seccionActual = cabecera[2].trim();
      continue;
    }
    if (esFilaTabla(linea)) {
      cierraApartado();
      tablaEnCurso.push(linea);
      continue;
    }
    if (!linea.trim()) {
      cierraTabla();
      cierraApartado();
      continue;
    }
    // texto suelto fuera de tabla: se acumula para no romper sus frases
    cierraTabla();
    apartadoEnCurso.push(linea);
  }
  cierraTabla();
  cierraApartado();

  return trozos.map((t, i) => ({ ...t, id: `${fuente}:${i}` }));
}
