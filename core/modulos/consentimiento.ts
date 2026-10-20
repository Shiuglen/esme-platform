/**
 * EL LIBRO DE LOS PERMISOS — quién autorizó qué, y cuándo.
 *
 * El manifiesto DECLARA lo que un módulo quiere; este libro dice lo que la
 * persona CONCEDIÓ. La diferencia es la que separa «un permiso pedido» de
 * «un permiso dado»: la primera es una intención del módulo, la segunda es
 * una decisión de quien usa la máquina.
 *
 * Por qué está en un fichero y no en la memoria: un permiso que se pierde al
 * cerrar la app es un permiso que hay que pedir cada vez (cansona); uno que se
 * pierde al reiniciar el equipo es una sorpresa. El libro está en disco, junto
 * a los módulos que gobierna, y se puede leer y corregir a mano.
 *
 * Referencia: core/extension-host/capability.ts, docs/ARQUITECTURA.md §16.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Concesion {
  /** El módulo al que se concede. */
  modulo: string;
  /** Las capacidades concretas que se conceden. */
  capacidades: string[];
  /** Cuándo se concedió (ms desde la época). */
  en: number;
  /** Quién lo concedió (la persona, por su nombre o "la persona"). */
  por: string;
}

export interface Libro {
  version: 1;
  conexiones: Concesion[];
}

/** El estado de un módulo frente a sus permisos: lo declarado, lo concedido. */
export interface EstadoPermisos {
  /** Lo que el manifiesto declara. */
  declaradas: string[];
  /** Lo que la persona ha concedido. */
  concedidas: string[];
  /** Lo declarado que todavía espera la palabra de la persona. */
  pendientes: string[];
  /** Lo que el módulo pidió y la persona no (± no existe: lo pedido no está). */
  denegadas: string[];
}

/**
 * El libro. Se guarda solo (como los ficheros que guardan la verdad): cada
 * concesión o revocación se escribe en el acto, porque un permiso que se
 * promete y no se guarda no es un permiso.
 */
export class Consentimientos {
  private libro: Libro = { version: 1, conexiones: [] };

  constructor(private readonly ruta: string) {
    this.carga();
  }

  /** Lee el libro del disco. Un libro roto no se inventa: se empieza vacío. */
  carga(): Libro {
    try {
      if (existsSync(this.ruta)) {
        const crudo = JSON.parse(readFileSync(this.ruta, "utf8")) as Libro;
        if (crudo && crudo.version === 1 && Array.isArray(crudo.conexiones)) {
          this.libro = crudo;
        }
      }
    } catch {
      this.libro = { version: 1, conexiones: [] };
    }
    return this.libro;
  }

  /** Guarda el libro. */
  guardar(): void {
    mkdirSync(dirname(this.ruta), { recursive: true });
    writeFileSync(this.ruta, `${JSON.stringify(this.libro, null, 2)}\n`, "utf8");
  }

  /** Concede capacidades a un módulo (las que ya concedidas se quedan). */
  concede(modulo: string, capacidades: string[], por = "la persona"): string[] {
    const actual = this.libro.conexiones.find((c) => c.modulo === modulo);
    if (!actual) {
      this.libro.conexiones.push({
        modulo,
        capacidades: [...new Set(capacidades)],
        en: Date.now(),
        por,
      });
    } else {
      actual.capacidades = [...new Set([...actual.capacidades, ...capacidades])];
      actual.en = Date.now();
      actual.por = por;
    }
    this.guardar();
    return this.concedidasDe(modulo);
  }

  /** Revoca capacidades (las que no se nombra se quedan). */
  revoca(modulo: string, capacidades: string[]): string[] {
    const actual = this.libro.conexiones.find((c) => c.modulo === modulo);
    if (actual) {
      actual.capacidades = actual.capacidades.filter((c) => !capacidades.includes(c));
      actual.en = Date.now();
      this.guardar();
    }
    return this.concedidasDe(modulo);
  }

  /** Revoca TODO lo concedido a un módulo (desinstalar no es olvidar). */
  revocaTodo(modulo: string): void {
    this.libro.conexiones = this.libro.conexiones.filter((c) => c.modulo !== modulo);
    this.guardar();
  }

  /** Lo concedido a un módulo. */
  concedidasDe(modulo: string): string[] {
    return this.libro.conexiones.find((c) => c.modulo === modulo)?.capacidades ?? [];
  }

  /** El estado frente a lo declarado: lo que falta, lo que hay, lo que no. */
  estado(modulo: string, declaradas: readonly string[]): EstadoPermisos {
    const concedidas = this.concedidasDe(modulo);
    return {
      declaradas: [...declaradas],
      concedidas: concedidas.filter((c) => declaradas.includes(c)),
      pendientes: declaradas.filter((c) => !concedidas.includes(c)),
      denegadas: declaradas.filter((c) => !concedidas.includes(c)),
    };
  }
}
