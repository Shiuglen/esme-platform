/**
 * LA PUERTA DE LOS MÓDULOS — una sola API para todo el mundo.
 *
 * Quien quiera usar módulos (la app, la CLI, un agente) habla con esta puerta
 * y no con el worker, ni con el libro de permisos, ni con la carpeta del
 * módulo. Eso es lo que hace una puerta: que del otro lado haya lo que haya.
 *
 * La secuencia completa, en sus cuatro tiempos:
 *
 *   1. `carga()`      — qué hay instalado en disco.
 *   2. `instala(id)`  — baja de la Tienda, verifica la firma y lo registra.
 *   3. `concede(...)` — la persona dice qué permisos da (o no).
 *   4. `activa(id)`   — el worker vivo, con la puerta montada.
 *
 * Y después, `llama(id, fn, ...)` para usarlo.
 *
 * Referencia: core/modulos/registro.ts, core/modulos/consentimiento.ts,
 * docs/ARQUITECTURA.md §16.
 */
import { Registro, type ModuloInstalado, type ModuloVivo, type OpcionesRegistro } from "./registro.ts";
import type { MenteViva } from "../ipc/mind-schema-types.ts";
import type { VistaModulo } from "../extension-host/puerta.ts";

/** Cómo se buscan los módulos instalados (lo sabe quien tiene el disco). */
export type Cargador = () => Promise<ModuloInstalado[]>;

/** Cómo se instala un módulo (lo sabe quien sabe de la Tienda). */
export type Instalador = (
  id: string,
  opts?: { baseUrl?: string }
) => Promise<ModuloInstalado>;

export interface OpcionesRuntime extends Omit<OpcionesRegistro, "rutaPermisos"> {
  /** Dónde vive el libro de los permisos. */
  rutaPermisos: string;
  /** La mente que se inyecta en los módulos que la piden. */
  mente?: MenteViva;
  /** Cómo se buscan los instalados (por defecto: los que hay en el registro). */
  cargar?: Cargador;
  /** Cómo se instala un módulo (por defecto: no se puede instalar). */
  instalar?: Instalador;
}

export interface RuntimeModulos {
  /** Los módulos y su estado. */
  lista(): ModuloVivo[];
  /** La vista de un módulo. */
  vista(id: string): ModuloVivo;
  /** Carga lo que hay instalado. */
  carga(): Promise<ModuloVivo[]>;
  /** Instala un módulo de la Tienda (verifica la firma antes de nada). */
  instala(id: string, opts?: { baseUrl?: string }): Promise<ModuloVivo>;
  /** Concede permisos (la persona). */
  concede(id: string, capacidades: string[], por?: string): ModuloVivo;
  /** Revoca permisos. */
  revoca(id: string, capacidades: string[]): ModuloVivo;
  /** Activa un módulo (abre su worker con la puerta montada). */
  activa(id: string): Promise<ModuloVivo>;
  /** Desactiva un módulo. */
  desactiva(id: string): Promise<ModuloVivo>;
  /** Llama a una función del módulo. */
  llama(id: string, fn: string, ...args: unknown[]): Promise<unknown>;
  /** Las vistas propuestas por los módulos activos. */
  vistas(): { modulo: string; vista: VistaModulo }[];
  /** Cierra todos los workers. */
  cierra(): Promise<void>;
  /** El registro, para quien quiera el detalle. */
  readonly registro: Registro;
}

/**
 * Abre la puerta de los módulos.
 *
 * `cargar` e `instalar` se inyectan porque el núcleo no sabe de YAML ni de
 * red: quien sabe, lo dice. La Tienda (`tienda/modulos.ts`) trae las dos
 * montadas.
 */
export function modulos(opts: OpcionesRuntime): RuntimeModulos {
  const registro = new Registro({
    rutaPermisos: opts.rutaPermisos,
    mente: opts.mente,
    proyecto: opts.proyecto,
    dominios: opts.dominios,
    onEvento: opts.onEvento,
    onVista: opts.onVista,
  });

  return {
    registro,
    lista: () => registro.lista(),
    vista: (id) => registro.vista(id),
    async carga() {
      if (opts.cargar) {
        const instalados = await opts.cargar();
        registro.registraTodos(instalados);
      }
      return registro.lista();
    },
    async instala(id, io) {
      if (!opts.instalar) {
        throw new Error("este runtime no sabe instalar: dale un instalador (tienda/modulos.ts)");
      }
      const m = await opts.instalar(id, io);
      return registro.registra(m);
    },
    concede(id, capacidades, por) {
      registro.permisos.concede(id, capacidades, por);
      return registro.vista(id);
    },
    revoca(id, capacidades) {
      registro.permisos.revoca(id, capacidades);
      return registro.vista(id);
    },
    async activa(id) {
      return registro.activa(id);
    },
    async desactiva(id) {
      await registro.desactiva(id);
      return registro.vista(id);
    },
    async llama(id, fn, ...args) {
      return registro.llama(id, fn, ...args);
    },
    vistas: () => registro.vistas(),
    async cierra() {
      await registro.cierraTodo();
    },
  };
}
