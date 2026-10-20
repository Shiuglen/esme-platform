// El banco real de la Prueba 0: las preguntas del usuario, sus documentos y
// el oro que elige el humano.
import { describe, expect, it } from "vitest";
import {
  casosDelBanco,
  correBanco,
  mundosDelBanco,
  nombreDeProyecto,
  opcionesDeOro,
  preguntasDeTranscripcion,
  proyectoDeTranscripcion,
  respuestaDe,
  validaBanco,
  type BancoReal,
} from "../core/bench/banco.ts";

const banco = (): BancoReal => ({
  version: 1,
  creado: "2026-10-20T00:00:00.000Z",
  documentos: [
    {
      id: "Obsidian/nota.md",
      texto: "## Decisión\n\nLa mente es local: el recall corre en el proceso del cerebro, sin nube.",
    },
  ],
  casos: [
    {
      id: "p001",
      pregunta: "¿dónde corre el recall de la mente?",
      opciones: [
        {
          texto: "La mente es local: el recall corre en el proceso del cerebro, sin nube.",
          origen: "Obsidian/nota.md",
          score: 0.9,
        },
      ],
      oro: "La mente es local: el recall corre en el proceso del cerebro, sin nube.",
      validado: true,
    },
  ],
});

describe("las preguntas del usuario", () => {
  it("saca lo que le preguntó a la IAs (y no los encargos largos)", () => {
    const jsonl = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "¿dónde corre el recall de la mente?" },
      }),
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "x".repeat(900) },
      }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: "hola" } }),
    ].join("\n");
    const q = preguntasDeTranscripcion(jsonl);
    expect(q).toEqual(["¿dónde corre el recall de la mente?"]);
  });

  it("los enunciados también cuentan (la mayoría no son interjecciones)", () => {
    const jsonl = JSON.stringify({
      type: "user",
      message: { role: "user", content: "ayudame con la tienda firmada" },
    });
    expect(preguntasDeTranscripcion(jsonl)).toEqual(["ayudame con la tienda firmada"]);
  });

  it("el ruido no cuenta (recordatorios, interrupciones, comandos)", () => {
    for (const ruido of [
      "<system-reminder> algo</system-reminder>",
      "[Request interrupted by user]",
      "/compact",
      "Caveat: The messages below",
      "<command-message>workflow</command-message>",
    ]) {
      const jsonl = JSON.stringify({ type: "user", message: { role: "user", content: ruido } });
      expect(preguntasDeTranscripcion(jsonl), ruido).toEqual([]);
    }
  });

  it("el proyecto de la sesión se lee del cwd", () => {
    const jsonl = JSON.stringify({ cwd: "/home/sakai/Sakoi", type: "user" });
    expect(proyectoDeTranscripcion(jsonl)).toBe("/home/sakai/Sakoi");
    expect(nombreDeProyecto("/home/sakai/Sakoi")).toBe("Sakoi");
  });
});

describe("las palabras que cuentan", () => {
  it("las cortas y de ruido no cuentan (una pregunta real es larga)", () => {
    // "que" y "para" no cuentan; "recall" y "mente" sí
    expect(respuestaDe("que para el recall de la mente", "el recall corre en la mente")).toBe(1);
    expect(respuestaDe("que para el recall de la mente", "no dice nada de eso")).toBe(0);
  });

  it("los candidatos se proponen por parecido, no se deciden", () => {
    const docs = [
      { id: "a.md", texto: "La mente es local: el recall corre en el proceso del cerebro." },
      { id: "b.md", texto: "La tienda firma los módulos con Ed25519 y una raíz congelada." },
    ];
    const opciones = opcionesDeOro("¿dónde corre el recall?", docs);
    expect(opciones[0].origen).toBe("a.md");
    expect(opciones.length).toBeGreaterThan(0);
  });

  it("sin palabras que cuenten, no hay candidatos (no se inventa)", () => {
    expect(opcionesDeOro("???", [{ id: "a.md", texto: "cualquier cosa" }])).toEqual([]);
  });
});

describe("el banco medido", () => {
  it("el oro se resuelve por texto: el mismo caso vale para los dos mundos", () => {
    const b = banco();
    const base = casosDelBanco(b, "base");
    const con = casosDelBanco(b, "con");
    expect(base).toHaveLength(1);
    expect(con).toHaveLength(1);
    expect(base[0].oro[0]).toBe("Obsidian/nota.md");
  });

  it("un caso sin validar no cuenta (el humano decide)", () => {
    const b = banco();
    b.casos[0].validado = false;
    expect(casosDelBanco(b, "base")).toHaveLength(0);
  });

  it("el banco vale o dice por qué", () => {
    expect(validaBanco(banco()).ok).toBe(true);
    const malo = { ...banco(), casos: [{ id: "x", pregunta: "", opciones: [], oro: "", validado: false }] };
    expect(validaBanco(malo).ok).toBe(false);
  });

  it("el troceo del módulo hace que la fila que responde se pueda encontrar", () => {
    const b = banco();
    b.documentos = [
      {
        id: "doc",
        texto: "## Estado\n\n| Área | Estado | Nota |\n|---|---|---|\n| Red neuronal | hecha | ONNX en el cerebro |",
      },
    ];
    b.casos = [
      {
        id: "p1",
        pregunta: "estado de la red neuronal",
        opciones: [{ texto: "Red neuronal | hecha | ONNX en el cerebro", origen: "doc", score: 1 }],
        oro: "Red neuronal | hecha | ONNX en el cerebro",
        validado: true,
      },
    ];
    const mundos = mundosDelBanco(b);
    expect(mundos.base).toHaveLength(1); // el documento entero
    expect(mundos.con.length).toBeGreaterThan(1); // troceado: la fila va sola
    const r = correBanco(b, { k: 2, budget: 60 });
    expect(r.casos).toBe(1);
    // el módulo no puede empeorar el número
    expect(r.con.recall).toBeGreaterThanOrEqual(r.base.recall);
  });
});
