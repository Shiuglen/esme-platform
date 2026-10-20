// servidor — la tienda sale de la carpeta: estático y restringido.
// Solo sirve lo que la confianza necesita (index, paquetes, firmas,
// rotaciones, revocaciones): nada del resto del repo sale por el cable.
// 127.0.0.1 por defecto: la prueba la hace un cliente, no la red.
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, normalize } from "node:path";

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

export function crearServidor(raiz: string, port = 0): ServidorTienda {
  const dirTienda = join(raiz, "tienda");
  const server: Server = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      const camino = normalize(decodeURIComponent(req.url ?? "/"));
      if (!SIRVIBLES.some((prefijo) => camino.startsWith(prefijo))) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("no existe ni existe el derecho a mirar: 404");
        return;
      }
      // fuera del prefijo se permiten solo ficheros con nombre controlado
      const fichero = join(dirTienda, camino);
      if (!existsSync(fichero)) {
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
