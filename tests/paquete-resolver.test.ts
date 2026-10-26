/**
 * EL RESOLVER Y EL CANDADO — de una plantilla, lo que hay que instalar, y
 * cuándo hay que volver a preguntar.
 *
 * Paquetes sintéticos: las huellas son una letra repetida (`"d".repeat(64)`)
 * y nadie lee disco salvo las pruebas del candado, en carpetas temporales.
 *
 * Referencia: core/paquetes/resolver.ts, core/paquetes/lock.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ManifiestoV2Schema, type ManifiestoV2, type PaqueteConocido } from "../core/paquetes/manifiesto.ts";
import { resuelve } from "../core/paquetes/resolver.ts";
import { cambiosDesde, escribeLock, leeLock, type Lock } from "../core/paquetes/lock.ts";

const carpetas: string[] = [];
const temporal = (): string => {
  const d = mkdtempSync(join(tmpdir(), "esme-lock-"));
  carpetas.push(d);
  return d;
};
afterEach(() => {
  for (const d of carpetas.splice(0)) rmSync(d, { recursive: true, force: true });
});

const huella = (c: string): string => c.repeat(64);

/** Un manifiesto válido (pasa por el esquema de verdad). */
function manifiesto(id: string, version: string, extra: Record<string, unknown> = {}): ManifiestoV2 {
  return ManifiestoV2Schema.parse({
    schema_version: 2,
    id,
    version,
    name: id,
    kind: "package",
    description: "Un paquete de prueba, sintético.",
    author: "Prueba",
    license: "MIT",
    contributes: { tasks: [{ id: "t", title: "Una tarea", prompt: "Haz algo útil." }] },
    ...extra,
  });
}

const conocido = (id: string, version: string, sha256: string, extra: Record<string, unknown> = {}): PaqueteConocido => ({
  manifiesto: manifiesto(id, version, extra),
  sha256,
});

/** Una entrada de `uses` que fija este paquete por su huella. */
const uso = (p: PaqueteConocido, version = "*") => ({ id: p.manifiesto.id, version, sha256: p.sha256 });

const plantilla = (id: string, uses: ReturnType<typeof uso>[], extra: Record<string, unknown> = {}): ManifiestoV2 =>
  manifiesto(id, "1.0.0", { kind: "template", contributes: {}, uses, ...extra });

const ids = (ps: PaqueteConocido[]): string[] => ps.map((p) => p.manifiesto.id);

const netA = { kind: "net:fetch", hosts: ["a.example.com"] };

/** El diamante: R usa B y C, y los dos usan D con la misma huella. */
const diamante = () => {
  const D = conocido("esme.t.d", "1.0.0", huella("d"));
  const B = conocido("esme.t.b", "1.0.0", huella("b"), { uses: [uso(D, "^1")] });
  const C = conocido("esme.t.c", "1.0.0", huella("c"), { uses: [uso(D, "1.0")], permissions: [{ kind: "net:fetch", hosts: ["c.example.com"] }] });
  return { D, B, C };
};

