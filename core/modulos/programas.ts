/**
 * EL LIBRO DE LOS PROGRAMAS — qué se puede lanzar en esta casa.
 *
 * Qué es esto. La puerta `proc:spawn` deja que un módulo pida que el
 * ANFITRIÓN lance un programa. El anfitrión sólo lanza los que están en la
 * lista (por nombre lógico). Esa lista tiene que vivir en algún sitio que la
 * persona pueda ver y cambiar: si vive en el código, la puerta está cerrada
 * para siempre y no hay forma de abrirla sin recompilar.
 *
 * Por qué un libro aparte y no el de los permisos. Son dos decisiones
 * distintas y de distinta gente:
 *
 *   - el LIBRO DE LOS PERMISOS dice «este módulo puede hacer esto»;
 *   - el LIBRO DE LOS PROGRAMAS dice «en esta casa se puede lanzar esto».
 *
 * Un módulo puede tener `proc:spawn` concedido y que no haya ningún programa
 * permitido: entonces la puerta existe y no abre nada. Al revés también: que
 * el programa esté en el libro NO da permiso a ningún módulo — el permiso
 * sigue siendo del módulo, y lo concede la persona.
 *
 * Dónde vive. Junto al libro de los permisos, en la carpeta de la casa
 * (`~/.esme/`), en texto plano, para que se pueda leer y corregir a mano.
 *
 * Referencia: core/extension-host/proc.ts, docs/REA.md, scripts/programas.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { EntradaProc } from "../extension-host/proc.ts";

/** Un programa que esta casa permite lanzar (la misma forma que la puerta). */
export type ProgramaPermitido = EntradaProc;

/** El libro, tal y como está en el disco. */
export interface LibroProgramas {
  version: 1;
  programas: ProgramaPermitido[];
}

/** El nombre lógico: el nombre de un ejecutable (ni rutas ni espacios). */
export const NOMBRE_PROGRAMA = /^[A-Za-z0-9._-]+$/;

/**
 * El libro de los programas.
 *
 * Se lee al construir y se guarda al cambiar. Un libro roto no se pisa: se
 * dice y se sigue con el libro vacío (la puerta cerrada), porque un libro
 * ilegible no es un libro con todo permitido.
 */
export class ProgramasPermitidos {
  private libro: LibroProgramas = { version: 1, programas: [] };

  constructor(private readonly ruta: string) {
    this.carga();
  }

  /** Carga el libro del disco (si no hay o está roto: vacío, y se dice). */
  carga(): LibroProgramas {
    if (!existsSync(this.ruta)) {
      this.libro = { version: 1, programas: [] };
      return this.libro;
    }
    try {
      const crudo = JSON.parse(readFileSync(this.ruta, "utf8")) as Partial<LibroProgramas>;
      const programas = Array.isArray(crudo.programas) ? crudo.programas : [];
      this.libro = {
        version: 1,
        programas: programas.filter(
          (p): p is ProgramaPermitido =>
            !!p && typeof p.nombre === "string" && NOMBRE_PROGRAMA.test(p.nombre)
        ),
      };
    } catch {
      // un libro roto no se pisa: la puerta se queda cerrada y se avisa
      this.libro = { version: 1, programas: [] };
    }
    return this.libro;
  }

  /** Los programas que esta casa permite lanzar. */
  lista(): ProgramaPermitido[] {
    return [...this.libro.programas];
  }

  /** El programa con ese nombre (o null). */
  permite(nombre: string): ProgramaPermitido | null {
    return this.libro.programas.find((p) => p.nombre === nombre) ?? null;
  }

  /**
   * Añade (o reemplaza) un programa.
   *
   * Las reglas que no se rompen: el nombre es un nombre de ejecutable (no una
   * ruta), y la descripción es obligatoria — es lo que se le enseña a quien
   * concede, y un programa sin explicación no se concede.
   */
  agrega(p: ProgramaPermitido): { ok: true } | { ok: false; error: string } {
    if (!NOMBRE_PROGRAMA.test(p.nombre)) {
      return {
        ok: false,
        error: `el nombre de un programa es un nombre de ejecutable (sin rutas ni espacios): ${p.nombre}`,
      };
    }
    if (!p.descripcion || !p.descripcion.trim()) {
      return { ok: false, error: `el programa «${p.nombre}» necesita una descripción: se le enseña a quien concede` };
    }
    const programa: ProgramaPermitido = {
      nombre: p.nombre,
      descripcion: p.descripcion.trim(),
      ...(p.ruta ? { ruta: p.ruta } : {}),
      ...(p.argvFijos?.length ? { argvFijos: [...p.argvFijos] } : {}),
      ...(p.envPermitidas?.length ? { envPermitidas: [...p.envPermitidas] } : {}),
    };
    this.libro.programas = [
      ...this.libro.programas.filter((x) => x.nombre !== p.nombre),
      programa,
    ];
    this.guarda();
    return { ok: true };
  }

  /** Quita un programa. Devuelve si estaba. */
  quita(nombre: string): boolean {
    const antes = this.libro.programas.length;
    this.libro.programas = this.libro.programas.filter((p) => p.nombre !== nombre);
    if (this.libro.programas.length === antes) return false;
    this.guarda();
    return true;
  }

  /** Escribe el libro en el disco. */
  guarda(): void {
    mkdirSync(dirname(this.ruta), { recursive: true });
    writeFileSync(this.ruta, `${JSON.stringify(this.libro, null, 2)}\n`, "utf8");
  }

  /** La ruta del libro por defecto (junto a los permisos). */
  static rutaPorDefecto(casa = "~/.esme"): string {
    return `${casa.replace(/^~(?=$|\/)/, process.env.HOME ?? "")}/programas.json`;
  }
}

/**
 * Los programas que esta casa permite lanzar.
 *
 * Es el atajo para quien está en la máquina de la persona: el juez, el banco
 * y el turno leen el libro de la casa sin que nadie se lo pase a mano.
 *
 * La ruta por defecto es la de la casa del kit (`~/.esme/modulos/`), que es
 * donde el kit guarda sus permisos; la app usa la suya (`<userData>/modulos/`)
 * y le pasa la ruta explícitamente.
 */
export function programasDeLaCasa(ruta?: string): ProgramaPermitido[] {
  const donde = ruta ?? join(homedir(), ".esme", "modulos", "programas.json");
  return new ProgramasPermitidos(donde).lista();
}

/**
 * La ruta del libro que va JUNTO al libro de los permisos.
 *
 * Por qué junto, y no en otro sitio. El libro de los permisos es el ancla
 * que el kit y la app YA comparten (la app lo pone en
 * `<userData>/modulos/consentimientos.json`, el kit en
 * `~/.esme/modulos/consentimientos.json`). El libro de los programas tiene
 * que estar en la MISMA carpeta: si cada lado lo buscara por su cuenta, la
 * puerta se abriría en un sitio y se cerraría en otro, y nadie sabría por
 * qué.
 *
 * Referencia: core/modulos/consentimiento.ts, tienda/modulos.ts.
 */
export function rutaProgramasDe(rutaPermisos: string): string {
  return join(dirname(rutaPermisos), "programas.json");
}
