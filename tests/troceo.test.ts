import { describe, expect, it } from "vitest";
import { trocea, slug } from "../core/mind/troceo.ts";

const doc = `# Esme
## 2. Decisiones del creador
La única línea del apartado que quería.

| Área | Estado |
|---|---|
| Red neuronal en la app | hecha con ONNX |
| Prueba 0 | a medias |

## 3. Estado real
Cerraba el documento.
`;

describe("troceo (el fallo del 12-oct: la tabla entera no la encontraba nadie)", () => {
  it("las filas de tabla son unidades independientes y encontrables", () => {
    const trozos = trocea("docs/ESME.md", doc);
    const filas = trozos.filter((t) => t.tipo === "fila-tabla");
    expect(filas.map((f) => f.texto)).toContain("| Red neuronal en la app | hecha con ONNX |");
    // la fila del separador nunca es contenido
    expect(filas.some((f) => f.texto.startsWith("|---"))).toBe(false);
    expect(filas.map((f) => f.texto)).toContain("| Prueba 0 | a medias |");
  });

  it("los apartados nacen por cabecera, y el texto largo no cruza secciones", () => {
    const trozos = trocea("docs/ESME.md", doc);
    const apartados = trozos.filter((t) => t.tipo === "parrafo");
    const textos = apartados.map((a) => a.texto);
    expect(textos).toContain("Cerraba el documento.");
    // no hay un trozo que mezcle sección 2 con sección 3
    expect(textos.some((t) => t.includes("quería") && t.includes("Cerraba"))).toBe(false);
  });

  it("cada trozo lleva el ancla de su sección", () => {
    const trozos = trocea("docs/ESME.md", doc);
    const fila = trozos.find((t) => t.tipo === "fila-tabla")!;
    expect(fila.fuente).toContain("#2-decisiones-del-creador");
    expect(fila.fuente).toContain("@fila");
  });

  it("tokens medidos: 4 chars por token, estimado conservador", () => {
    const [t] = trocea("x.md", "hola");
    expect(t.tokens).toBe(1);
  });

  it("slug estable y sin metros raré", () => {
    expect(slug("Área  **Estado** brújula")).toBe("area-estado-brujula");
  });
});
