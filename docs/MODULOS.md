# Los módulos: la puerta, la cápsula y el juez

> Este documento explica cómo un módulo pasa de ser un fichero en un disco a
> ser algo vivo dentro de Esme, y por qué el camino es el que es.
>
> Referencia: `docs/ARQUITECTURA.md` §2 y §16, `core/extension-host/`,
> `core/modulos/`, `estandar/module-manifest.spec.yaml`,
> `estandar/module-veredicto.spec.yaml`.

## 0. La pregunta

La Tienda pública ya tenía módulos firmados que se podían instalar desde
internet (`npm run instalar:remoto`). Pero instalar un módulo no es lo mismo
que **tenerlo**: nada lo ejecutaba, nada le preguntaba a la mente, y —lo que
era peor— el sistema de permisos era decorativo.

Un módulo en un worker de Node tenía `fetch`, `process.env` (con las llaves
de la persona dentro) y podía importar `node:fs` o `node:child_process`
sin que nadie le preguntara. El manifiesto declaraba capacidades
(`net:fetch`, `fs:project`…) y el código no las cumplía: **el permiso era
mentira**.

Este trabajo cierra ese hueco. Tres piezas, en este orden:

1. **La CÁPSULA** (`core/extension-host/sandbox.ts`): lo que el módulo no
   puede ni tocar.
2. **La PUERTA** (`core/extension-host/puerta.ts`): lo que sí, y sólo si se
   le concede.
3. **El JUEZ** (`core/modulos/veredicto.ts`): si un módulo entra o no.

Y debajo, el **RUNTIME** (`core/modulos/api.ts`): la puerta de los módulos
que usan la app y la terminal, con la misma API.

## 1. La cápsula: cerrarlo por dentro no es una promesa

Un módulo no es de fiar: no se le pide que se porte bien, se le quita la
opción. Tres capas, todas verificables (`tests/capsula.test.ts`):

| Capa | Qué hace | Cómo se comprueba |
|---|---|---|
| **Importar está cerrado** | Un hook de resolución de módulos (`module.registerHooks`) rechaza los núcleos de Node que un módulo no debería tocar: `fs`, `child_process`, `net`/`http`, `os`, `process`, `inspector`, `vm`… | El módulo hace `import("node:fs")` y recibe un `throw` del cargador, no un error raro |
| **Los globales se ciegan** | `fetch`, `WebSocket` y `process` (con su `env`) desaparecen del mundo del módulo | `typeof globalThis.fetch === "undefined"` y `process.env` vacío |
| **La puerta decide** | Lo concedido se monta en `globalThis.esme`; lo que no, no existe | Sin permiso, `esme.fs` es `undefined`: no hay función que falle, hay una puerta sin esa pieza |

Los núcleos prohibidos están en `NUCLEOS_PROHIBIDOS` (`core/extension-host/sandbox.ts`).
Son una decisión de seguridad, no de comodidad: se conservan y se explican.

## 2. La puerta: lo que el módulo ve

`globalThis.esme` es la puerta. Tiene seis piezas, y cada una existe sólo si
el módulo la **declaró** en su manifiesto **y** la persona la **concedió**:

| Pieza | Capacidad | Qué puede hacer (y qué no) |
|---|---|---|
| `esme.mente` | `mind:read` / `mind:write` | `recall`, `remember`, `intake`, `rumbo`. La forma se verifica con zod y la mente se ejecuta en el proceso principal: el módulo recibe la **respuesta**, nunca la mente. |
| `esme.fs` | `fs:project` | Leer y escribir **dentro de la carpeta del proyecto**. `..` no sale (la comparación es por segmentos, no por prefijo de texto). |
| `esme.net` | `net:fetch` | Sólo a los **dominios concedidos**, con tope de tiempo, y cada salto de redirección se comprueba. |
| `esme.ipc` | `ipc:emit` | Emitir eventos, **con namespace del módulo**: `esme.x.y:listo`. Un módulo no puede hablar en nombre de otro. |
| `esme.ui` | `ui:render` | Proponer una vista. El módulo propone; la app decide si se ve. |
| `esme.entorno` | — | Plataforma, versión de Node y la **huella** de la máquina (hash), nunca su nombre: el nombre identifica a la persona. |

### El permiso tiene tres estados, no dos

- **Declarado**: lo que el manifiesto pide.
- **Concedido**: lo que la persona ha dicho que sí (se guarda en el libro:
  `~/.esme/modulos/consentimientos.json`).
- **Usado**: lo que la medición le ha visto tocar de verdad.

Lo declarado y no concedido **no se monta**. Lo declarado y no usado se
**avisa** (pide más de lo que necesita: quien lo instala tiene que saberlo).
Lo usado y no declarado **no puede pasar**: la cápsula lo impide.

## 3. El runtime: la puerta de los módulos

`core/modulos/api.ts` es lo que usan la app y la terminal. Es UNA API, no
seis:

