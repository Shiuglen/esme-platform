/**
 * modulos — la puerta de los módulos, desde la terminal.
 *
 *   npm run modulos -- lista
 *   npm run modulos -- instala esme.nucleo.troceo-pro
 *   npm run modulos -- concede esme.nucleo.troceo-pro mind:read mind:write
 *   npm run modulos -- activa esme.nucleo.troceo-pro
 *   npm run modulos -- llama esme.nucleo.troceo-pro resumen '["hola"]'
 *   npm run modulos -- juzga esme.nucleo.troceo-pro
 *   npm run modulos -- desactiva esme.nucleo.troceo-pro
 *
 * Esto es la MISMA puerta que usa la app (`core/modulos/api.ts`): la terminal
 * y la ventana no tienen caminos distintos, sólo usuarios distintos.
 *
 * Referencia: docs/MODULOS.md, core/modulos/api.ts.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { creaRuntimeTienda, leeModulo, instaladosEn, TIENDA_PUBLICA } from "../tienda/modulos.ts";
import { planDeActualizacion } from "../core/modulos/actualiza.ts";
import { bajar } from "../tienda/servidor.ts";
import { mideModulo } from "../core/bench/modulos.ts";
import { programasDeLaCasa } from "../core/modulos/programas.ts";
import { juzgaModulo } from "../core/modulos/veredicto.ts";
import { leeRaiz } from "../tienda/raiz.ts";

const raizKit = resolve(import.meta.dirname, "..");
const dirModulos = process.env.ESME_MODULOS ?? join(homedir(), ".esme", "modulos");
const rutaPermisos = join(dirModulos, "consentimientos.json");

const pubRaiz =
  process.env.ESME_PUB_KEY ?? leeRaiz(raizKit) ?? "";
if (!pubRaiz) {
  console.error("no encuentro la raíz de confianza (ESME_PUB_KEY o tienda/raiz.pub.pem)");
  process.exit(1);
}

const runtime = creaRuntimeTienda({
  dirModulos,
  rutaPermisos,
  pubRaiz,
  baseUrl: process.env.ESME_TIENDA_URL,
});

// Lo que hay instalado se carga antes de nada: a partir de aquí, la puerta
// sabe de los módulos que hay en disco.
await runtime.carga();

const [comando, ...resto] = process.argv.slice(2);

/** Imprime los módulos y su estado (la lista que la app también muestra). */
const lista = async (): Promise<void> => {
  const mods = await runtime.carga();
  if (!mods.length) {
    console.log("no hay módulos instalados");
    return;
  }
  for (const m of mods) {
    const estado = m.estado === "activo" ? "activo" : m.estado === "error" ? `error: ${m.error}` : "instalado";
    console.log(`· ${m.id} v${m.version} — ${estado}`);
    console.log(`  permisos: ${m.permisos.declaradas.join(", ") || "ninguno"}`);
    const concedidas = m.permisos.concedidas;
    const pendientes = m.permisos.pendientes;
    console.log(`  concedidos: ${concedidas.join(", ") || "ninguno"}`);
    if (pendientes.length) console.log(`  PIDIENDO PALABRA: ${pendientes.join(", ")}`);
    if (m.usadas.length) console.log(`  usadas: ${m.usadas.join(", ")}`);
  }
};

