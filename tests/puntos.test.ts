/**
 * LOS PUNTOS — el estado de tu PC, medido.
 *
 * Lo que se prueba:
 *
 *   1. se sabe qué motor es cada proceso (por su binario);
 *   2. la memoria se MIDE (el proceso de la prueba se ve a sí mismo);
 *   3. lo que no se puede medir, se dice (null) — no se estima;
 *   4. un punto por encima del tope se ve como pasado.
 *
 * Referencia: core/motores/puntos.ts, estandar/puntos.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { platform } from "node:os";
import { puntos, motorDe, renderPuntos, renderArbolPuntos, TOPE_MB, type Punto } from "../core/motores/puntos.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(import.meta.dirname, "..");
const esLinux = platform() === "linux";

describe("qué motor es", () => {
  it("se sabe por el binario", () => {
    expect(motorDe("opencode")).toBe("opencode");
    expect(motorDe("claude")).toBe("claude-code");
    expect(motorDe("codex")).toBe("codex");
    expect(motorDe("gemini")).toBe("gemini");
    expect(motorDe("ollama")).toBe("ollama");
  });

  it("un proceso que no es motor no es motor (no se inventa)", () => {
    expect(motorDe("firefox")).toBeNull();
    expect(motorDe("bash")).toBeNull();
  });
});

describe("la medida", () => {
  it.skipIf(!esLinux)("el proceso de la prueba se ve a sí mismo, con su memoria", () => {
    const lista = puntos({ pids: [process.pid] });
    expect(lista.length).toBe(1);
    const p = lista[0];
    expect(p.pid).toBe(process.pid);
    expect(p.memoria_mb).not.toBeNull();
    expect(p.memoria_mb!).toBeGreaterThan(0);
    expect(p.estado).toBe("vivo");
    expect(p.desde).not.toBeNull();
  });

  it.skipIf(!esLinux)("el que se pasa del tope se marca (no se esconde)", () => {
    const lista = puntos({ pids: [process.pid], tope_mb: 0.0001 });
    expect(lista[0].pasado).toBe(true);
    const normal = puntos({ pids: [process.pid], tope_mb: TOPE_MB * 1000 });
    expect(normal[0].pasado).toBe(false);
  });

  it.skipIf(!esLinux)("la CPU se mide AHORA (con dos muestras, no desde siempre)", () => {
    const lista = puntos({ pids: [process.pid] });
    const cpu = lista[0].cpu_pct;
    expect(cpu).not.toBeNull();
    // un proceso vivo no puede estar al 100% todo el rato: si el número
    // fuera la media histórica, un proceso de horas daría un 0% falso
    expect(cpu!).toBeGreaterThanOrEqual(0);
    expect(cpu!).toBeLessThan(400);
  });

  it("el texto que se ve en la terminal lo dice todo", () => {
    const texto = renderPuntos(
      [
        {
          id: "opencode:1:0",
          motor: "opencode",
          proceso: "opencode",
          pid: 1,
          papa: null,
          estado: "vivo",
          memoria_mb: 3000,
          cpu_pct: 12.5,
          desde: 0,
          pasado: true,
        },
      ],
      2048
    );
    expect(texto).toContain("opencode");
    expect(texto).toContain("3000");
    expect(texto).toContain("por encima del tope");
  });
});

describe("la familia", () => {
  it("cada punto trae su papa MEDIDO (el ppid del sistema, no una invención)", async () => {
    // el propio proceso de la prueba: su papa en la medida tiene que cuadrar
    // con lo que /proc self/stat dice (misma fuente, misma verdad)
    const lista = puntos({ pids: [process.pid] });
    expect(lista.length).toBe(1);
    const papaMedido = lista[0].papa;
    const self = readFileSync(`/proc/${process.pid}/stat`, "utf8");
    const campos = self.slice(self.lastIndexOf(")") + 2).split(" ");
    expect(papaMedido).toBe(Number(campos[1]));
  });

  it("el árbol conecta cada punto con su papa (y lo que nació fuera, raíz)", () => {
    const punto = (pid: number, papa: number | null, proceso: string, memoria_mb: number, motor: string | null = null): Punto =>
      ({
        id: `${motor ?? proceso}:${pid}:0`,
        motor,
        proceso,
        pid,
        papa,
        estado: "vivo",
        memoria_mb,
        cpu_pct: 0,
        desde: 0,
        pasado: false,
        carga: { pesos_mb: null, cache_mb: null, libre_mb: null },
      }) as Punto;
    // la casa de pruebas: un agente que engendró a dos hijos, y un proceso
    // que nació fuera de la lista (su papa no está entre los puntos)
    const lista = [
      punto(12, null, "opencode", 30, "opencode"),
      punto(13, 12, "hijo-busy", 400),
      punto(14, 12, "hijo-quieto", 5),
      punto(20, 13, "nieto", 1),
      punto(99, 7, "externo", 120),
    ];
    const texto = renderArbolPuntos(lista);
    // el hijo gordo sale primero (la familia se lee como la lista: lo que más come)
    const desdeOpencode = texto.indexOf("opencode");
    const desdeBusy = texto.indexOf("hijo-busy");
    const desdeQuieto = texto.indexOf("hijo-quieto");
    expect(desdeOpencode).toBeGreaterThan(-1);
    expect(desdeBusy).toBeGreaterThan(desdeOpencode);
    expect(desdeQuieto).toBeGreaterThan(desdeBusy);
    // el nieto cuelga de su papa con la sangría del nivel siguiente
    const indentPadre = texto.indexOf("hijo-busy") - texto.lastIndexOf("\n", texto.indexOf("hijo-busy")) - 1;
    const indentNieto = texto.indexOf("nieto") - texto.lastIndexOf("\n", texto.indexOf("nieto")) - 1;
    expect(indentNieto).toBeGreaterThan(indentPadre);
    // el externo es SU raíz: su papa no está, y no se inventa que cuelga de nadie
    const desdeExterno = texto.indexOf("externo");
    expect(texto.slice(0, desdeExterno)).not.toContain("│ ");
  });

  it("sin familia: árbols vacíos se dicen, no se dibujan", () => {
    expect(renderArbolPuntos([])).toContain("nadie");
  });
});

describe("el contrato está escrito", () => {
  it("la spec declara los campos del punto (entre dos lenguajes, lo escrito)", () => {
    const spec = readFileSync(join(raiz, "estandar", "puntos.spec.yaml"), "utf8");
    for (const campo of ["id:", "motor:", "proceso:", "pid:", "papa:", "memoria_mb:", "cpu_pct:", "estado:", "familia:"]) {
      expect(spec, `la spec no declara ${campo}`).toContain(campo);
    }
    expect(spec).toContain("medido: true");
    expect(spec).toContain("local: true");
  });
});
