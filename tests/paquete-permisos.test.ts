/**
 * LOS PERMISOS CON ALCANCE — lo que un paquete pide, con sus límites.
 *
 * Un `net:fetch` a secas es «toda la red»; uno con `hosts` es «estos sitios
 * y ninguno más». La diferencia es la que separa un paquete que puede
 * mandar tus datos a cualquier parte de uno que solo habla con su servidor.
 *
 * Referencia: core/paquetes/permisos.ts, estandar/paquete.spec.yaml.
 */
import { describe, expect, it } from "vitest";
import {
  ALCANCES,
  permiteHost,
  permitePrograma,
  permisosNuevos,
  unePermisos,
  type Permiso,
} from "../core/paquetes/permisos.ts";
import { PermisoSchema } from "../core/paquetes/manifiesto.ts";
import { CAPABILITIES } from "../core/extension-host/capability.ts";

describe("permiteHost — por etiquetas, no por texto", () => {
  const sub: Permiso[] = [{ kind: "net:fetch", hosts: ["*.example.com"] }];

  it("un comodín cubre los subdominios, a cualquier profundidad", () => {
    expect(permiteHost(sub, "a.example.com")).toBe(true);
    expect(permiteHost(sub, "a.b.example.com")).toBe(true);
  });

  it("el comodín NO cubre el dominio desnudo ni los que se le parecen", () => {
    expect(permiteHost(sub, "example.com")).toBe(false);
    expect(permiteHost(sub, "evil-example.com")).toBe(false);
    expect(permiteHost(sub, "example.com.evil.net")).toBe(false);
  });

  it("sin mayúsculas y sin el punto final: EXAMPLE.com. es example.com", () => {
    expect(permiteHost([{ kind: "net:fetch", hosts: ["example.com"] }], "EXAMPLE.com.")).toBe(true);
  });

  it("un host exacto no cubre sus subdominios", () => {
    expect(permiteHost([{ kind: "net:fetch", hosts: ["example.com"] }], "a.example.com")).toBe(false);
  });

  it("net:fetch a secas es toda la red; sin net:fetch, ninguna", () => {
    expect(permiteHost(["net:fetch"], "x.y")).toBe(true);
    expect(permiteHost([], "x.y")).toBe(false);
    expect(permiteHost(["mind:read"], "x.y")).toBe(false);
  });

  it("lo que no es un host no pasa (una URL, un puerto, espacios, nada)", () => {
    for (const malo of ["https://x.y", "x.y/z", "x.y:443", "x y", "", "."]) {
      expect(permiteHost(["net:fetch"], malo), malo).toBe(false);
    }
  });
});

describe("permitePrograma — por su nombre lógico", () => {
  it("proc:spawn a secas deja cualquiera; con programs, solo esos", () => {
    expect(permitePrograma(["proc:spawn"], "npx")).toBe(true);
    expect(permitePrograma([{ kind: "proc:spawn", programs: ["npx"] }], "npx")).toBe(true);
    expect(permitePrograma([{ kind: "proc:spawn", programs: ["npx"] }], "node")).toBe(false);
    expect(permitePrograma([], "npx")).toBe(false);
  });
});

