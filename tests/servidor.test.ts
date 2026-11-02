/**
 * EL SERVIDOR DE LA TIENDA — qué fichero sale por cada URL.
 *
 * La URL siempre va con «/», sea cual sea el sistema; la ruta del disco, con
 * el separador del sistema. Si se mezclan, en Windows nada casaba con los
 * prefijos (todo era 404) o, peor, un «\» en la URL podía subir de carpeta.
 * Aquí se prueba con las rutas de Windows (path.win32) y con las de aquí.
 *
 * Referencia: tienda/servidor.ts.
 */
import { describe, expect, it } from "vitest";
import { posix, win32 } from "node:path";
import { ficheroServible } from "../tienda/servidor.ts";

describe("el servidor de la tienda: de la URL al fichero", () => {
  const tiendaWin = "C:\\kit\\tienda";

  it("en Windows, lo que se puede servir se encuentra (con «\\» en el disco)", () => {
    expect(ficheroServible(tiendaWin, "/index.json", win32)).toBe("C:\\kit\\tienda\\index.json");
    expect(ficheroServible(tiendaWin, "/rotaciones.json", win32)).toBe("C:\\kit\\tienda\\rotaciones.json");
    expect(ficheroServible(tiendaWin, "/firmas/esme.nucleo.puerta.artefacto.json", win32)).toBe(
      "C:\\kit\\tienda\\firmas\\esme.nucleo.puerta.artefacto.json"
    );
    expect(ficheroServible(tiendaWin, "/paquetes/esme-nucleo-puerta-0.1.0.tgz?v=1", win32)).toBe(
      "C:\\kit\\tienda\\paquetes\\esme-nucleo-puerta-0.1.0.tgz"
    );
  });

  it("en Windows, un «\\» en la URL no sube de carpeta", () => {
    expect(ficheroServible(tiendaWin, "/firmas/..\\..\\package.json", win32)).toBeNull();
    expect(ficheroServible(tiendaWin, "/firmas/..%5C..%5Cpackage.json", win32)).toBeNull();
    expect(ficheroServible(tiendaWin, "/paquetes/C:\\Windows\\win.ini", win32)).toBeNull();
  });

  it("en cualquier sistema, nada fuera de lo servible ni por encima de la tienda", () => {
    for (const sistema of [posix, win32]) {
      const tienda = sistema === win32 ? tiendaWin : "/kit/tienda";
      expect(ficheroServible(tienda, "/package.json", sistema)).toBeNull();
      expect(ficheroServible(tienda, "/firmas/../../package.json", sistema)).toBeNull();
      expect(ficheroServible(tienda, "/firmas/%2e%2e/%2e%2e/package.json", sistema)).toBeNull();
      expect(ficheroServible(tienda, "/firmas/", sistema)).toBeNull();
      expect(ficheroServible(tienda, "/index.json%00.txt", sistema)).toBeNull();
      expect(ficheroServible(tienda, "/%E0%A4%A", sistema)).toBeNull();
    }
    expect(ficheroServible("/kit/tienda", "/index.json", posix)).toBe("/kit/tienda/index.json");
  });
});
