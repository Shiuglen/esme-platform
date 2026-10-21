/**
 * compat-check — ¿qué motores pueden alojar este módulo?
 *   npm run compat -- <carpeta-del-módulo> [--json] [--presencia]
 *
 * La ruta exacta la nombra la arquitectura (docs/ARQUITECTURA.md §8):
 * `scripts/estandar/compat-check.ts`. Lo que hace:
 *
 *   1. dictamina el manifiesto del módulo;
 *   2. carga la spec de motores (estandar/motor-capability.spec.yaml);
 *   3. cruza los dos y dice, motor por motor, si puede alojarlo Y POR QUÉ;
 *   4. dice si el motor está INSTALADO en esta máquina (que no es lo mismo que
 *      que funcione: puede faltar la llave o el modelo).
 *
 * Por qué importa: un módulo que no puede alojar NINGÚN motor es un módulo
 * que no sirve, y hoy nadie se entera hasta que alguien lo instala. Con esto
 * se entera antes: en el PR.
 *
 * Referencia: docs/MOTORES.md, motores/compat.ts.
 */
import { resolve, join } from "node:path";
import { cargaMotorCached } from "../../motores/laya-adapter.ts";
import { estaInstalado } from "../../motores/acp-motores.ts";
import {
  compatMotores,
  motoresDeclaradosQueNoExisten,
  type Compatibilidad,
  type RequisitoModulo,
} from "../../motores/compat.ts";
import { leeManifiesto } from "../../tienda/modulo-manifiesto.ts";

export interface ResultadoCompat {
  /** El módulo (id y versión). */
  modulo: string;
  /** ¿El manifiesto vale? */
  ok: boolean;
  /** Los errores del dictamen. */
  errores: string[];
  /** Motor por motor. */
  motores: Compatibilidad[];
  /** Los motores que SÍ pueden alojarlo. */
  pueden: string[];
  /** Los motores que el módulo declara y no existen en la spec. */
  declaradosInexistentes: string[];
}

const raizKit = resolve(import.meta.dirname, "..", "..");

/** El requisito que el módulo impone a un motor, tal y como lo declara. */
export function requisitoDe(manifiesto: {
  runtime: string;
  permissions: string[];
  engines?: string[];
}): RequisitoModulo {
  return {
    runtime: manifiesto.runtime,
    permisos: [...manifiesto.permissions],
    engines: manifiesto.engines,
  };
}

/** Cruza el módulo con la spec de motores. */
export function verificaCompat(
  dirModulo: string,
  opts: { rutaSpec?: string; presencia?: boolean } = {}
): ResultadoCompat {
  const dir = resolve(dirModulo);
  const dictamen = leeManifiesto(dir, { exigirEntrada: false });
  const motores = cargaMotorCached(
    opts.rutaSpec ?? join(raizKit, "estandar", "motor-capability.spec.yaml")
  );

  if (!dictamen.ok || !dictamen.manifest) {
    return {
      modulo: dictamen.id,
      ok: false,
      errores: dictamen.errores,
      motores: [],
      pueden: [],
      declaradosInexistentes: [],
    };
  }

  const requisito = requisitoDe(dictamen.manifest);
  const declaradosInexistentes = motoresDeclaradosQueNoExisten(requisito, motores);
  const tabla = compatMotores(requisito, motores, opts.presencia ? estaInstalado : () => false);

  return {
    modulo: dictamen.manifest.id,
    ok: declaradosInexistentes.length === 0,
    errores: declaradosInexistentes.map(
      (m) => `el módulo declara el motor «${m}», que no está en la spec de motores`
    ),
    motores: tabla,
    pueden: tabla.filter((c) => c.ok).map((c) => c.motor),
    declaradosInexistentes,
  };
}

/** El texto que ve quien mira el resultado. */
export function renderCompat(r: ResultadoCompat): string {
  const lineas: string[] = [];
  lineas.push(`módulo : ${r.modulo}`);
  if (!r.ok) {
    for (const e of r.errores) lineas.push(`  ✗ ${e}`);
  }
  for (const c of r.motores) {
    const instalado = c.instalado ? " (instalado)" : "";
    lineas.push(`  ${c.ok ? "✓" : "✗"} ${c.motor.padEnd(12)}${instalado} — ${c.motivo}`);
  }
  lineas.push(
    r.pueden.length
      ? `pueden : ${r.pueden.join(", ")}`
      : "pueden : NINGUNO — este módulo no lo puede alojar ningún motor"
  );
  return lineas.join("\n");
}

// ——— la línea de comandos ———
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (flag: string): string | null => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : null;
  };
  const tiene = (flag: string): boolean => process.argv.includes(flag);

  const dir = arg("--dir") ?? process.argv[2];
  if (!dir || dir.startsWith("--")) {
    console.error("uso: npm run compat -- <carpeta-del-módulo> [--json] [--presencia]");
    process.exit(2);
  }
  const resultado = verificaCompat(dir, { presencia: tiene("--presencia") });
  if (tiene("--json")) console.log(JSON.stringify(resultado, null, 2));
  else console.log(renderCompat(resultado));
  // un módulo que no puede alojar ningún motor no sirve: eso es un fallo
  process.exit(resultado.ok && resultado.pueden.length > 0 ? 0 : 1);
}