describe("resuelve — una versión por paquete, sin ciclos", () => {
  it("el diamante resuelve: D una sola vez y antes que B y C", () => {
    const { D, B, C } = diamante();
    const r = resuelve(plantilla("esme.t.r", [uso(B), uso(C)]), [D, B, C]);
    expect(r.errores).toEqual([]);
    expect(r.ok).toBe(true);
    expect(ids(r.paquetes)).toEqual(["esme.t.d", "esme.t.b", "esme.t.c"]);
  });

  it("el orden de lo conocido no cambia nada", () => {
    const { D, B, C } = diamante();
    const R = plantilla("esme.t.r", [uso(B), uso(C)]);
    expect(resuelve(R, [C, B, D])).toEqual(resuelve(R, [D, B, C]));
  });

  it("D 1.0.0 frente a D 2.0.0: viene en dos versiones a la vez, y se dice quién pide cada una", () => {
    const D1 = conocido("esme.t.d", "1.0.0", huella("1"));
    const D2 = conocido("esme.t.d", "2.0.0", huella("2"));
    const B = conocido("esme.t.b", "1.0.0", huella("b"), { uses: [uso(D1)] });
    const C = conocido("esme.t.c", "1.0.0", huella("c"), { uses: [uso(D2)] });
    const r = resuelve(plantilla("esme.t.r", [uso(B), uso(C)]), [D1, D2, B, C]);
    expect(r.ok).toBe(false);
    expect(r.lock).toBeNull();
    expect(r.errores).toEqual(["esme.t.d viene en dos versiones a la vez: 1.0.0 (la pide esme.t.b) y 2.0.0 (la pide esme.t.c)"]);
  });

  it("la misma versión con dos huellas también choca", () => {
    const D1 = conocido("esme.t.d", "1.0.0", huella("1"));
    const D2 = conocido("esme.t.d", "1.0.0", huella("2"));
    const B = conocido("esme.t.b", "1.0.0", huella("b"), { uses: [uso(D1)] });
    const C = conocido("esme.t.c", "1.0.0", huella("c"), { uses: [uso(D2)] });
    const r = resuelve(plantilla("esme.t.r", [uso(B), uso(C)]), [D1, D2, B, C]);
    expect(r.errores).toEqual([
      "esme.t.d viene con dos huellas a la vez para la 1.0.0: 111111111111… (la pide esme.t.b) y 222222222222… (la pide esme.t.c)",
    ]);
  });

  it("A → B → A es un ciclo (B usa una A anterior: el ciclo se mira por id)", () => {
    const A1 = conocido("esme.t.a", "1.0.0", huella("a"));
    const B = conocido("esme.t.b", "1.0.0", huella("b"), { uses: [uso(A1)] });
    const r = resuelve(manifiesto("esme.t.a", "2.0.0", { uses: [uso(B)] }), [A1, B]);
    expect(r.ok).toBe(false);
    expect(r.errores).toEqual(["ciclo: esme.t.a → esme.t.b → esme.t.a"]);
  });

  it("una plantilla que se usa a sí misma también es un ciclo", () => {
    const T1 = conocido("esme.t.a", "1.0.0", huella("a"), { kind: "template" });
    const r = resuelve(plantilla("esme.t.a", [uso(T1)]), [T1]);
    expect(r.errores).toEqual(["ciclo: esme.t.a → esme.t.a"]);
  });

  it("una huella que no es de ninguna versión conocida: error con sus 12 primeros caracteres", () => {
    const D = conocido("esme.t.d", "1.0.0", huella("d"));
    const r = resuelve(plantilla("esme.t.r", [{ id: "esme.t.d", version: "*", sha256: huella("e") }]), [D]);
    expect(r.errores).toEqual(["esme.t.d: ninguna versión conocida tiene la huella eeeeeeeeeeee… (lo usa esme.t.r)"]);
  });

  it("una huella fijada cuya versión no cumple su rango: error", () => {
    const D = conocido("esme.t.d", "1.0.0", huella("d"));
    const r = resuelve(plantilla("esme.t.r", [uso(D, "^2")]), [D]);
    expect(r.ok).toBe(false);
    expect(r.errores).toEqual(["esme.t.d: la huella fijada es de la 1.0.0, que no cumple «^2» (lo usa esme.t.r)"]);
  });

  it("un id que nadie conoce: error", () => {
    const r = resuelve(plantilla("esme.t.r", [{ id: "esme.t.nadie", version: "*", sha256: huella("0") }]), []);
    expect(r.errores).toEqual(["esme.t.nadie: no se conoce ningún paquete con ese id (lo usa esme.t.r)"]);
  });

  it("todos los errores salen en una sola pasada", () => {
    const D = conocido("esme.t.d", "1.0.0", huella("d"));
    const B = conocido("esme.t.b", "1.0.0", huella("b"), { uses: [uso(D, "^2")] });
    const C = conocido("esme.t.c", "1.0.0", huella("c"), { uses: [{ id: "esme.t.d", version: "*", sha256: huella("e") }] });
    const R = plantilla("esme.t.r", [{ id: "esme.t.nadie", version: "*", sha256: huella("0") }, uso(B), uso(C)]);
    const r = resuelve(R, [D, B, C]);
    expect(r.errores).toEqual([
      "esme.t.nadie: no se conoce ningún paquete con ese id (lo usa esme.t.r)",
      "esme.t.d: la huella fijada es de la 1.0.0, que no cumple «^2» (lo usa esme.t.b)",
      "esme.t.d: ninguna versión conocida tiene la huella eeeeeeeeeeee… (lo usa esme.t.c)",
    ]);
  });

  it("los permisos son la suma de la raíz y de todo lo resuelto", () => {
    const D = conocido("esme.t.d", "1.0.0", huella("d"), { permissions: [{ kind: "net:fetch", hosts: ["b.example.com"] }] });
    const B = conocido("esme.t.b", "1.0.0", huella("b"), { uses: [uso(D)], permissions: ["mind:read"] });
    const r = resuelve(plantilla("esme.t.r", [uso(B)], { permissions: [netA] }), [D, B]);
    expect(r.permisos).toEqual(["mind:read", { kind: "net:fetch", hosts: ["a.example.com", "b.example.com"] }]);
  });

  it("una plantilla sin uses resuelve a nada, con sus permisos", () => {
    const r = resuelve(manifiesto("esme.t.r", "1.0.0", { kind: "template", permissions: [netA] }), []);
    expect(r.ok).toBe(true);
    expect(r.paquetes).toEqual([]);
    expect(r.lock?.paquetes).toEqual([]);
    expect(r.lock?.permisos).toEqual([netA]);
  });
});

