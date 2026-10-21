// El contrato, del lado de la app: el kit y la app declaran el mismo Rumbo y
// el mismo veredicto. Aquí se comprueba que las dos declaraciones son
// INTERCAMBIABLES (esto es una prueba de tipos: si una cambia y la otra no,
// el compilador se cae).
//
// La declaración de la app está en app/src/main/mente/cliente.ts (Pilar,
// Objetivo, Rumbo) y app/src/main/skills/veredicto.ts (MedidasSkill,
// VeredictoSkill). Se copia aquí a propósito: la app no depende del kit (el
// kit es MIT y publicable; la app es la ventana), pero las dos tienen que
// hablar el mismo idioma.
import { describe, expect, it } from "vitest";
import type {
  Pilar as PilarKit,
  Objetivo as ObjetivoKit,
  Rumbo as RumboKit,
} from "../core/mind/rumbo.ts";
import type { MedidasSkill as MedidasKit, VeredictoSkill as VeredictoKit } from "../tienda/skills.ts";

// ——— lo que declara la app ———
type PilarApp = { id: string; texto: string; creado: number };
type ObjetivoApp = {
  id: string;
  texto: string;
  estado: "activo" | "hecho" | "pausado";
  creado: number;
  cerrado: number | null;
  pilar: string | null;
};
type RumboApp = { version: 1; pilares: PilarApp[]; objetivos: ObjetivoApp[] };
type MedidasApp = {
  arbolSha256: string;
  licencia: string;
  commit: string;
  ficheros: number;
  bytes: number;
  ejecutables: boolean;
  tokens: number | null;
  skillMdSha256: string;
};
type VeredictoApp = {
  id: string;
  entra: boolean;
  nivel: "ok" | "aviso" | "fuera";
  causa: string;
  medidas: MedidasApp;
};

// ——— las dos direcciones ———
const appALaKit = (r: RumboApp): RumboKit => r;
const kitALaApp = (r: RumboKit): RumboApp => r;
const appALaKitV = (v: VeredictoApp): VeredictoKit => v;
const kitALaAppV = (v: VeredictoKit): VeredictoApp => v;

describe("el contrato Rumbo: el kit y la app dicen lo mismo", () => {
  it("un Rumbo de la app es un Rumbo del kit (y al revés)", () => {
    const deLaApp: RumboApp = {
      version: 1,
      pilares: [{ id: "p1", texto: "Esme de otro mundo", creado: 1 }],
      objetivos: [
        { id: "o1", texto: "La tienda firmada", estado: "activo", creado: 2, cerrado: null, pilar: "p1" },
      ],
    };
    expect(appALaKit(deLaApp)).toEqual(deLaApp);
    expect(kitALaApp(appALaKit(deLaApp))).toEqual(deLaApp);
  });

  it("un veredicto de la app es un veredicto del kit (y al revés)", () => {
    const deLaApp: VeredictoApp = {
      id: "anthropics/frontend-design",
      entra: true,
      nivel: "ok",
      causa: "commit fijado, huella del árbol y licencia que deja redistribuir",
      medidas: {
        arbolSha256: "a".repeat(64),
        licencia: "MIT",
        commit: "b".repeat(40),
        ficheros: 2,
        bytes: 100,
        ejecutables: false,
        tokens: 3702,
        skillMdSha256: "c".repeat(64),
      },
    };
    expect(appALaKitV(deLaApp)).toEqual(deLaApp);
    expect(kitALaAppV(appALaKitV(deLaApp))).toEqual(deLaApp);
  });

  it("la forma que declara la spec de la frontera es la del kit", async () => {
    // la spec (estandar/cerebro-frontera.spec.yaml) declara el rumbo: si el
    // kit cambiara la forma, la spec y el kit se separarían
    const yaml = await import("js-yaml");
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const spec = yaml.load(
      readFileSync(resolve(import.meta.dirname, "../estandar/cerebro-frontera.spec.yaml"), "utf8")
    ) as { contrato?: { rumbo?: { responde?: string } } };
    const declarada = spec.contrato?.rumbo?.responde ?? "";
    // la spec escribe la forma en texto: se comprueba que trae los mismos
    // campos que el kit (id, texto, creado, estado, cerrado, pilar)
    for (const campo of ["id", "texto", "creado", "estado", "cerrado", "pilar"])
      expect(declarada, `la spec no declara «${campo}»`).toContain(campo);
    // y que el kit tiene esos campos (esto es lo que ata la spec con el tipo)
    const p: PilarKit = { id: "p1", texto: "x", creado: 1 };
    const o: ObjetivoKit = {
      id: "o1",
      texto: "y",
      estado: "activo",
      creado: 2,
      cerrado: null,
      pilar: p.id,
    };
    expect(Object.keys(p).sort()).toEqual(["creado", "id", "texto"]);
    expect(Object.keys(o).sort()).toEqual(["cerrado", "creado", "estado", "id", "pilar", "texto"]);
  });
});
