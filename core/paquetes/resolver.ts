/**
 * EL RESOLVER — de una plantilla, la lista entera de lo que hay que instalar.
 *
 * Una plantilla (o cualquier paquete) dice qué usa, y cada `uses` fija un
 * paquete por su HUELLA y dice con un rango qué versiones habría aceptado.
 * Resolver es seguir esos `uses` hasta el fondo, con lo que se conoce (la
 * Tienda, lo ya instalado) y comprobar tres cosas:
 *
 *   - que cada huella es de un paquete conocido, y su versión cumple el
 *     rango de quien la fija;
 *   - que cada paquete viene UNA vez: dos versiones (o dos huellas) del
 *     mismo id a la vez no caben en una casa;
 *   - que no hay ciclos. Con huellas de verdad un ciclo exacto no se puede
 *     construir (la huella de A tendría que estar dentro de A); el que sí
 *     pasa es B usando una A anterior. Por eso el ciclo se mira por id.
 *
 * El diamante (A usa B y C, y los dos usan D con la misma huella) no es
 * ni ciclo ni choque: D viene una vez.
 *
 * Todos los errores salen en una pasada, cada uno diciendo quién lo pide:
 * quien arregla una plantilla no quiere descubrirlos de uno en uno.
 *
 * Lo que sale va en orden topológico (primero las dependencias, sin la
 * raíz), con la suma de los permisos y, si todo cuadró, el candado.
 *
 * Referencia: core/paquetes/lock.ts, core/paquetes/semver.ts, estandar/paquete.spec.yaml.
 */
import { canonicoLock, type Lock } from "./lock.ts";
import type { ManifiestoV2, PaqueteConocido } from "./manifiesto.ts";
import { unePermisos, type Permiso } from "./permisos.ts";
import { cumple } from "./semver.ts";

/** Lo que sale de resolver. */
export interface Resolucion {
  ok: boolean;
  errores: string[];
  /** En orden topológico: primero las dependencias, sin la raíz. */
  paquetes: PaqueteConocido[];
  /** La suma de los permisos de la raíz y de todo lo resuelto. */
  permisos: Permiso[];
  /** El candado, si todo cuadró (si no, null). */
  lock: Lock | null;
}

type Uso = ManifiestoV2["uses"][number];

/** Quién trajo un paquete: el elegido y quién lo pidió primero. */
interface Elegido {
  conocido: PaqueteConocido;
  por: string;
}

/** Una huella en un mensaje: sus 12 primeros caracteres. */
const corta = (sha256: string): string => `${sha256.slice(0, 12)}…`;

function choque(id: string, a: Elegido, b: Elegido): string {
  const va = a.conocido.manifiesto.version;
  const vb = b.conocido.manifiesto.version;
  return va !== vb
    ? `${id} viene en dos versiones a la vez: ${va} (la pide ${a.por}) y ${vb} (la pide ${b.por})`
    : `${id} viene con dos huellas a la vez para la ${va}: ${corta(a.conocido.sha256)} (la pide ${a.por}) y ${corta(b.conocido.sha256)} (la pide ${b.por})`;
}

/** Resuelve lo que usa `raiz` con lo que se conoce. */
export function resuelve(raiz: ManifiestoV2, conocidos: PaqueteConocido[], opts: { sha256Raiz?: string } = {}): Resolucion {
  const porId = new Map<string, PaqueteConocido[]>();
  for (const c of conocidos) porId.set(c.manifiesto.id, [...(porId.get(c.manifiesto.id) ?? []), c]);

  const errores: string[] = [];
  const elegidos = new Map<string, Elegido>();
  const orden: PaqueteConocido[] = [];
  const camino: string[] = [raiz.id];

  // en profundidad, con la pila del camino (para ver ciclos) y el mapa de elegidos (para ver choques)
  const visita = (uso: Uso, quien: string): void => {
    const enCamino = camino.indexOf(uso.id);
    if (enCamino >= 0) {
      errores.push(`ciclo: ${[...camino.slice(enCamino), uso.id].join(" → ")}`);
      return;
    }
    const candidatos = porId.get(uso.id);
    if (!candidatos) {
      errores.push(`${uso.id}: no se conoce ningún paquete con ese id (lo usa ${quien})`);
      return;
    }
    const conocido = candidatos.find((c) => c.sha256 === uso.sha256);
    if (!conocido) {
      errores.push(`${uso.id}: ninguna versión conocida tiene la huella ${corta(uso.sha256)} (lo usa ${quien})`);
      return;
    }
    const version = conocido.manifiesto.version;
    if (!cumple(version, uso.version))
      errores.push(`${uso.id}: la huella fijada es de la ${version}, que no cumple «${uso.version}» (lo usa ${quien})`);

    const ya = elegidos.get(uso.id);
    if (ya) {
      if (ya.conocido.sha256 !== conocido.sha256) errores.push(choque(uso.id, ya, { conocido, por: quien }));
      return; // el diamante: ya está, una vez basta
    }
    elegidos.set(uso.id, { conocido, por: quien });
    camino.push(uso.id);
    for (const u of conocido.manifiesto.uses) visita(u, uso.id);
    camino.pop();
    orden.push(conocido); // post-orden: sus dependencias ya están delante
  };
  for (const u of raiz.uses) visita(u, raiz.id);

  const permisos = unePermisos(raiz.permissions, ...orden.map((p) => p.manifiesto.permissions));
  const ok = errores.length === 0;
  const lock = ok
    ? canonicoLock({
        lock_version: 1,
        raiz: {
          id: raiz.id,
          version: raiz.version,
          ...(opts.sha256Raiz !== undefined ? { sha256: opts.sha256Raiz } : {}),
          permisos: unePermisos(raiz.permissions),
        },
        paquetes: orden.map((p) => ({
          id: p.manifiesto.id,
          version: p.manifiesto.version,
          sha256: p.sha256,
          permisos: unePermisos(p.manifiesto.permissions),
        })),
        permisos,
      })
    : null;

  return { ok, errores, paquetes: orden, permisos, lock };
}