describe("el candado — lo que se resolvió, escrito", () => {
  it("resolver da el candado: los paquetes por id, cada uno con sus permisos, y la suma", () => {
    const { D, B, C } = diamante();
    const r = resuelve(plantilla("esme.t.r", [uso(B), uso(C)]), [D, B, C], { sha256Raiz: huella("f") });
    expect(r.lock).toEqual({
      lock_version: 1,
      raiz: { id: "esme.t.r", version: "1.0.0", sha256: huella("f") },
      paquetes: [
        { id: "esme.t.b", version: "1.0.0", sha256: huella("b"), permisos: [] },
        { id: "esme.t.c", version: "1.0.0", sha256: huella("c"), permisos: [{ kind: "net:fetch", hosts: ["c.example.com"] }] },
        { id: "esme.t.d", version: "1.0.0", sha256: huella("d"), permisos: [] },
      ],
      permisos: [{ kind: "net:fetch", hosts: ["c.example.com"] }],
    });
  });

  it("hace ida y vuelta por disco: JSON con dos espacios, paquetes por id y salto de línea final", () => {
    const { D, B, C } = diamante();
    const lock = resuelve(plantilla("esme.t.r", [uso(B), uso(C)]), [D, B, C]).lock!;
    const ruta = join(temporal(), "esme.lock.json");
    escribeLock(ruta, lock);
    expect(leeLock(ruta)).toEqual(lock);
    const texto = readFileSync(ruta, "utf8");
    expect(texto).toBe(`${JSON.stringify(lock, null, 2)}\n`);
    expect(texto.startsWith('{\n  "lock_version": 1,\n  "raiz": {')).toBe(true);
  });

  it("se escribe siempre igual: los paquetes por id y las claves en su orden, venga como venga", () => {
    const desordenado = {
      permisos: [],
      paquetes: [
        { permisos: [], sha256: huella("d"), version: "1.0.0", id: "esme.t.d" },
        { sha256: huella("b"), id: "esme.t.b", version: "1.0.0", permisos: [] },
      ],
      raiz: { version: "1.0.0", id: "esme.t.r" },
      lock_version: 1,
    } as Lock;
    const ruta = join(temporal(), "esme.lock.json");
    escribeLock(ruta, desordenado);
    const texto = readFileSync(ruta, "utf8");
    expect(texto.indexOf('"esme.t.b"')).toBeLessThan(texto.indexOf('"esme.t.d"'));
    expect(texto.indexOf('"lock_version"')).toBeLessThan(texto.indexOf('"raiz"'));
    expect(texto).toContain('{\n      "id": "esme.t.b",\n      "version": "1.0.0",');
  });

  it("un candado roto no se escribe", () => {
    const roto = { lock_version: 1, raiz: { id: "esme.t.r", version: "1.0.0" }, paquetes: [{ id: "esme.t.b", version: "1.0.0", sha256: "xyz", permisos: [] }], permisos: [] } as Lock;
    const ruta = join(temporal(), "esme.lock.json");
    expect(() => escribeLock(ruta, roto)).toThrow(/candado/);
    expect(leeLock(ruta)).toBeNull();
  });

  it("un candado roto, ajeno o que no está da null («nada consentido»)", () => {
    const dir = temporal();
    const escribe = (nombre: string, texto: string) => {
      writeFileSync(join(dir, nombre), texto);
      return join(dir, nombre);
    };
    expect(leeLock(join(dir, "no-esta.json"))).toBeNull();
    expect(leeLock(escribe("roto.json", "{ roto"))).toBeNull();
    expect(leeLock(escribe("otra-version.json", JSON.stringify({ lock_version: 2, raiz: { id: "esme.t.r", version: "1.0.0" }, paquetes: [], permisos: [] })))).toBeNull();
    expect(leeLock(escribe("de-mas.json", JSON.stringify({ lock_version: 1, raiz: { id: "esme.t.r", version: "1.0.0" }, paquetes: [], permisos: [], extra: true })))).toBeNull();
    const repetido = { id: "esme.t.b", version: "1.0.0", sha256: huella("b"), permisos: [] };
    expect(leeLock(escribe("repetido.json", JSON.stringify({ lock_version: 1, raiz: { id: "esme.t.r", version: "1.0.0" }, paquetes: [repetido, repetido], permisos: [] })))).toBeNull();
    expect(leeLock(escribe("permiso-raro.json", JSON.stringify({ lock_version: 1, raiz: { id: "esme.t.r", version: "1.0.0" }, paquetes: [], permisos: ["todo:todo"] })))).toBeNull();
  });
});

