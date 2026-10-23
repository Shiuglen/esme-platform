/**
 * EL VERIFICADOR — LA PUERTA DE ENTRADA: ¿entra este módulo?
 *   npm run verificar:modulo -- <carpeta-del-módulo> [--salida <dir>] [--firmar] [--json]
 *
 * Lo que hace, en orden, y siempre igual (da igual quién lo llame: una
 * persona, la CI o un agente):
 *
 *   1. dictamina el manifiesto (tienda/modulo-manifiesto.ts);
 *   2. lo construye (esbuild, los mismos flags que el resto de la casa);
 *   3. lo MIDE de verdad: se le abre su worker, se le habla por la puerta y
 *      se cuentan los tokens (core/bench/ciclo.ts);
 *   4. escribe el bench.json con los números MEDIDOS (nunca inventados);
 *   5. lo juzga (core/modulos/veredicto.ts): entra, entra con reparos o no;
 *   6. lo empaqueta, y lo firma si la llave de esta máquina tiene derecho.
 *
 * Por qué importa: sin este comando, publicar un módulo exigía saber cinco
 * cosas a la vez (el manifiesto, el build, la medida, el juez y la firma). Con
 * él, un módulo ajeno se comprueba entero con un comando, y quien decide si
 * entra lo hace con números, no con una impresión.
 *
 * Lo que NO hace (a propósito): no toca el índice firmado de la tienda. El
 * índice lo firma quien tiene derecho; este script dice si lo que hay delante
 * se lo merece, y entrega el paquete.
 *
 * POR QUÉ VIVE AQUÍ Y NO EN `scripts/`: porque esto no es una herramienta de
 * la casa, es la PUERTA DE ENTRADA de la era. Un tercero que instala el kit
 * tiene que poder verificar su módulo sin el repo: por eso esta lógica es
 * publicable (y por eso los scripts de `scripts/` son sólo la ropa de la
 * línea de comandos).
 *
 * Referencia: docs/ENTRADA.md, core/modulos/veredicto.ts, tienda/modulo-manifiesto.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { claveDeFirma, puedePublicar } from "./claves.ts";
import { empaquetar } from "./empaque.ts";
import { firmarBytes, type FirmaBytes } from "./firma.ts";
import { leeManifiesto } from "./modulo-manifiesto.ts";
import { mideCicloModulo, menteDePrueba } from "../core/bench/ciclo.ts";
import { mideMemoriaModulo } from "../core/bench/memoria.ts";
import { juzgaPielDeModulo } from "./piel.ts";
import { juzgaAgenteDeModulo } from "./agente.ts";
import { mideModulo } from "../core/bench/modulos.ts";
import { programasDeLaCasa } from "../core/modulos/programas.ts";
import { juzgaModulo, type VeredictoModulo, type InformeModulo } from "../core/modulos/veredicto.ts";
import { construyeModulo } from "./construye.ts";

export interface OpcionesVerificar {
  /** Dónde se deja el paquete de entrega. */
  salida?: string;
  /** ¿Se firma el paquete con la llave de esta máquina? */
  firmar?: boolean;
  /** ¿Se escribe el bench.json medido dentro del módulo? */
  escribirInforme?: boolean;
}

export interface ResultadoVerificar {
  /** ¿El módulo tiene un manifiesto válido? */
  manifiestoOk: boolean;
  /** Los errores del dictamen del manifiesto (si los hay). */
  errores: string[];
  /** Los avisos del dictamen (lo que no está mal pero falta). */
  avisos: string[];
  /** El veredicto del juez (si se pudo juzgar). */
  veredicto: VeredictoModulo | null;
  /** El informe medido (el bench.json que se escribió). */
  informe: InformeModulo | null;
  /** El paquete (si se llegó a empaquetar). */
  paquete: { ruta: string; sha256: string; bytes: number } | null;
  /** La firma del paquete (si la llave tenía derecho). */
  firma: { signed_by: string; hash: string } | null;
  /** Los pasos que quedan para publicar. */
  pasos: string[];
}

/** El artefacto firmado: lo que el libro de firmas guarda de cada módulo. */
export interface ArtefactoFirmado {
  modulo: string;
  version: string;
  tar: string;
  bytes: number;
  firmado_en: string;
  firma: FirmaBytes;
  /**
   * La clave pública que firmó.
   *
   * Por qué va dentro: el índice declara las claves de los que firman, y el
   * consumidor busca ahí la del firmante del artefacto. Si el que firma es
   * otro (un módulo de cualquiera, con su propia llave), su clave tiene que
   * poder viajar con la firma — o el consumidor no puede verificarla.
   */
  pub?: string;
}

