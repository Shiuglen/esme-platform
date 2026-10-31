/**
 * LA CONFORMIDAD DEL PAQUETE — `paquete.spec.yaml` y `core/paquetes/` dicen lo mismo.
 *
 * La spec del paquete no solo describe: trae un manifiesto de ejemplo, los
 * doce puntos, los alcances, los niveles, los rangos y los hosts que un
 * patrón cubre y los que no. Aquí se compara cada sección con el código:
 *
 *   - el ejemplo trae todas las claves y el código lo acepta, sin avisos;
 *   - los tipos, las licencias, los formatos, los puntos, los alcances, los
 *     niveles, las variables, las claves del candado y las listas y los
 *     topes del oficio son los del código (ni uno más, ni uno menos);
 *   - los rangos, los hosts y los filtros del oficio de la spec se PRUEBAN
 *     con el código: un host parecido (`evil-figma.com`) que la spec da por
 *     no cubierto y el código cubre es una puerta de atrás, y aquí se ve.
 *
 * Recibe la spec ya leída (y no la lee ella) para que la prueba pueda darle
 * una spec separada a propósito y ver que lo dice.
 *
 * Referencia: estandar/paquete.spec.yaml, scripts/estandar/conformidad.ts.
 */
import {
  CLAVES_PAQUETE,
  FORMATOS_AGENTE,
  LICENCIAS_PAQUETE,
  NIVELES,
  PUNTOS,
  TIPOS_PAQUETE,
  VARIABLES_PAQUETE,
  PermisoSchema,
  leePaquete,
  type Punto,
} from "../../core/paquetes/manifiesto.ts";
import {
  ESTADOS,
  PRIMERA,
  TIPOS_ENTRADA,
  TOPES,
  VISTAS,
  VISTAS_CON_FILTRO,
  VISTA_DE_RESERVA,
  esFiltro,
} from "../../core/paquetes/oficio.ts";
import { ALCANCES, permiteHost } from "../../core/paquetes/permisos.ts";
import { cumple, esRango } from "../../core/paquetes/semver.ts";
import { CLAVES_ENTRADA_LOCK, CLAVES_LOCK, CLAVES_RAIZ_LOCK } from "../../core/paquetes/lock.ts";
import { CAPABILITIES } from "../../core/extension-host/capability.ts";

type Objeto = Record<string, unknown>;

const objeto = (v: unknown): Objeto | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : null;

const textos = (v: unknown): string[] | null => (Array.isArray(v) ? v.map(String) : null);

const lista = (l: readonly string[]): string => `[${l.join(", ")}]`;

