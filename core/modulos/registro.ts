/**
 * EL REGISTRO — los módulos instalados y los que están vivos.
 *
 * Un módulo instalado es un árbol en disco con un manifiesto válido. Un módulo
 * activo es un worker vivo con una puerta montada. El registro sabe de los
 * dos y no confunde uno con otro: instalar NO es activar, y activar NO es
 * instalar.
 *
 * Al activar, la puerta se monta con la INTERSECCIÓN de lo declarado y lo
 * concedido por la persona. Lo declarado y no concedido no se monta: no
 * existe para el módulo (y si lo usa, se estrella en voz alta).
 *
 * Referencia: core/extension-host/host.ts, core/modulos/consentimiento.ts.
 */
import { abreHost, type Host, type OpcionesHost } from "../extension-host/host.ts";
import type { VistaModulo } from "../extension-host/puerta.ts";
import type { Manifest } from "../ipc/module-schema.ts";
import type { MenteViva } from "../ipc/mind-schema-types.ts";
import { Consentimientos, type EstadoPermisos } from "./consentimiento.ts";

/** Los hechos de un módulo instalado: lo que el disco ya tiene y verificó. */
export interface ModuloInstalado {
  id: string;
  version: string;
  /** La carpeta del módulo en disco. */
  dir: string;
  /** La ruta ABSOLUTA de la entrada (ya confinada a la carpeta). */
  entrada: string;
  /** El manifiesto, ya validado contra el contrato. */
  manifiesto: Manifest;
}

/** Un módulo visto desde fuera: lo que se puede hacer con él ahora mismo. */
export interface ModuloVivo extends ModuloInstalado {
  /** "instalado" (en disco, parado) o "activo" (worker vivo). */
  estado: "instalado" | "activo" | "error";
  /** Por qué falló, si falló. */
  error?: string;
  /** El estado de sus permisos: lo declarado, lo concedido, lo pendiente. */
  permisos: EstadoPermisos;
  /** Las vistas que ha propuesto (ui:render). */
  vistas: VistaModulo[];
  /**
   * Las capacidades que ha USADO de verdad (si está activo). Lo que pidió es
   * `permisos.declaradas`: la diferencia entre pedir y usar es lo que el
   * juez mide y lo que la persona tiene derecho a saber.
   */
  usadas: string[];
}

/** Lo que el registro necesita del mundo para activar un módulo. */
export interface OpcionesRegistro {
  /** Dónde vive el libro de los permisos. */
  rutaPermisos: string;
  /** La mente que se inyecta (o nada: un módulo sin mente no tiene a quién preguntar). */
  mente?: MenteViva;
  /** La raíz de `fs:project`. */
  proyecto?: string;
  /** Los dominios que `net:fetch` puede tocar. */
  dominios?: string[];
  /** Quién recibe los eventos. */
  onEvento?: (evento: string, carga: unknown) => void;
  /** Quién recibe las vistas. */
  onVista?: (vista: VistaModulo) => void;
}

export class Registro {
  private readonly instalados = new Map<string, ModuloInstalado>();
  private readonly hosts = new Map<string, Host>();
  private readonly errores = new Map<string, string>();
  readonly permisos: Consentimientos;

  constructor(private readonly opts: OpcionesRegistro) {
    this.permisos = new Consentimientos(opts.rutaPermisos);
  }

  /** Registra un módulo instalado (después de verificarlo). */
  registra(m: ModuloInstalado): ModuloVivo {
    this.instalados.set(m.id, m);
    this.errores.delete(m.id);
    return this.vista(m.id);
  }

  /** Registra una lista y devuelve la vista de cada uno. */
  registraTodos(lista: readonly ModuloInstalado[]): ModuloVivo[] {
    for (const m of lista) this.registra(m);
    return this.lista();
  }

  /** ¿Está instalado? */
  tiene(id: string): boolean {
    return this.instalados.has(id);
  }

  /** El módulo instalado (sin activar). */
  instalado(id: string): ModuloInstalado | undefined {
    return this.instalados.get(id);
  }

  /** Todos los módulos, con su estado. */
  lista(): ModuloVivo[] {
    return [...this.instalados.keys()].map((id) => this.vista(id));
  }

  /** La vista de un módulo: su estado y sus permisos. */
  vista(id: string): ModuloVivo {
    const m = this.instalados.get(id);
    if (!m) throw new Error(`módulo desconocido: ${id}`);
    return {
      ...m,
      estado: this.hosts.has(id) ? "activo" : this.errores.has(id) ? "error" : "instalado",
      error: this.errores.get(id),
      permisos: this.permisos.estado(id, m.manifiesto.permissions),
      vistas: this.hosts.get(id)?.vistas() ?? [],
      usadas: this.hosts.get(id)?.usadas() ?? [],
    };
  }

  /**
   * Activa un módulo: abre su worker y le monta la puerta.
   *
   * Se puede activar sin TODOS los permisos concedidos: lo que falta se queda
   * fuera de la puerta y el módulo lo nota cuando lo usa. La alternativa
   * (negarse a activar) sería más estricta y también menos útil: quien lo
   * quiere, lo concede y lo vuelve a activar.
   */
  async activa(id: string): Promise<ModuloVivo> {
    const m = this.instalados.get(id);
    if (!m) throw new Error(`módulo desconocido: ${id}`);
    if (this.hosts.has(id)) return this.vista(id);

    const declaradas: string[] = [...m.manifiesto.permissions];
    const concedidas = this.permisos
      .concedidasDe(id)
      .filter((c) => declaradas.includes(c));

    const opciones: OpcionesHost = {
      permisos: declaradas,
      concedidas,
      mente: this.opts.mente,
      proyecto: this.opts.proyecto,
      dominios: this.opts.dominios,
      onEvento: this.opts.onEvento,
      onVista: this.opts.onVista,
      id: m.id,
      version: m.version,
    };

    try {
      const host = abreHost(m.entrada, opciones);
      // Se espera a que el worker esté listo: si el módulo no carga, el fallo
      // es de ahora y se dice (no se finge que está vivo).
      await host.listo;
      this.hosts.set(id, host);
      this.errores.delete(id);
    } catch (e) {
      this.errores.set(id, String((e as Error)?.message || e));
    }
    return this.vista(id);
  }

  /** Desactiva un módulo: se cierra su worker y se olvida su puerta. */
  async desactiva(id: string): Promise<void> {
    const host = this.hosts.get(id);
    if (!host) return;
    this.hosts.delete(id);
    await host.cerrar();
  }

  /** Cierra todos los workers (la app se apaga). */
  async cierraTodo(): Promise<void> {
    for (const id of [...this.hosts.keys()]) await this.desactiva(id);
  }

  /**
   * Llama a una función del módulo. Si el módulo está parado, se dice: no se
   * finge que está trabajando.
   */
  async llama(id: string, fn: string, ...args: unknown[]): Promise<unknown> {
    const host = this.hosts.get(id);
    if (!host) throw new Error(`el módulo '${id}' no está activo`);
    return host.call(fn, ...args);
  }

  /** Las vistas que han propuesto los módulos activos. */
  vistas(): { modulo: string; vista: VistaModulo }[] {
    const salida: { modulo: string; vista: VistaModulo }[] = [];
    for (const [id, host] of this.hosts) {
      for (const v of host.vistas()) salida.push({ modulo: id, vista: v });
    }
    return salida;
  }
}
