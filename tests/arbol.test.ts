/**
 * EL ÁRBOL DE TUS FICHEROS — la carpeta como árbol, medida.
 *
 * Lo que se prueba:
 *
 *   1. la estirpe: cada nodo trae su papa, su altura y su nombre;
 *   2. el peso cuadra con lo medido (stat de verdad, no una estimación);
 *   3. la rama que más pesa, arriba;
 *   4. lo que no se pudo mirar se Dice (a ciegas, peso null); no cero;
 *   5. los enlaces no se siguen;
 *   6. los saltos: lo que pediste saltar no está, y no es silencio;
 *   7. el dibujo es un árbol, no una lista: la sangría crece por generación;
 *   8. el contrato está escrito (la spec declara la forma).
 *
 * Referencia: core/ficheros.ts, estandar/arbol.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { arbolFicheros, renderArbolFicheros, pesoHumano, totalRama, type NodoArbol } from "../core/ficheros.ts";

const raiz = join(import.meta.dirname, "..");
/** ser root vuelve imposible «a ciegas» (chmod no lo detiene): la prueba se salta sola */
const somoRoot = typeof process.getuid === "function" && process.getuid() === 0;

/** Un banco en tmp, todo MEDIDO: el nombre del fichero es su peso en bytes. */
function banco(): string {
  const tmp = mkdtempSync(join(tmpdir(), "arbol-"));
  mkdirSync(join(tmp, "grande"), { recursive: true });
  mkdirSync(join(tmp, "grande", "hondo"), { recursive: true });
  mkdirSync(join(tmp, "chico"), { recursive: true });
  mkdirSync(join(tmp, "vacia"), { recursive: true });
  writeFileSync(join(tmp, "raiz.txt"), Buffer.alloc(10));
  writeFileSync(join(tmp, "grande", "nod400.txt"), Buffer.alloc(400));
  writeFileSync(join(tmp, "grande", "hondo", "nod20.txt"), Buffer.alloc(20));
  writeFileSync(join(tmp, "chico", "n5.txt"), Buffer.alloc(5));
  return tmp;
}

function busca(nodo: NodoArbol, nombre: string): NodoArbol | undefined {
  if (nodo.nombre === nombre) return nodo;
  for (const hijo of nodo.hijos) {
    const hallado = busca(hijo, nombre);
    if (hallado) return hallado;
  }
  return undefined;
}

