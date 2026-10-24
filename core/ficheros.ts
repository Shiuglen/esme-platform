/**
 * EL ÁRBOL DE TUS FICHEROS — medido, no estimado.
 *
 * Tu carpeta es un ÁRBOL, no una lista con sangría. En la casa el dibujo no
 * se hace a mano: aquí se MIDIEN los ficheros y salen los DATOS — cada nodo
 * con su papa (como la familia de los puntos trae su pid), su altura y su
 * peso REAL — para que quien renderice lo mire como lo que es: un árbol.
 *
 * La pregunta que responde: «¿de dónde SALE el peso de esta carpeta?» —
 * la rama que más pesa arriba, igual que en los puntos la rama que más
 * memoria come.
 *
 * Lo que NO se hace: inventar. Si no se puede mirar dentro de una carpeta
 * (permiso, symlink roto...), el nodo lo DICE (`ciega: true`, peso `null`),
 * no pone un cero disimulado. Los enlaces no se siguen: el tamaño real
 * primero, el teatro después.
 *
 * Referencia: estandar/arbol.spec.yaml, docs/ARBOLES.md, core/motores/puntos.ts.
 */
import { basename, resolve } from "node:path";
import { readdirSync, statSync, lstatSync } from "node:fs";

/** Las claves del nodo (la forma que declara estandar/arbol.spec.yaml). */
export const CLAVES_ARBOL = [
  "id",
  "nombre",
  "ruta",
  "papa",
  "profundo",
  "tipo",
  "peso_bytes",
  "ficheros",
  "carpetas",
  "ciega",
] as const;

/**
 * Un nodo del árbol, medido. El `peso_bytes` de una carpeta es la suma de
 * sus ficheros de debajo (lo que mide el sistema); si algo no se pudo
 * mirar, es `null`: no se disimula con cero.
 */
export interface NodoArbol {
  /** La ruta relativa a la raíz (`"."` la raíz misma). */
  id: string;
  /** El nombre en su carpeta (la raíz lleva el nombre de la ruta pedida). */
  nombre: string;
  /** Ruta relativa a la raíz pedida (`""` la raíz). */
  ruta: string;
  /** El id del progenitor (`null` la raíz). */
  papa: string | null;
  /** Altura en generaciones: 0 la raíz, 1 sus hijos, 2 los nietos... */
  profundo: number;
  tipo: "carpeta" | "fichero" | "otro";
  /** bytes REALES (fichero: su tamaño; carpeta: el de sus ficheros de debajo). */
  peso_bytes: number | null;
  /** Cuántos ficheros se VIERON debajo (lo no mirado no lo sabe el número). */
  ficheros: number;
  /** Cuántas carpetas se vieron debajo. */
  carpetas: number;
  /** `true` si no se pudo mirar dentro (o debajo): sus números no lo saben todo. */
  ciega: boolean;
  hijos: NodoArbol[];
}

/** La consulta: qué carpeta se mira, qué carpetas se saltan y el orden. */
export interface ConsultaArbol {
  ruta: string;
  /** Nombres de carpeta que no se abren (`.git`, `node_modules`...): se los pediste tú, no es silencio. */
  saltos?: string[];
  /** Orden de los hijos: la rama más pesada arriba (`"peso"`) o `"alfabeto"`. Por defecto: `"peso"`. */
  orden?: "peso" | "alfabeto";
}

/**
 * MIDE el árbol de una carpeta y devuelve su raíz. El peso de la rama sale
 * de `stat` (bytes de verdad); lo que no se puede ver se dice.
 */
export function arbolFicheros(consulta: ConsultaArbol): NodoArbol {
  const rutaRaiz = resolve(consulta.ruta);
  const saltos = new Set(consulta.saltos ?? []);
  const orden = consulta.orden ?? "peso";

  const mide = (
    nombre: string,
    absoluto: string,
    ruta: string,
    papa: string | null,
    profundo: number,
  ): NodoArbol => {
    const nodo: NodoArbol = {
      id: ruta === "" ? "." : ruta,
      nombre,
      ruta,
      papa,
      profundo,
      tipo: "carpeta",
      peso_bytes: 0,
      ficheros: 0,
      carpetas: 0,
      ciega: false,
      hijos: [],
    };

    let entradas: Array<{ nombre: string; carpeta: boolean; fichero: boolean; otro: boolean }>;
    try {
      entradas = readdirSync(absoluto, { withFileTypes: true }).map((e) => ({
        nombre: e.name,
        carpeta: e.isDirectory(),
        fichero: e.isFile(),
        otro: !e.isFile() && !e.isDirectory(),
      }));
    } catch {
      // no se pudo mirar dentro: lo decimos; no ponemos cero disimulado
      nodo.ciega = true;
      nodo.peso_bytes = null;
      return nodo;
    }

    for (const entrada of entradas) {
      const rutaHija = ruta === "" ? entrada.nombre : `${ruta}/${entrada.nombre}`;
      if (entrada.carpeta) {
        if (saltos.has(entrada.nombre)) continue;
        nodo.carpetas += 1;
        const hijo = mide(entrada.nombre, `${absoluto}/${entrada.nombre}`, rutaHija, nodo.id, profundo + 1);
        nodo.hijos.push(hijo);
      } else if (entrada.fichero) {
        nodo.ficheros += 1;
        let peso: number | null = null;
        try {
          peso = statSync(`${absoluto}/${entrada.nombre}`).size;
        } catch {
          // fichero que no se puede medir (permiso): se dice, no se inventa
        }
        nodo.hijos.push({
          id: rutaHija,
          nombre: entrada.nombre,
          ruta: rutaHija,
          papa: nodo.id,
          profundo: profundo + 1,
          tipo: "fichero",
          peso_bytes: peso,
          ficheros: 0,
          carpetas: 0,
          ciega: peso === null,
          hijos: [],
        });
      } else {
        // symlink y demás: no se siguen — medimos el ENLACE (lstat no le
        // sigue), no su destino; el destino no está en este árbol
        let peso: number | null = null;
        try {
          peso = lstatSync(`${absoluto}/${entrada.nombre}`).size;
        } catch {
          // enlace que no se puede medir: se dice, no se inventa
        }
        nodo.hijos.push({
          id: rutaHija,
          nombre: entrada.nombre,
          ruta: rutaHija,
          papa: nodo.id,
          profundo: profundo + 1,
          tipo: "otro",
          peso_bytes: peso,
          ficheros: 0,
          carpetas: 0,
          ciega: peso === null,
          hijos: [],
        });
      }
    }

    // el peso de la carpeta es la suma de lo SE VISTO: si algo quedó a
    // ciegas, el total no lo sabría decir (peso null); huerfano false
    let pesoRama = 0;
    let seguro = true;
    for (const hijo of nodo.hijos) {
      if (hijo.peso_bytes === null) seguro = false;
      else pesoRama += hijo.peso_bytes;
      if (hijo.ciega) seguro = false;
    }
    nodo.peso_bytes = seguro ? pesoRama : null;
    nodo.ciega = nodo.ciega || !seguro;

    // la rama que más pesa, arriba (o por su nombre, si así se pidió)
    nodo.hijos.sort((a, b) => {
      if (orden === "alfabeto") return a.nombre.localeCompare(b.nombre);
      const pa = a.peso_bytes ?? -1;
      const pb = b.peso_bytes ?? -1;
      if (pa !== pb) return pb - pa;
      return a.nombre.localeCompare(b.nombre);
    });

    return nodo;
  };

  return mide(basename(rutaRaiz) || rutaRaiz, rutaRaiz, "", null, 0);
}