/**
 * Firma un paquete (el tarball) y devuelve el artefacto.
 *
 * Una sola forma de firmar en toda la casa: el que verifica, el que publica
 * y el bench firman IGUAL, o los bytes que se firman y los que se publican
 * dejan de ser los mismos.
 */
export function firmaArtefacto(
  paquete: { ruta: string; sha256: string; bytes: number },
  modulo: string,
  version: string,
  privPem: string,
  huella: string,
  pubPem?: string
): ArtefactoFirmado {
  return {
    modulo,
    version,
    tar: paquete.sha256,
    bytes: paquete.bytes,
    firmado_en: new Date().toISOString().slice(0, 10),
    firma: firmarBytes(readFileSync(paquete.ruta), privPem, huella),
    ...(pubPem ? { pub: pubPem } : {}),
  };
}

const escribir = (ruta: string, dato: unknown): void =>
  writeFileSync(ruta, JSON.stringify(dato, null, 2) + "\n");

/**
 * Verifica un módulo de verdad. Devuelve el veredicto, el paquete y lo que
 * falta para publicar. Nunca lanza por un módulo malo: un módulo malo es un
 * RESULTADO (el juez lo dice), no un fallo del script.
 */
export async function verificaModulo(
  dirModulo: string,
  opts: OpcionesVerificar = {}
): Promise<ResultadoVerificar> {
  const dir = resolve(dirModulo);
  const salida = resolve(opts.salida ?? join(dir, "salida"));
  const pasos: string[] = [];

  // 1. el manifiesto, en dos tiempos: primero la FORMA (que no necesita el
  //    build), luego el conjunto (que sí: la entrada tiene que existir).
  const forma = leeManifiesto(dir, { exigirEntrada: false });
  if (!forma.ok || !forma.manifest) {
    return {
      manifiestoOk: false,
      errores: forma.errores,
      avisos: forma.avisos ?? [],
      veredicto: null,
      informe: null,
      paquete: null,
      firma: null,
      pasos: ["el manifiesto no vale: arréglalo y vuelve a pasar por aquí"],
    };
  }

  // 2. construir: sin `dist/` no hay nada que medir.
  try {
    await construyeModulo(dir);
  } catch (e) {
    return {
      manifiestoOk: true,
      errores: [],
      avisos: forma.avisos ?? [],
      veredicto: null,
      informe: null,
      paquete: null,
      firma: null,
      pasos: [`el módulo no compila: ${String((e as Error)?.message || e)}`],
    };
  }

  // 2bis. el dictamen completo, ahora que la entrada existe.
  const dictamen = leeManifiesto(dir);
  if (!dictamen.ok || !dictamen.manifest) {
    return {
      manifiestoOk: false,
      errores: dictamen.errores,
      avisos: dictamen.avisos ?? [],
      veredicto: null,
      informe: null,
      paquete: null,
      firma: null,
      pasos: ["el manifiesto no vale: arréglalo y vuelve a pasar por aquí"],
    };
  }
  const manifiesto = dictamen.manifest;

  // 1bis. el guard de la identidad: un módulo de tema trae una piel, y la
  //      piel tiene que ser válida (y se tiene que LEER). La estética es el
  //      producto: por eso hay un juez, y por eso está en la puerta.
  const piel = juzgaPielDeModulo(dir, manifiesto.category);
  const agente = juzgaAgenteDeModulo(dir, manifiesto.category);
  if (!piel.ok || !agente.ok) {
    return {
      manifiestoOk: true,
      errores: [],
      avisos: dictamen.avisos ?? [],
      veredicto: null,
      informe: null,
      paquete: null,
      firma: null,
      pasos: [...piel.errores, ...agente.errores],
    };
  }

  // 3. medir de verdad y 4. el informe medido.
  //    Un módulo de HERRAMIENTA se mide por su ciclo (la puerta); un módulo de
  //    MEMORIA, por su troceo (el examen de la casa). Cada forma con su
  //    examen: no hay dos verdades.
  //    La misma mente de juguete para las dos medidas: si el módulo no tiene
  //    a quién preguntar, la medición no mide nada (y el juez lo dice).
  const { mente } = menteDePrueba();
  const medida =
    manifiesto.category === "memory"
      ? await mideMemoriaModulo(dir, manifiesto)
      : await mideCicloModulo(dir, manifiesto, { mente, programas: programasDeLaCasa() });
  if (opts.escribirInforme !== false) {
    const nombre = manifiesto.benchmarks?.report ?? "bench.json";
    writeFileSync(join(dir, nombre), JSON.stringify(medida.informe, null, 2) + "\n");
  }

  // 5. la medida canónica (la que el juez conoce): se relee el informe y se
  //    ejercita el módulo con sus sondas, para saber qué capacidades tocó.
  const medidas = await mideModulo(dir, manifiesto, { mente, programas: programasDeLaCasa() });
  const veredicto = juzgaModulo(manifiesto, medidas.medidas);

  // 6. empaquetar (y firmar si esta máquina tiene derecho).
  let paquete: ResultadoVerificar["paquete"] = null;
  let firma: ResultadoVerificar["firma"] = null;
  try {
    mkdirSync(salida, { recursive: true });
    const p = empaquetar(dir, salida);
    paquete = { ruta: p.ruta, sha256: p.sha256, bytes: p.bytes };
    const clave = claveDeFirma();
    if (opts.firmar) {
      const derecho = puedePublicar(clave);
      if (derecho.ok) {
        const artefacto = firmaArtefacto(
          { ruta: p.ruta, sha256: p.sha256, bytes: p.bytes },
          manifiesto.id,
          manifiesto.version,
          clave.priv,
          clave.huella,
          clave.pub
        );
        firma = artefacto.firma;
        escribir(join(salida, `${manifiesto.id}.artefacto.json`), artefacto);
      } else {
        pasos.push(`esta llave no publica (${derecho.razon}): el paquete queda sin firma`);
      }
    }
  } catch (e) {
    pasos.push(`no se pudo empaquetar: ${String((e as Error)?.message || e)}`);
  }

  if (veredicto.entra) {
    pasos.push(
      "abre una PR en `tienda/` con el paquete y el veredicto, o entrégale el paquete a quien mantenga la tienda",
      "quien publica lo mete en el índice firmado (npm run bench) y lo firma con la llave de release"
    );
  } else {
    pasos.push("el juez no lo ha aceptado: arregla lo que dice el veredicto y vuelve a verificar");
  }

  return {
    manifiestoOk: true,
    errores: [],
    avisos: dictamen.avisos ?? [],
    veredicto,
    informe: medida.informe,
    paquete,
    firma,
    pasos,
  };
}

