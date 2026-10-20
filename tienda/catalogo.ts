// El catálogo de productos de la Tienda (estandar/catalogo-productos.spec.yaml): los productos que se publican con
// la firma Ed25519 de quien publica. La app comprueba la misma firma con el mismo orden de bytes: el test
// `tests/catalogo-productos.test.ts` lo fija con un ejemplo firmado por el propio código de la app, así que las dos
// implementaciones no pueden separarse sin que se caiga el test.
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export type TipoProducto = "piel" | "herramienta" | "agente" | "app";

export type Producto = {
  id: string;
  tipo: TipoProducto;
  nombre: string;
  autor: string;
  descripcion: string;
  etiquetas: string[];
  version: number;
  precio?: number;
  contenido: Record<string, unknown>;
};

type Firmado = { version: 1; emitido: number; productos: Producto[]; firma: string };

const TIPOS: TipoProducto[] = ["piel", "herramienta", "agente", "app"];

/** Los bytes que se firman: JSON con las claves en ESTE orden (el orden es parte de la spec). */
const cuerpo = (emitido: number, productos: Producto[]): Buffer =>
  Buffer.from(JSON.stringify({ version: 1, emitido, productos }));

/** Lo usa el script que publica (scripts/publicar-catalogo.ts). La app nunca firma. */
export function firmarCatalogo(
  productos: Producto[],
  clavePrivadaPem: string,
  emitido = Date.now(),
): string {
  const firma = sign(null, cuerpo(emitido, productos), createPrivateKey(clavePrivadaPem)).toString(
    "base64url",
  );
  return JSON.stringify({ version: 1, emitido, productos, firma } satisfies Firmado);
}

/** ¿Este producto tiene la forma que la spec exige? */
export function esProducto(p: unknown): p is Producto {
  const x = p as Partial<Producto>;
  return (
    !!x &&
    typeof x === "object" &&
    typeof x.id === "string" &&
    /^[a-z0-9-]{2,60}$/.test(x.id) &&
    TIPOS.includes(x.tipo as TipoProducto) &&
    typeof x.nombre === "string" &&
    typeof x.autor === "string" &&
    typeof x.descripcion === "string" &&
    Array.isArray(x.etiquetas) &&
    x.etiquetas.every((e) => typeof e === "string") &&
    typeof x.version === "number" &&
    (x.precio === undefined || typeof x.precio === "number") &&
    !!x.contenido &&
    typeof x.contenido === "object" &&
    !Array.isArray(x.contenido)
  );
}

/** El catálogo firmado: se lee o se rechaza. Con varias claves, vale el que firme alguna. */
export function verificarCatalogo(
  texto: string,
  clavePublicaPem: string | string[],
):
  | { ok: true; productos: Producto[]; emitido: number }
  | { ok: false; motivo: string } {
  let c: Partial<Firmado>;
  try {
    c = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: "El catálogo no se puede leer." };
  }
  if (
    !c ||
    typeof c !== "object" ||
    !Array.isArray(c.productos) ||
    typeof c.firma !== "string" ||
    typeof c.emitido !== "number"
  ) {
    return { ok: false, motivo: "El catálogo no tiene la forma esperada." };
  }
  const claves = Array.isArray(clavePublicaPem) ? clavePublicaPem : [clavePublicaPem];
  let valida = false;
  for (const k of claves) {
    try {
      if (
        verify(
          null,
          cuerpo(c.emitido, c.productos),
          createPublicKey(k),
          Buffer.from(c.firma, "base64url"),
        )
      ) {
        valida = true;
        break;
      }
    } catch {
      /* esa clave no vale */
    }
  }
  if (!valida) return { ok: false, motivo: "El catálogo no trae una firma válida de la Tienda." };
  if (!c.productos.every(esProducto)) {
    return { ok: false, motivo: "El catálogo trae productos sin la forma esperada." };
  }
  if (new Set(c.productos.map((p) => p.id)).size !== c.productos.length) {
    return { ok: false, motivo: "El catálogo trae dos productos con el mismo id." };
  }
  return { ok: true, productos: c.productos, emitido: c.emitido };
}