```ts
const runtime = modulos({ dirModulos, rutaPermisos, mente });

await runtime.carga();                              // qué hay instalado
await runtime.instala("esme.nucleo.troceo-pro");    // baja, verifica la firma y registra
runtime.concede("esme.nucleo.troceo-pro", ["mind:write"]);  // la persona dice
await runtime.activa("esme.nucleo.troceo-pro");     // el worker vivo
await runtime.llama("esme.nucleo.troceo-pro", "filasDe", [...]);  // usarlo
```

El núcleo no sabe de YAML ni de red: por eso `cargar` e `instalar` se
inyectan. La Tienda (`tienda/modulos.ts`) trae las dos montadas:

```ts
const runtime = creaRuntimeTienda({ dirModulos, rutaPermisos, pubRaiz });
```

Y desde la terminal:

```bash
npm run modulos -- lista
npm run modulos -- instala esme.nucleo.troceo-pro
npm run modulos -- concede esme.nucleo.troceo-pro mind:write
npm run modulos -- activa esme.nucleo.troceo-pro
npm run modulos -- llama esme.nucleo.troceo-pro filasDe '[[{"tipo":"fila-tabla"}]]'
npm run modulos -- juzga
```

> El JSON de `llama` es **la lista de argumentos**: `'[[...]]'` pasa una
> lista como único argumento.

## 4. El juez: un módulo entra si lo demuestra

Las skills tienen juez; los módulos no. Ahora sí (`core/modulos/veredicto.ts`):

1. **Carga**: el módulo arranca y contesta. Si no, no entra.
2. **Forma**: cada módulo se mide como lo que es. Un módulo de **memoria**,
   por el recall (base vs. con). Un módulo de **herramienta**, por el ciclo
   completo (recall→inject) y los tokens que inyecta.
3. **Mejora y coste**: llega al mínimo que su propio manifiesto declaró, y no
   paga un peaje. El coste se mide **por punto de acierto**: pagar 40 tokens
   por 0,01 de recall no es mejorar.
4. **Permisos**: lo que usa está dentro de lo que declara.

El juez no concede permisos: concede veredictos. Y **nunca estima**: si el
módulo no se puede abrir y ejercitar, el veredicto es «sin medida», no un
número inventado.

Y el veredicto **se firma**: el documento entero (el catálogo juzgado, la
huella del árbol que se miró y el dictamen) va firmado con la clave de la
Tienda, para que la app pueda comprobarlo sin guardar ninguna clave privada y
negarse a activar un árbol que no sea exactamente el que el juez miró.
`npm run modulos:juzgar` → `modulos/veredictos.json`.

### Cómo se mide de verdad

`core/bench/modulos.ts` abre el módulo en su worker, con la puerta real, y
llama a las **sondas** que declara su informe (`bench.json.sondas`): las
funciones que lo ejercitan. El host sabe qué capacidades se han tocado —no
hay que adivinarlas, y el módulo no puede despistar porque la cápsula no le
deja tocar lo que no pidió—.

Ejemplo real, medido en este repo (`npm run bench`):

```
memoria    : recall 0.250 → 1.000 · ENTRA (recordar mejor: +0.750 recall)
herramienta: ENTRA — el ciclo funciona: 3 escenarios, 19 tokens por ciclo
la puerta  : ENTRA — el ciclo funciona: 3 escenarios, 53 tokens por ciclo
```

## 5. El módulo de ejemplo: `esme.nucleo.puerta`

`modulos/ejemplo-puerta/` toca la puerta entera y dice qué tocó. Es a la vez
la prueba de que la puerta sirve y la teaching example de cómo se escribe un
módulo:

```ts
import { esme } from "esme-platform/sdk";

export async function demuestra(consulta: string): Promise<string[]> {
  const tocadas: string[] = [];
  if (globalThis.esme?.mente) {
    const r = await globalThis.esme.mente.recall({ query: consulta, budget: 400 });
    tocadas.push("mind:read");
    return tocadas;
  }
  return tocadas;
}
```

Lo que **no** hace, y es lo importante: no usa `fetch`, ni `node:fs`, ni
`process.env`. No puede: la cápsula los cierra.

## 6. Lo que falta (y es una decisión, no un fallo)

### 6.1 La app todavía no llama a esta puerta

El kit tiene el runtime; a la app (`~/Daimon`) le falta el pegamento. Son dos
ficheros y una vista:

**a) El cliente de la app tiene que saber hablar `MenteViva`.** Hoy
`app/src/main/mente/cliente.ts` habla con el cerebro en su propia forma; el
host habla en la del kit. El traductor es pequeño:

```ts
// app/src/main/mente/viva.ts
import type { MenteViva } from "esme-platform/core/ipc/mind-schema-types.ts";
import type { ClienteCerebro } from "./cliente.ts";

/** La MenteViva que el host de módulos necesita. */
export function menteViva(cliente: ClienteCerebro): MenteViva {
  return {
    recall: async (query, budget) => {
      const r = await cliente.recordar(query, { budget });
      return r.ids.map((id, i) => ({ id, texto: r.context.slice(i * 80, i * 80 + 80) }));
    },
    remember: async (text, kind) => {
      const r = await cliente.recordar(text, { motor: kind });
      return { id: r.ids[0] ?? "s/n" };
    },
    intake: async (source, content, tags) => {
      await cliente.ingerir([source]);
      return { id: source };
    },
    rumbo: async () => cliente.rumbo(),
  };
}
```

> Lo que sí hay que decidir aquí es el `recall`: la mente devuelve el contexto
> como un bloque y las ids sueltas (`Recuerdos`), y el kit espera recuerdos
> con texto. Esa traducción es la primera pieza real de la puerta.

**b) El runtime en el proceso principal.** Un solo fichero, y los canales IPC
que la ventana usa:

```ts
// app/src/main/modulos/runtime.ts
import { creaRuntimeTienda } from "esme-platform/tienda/modulos.ts";
import { leeRaiz } from "esme-platform/tienda/raiz.ts";
import { menteViva } from "../mente/viva.ts";

export const modulos = creaRuntimeTienda({
  dirModulos: join(app.getPath("userData"), "modulos"),
  rutaPermisos: join(app.getPath("userData"), "modulos", "consentimientos.json"),
  pubRaiz: leeRaiz(raizKit) ?? "",
  mente: menteViva(cliente),
  proyecto: app.getPath("userData"),
  dominios: [],                       // la red se concede por módulo
  onEvento: (evento, carga) => ventana.webContents.send("modulos:evento", { evento, carga }),
  onVista: (vista) => ventana.webContents.send("modulos:vista", vista),
});
```

Y los canales (`modulos:lista`, `modulos:instala`, `modulos:concede`,
`modulos:activa`, `modulos:llama`), con el patrón de siempre: validar en el
proceso principal y devolver `{ ok: true, ... } | { ok: false, error }`.

**c) La vista.** Una pestaña «Módulos» en la Tienda (`TiendaVista.tsx`): los
instalados, lo que piden, lo que se les ha concedido, y los botones de
instalar / conceder / activar. El pedido de permisos es el momento en que la
persona dice que sí o que no: sin ese momento, la puerta no tiene dueño.

### 6.2 El kit no está en npm

`esme-platform` no está publicado, así que la app no puede depender de él
todavía. Publicarlo es un paso de una persona (la cuenta de npm), no un
problema de código. Mientras tanto, el pegamento puede ir con `file:`.

### 6.3 El veredicto ya está firmado

El juez produce el dictamen **y lo firma** (`npm run modulos:juzgar`). El
documento firmado (`modulos/veredictos.json`) ata tres cosas:

- **el catálogo**: la proyección estable de lo publicado (id, versión y el
  sha256 del tarball). Los números del bench no entran en la huella: se
  vuelven a medir cada día y el veredicto no puede caducar por eso. Lo que sí
  lo caduca es que cambie el artefacto.
- **el árbol**: la huella de los bytes que el juez miró. Si el módulo cambia
  después del juicio, el veredicto deja de aplicar y la app lo vuelve a poner
  en «sin medir».
- **el dictamen**: lo que el juez vio, con sus números, firmado con la clave
  de la Tienda. La app verifica con su clave pública (la misma que ya usaba
  para el veredicto de las skills) y **no necesita ninguna clave privada**.

La spec es abierta y pública: `estandar/module-veredicto.spec.yaml`.

### 6.4 Lo que NO falta

La confianza: la instalación remota verifica el índice firmado, la estirpe de
rotaciones desde la raíz congelada, la firma de cada artefacto y las
revocaciones. Eso ya estaba y ya funciona (`npm run instalar:remoto`). Lo que
faltaba era todo lo demás.

### 6.5 La puerta de entrada

Medir un módulo exige una convención (una sola función, `ciclo(consulta)`) y
un examen. Sin las dos cosas, un módulo de fuera no puede traer sus números:
no hay veredicto, y no hay entrada.

Por eso existe [`docs/ENTRADA.md`](ENTRADA.md): `npm run crear:modulo` deja un
módulo entero y `npm run verificar:modulo` lo construye, lo mide de verdad
(abre su worker, le habla por la puerta y cuenta los tokens) y lo juzga. Un
módulo nace juzgado, y el motivo de que no entre está escrito.

## 7. La regla

> Un límite solo se conserva si es una decisión del creador, nunca un resto de
> una decisión anterior. Y un permiso solo existe si la persona lo ha dicho.

Las dos reglas juntas son el motivo de que la cápsula sea una cápsula y no un
`if` de educación: el módulo no es de fiar, y el permiso es una decisión, no
un detalle de configuración.