describe("PermisoSchema — la forma de un permiso", () => {
  const vale = (p: unknown) => PermisoSchema.safeParse(p).success;

  it("la forma corta es cada capacidad de la lista cerrada", () => {
    for (const c of CAPABILITIES) expect(vale(c), c).toBe(true);
    expect(vale("net:raw")).toBe(false);
  });

  it("la forma larga lleva el alcance que es suyo, y ningún otro", () => {
    expect(vale({ kind: "net:fetch", hosts: ["a.com", "*.b.com"] })).toBe(true);
    expect(vale({ kind: "fs:project", paths: ["docs/**"] })).toBe(true);
    expect(vale({ kind: "proc:spawn", programs: ["npx", "claude-agent-acp"] })).toBe(true);
    expect(vale({ kind: "mind:read", hosts: ["a.com"] })).toBe(false);
    expect(vale({ kind: "net:fetch", programs: ["npx"] })).toBe(false);
  });

  it("un objeto sin alcance no vale: para eso está la forma corta", () => {
    const r = PermisoSchema.safeParse({ kind: "net:fetch" });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("forma corta");
  });

  it("un host es un host: ni esquema, ni ruta, ni mayúsculas, ni vacío", () => {
    expect(vale({ kind: "net:fetch", hosts: ["https://a.com"] })).toBe(false);
    expect(vale({ kind: "net:fetch", hosts: ["a.com/x"] })).toBe(false);
    expect(vale({ kind: "net:fetch", hosts: ["A.com"] })).toBe(false);
    expect(vale({ kind: "net:fetch", hosts: [] })).toBe(false);
    expect(vale({ kind: "net:fetch", hosts: ["*"] })).toBe(true);
  });

  it("un programa va por su nombre, no por su ruta", () => {
    expect(vale({ kind: "proc:spawn", programs: ["/usr/bin/node"] })).toBe(false);
    expect(vale({ kind: "proc:spawn", programs: ["..\\node"] })).toBe(false);
  });

  it("una ruta de fs:project se queda dentro del proyecto", () => {
    expect(vale({ kind: "fs:project", paths: ["../x"] })).toBe(false);
    expect(vale({ kind: "fs:project", paths: ["/etc"] })).toBe(false);
    expect(vale({ kind: "fs:project", paths: ["a/../../b"] })).toBe(false);
    // ni caracteres de control: una ruta así, al enseñarla, escribiría en tu terminal
    for (const r of ["a\u001b[31mb", "a\nb", "a\tb", "a\u0000b", "a\u007fb", "a\u202eb"])
      expect(vale({ kind: "fs:project", paths: [r] }), JSON.stringify(r)).toBe(false);
  });

  it("los alcances son los de la spec: red con hosts, disco con paths, procesos con programs", () => {
    expect(ALCANCES["net:fetch"]).toEqual(["hosts"]);
    expect(ALCANCES["fs:project"]).toEqual(["paths"]);
    expect(ALCANCES["proc:spawn"]).toEqual(["programs"]);
    for (const c of ["mind:read", "mind:write", "ipc:emit", "ui:render"] as const) {
      expect(ALCANCES[c]).toEqual([]);
    }
  });
});

describe("unePermisos — la suma de lo que se pide", () => {
  it("junta los alcances sin duplicados, en orden, y en el orden de la lista cerrada", () => {
    expect(
      unePermisos(
        [{ kind: "net:fetch", hosts: ["b.com"] }],
        [{ kind: "net:fetch", hosts: ["a.com", "b.com"] }, "mind:read"]
      )
    ).toEqual(["mind:read", { kind: "net:fetch", hosts: ["a.com", "b.com"] }]);
  });

  it("sin límite gana a con límite", () => {
    expect(unePermisos([{ kind: "net:fetch", hosts: ["a.com"] }], ["net:fetch"])).toEqual(["net:fetch"]);
  });

  it("nada más nada es nada", () => {
    expect(unePermisos([], [])).toEqual([]);
  });
});

describe("permisosNuevos — lo que ahora se pide y antes no", () => {
  it("lo cubierto no es nuevo; lo que sale del alcance, sí", () => {
    expect(
      permisosNuevos(
        [{ kind: "net:fetch", hosts: ["*.a.com"] }],
        [{ kind: "net:fetch", hosts: ["x.a.com", "b.com"] }]
      )
    ).toEqual([{ kind: "net:fetch", hosts: ["b.com"] }]);
  });

  it("quien tenía toda la red no estrena nada al pedir un sitio", () => {
    expect(permisosNuevos(["net:fetch"], [{ kind: "net:fetch", hosts: ["b.com"] }])).toEqual([]);
  });

  it("pasar de un sitio a toda la red es pedir toda la red", () => {
    expect(permisosNuevos([{ kind: "net:fetch", hosts: ["b.com"] }], ["net:fetch"])).toEqual(["net:fetch"]);
  });

  it("una capacidad que antes no estaba es nueva entera", () => {
    expect(permisosNuevos(["mind:read"], ["mind:read", "mind:write"])).toEqual(["mind:write"]);
  });

  it("un comodín más ancho no lo cubre uno más estrecho", () => {
    expect(
      permisosNuevos([{ kind: "net:fetch", hosts: ["*.b.a.com"] }], [{ kind: "net:fetch", hosts: ["*.a.com"] }])
    ).toEqual([{ kind: "net:fetch", hosts: ["*.a.com"] }]);
  });
});