try {
switch (comando) {
  case "lista": {
    await lista();
    break;
  }

  case "instala": {
    const id = resto[0];
    if (!id) {
      console.error("uso: modulos instala <id>");
      process.exit(1);
    }
    const m = await runtime.instala(id);
    console.log(`✓ ${m.id} v${m.version} instalado en ${m.dir}`);
    console.log(`  entrada: ${m.entrada}`);
    console.log(`  pide: ${m.manifiesto.permissions.join(", ") || "nada"}`);
    break;
  }

  case "actualiza": {
    // el plan: qué hay versión nueva, y qué cambia de verdad
    const base = process.env.ESME_TIENDA_URL ?? TIENDA_PUBLICA;
    let indice: { modulos?: Array<{ id: string; version: string }> } = {};
    try {
      indice = JSON.parse((await bajar(`${base}/index.json`)).toString("utf8"));
    } catch (e) {
      console.error(`no se pudo leer la tienda: ${String((e as Error).message)}`);
      process.exit(1);
    }
    const instalados = runtime.lista().map((m) => ({ id: m.id, version: m.version, dir: m.dir }));
    const plan = planDeActualizacion(instalados, indice.modulos ?? []);
    if (!plan.actualizaciones.length) {
      console.log("todo está al día ✓");
      break;
    }
    for (const u of plan.actualizaciones) {
      console.log(`· ${u.id}: v${u.de} → v${u.a}`);
    }
    if (!resto.includes("--sí")) {
      console.log("");
      console.log("esto es un plan: con --sí se aplica (la firma se verifica igual que al instalar)");
      break;
    }
    for (const u of plan.actualizaciones) {
      const m = await runtime.instala(u.id, { baseUrl: base });
      console.log(`✓ ${m.id} v${m.version} actualizado`);
    }
    console.log("los permisos no se han tocado: lo que concediste, concedido");
    break;
  }

  case "concede": {
    const [id, ...caps] = resto;
    if (!id || !caps.length) {
      console.error("uso: modulos concede <id> <capacidad...>");
      process.exit(1);
    }
    const m = runtime.concede(id, caps);
    console.log(`✓ ${id}: concedidas ${m.permisos.concedidas.join(", ") || "ninguna"}`);
    if (m.permisos.pendientes.length) {
      console.log(`  siguen esperando: ${m.permisos.pendientes.join(", ")}`);
    }
    break;
  }

  case "revoca": {
    const [id, ...caps] = resto;
    if (!id || !caps.length) {
      console.error("uso: modulos revoca <id> <capacidad...>");
      process.exit(1);
    }
    const m = runtime.revoca(id, caps);
    console.log(`✓ ${id}: concedidas ${m.permisos.concedidas.join(", ") || "ninguna"}`);
    break;
  }

  case "activa": {
    const id = resto[0];
    if (!id) {
      console.error("uso: modulos activa <id>");
      process.exit(1);
    }
    const m = await runtime.activa(id);
    if (m.estado === "error") {
      console.error(`✗ ${id} no arranca: ${m.error}`);
      process.exit(1);
    }
    console.log(`✓ ${id} activo`);
    console.log(`  pid del worker: vivo (la puerta tiene ${m.permisos.concedidas.length} permisos)`);
    break;
  }

  case "desactiva": {
    const id = resto[0];
    if (!id) {
      console.error("uso: modulos desactiva <id>");
      process.exit(1);
    }
    await runtime.desactiva(id);
    console.log(`✓ ${id} desactivado`);
    break;
  }

  case "llama": {
    const [id, fn, ...args] = resto;
    if (!id || !fn) {
      console.error("uso: modulos llama <id> <función> [json]");
      process.exit(1);
    }
    // Llamar a un módulo implica quererlo vivo: cada invocación de la
    // terminal es un proceso nuevo, así que se activa aquí.
    if (runtime.vista(id).estado !== "activo") {
      const m = await runtime.activa(id);
      if (m.estado === "error") throw new Error(`el módulo no arranca: ${m.error}`);
    }
    const arg = args[0] ? (JSON.parse(args[0]) as unknown[]) : [];
    const r = await runtime.llama(id, fn, ...arg);
    console.log(JSON.stringify(r, null, 2));
    break;
  }

  case "juzga": {
    const id = resto[0];
    const dir = id
      ? join(dirModulos, id.replace(/\./g, "__"))
      : undefined;
    const dirs = dir ? [dir] : instaladosEn(dirModulos).map((m) => m.dir);
    if (!dirs.length) {
      console.error("no hay módulos que juzgar");
      process.exit(1);
    }
    for (const d of dirs) {
      const leido = leeModulo(d);
      if (!leido.ok || !leido.modulo) {
        console.error(`✗ ${d}: ${leido.errores.join("; ")}`);
        continue;
      }
      const { manifiesto, medidas } = await mideModulo(d, leido.modulo.manifiesto, {
        programas: programasDeLaCasa(),
      });
      const v = juzgaModulo(manifiesto, medidas);
      const marca = v.entra ? (v.nivel === "ok" ? "✓" : "⚠") : "✗";
      console.log(`${marca} ${v.id} v${v.version} — ${v.nivel}: ${v.causa}`);
      console.log(
        `  recall ${String(v.medidas.recallBase)} → ${String(v.medidas.recallCon)} (delta ${String(v.medidas.delta)}), ` +
          `coste ${String(v.medidas.coste)}×, usadas: ${v.medidas.usadas.join(", ") || "ninguna"}`
      );
    }
    break;
  }

  default: {
    console.log("la puerta de los módulos");
    console.log("");
    console.log("  lista                            qué hay instalado y con qué permisos");
  console.log("  actualiza [--sí]                 qué hay versión nueva (y la aplica con --sí)");
    console.log("  instala <id>                    baja de la Tienda, verifica la firma y registra");
    console.log("  concede <id> <cap...>           la persona dice qué permisos da");
    console.log("  revoca <id> <cap...>            la persona cambia de idea");
    console.log("  activa <id>                     abre el worker con la puerta montada");
    console.log("  desactiva <id>                   lo cierra");
    console.log("  llama <id> <fn> [json]          usa el módulo");
    console.log("  juzga [<id>]                    lo mide y dictamina si entra");
    console.log("");
    console.log(`  módulos en: ${dirModulos}`);
  }
}
} catch (e) {
  console.error(`✗ ${(e as Error)?.message ?? e}`);
  process.exitCode = 1;
}

await runtime.cierra();
