// servidor — la tienda sale de la carpeta: estático y restringido.
// Solo sirve lo que la confianza necesita (index, paquetes, firmas,
// rotaciones, revocaciones): nada del resto del repo sale por el cable.
// 127.0.0.1 por defecto: la prueba la hace un cliente, no la red.
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import * as path from "node:path";

export interface ServidorTienda {
  url: () => string;
  listo: () => Promise<void>;
  cerrar: () => Promise<void>;
}

const SIRVIBLES: string[] = [
  "/index.json",
  "/rotaciones.json",
  "/revocaciones.json",
  "/firmas/",
  "/paquetes/",
];

/**
 * El fichero que corresponde a una URL, o null si no se sirve.
 *
 * La URL va siempre con «/» (se normaliza con path.posix); el disco, con el
 * separador del sistema. Un «\» en la URL no es un separador: se rechaza,
 * porque en Windows sí lo sería y subiría de carpeta. Y el fichero tiene que
 * quedar DENTRO de la tienda, se haya escrito como se haya escrito.
 *
 * @param sistema el path del sistema (las pruebas pasan path.win32).
 */
export function ficheroServible(
  dirTienda: string,
  url: string,
  sistema: typeof path = path
): string | null {
  let camino: string;
  try {
    camino = decodeURIComponent(url.split("?")[0] ?? "/");
  } catch {
    return null; // un %XX roto no es una ruta
  }
  if (camino.includes("\\") || camino.includes("\0")) return null;
  camino = path.posix.normalize(camino);
  if (!SIRVIBLES.some((prefijo) => camino.startsWith(prefijo))) return null;
  if (camino.endsWith("/")) return null; // una carpeta no es un fichero
  const raiz = sistema.resolve(dirTienda);
  const fichero = sistema.resolve(raiz, ...camino.split("/").filter(Boolean));
  if (!fichero.startsWith(raiz + sistema.sep)) return null;
  return fichero;
}

export function crearServidor(raiz: string, port = 0): ServidorTienda {
  const dirTienda = path.join(raiz, "tienda");
  const server: Server = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      // fuera de los prefijos no sale nada, y dentro solo ficheros
      const fichero = ficheroServible(dirTienda, req.url ?? "/");
      if (!fichero) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("no existe ni existe el derecho a mirar: 404");
        return;
      }
      if (!existsSync(fichero) || !statSync(fichero).isFile()) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("404");
        return;
      }
      try {
        const bytes = readFileSync(fichero);
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(bytes);
      } catch {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("500");
      }
    }
  );
  // port 0: el sistema da uno libre — nunca peleamos por un puerto
  server.listen(port, "127.0.0.1");
  return {
    url: () => `http://127.0.0.1:${(server.address() as { port: number; } | null)?.port ?? "?"}`,
    listo: () => new Promise<void>((res, rej) => {
      server.once("listening", res);
      server.once("error", rej);
    }),
    cerrar: () =>
      new Promise((res) => {
        server.close(() => res());
      }),
  };
}

/** Baja un fichero de la tienda por HTTP como haría cualquiera. */
export async function bajar(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