describe("la estirpe", () => {
  it("cada nodo trae su papa, su altura y su nombre", () => {
    const tmp = banco();
    const arbol = arbolFicheros({ ruta: tmp });
    try {
      // la raíz: sin papa, altura 0
      expect(arbol.papa).toBeNull();
      expect(arbol.profundo).toBe(0);
      expect(arbol.tipo).toBe("carpeta");
      expect(arbol.id).toBe(".");
      // un nieto cuelga de su papa con la altura exacta
      const hondo = busca(arbol, "hondo")!;
      expect(hondo.papa).toBe("grande");
      expect(hondo.profundo).toBe(2);
      const fichero = busca(arbol, "nod400.txt")!;
      expect(fichero.papa).toBe("grande");
      expect(fichero.profundo).toBe(2);
      expect(fichero.tipo).toBe("fichero");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("la medida", () => {
  it("el peso cuadra con stat, hasta el byte", () => {
    const tmp = banco();
    try {
      const arbol = arbolFicheros({ ruta: tmp });
      // la suma se sabe de antemano: se escribió con lima y sello
      expect(arbol.peso_bytes).toBe(10 + 400 + 20 + 5);
      const grande = busca(arbol, "grande")!;
      expect(grande.peso_bytes).toBe(400 + 20);
      const nod400 = busca(arbol, "nod400.txt")!;
      expect(nod400.peso_bytes).toBe(400);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("la carpeta cuenta lo que vio debajo", () => {
    const tmp = banco();
    try {
      const arbol = arbolFicheros({ ruta: tmp });
      expect(arbol.carpetas).toBe(3);
      expect(arbol.ficheros).toBe(1);
      const total = totalRama(arbol);
      expect(total.carpetas).toBe(4);
      expect(total.ficheros).toBe(4);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("el orden", () => {
  it("la rama que más pesa, arriba", () => {
    const tmp = banco();
    try {
      const arbol = arbolFicheros({ ruta: tmp });
      const nombres = arbol.hijos.map((h) => h.nombre);
      // grande (420) > raiz.txt (10) > chico (5) > vacía (0): el peso manda
      expect(nombres).toEqual(["grande", "raiz.txt", "chico", "vacia"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("o por su nombre, si así se pide", () => {
    const tmp = banco();
    try {
      const arbol = arbolFicheros({ ruta: tmp, orden: "alfabeto" });
      const nombres = arbol.hijos.map((h) => h.nombre);
      expect(nombres.filter((n) => n.startsWith("c") || n.startsWith("g"))).toEqual(["chico", "grande"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("lo que no se mide", () => {
  it.skipIf(somoRoot)("la carpeta sin permiso no es un cero: está a ciegas y su peso queda en el aire", () => {
    const tmp = banco();
    const cerrada = join(tmp, "cerrada");
    mkdirSync(cerrada);
    chmodSync(cerrada, 0o000);
    try {
      const arbol = arbolFicheros({ ruta: tmp });
      const ciega = busca(arbol, "cerrada")!;
      expect(ciega.ciega).toBe(true);
      expect(ciega.peso_bytes).toBeNull();
      // y la raíz hereda la duda: su total no lo sabe decir
      expect(arbol.peso_bytes).toBeNull();
      // ...y lo dice en el dibujo
      expect(renderArbolFicheros(arbol)).toContain("a ciegas");
    } finally {
      chmodSync(cerrada, 0o755);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("los enlaces no se siguen: se mide el ENLACE, no su destino", () => {
    const tmp = banco();
    symlinkSync(join(tmp, "raiz.txt"), join(tmp, "atajo.txt"), "file");
    try {
      const arbol = arbolFicheros({ ruta: tmp });
      const atajo = busca(arbol, "atajo.txt")!;
      expect(atajo.tipo).toBe("otro");
      // el enlace pesa (lstat lo mide); su destino NO se abre: no hay dos raiz.txt
      expect(atajo.peso_bytes).not.toBeNull();
      expect(atajo.peso_bytes!).toBeLessThan(1024);
      expect(arbol.peso_bytes).toBe(10 + 400 + 20 + 5 + (atajo.peso_bytes ?? 0));
      // y el dibujo lo dice
      expect(renderArbolFicheros(arbol)).toContain("atajo.txt (enlace");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("los saltos: lo que pediste saltar no está (y no es silencio)", () => {
    const tmp = banco();
    try {
      const arbol = arbolFicheros({ ruta: tmp, saltos: ["grande"] });
      expect(busca(arbol, "grande")).toBeUndefined();
      expect(arbol.peso_bytes).toBe(10 + 5);
      expect(arbol.carpetas).toBe(2);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("el dibujo es un árbol", () => {
  it("la sangría crece por generación (no es una lista sangrada de tomo y lomo)", () => {
    const tmp = banco();
    try {
      const texto = renderArbolFicheros(arbolFicheros({ ruta: tmp }));
      // el título trae los números de la cosecha
      expect(texto).toContain("árbol (");
      expect(texto).toContain("4 carpetas");
      expect(texto).toContain("4 ficheros");
      // el nieto cuelga con más sangría que su papa
      const grande = texto.indexOf("grande/");
      const nod400 = texto.indexOf("nod400.txt");
      const hondo = texto.indexOf("hondo/");
      const nod20 = texto.indexOf("nod20.txt");
      const sangria = (at: number): number => at - texto.lastIndexOf("\n", at) - 1;
      expect(sangria(nod400)).toBeGreaterThan(sangria(grande));
      expect(sangria(nod20)).toBeGreaterThan(sangria(hondo));
      // la carpeta vacía se dice, y el peso humano va con la medida
      expect(texto).toContain("vacia/");
      expect(texto).toContain("435 B");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("el peso humano", () => {
  it("lo pequeño en B, lo mediano en KB, lo grande en MB", () => {
    expect(pesoHumano(10)).toBe("10 B");
    expect(pesoHumano(425)).toBe("425 B");
    expect(pesoHumano(1024)).toBe("1.0 KB");
    expect(pesoHumano(1024 * 1024)).toBe("1.0 MB");
    expect(pesoHumano(null)).toBe("en el aire");
  });
});

describe("el contrato está escrito", () => {
  it("la spec declara la forma del nodo (entre dos lenguas, lo escrito)", () => {
    const spec = readFileSync(join(raiz, "estandar", "arbol.spec.yaml"), "utf8");
    for (const campo of ["id:", "nombre:", "ruta:", "papa:", "profundo:", "tipo:", "peso_bytes:", "ciega:"]) {
      expect(spec, `la spec no declara ${campo}`).toContain(campo);
    }
    expect(spec).toContain("medido: true");
    expect(spec).toContain("local: true");
    expect(spec).toContain("orden");
  });
});