/** El texto que se le enseña a quien está en la puerta. */
export function renderVerificacion(r: ResultadoVerificar): string {
  const lineas: string[] = [];
  if (!r.manifiestoOk) {
    lineas.push("manifiesto : FUERA");
    for (const e of r.errores) lineas.push(`  · ${e}`);
    return lineas.join("\n");
  }
  const v = r.veredicto;
  lineas.push(`manifiesto : vale${r.avisos.length ? ` (avisos: ${r.avisos.join("; ")})` : ""}`);
  if (v) {
    lineas.push(`carga      : ${v.medidas.carga ? "sí" : "no"}`);
    lineas.push(`forma      : ${v.medidas.forma}`);
    if (v.medidas.forma === "memoria") {
      lineas.push(
        `número     : ${v.medidas.casos} casos · recall ${(v.medidas.recallBase ?? 0).toFixed(3)} → ${(v.medidas.recallCon ?? 0).toFixed(3)} · ${Math.round(v.medidas.tokensCon ?? 0)} tokens`
      );
    } else {
      lineas.push(
        `número     : ${v.medidas.casos} casos · ${Math.round(v.medidas.tokensCiclo ?? 0)} tokens por ciclo`
      );
    }
    lineas.push(`permisos   : usa [${v.medidas.usadas.join(", ") || "nada"}] de [${v.medidas.declaradas.join(", ") || "nada"}]`);
    lineas.push(`veredicto  : ${v.entra ? "ENTRA" : "FUERA"} (${v.nivel}) — ${v.causa}`);
  }
  if (r.paquete) {
    lineas.push(`paquete    : ${r.paquete.ruta} (${r.paquete.bytes}B, sha ${r.paquete.sha256.slice(0, 12)}…)`);
  }
  if (r.firma) {
    lineas.push(`firma      : ${r.firma.signed_by}`);
  }
  for (const p of r.pasos) lineas.push(`siguiente  : ${p}`);
  return lineas.join("\n");
}

