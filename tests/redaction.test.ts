import { describe, expect, it } from "vitest";
import {
  excluido,
  redacta,
  EXCLUSION_MINIMA,
} from "../core/mind/redaction.ts";

describe("redacción de secretos (el escudo inviolable)", () => {
  it("una API key se redacta y NUNCA se guarda su contenido", () => {
    const r = redacta("mi clave es sk-proj-abcdefghijklmnopqrstuvwxyz123456");
    expect(r.texto).toContain("[SECRET:openai-sk]");
    expect(r.texto).not.toContain("sk-proj");
    expect(r.hallazgos).toHaveLength(1);
  });

  it("una PEM privada entera desaparece del texto", () => {
    const pem =
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq\n-----END PRIVATE KEY-----";
    expect(redacta(`guardado:\n${pem}`).texto).not.toContain("MIIEv");
  });

  it("un JWT va dentro del saco", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36";
    expect(redacta(jwt).hallazgos).toContain("jwt");
  });

  it("texto benigno no se toca", () => {
    const t = "la regla de oro: si el número no mejora, la mejora no entra";
    expect(redacta(t)).toEqual({ texto: t, hallazgos: [] });
  });
});

describe("exclusión de rutas (empresa y terceros)", () => {
  it("work/** excluye lo interior", () => {
    expect(excluido("work/notas.md", EXCLUSION_MINIMA)).toBe(true);
  });

  it("company/** y .env* y *.pem quedan fuera", () => {
    expect(excluido("company/plan.md", EXCLUSION_MINIMA)).toBe(true);
    expect(excluido(".env.local", EXCLUSION_MINIMA)).toBe(true);
    expect(excluido("claves/server.pem", EXCLUSION_MINIMA)).toBe(true);
  });

  it("el proyecto de la empresa nombrado de otra forma también queda fuera", () => {
    // la exclusión se hace por segmento: ruta/*/secreto.md no pasa si la trucan
    expect(excluido("otra/carpeta/server.key", EXCLUSION_MINIMA)).toBe(true);
  });

  it("docs del proyecto propio SÍ entran", () => {
    expect(excluido("docs/PRUEBA-0.md", EXCLUSION_MINIMA)).toBe(false);
  });
});
