// El contrato del catálogo de productos: el kit firma, la app comprueba, y los dos tienen que sacar los MISMOS bytes.
// El fixture de este test lo firmó el propio código de la app (app/src/main/tienda/catalogo.ts) con una llave fija:
// si el kit firma distinto, la app dejaría de entender lo que el kit publica, y este test se cae.
import { describe, expect, it } from "vitest";
import { firmarCatalogo, verificarCatalogo, type Producto } from "../tienda/catalogo.ts";

const PRIVADA = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIAnUc9nJLkuZX2QeAKqXJxzPSD6UEOs3hVEpziUQp8cS
-----END PRIVATE KEY-----
`;
const PUBLICA = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAEcVtnSJXJlYz/2LAfcP/YfbMcVw9U0sjbYYD3aj3ZMA=
-----END PUBLIC KEY-----`;

// firmado por la app, con emitid 1700000000000
const FIRMADO_POR_LA_APP =
  '{"version":1,"emitido":1700000000000,"productos":[{"id":"neon-tokio","tipo":"piel","nombre":"Neón Tokio","autor":"Esme","descripcion":"Neón y lluvia","etiquetas":["neón"],"version":1,"contenido":{"nombre":"Neón Tokio"}}],"firma":"2CVIiIHp1LF3hvXSlclV61BUTS7bn6b6A47Uj9pkllGynDnDa37ezbKtv66aBlE6U2oNeUeaHlarSLWeQS7cCQ"}';

const producto: Producto = {
  id: "neon-tokio",
  tipo: "piel",
  nombre: "Neón Tokio",
  autor: "Esme",
  descripcion: "Neón y lluvia",
  etiquetas: ["neón"],
  version: 1,
  contenido: { nombre: "Neón Tokio" },
};

describe("el catálogo de productos: el kit firma lo que la app lee", () => {
  it("el kit firma byte a byte lo que firmó la app", () => {
    expect(firmarCatalogo([producto], PRIVADA, 1700000000000)).toBe(FIRMADO_POR_LA_APP);
  });

  it("el catálogo que firmó la app lo entiende el kit", () => {
    const r = verificarCatalogo(FIRMADO_POR_LA_APP, PUBLICA);
    expect(r.ok && r.productos.map((p) => p.id)).toEqual(["neon-tokio"]);
  });

  it("cambiar un producto rompe la firma", () => {
    const c = JSON.parse(firmarCatalogo([producto], PRIVADA, 1700000000000));
    c.productos[0].nombre = "Otro";
    expect(verificarCatalogo(JSON.stringify(c), PUBLICA).ok).toBe(false);
  });

  it("un catálogo firmado con otra clave no vale", () => {
    const otra = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIIUPYCGwOMtJUEmvar5sKHeM+C8+fRkpstcwXfjT/zdw
-----END PRIVATE KEY-----
`;
    expect(verificarCatalogo(firmarCatalogo([producto], otra, 1700000000000), PUBLICA).ok).toBe(false);
  });

  it("con varias claves de confianza vale la que firme", () => {
    const otraPub = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAXcxvxwZoTW8T+N8muItUL9m5LfL6vPxWHgR/5TFffPA=
-----END PUBLIC KEY-----`;
    expect(verificarCatalogo(FIRMADO_POR_LA_APP, [otraPub, PUBLICA]).ok).toBe(true);
  });

  it("lo que no es un catálogo, o trae productos sin forma, se rechaza sin romperse", () => {
    for (const x of ["", "{}", "null", '{"productos":5,"firma":"x"}']) {
      expect(verificarCatalogo(x, PUBLICA).ok).toBe(false);
    }
    const raro = firmarCatalogo([{ ...producto, tipo: "virus" } as never], PRIVADA, 1700000000000);
    expect(verificarCatalogo(raro, PUBLICA).ok).toBe(false);
  });

  it("dos productos con el mismo id invalidan el catálogo entero", () => {
    const c = firmarCatalogo([producto, { ...producto }], PRIVADA, 1700000000000);
    expect(verificarCatalogo(c, PUBLICA).ok).toBe(false);
  });
});