/** El total visto de la rama: ficheros y carpetas debajo (lo ciego no cuenta: se dice aparte). */
export function totalRama(nodo: NodoArbol): { carpetas: number; ficheros: number } {
  let carpetas = nodo.carpetas;
  let ficheros = nodo.ficheros;
  for (const hijo of nodo.hijos) {
    const rama = totalRama(hijo);
    carpetas += rama.carpetas;
    ficheros += rama.ficheros;
  }
  return { carpetas, ficheros };
}

/** El peso humano para el ojo: 1 KB = 1024 B (como la memoria de los puntos). */
export function pesoHumano(peso: number | null): string {
  if (peso === null) return "en el aire";
  if (peso < 1024) return `${peso} B`;
  if (peso < 1024 * 1024) return `${(peso / 1024).toFixed(1)} KB`;
  if (peso < 1024 * 1024 * 1024) return `${(peso / (1024 * 1024)).toFixed(1)} MB`;
  return `${(peso / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** ¿El conector heredado ya era el de un último hijo? (su rama ya terminó) */
function esUltimoHeredado(conector: string): boolean {
  return conector === "└─ " || conector === "";
}

/** La descripción de una entrada para el ojo. */
function decora(nodo: NodoArbol): string {
  if (nodo.tipo === "carpeta") {
    if (nodo.ciega && nodo.peso_bytes === null) return `${nodo.nombre}/ (a ciegas: no se pudo abrir)`;
    const cajas = nodo.carpetas === 1 ? "1 carpeta" : `${nodo.carpetas} carpetas`;
    const cosas = nodo.ficheros === 1 ? "1 fichero" : `${nodo.ficheros} ficheros`;
    return `${nodo.nombre}/ (${cajas}, ${cosas}; ${pesoHumano(nodo.peso_bytes)})`;
  }
  if (nodo.tipo === "otro") return `${nodo.nombre} (enlace: no se sigue)`;
  return `${nodo.nombre} (${pesoHumano(nodo.peso_bytes)})`;
}

/**
 * EL ÁRBOL en texto, con los conectores debidos: carpetas con sangría real,
 * la rama que más pesa arriba y lo ciego dicho.
 */
export function renderArbolFicheros(raiz: NodoArbol): string {
  if (raiz === undefined || raiz === null) return "árbol (nadie: la ruta no llegó a ningún sitio)";
  const total = totalRama(raiz);
  const lineas: string[] = [
    total.carpetas === 0 && total.ficheros === 0
      ? `árbol (${raiz.nombre}; vacío: se dice, no se dibuja)`
      : `árbol (${raiz.nombre}; ${total.carpetas} ${total.carpetas === 1 ? "carpeta" : "carpetas"}, ` +
        `${total.ficheros} ${total.ficheros === 1 ? "fichero" : "ficheros"}; ${pesoHumano(raiz.peso_bytes)})`,
  ];

  const caminar = (nodo: NodoArbol, prefijo: string, conector: string): void => {
    lineas.push(`${prefijo}${conector}${decora(nodo)}`);
    nodo.hijos.forEach((hijo, i) => {
      const esUltimo = i === nodo.hijos.length - 1;
      // el hijo que sigue contaminando la columna: sólo si este no era el último
      caminar(
        hijo,
        prefijo + (conector ? (esUltimoHeredado(conector) ? "  " : "│ ") : ""),
        esUltimo ? "└─ " : "├─ ",
      );
    });
  };
  raiz.hijos.forEach((hijo, i) => {
    caminar(hijo, "", i === raiz.hijos.length - 1 ? "└─ " : "├─ ");
  });

  return lineas.join("\n");
}