describe("cambiosDesde — cuándo se vuelve a pedir permiso", () => {
  const conD = (sha: string, version: string, permissions: unknown[] = [netA]) => {
    const D = conocido("esme.t.d", version, huella(sha), { permissions });
    return resuelve(plantilla("esme.t.r", [uso(D)]), [D]).lock!;
  };

  it("sin candado (o roto) pide consentimiento: todo es nuevo", () => {
    const { D, B, C } = diamante();
    const lock = resuelve(plantilla("esme.t.r", [uso(B), uso(C)]), [D, B, C]).lock!;
    const c = cambiosDesde(null, lock);
    expect(c.pideConsentimiento).toBe(true);
    expect(c.nuevos).toEqual(["esme.t.b", "esme.t.c", "esme.t.d"]);
    expect(c.permisosNuevos).toEqual(lock.permisos);
  });

  it("el mismo candado no pide nada", () => {
    const l = conD("1", "1.0.0");
    expect(cambiosDesde(l, l)).toEqual({ nuevos: [], quitados: [], huellas: [], permisosNuevos: [], pideConsentimiento: false });
  });

  it("cambiar solo la huella de D, con los mismos permisos, lo pide, y nombra a D", () => {
    const c = cambiosDesde(conD("1", "1.0.0"), conD("2", "1.0.1"));
    expect(c.huellas).toEqual([{ id: "esme.t.d", antes: huella("1"), despues: huella("2") }]);
    expect(c.permisosNuevos).toEqual([]);
    expect(c.nuevos).toEqual([]);
    expect(c.pideConsentimiento).toBe(true);
  });

  it("quitar C no lo pide (aunque se lleve sus permisos)", () => {
    const { D, B, C } = diamante();
    const antes = resuelve(plantilla("esme.t.r", [uso(B), uso(C)]), [D, B, C]).lock!;
    const ahora = resuelve(plantilla("esme.t.r", [uso(B)]), [D, B, C]).lock!;
    expect(cambiosDesde(antes, ahora)).toEqual({ nuevos: [], quitados: ["esme.t.c"], huellas: [], permisosNuevos: [], pideConsentimiento: false });
  });

  it("un host nuevo lo pide, y sale en permisosNuevos", () => {
    const c = cambiosDesde(conD("1", "1.0.0"), conD("2", "1.1.0", [{ kind: "net:fetch", hosts: ["a.example.com", "b.example.com"] }]));
    expect(c.permisosNuevos).toEqual([{ kind: "net:fetch", hosts: ["b.example.com"] }]);
    expect(c.pideConsentimiento).toBe(true);
  });

  it("un permiso que ya tenía otro paquete, nuevo para este, también sale", () => {
    const X = conocido("esme.t.x", "1.0.0", huella("a"), { permissions: [netA] });
    const Y1 = conocido("esme.t.y", "1.0.0", huella("1"));
    const Y2 = conocido("esme.t.y", "1.1.0", huella("2"), { permissions: [netA] });
    const antes = resuelve(plantilla("esme.t.r", [uso(X), uso(Y1)]), [X, Y1]).lock!;
    const ahora = resuelve(plantilla("esme.t.r", [uso(X), uso(Y2)]), [X, Y2]).lock!;
    const c = cambiosDesde(antes, ahora);
    expect(c.permisosNuevos).toEqual([netA]);
    expect(c.huellas.map((h) => h.id)).toEqual(["esme.t.y"]);
  });

  it("el candado de otra plantilla no vale: todo es nuevo", () => {
    const D = conocido("esme.t.d", "1.0.0", huella("d"), { permissions: [netA] });
    const deX = resuelve(plantilla("esme.t.x", [uso(D)]), [D]).lock!;
    const deY = resuelve(plantilla("esme.t.y", [uso(D)]), [D]).lock!;
    const c = cambiosDesde(deX, deY);
    expect(c.pideConsentimiento).toBe(true);
    expect(c.nuevos).toEqual(["esme.t.d"]);
    expect(c.permisosNuevos).toEqual([netA]);
  });
});