/** Compara la spec con el código, sección por sección. Cada fallo, a `anota`. */
export function compruebaPaquete(spec: Objeto, anota: (problema: string) => void): void {
  /** Una sección de la spec (si falta, se dice una vez y se sigue). */
  const seccion = (k: string): unknown => {
    if (!(k in spec)) anota(`falta la sección «${k}»`);
    return spec[k];
  };

  /** Una lista cerrada: la misma que la del código. `orden`: también en el mismo orden. */
  const mismaLista = (que: string, deSpec: unknown, codigo: readonly string[], orden = true): void => {
    const l = textos(deSpec);
    if (!l) {
      if (deSpec !== undefined) anota(`${que}: no es una lista`);
      return;
    }
    const a = orden ? l : [...l].sort();
    const b = orden ? [...codigo] : [...codigo].sort();
    if (a.join(",") !== b.join(",")) anota(`${que} no cuadran: spec ${lista(l)} · código ${lista(codigo)}`);
  };

  // el ejemplo: todas las claves, y que el código lo lea como un v2 sin pegas
  const ejemplo = objeto(seccion("manifiesto"));
  if (ejemplo) {
    const claves = Object.keys(ejemplo);
    for (const k of CLAVES_PAQUETE) if (!claves.includes(k)) anota(`manifiesto: el ejemplo no trae «${k}»`);
    for (const k of claves)
      if (!(CLAVES_PAQUETE as readonly string[]).includes(k)) anota(`manifiesto: «${k}» no es una clave del paquete`);
    const r = leePaquete(ejemplo);
    for (const e of r.errores) anota(`manifiesto: el código no lo acepta: ${e}`);
    for (const a of r.avisos) anota(`manifiesto: el código avisa: ${a}`);
    if (r.ok && r.version !== 2) anota(`manifiesto: se lee como v${String(r.version)} (se espera la 2)`);
  }

  mismaLista("tipos", seccion("tipos"), TIPOS_PAQUETE);
  mismaLista("licencias", seccion("licencias"), LICENCIAS_PAQUETE, false);
  mismaLista("formatos_agente", seccion("formatos_agente"), FORMATOS_AGENTE);

  // los puntos: los mismos doce, con su naturaleza, su sitio y sus claves
  const puntos = objeto(seccion("puntos"));
  if (puntos) {
    for (const p of Object.keys(PUNTOS) as Punto[]) {
      const deSpec = objeto(puntos[p]);
      if (!deSpec) {
        anota(`puntos: falta «${p}»`);
        continue;
      }
      const codigo = PUNTOS[p];
      if (deSpec.naturaleza !== codigo.naturaleza)
        anota(`puntos.${p}: naturaleza «${String(deSpec.naturaleza)}» en la spec, «${codigo.naturaleza}» en el código`);
      if (deSpec.corre !== codigo.corre)
        anota(`puntos.${p}: corre «${String(deSpec.corre)}» en la spec, «${codigo.corre}» en el código`);
      mismaLista(`puntos.${p}: las claves`, deSpec.claves, codigo.claves);
    }
    for (const p of Object.keys(puntos)) if (!(p in PUNTOS)) anota(`puntos: «${p}» no es un punto del código`);
  }

  // los alcances: cada capacidad con el límite que admite
  const alcances = objeto(seccion("alcances"));
  if (alcances) {
    for (const c of CAPABILITIES) {
      if (!(c in alcances)) anota(`alcances: falta «${c}»`);
      else mismaLista(`alcances.${c}`, alcances[c], ALCANCES[c]);
    }
    for (const c of Object.keys(alcances))
      if (!(CAPABILITIES as readonly string[]).includes(c)) anota(`alcances: «${c}» no es una capacidad`);
  }

  // los hosts: lo que la spec dice que se cubre (y que no), probado con el código
  const hosts = objeto(seccion("hosts"));
  if (hosts) {
    const pares = (k: "cubre" | "no_cubre"): Array<[string, string]> =>
      (Array.isArray(hosts[k]) ? (hosts[k] as unknown[]) : [])
        .filter((par): par is unknown[] => Array.isArray(par) && par.length === 2)
        .map(([a, b]) => [String(a), String(b)]);
    for (const k of ["cubre", "no_cubre"] as const) {
      const esperado = k === "cubre";
      for (const [patron, host] of pares(k)) {
        const permiso = { kind: "net:fetch", hosts: [patron] };
        if (!PermisoSchema.safeParse(permiso).success) {
          anota(`hosts: «${patron}» no es un patrón de host`);
          continue;
        }
        if (permiteHost([permiso as never], host) !== esperado)
          anota(
            `hosts: según la spec, «${patron}» ${esperado ? "cubre" : "no cubre"} «${host}», y el código dice lo contrario`
          );
      }
    }
  }

  // los rangos: los que se admiten, los que no, y sus ejemplos
  const rangos = objeto(seccion("rangos"));
  if (rangos) {
    for (const r of textos(rangos.validos) ?? [])
      if (!esRango(r)) anota(`rangos: la spec admite «${r}» y el código no`);
    for (const r of textos(rangos.no_validos) ?? [])
      if (esRango(r)) anota(`rangos: la spec no admite «${r}» y el código sí`);
    for (const ej of Array.isArray(rangos.ejemplos) ? (rangos.ejemplos as unknown[]) : []) {
      if (!Array.isArray(ej) || ej.length !== 3) continue;
      const [version, rango, esperado] = [String(ej[0]), String(ej[1]), ej[2] === true];
      if (cumple(version, rango) !== esperado)
        anota(
          `rangos: ${version} con «${rango}»: la spec dice que ${esperado ? "cumple" : "no cumple"} y el código, lo contrario`
        );
    }
  }

  // los niveles: los mismos cinco, con su nombre
  const niveles = objeto(seccion("niveles"));
  if (niveles) {
    for (const [n, nombre] of Object.entries(NIVELES)) {
      if (niveles[n] !== nombre) anota(`niveles.${n}: «${String(niveles[n])}» en la spec, «${nombre}» en el código`);
    }
    for (const n of Object.keys(niveles)) if (!(n in NIVELES)) anota(`niveles: el ${n} no es un nivel del código`);
  }

  // las variables que Esme sustituye
  const variables = objeto(seccion("variables"));
  if (variables) {
    for (const v of Object.keys(VARIABLES_PAQUETE)) if (!(v in variables)) anota(`variables: falta «${v}»`);
    for (const v of Object.keys(variables))
      if (!(v in VARIABLES_PAQUETE)) anota(`variables: «${v}» no la sustituye el código`);
  }

  // el candado
  const lock = objeto(seccion("lock"));
  if (lock) {
    mismaLista("lock.claves", lock.claves, CLAVES_LOCK);
    mismaLista("lock.claves_raiz", lock.claves_raiz, CLAVES_RAIZ_LOCK);
    mismaLista("lock.claves_paquete", lock.claves_paquete, CLAVES_ENTRADA_LOCK);
  }

  // el oficio: sus listas y sus topes, y los filtros que la spec da por buenos (y por malos), probados con el código
  const oficio = objeto(seccion("oficio"));
  if (oficio) {
    const mismo = (que: string, deSpec: unknown, codigo: string | number): void => {
      if (deSpec !== codigo) anota(`oficio.${que}: «${String(deSpec)}» en la spec, «${codigo}» en el código`);
    };
    mismo("primera", oficio.primera, PRIMERA);
    mismaLista("oficio.vistas", oficio.vistas, VISTAS);
    mismaLista("oficio.vistas_con_filtro", oficio.vistas_con_filtro, VISTAS_CON_FILTRO);
    mismo("vista_de_reserva", oficio.vista_de_reserva, VISTA_DE_RESERVA);
    mismaLista("oficio.estados", oficio.estados, ESTADOS);
    mismaLista("oficio.tipos_de_entrada", oficio.tipos_de_entrada, TIPOS_ENTRADA);
    const topes = objeto(oficio.topes) ?? {};
    for (const [k, v] of Object.entries(TOPES)) mismo(`topes.${k}`, topes[k], v);
    for (const k of Object.keys(topes)) if (!(k in TOPES)) anota(`oficio.topes: «${k}» no es un tope del código`);
    const filtros = objeto(oficio.filtros) ?? {};
    for (const f of textos(filtros.validos) ?? []) if (!esFiltro(f)) anota(`oficio.filtros: la spec da por bueno «${f}» y el código no`);
    for (const f of textos(filtros.no_validos) ?? [])
      if (esFiltro(f)) anota(`oficio.filtros: la spec no da por bueno «${f}» y el código sí`);
  }
}
