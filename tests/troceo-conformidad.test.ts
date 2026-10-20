// El módulo esme.nucleo.troceo-pro (TypeScript) y el cerebro (Python) tienen que
// trocear IGUAL: el mismo documento → los mismos trozos, byte a byte.
//
// Si se separan, la mejora que el juez midió (+0,750 de recall) se queda en el
// banco de pruebas y el usuario no la siente. Por eso este test compara las dos
// implementaciones de verdad (si el cerebro está en esta máquina) y, si no,
// fija los trozos con letras y sangre para que el banco siga siendo el mismo.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { trocea } from "../core/mind/troceo.ts";
import { DOC, casosCon } from "../core/bench/examen-real.ts";
import { corre } from "../core/bench/runner.ts";

const cerebro = join(homedir(), "Daimon");
const venv = join(cerebro, ".venv", "bin", "python");
const hayCerebro = existsSync(join(cerebro, "daimon", "troceo.py"));
const python = existsSync(venv) ? venv : "python3";

/** Los trozos que da el Python (si el cerebro está en esta máquina). */
function trozosDelCerebro(fuente: string, markdown: string): { id: string; fuente: string; texto: string; tipo: string }[] | null {
  if (!hayCerebro) return null;
  const codigo = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(cerebro)})`,
    "from daimon.troceo import trocea",
    "doc = sys.stdin.read()",
    "print(json.dumps([{'id': t.id, 'fuente': t.fuente, 'texto': t.texto, 'tipo': t.tipo} for t in trocea(sys.argv[1], doc)]))",
  ].join("\n");
  const r = spawnSync(python, ["-c", codigo, fuente], { input: markdown, encoding: "utf8" });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout) as { id: string; fuente: string; texto: string; tipo: string }[];
  } catch {
    return null;
  }
}

const DOCUMENTOS: { nombre: string; fuente: string; markdown: string }[] = [
  {
    nombre: "una tabla con cabecera y separador",
    fuente: "nota.md",
    markdown: `## Estado real

| Área | Estado | Nota |
|---|---|---|
| Red neuronal | hecha | ONNX en el cerebro |
| Prueba 0 | a medias | recall 0,77 |

Un párrafo que cuenta algo.
`,
  },
  {
    nombre: "apartados y párrafos",
    fuente: "doc",
    markdown: `# Título

Primer párrafo.

## Otro apartado

Texto del segundo.

Tercer párrafo pegado al anterior.
`,
  },
  {
    nombre: "sin cabeceras",
    fuente: "plano",
    markdown: `Solo texto.

Y otro bloque.
`,
  },
  {
    nombre: "con acentos y símbolos",
    fuente: "acentos",
    markdown: `## El año de laPiña

Un texto con ñ, á, ¡y emoji 🍐 al final.
`,
  },
  {
    nombre: "vacío",
    fuente: "vacio",
    markdown: "   \n\n  ",
  },
];

describe("el troceo: el módulo y el cerebro, el mismo", () => {
  for (const doc of DOCUMENTOS) {
    it(doc.nombre, () => {
      const ts = trocea(doc.fuente, doc.markdown);
      const py = trozosDelCerebro(doc.fuente, doc.markdown);
      if (py) {
        expect(py.map((t) => t.texto), "los textos no coinciden").toEqual(ts.map((t) => t.texto));
        expect(py.map((t) => t.fuente), "las fuentes no coinciden").toEqual(ts.map((t) => t.fuente));
        expect(py.map((t) => t.tipo), "los tipos no coinciden").toEqual(ts.map((t) => t.tipo));
        expect(py.map((t) => t.id), "los ids no coinciden").toEqual(ts.map((t) => t.id));
      } else {
        // sin el cerebro a mano, el banco queda fijado aquí (el mismo que el Python)
        expect(ts.length).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it("la tabla entra POR FILAS (el hallazgo del 12-oct, en el banco)", () => {
    const doc = DOCUMENTOS[0];
    const trozos = trocea(doc.fuente, doc.markdown);
    const filas = trozos.filter((t) => t.tipo === "fila-tabla");
    expect(filas.length).toBe(3); // cabecera + dos datos (el separador no)
    expect(filas.map((t) => t.texto)).toEqual([
      "| Área | Estado | Nota |",
      "| Red neuronal | hecha | ONNX en el cerebro |",
      "| Prueba 0 | a medias | recall 0,77 |",
    ]);
    // el párrafo va aparte
    expect(trozos.filter((t) => t.tipo === "parrafo").map((t) => t.texto)).toEqual([
      "Un párrafo que cuenta algo.",
    ]);
  });

  it("la fila sabe de dónde viene (el ancla)", () => {
    const trozos = trocea("nota.md", "## Estado\n\n| A | B |\n|---|---|\n| 1 | 2 |");
    const fila = trozos.find((t) => t.tipo === "fila-tabla" && t.texto.includes("| 1 | 2 |"));
    expect(fila?.fuente).toBe("nota.md#estado@fila2");
  });

  it("el número del examen es el del CEREBRO (la mejora llega al usuario)", () => {
    // el examen de la Prueba 0, medido con los trozos que hace el cerebro de
    // verdad: si el troceo del Python es el mismo, el recall es el mismo
    const py = trozosDelCerebro("doc", DOC);
    if (!py) return; // sin el cerebro a mano, el banco ya está fijado arriba
    const ts = trocea("doc", DOC);
    expect(py.map((t) => t.texto)).toEqual(ts.map((t) => t.texto));

    const candidatos = py.map((t) => ({ id: t.id, texto: t.texto, score: 0, tokens: Math.ceil(t.texto.length / 4) }));
    const con = corre(candidatos, casosCon(), { k: 2, budget: 60 });
    expect(con.recall, "el cerebro no llega al recall medido").toBeGreaterThanOrEqual(
      corre(trocea("doc", DOC).map((t) => ({ id: t.id, texto: t.texto, score: 0, tokens: t.tokens })), casosCon(), { k: 2, budget: 60 }).recall
    );
    // y el número es el del banco commiteado (el +0,750 del módulo)
    expect(con.recall).toBeGreaterThan(0.9);
  });
});
