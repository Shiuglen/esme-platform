# REA: los ojos de la mente

> Este documento explica cómo la mente puede mirar dentro de un programa, qué
> es lo que ve cuando mira, y por qué lo que NO ve es tan importante como lo
> que ve.
>
> Referencia: `core/rea/`, `core/extension-host/proc.ts`,
> `estandar/rea.spec.yaml`, `docs/MODULOS.md`.

## 0. La pregunta

Hay dos cosas que la mente no sabe hacer y que un humano sí: **mirar dentro
de un programa** y **contar lo que hay**. Un programa de Electron son 58 MB de
JavaScript empaquetado: 33.436 nodos, 25.173 relaciones, 10.061 cosas que el
análisis no pudo resolver. Un humano lo abre con un descompilador y lee el
código. La mente, hasta ahora, no tenía nada de eso: sólo sabía absorber
ficheros de texto.

REA es el sensor que le da ese ojo. Pero un ojo sin contrato es un problema:
un análisis real pesa 58 MB y trae 33.436 nodos. Si eso entra en la mente tal
cual, la mente llena su presupuesto con expresiones y vínculos que nadie
pregunta, y después afirma cosas que nadie comprobó.

Por eso REA entra en el kit **por la puerta**:

1. **La forma, con nombre.** La Evidencia es un documento con un contrato
   escrito (`estandar/rea.spec.yaml`), comprobado en la frontera. Lo que no
   encaja se dice con sus motivos.
2. **El coste, declarado.** El catálogo de REA dice, operación por operación,
   qué efectos tiene (lanza procesos, toca el disco, sale a la red, muestra
   una ventana). Cada efecto se traduce a una capacidad del kit. Un módulo que
   quiera analizar una app no pide «REA»: pide `proc:spawn` + `fs:project`, y
   la casa sabe por qué.
3. **El resumen, no el volcado.** De la evidencia salen **hechos por
   entidad**, no por nodo: decenas de filas, no decenas de miles.

## 1. La Evidencia: el documento con nombre

La Evidencia es lo que REA entrega. Tiene cinco bloques, y los cinco importan:

| Bloque | Qué dice | Por qué está |
|---|---|---|
| `sujeto` | Qué programa se miró, su formato, su huella | Sin nombre no hay evidencia: no se sabe de quién habla |
| `proveedor` | Quién lo miró y con qué versión | Un análisis sin proveedor no se puede repetir |
| `limitations` | Lo que este análisis NO pudo hacer | Una lista puede estar vacía, pero el campo **siempre está** |
| `unknowns` | Lo que se vio y no se pudo resolver | 10.061 nodos sin explicación son 10.061 afirmaciones potenciales |
| `coverage` | Qué familias se quedaron fuera | Si el grafo está truncado, hay que saberlo antes de citarlo |

La forma se comprueba con zod en `core/rea/forma.ts`. El sobre entero se
valida; los 33.000 nodos se normalizan **a mano**, porque pasarlos por zod
cuesta más que el análisis entero. Un nodo que no tiene `kind` o `node_id` no
se inventa: se descarta.

```ts
import { leeEvidenciaReaJson } from "esme-platform/core/rea/forma.ts";

const lectura = leeEvidenciaReaJson(texto);
if (!lectura.ok) throw new Error(lectura.errores.join("; "));
// lectura.evidencia.nodes, .unknowns, .coverage, .limitations…
```

Cuando la forma no encaja, la respuesta es `ok: false` con la lista de
motivos. Nunca es una evidencia a medias que parece entera.

## 2. El catálogo: lo que REA puede hacer, con lo que cuesta

El catálogo (`rea capabilities --format json`) es la otra mitad del contrato.
No dice qué ha visto REA: dice **qué sabe hacer** y **qué efectos tiene cada
operación**.

| Efecto declarado | Capacidad del kit | Modo |
|---|---|---|
| `launches_process` | `proc:spawn` | exigible |
| `may_write_filesystem` | `fs:project` | exigible |
| `may_access_network` | `net:fetch` | condicionada (los dominios de la operación en la lista de la persona) |
| `may_show_ui` | `ui:render` | condicionada (que haya una ventana que lo muestre) |

Dos reglas que no se rompen:

- **Una operación que no esté en el catálogo no se concede.** No hay
  «operación desconocida, pero funciona».
- **Una operación sin efectos declarados no se presume inocua.** Se trata
  como la que peor efecto declara. Un efecto que una versión nueva de REA
  declare y el kit no conozca se cuenta como **desconocido**, y se dice.

```ts
import { leeCatalogoRea, capacidadesExigidas, operaciónPermitida } from "esme-platform/core/rea/";

const req = capacidadesExigidas(catalogo, "analizar-app");
// → { ok: true, capacidades: ["proc:spawn", "fs:project"], condiciones: [...], desconocidos: [] }

const veredicto = operaciónPermitida(catalogo, "analizar-app", concedidas);
// → { ok: false, faltan: ["proc:spawn"], ... }
```

## 3. La puerta de los programas (`proc:spawn`)

Hasta ahora un módulo no podía lanzar nada: `child_process` es un núcleo
prohibido de la cápsula y la lista de capacidades no tenía hueco para él. Con
esta puerta, un módulo puede pedir que el **anfitrión** lance un programa y
reciba su salida.

Por qué el anfitrión y no el módulo. El hijo de un módulo hereda el disco, el
entorno y la red del anfitrión. Si lo lanza el propio módulo, la cápsula no
es una cápsula: es un sugerencias. Si lo lanza el anfitrión, todo lo que el
hijo hace pasa por cuatro guardas:

1. **Lista de programas.** No se lanza lo que el módulo pida: se lanza lo que
   el anfitrión ha concedido, y sólo por su **nombre lógico** («rea»). Un
   módulo que invente un nombre recibe un no, no una ejecución.
2. **Argumentos en array.** Nunca una cadena con comillas: sin shell no hay
   interpretación, no hay `;`, no hay `$(...)`, no hay redirección.
3. **Directorio de trabajo confinado.** El hijo nace dentro del proyecto.
4. **Entorno mínimo, tiempo tope y salida tope.** El hijo no ve las llaves de
   la persona, no vive para siempre y no llena la memoria.

La puerta **no promete que el programa sea inocuo**: REA lanza navegadores y
captura pantallas. Lo que promete es que la persona lo ha concedido, y que el
resto de efectos que declara REA (red, UI) se piden por sus capacidades
normales.

### El libro de los programas: quién decide qué se puede lanzar

La puerta sólo lanza lo que está en la **lista de programas** que el anfitrión
tiene concedida. Esa lista no vive en el código (si viviera en el código, la
puerta estaría cerrada para siempre): vive en el **libro de la casa**, en
`~/.esme/programas.json`, en texto plano, para que se pueda leer y corregir a
mano.

```bash
npm run programas -- lista
npm run programas -- concede rea --desc "el motor de ingeniería inversa"
npm run programas -- revoca rea
```

Dos decisiones, y no se confunden:

| | Qué decide | Dónde vive |
|---|---|---|
| **El libro de los programas** | qué se puede lanzar en esta casa | `~/.esme/programas.json` |
| **El libro de los permisos** | qué puede hacer cada módulo | `~/.esme/consentimientos.json` |

Un módulo puede tener `proc:spawn` concedido y que no haya ningún programa
permitido: entonces la puerta existe y no abre nada. Al revés también: que el
programa esté en el libro **no** da permiso a ningún módulo — el permiso sigue
siendo del módulo, y lo concede la persona.

Dos reglas del libro: el nombre es un **nombre de ejecutable** (no una ruta:
«rea», no «/usr/bin/rea») y la **descripción es obligatoria** — es lo que se le
enseña a quien concede, y un programa sin explicación no se concede.

```ts
// en el anfitrión: qué programas se pueden lanzar
abreHost(manifiesto, {
  programas: [
    { nombre: "rea", ruta: "/usr/local/bin/rea", envPermitidas: ["REA_HOME"] },
  ],
});

// en el módulo (si tiene `proc:spawn` y el anfitrión lo concedió)
const r = await globalThis.esme.proc.ejecutar({
  programa: "rea",
  args: ["analyze", "--format", "json", "/ruta/de/la/app"],
});
// → { codigo: 0, stdout: "{...}", stderr: "", truncado: false, timeout: false, ms: 812 }
```

## 4. De la evidencia al conocimiento

La evidencia es un grafo. El conocimiento es otra cosa. La regla que gobierna
`core/rea/conocimiento.ts`:

> **Un hecho por entidad, no por nodo.**

De un módulo se dice qué módulo es y qué funciones con nombre declara. De las
funciones sueltas, lo que se sepa. De los 22.510 nodos de expresión, un número
en la composición y nada más.

| Tipo de hecho | Qué dice |
|---|---|
| `sujeto` | Qué se miró, con qué confianza y con qué autoridad |
| `composicion` | El inventario completo, en una frase («412 nodos de tipo módulo, 22.510 de tipo expresión…») |
| `limite` | Una limitación declarada por el análisis |
| `desconocido` | Una familia de nodos que no se pudo resolver |
| `cobertura` | El estado de la cobertura, y si se truncó |
| `superficie` | La superficie: canales IPC, ventanas, preloads, puentes, procesos auxiliares |
| `modulo`, `funcion`, `endpoint`, `proceso`, `configuracion`, `evento`, `temporizador`, `frontera` | Los nodos que merecen un hecho propio |

Y la segunda regla, más importante:

> **Lo que no se vio también es conocimiento.**

Los límites, los desconocidos por familia y la cobertura por familia salen
como hechos propios. Una mente que sabe lo que no puede afirmar vale más que
una que afirma de más.

## 5. La absorción: presupuesto contado, secretos fuera

La absorción es el mismo pipeline de siempre —EXCLUIR → REDACTAR → TROCEAR—
con una diferencia: aquí el conocimiento no viene de un fichero de texto, viene
de un programa. Las filas que salen son `Trozo` como las de cualquier
importador, con la misma promesa: **una fila que sale de aquí no lleva un
secreto dentro**.

Lo que cambia es el presupuesto, que es **contado**: si los hechos no caben, se
dice cuántos quedaron fuera y se deja una fila que lo recuerda. Un recorte
silencioso es una mentira con forma de dato.

```ts
import { absorbeEvidencia } from "esme-platform/core/rea/absorbe.ts";

const a = absorbeEvidencia(evidencia, { maxTrozos: 400, budgetTokens: 20_000 });
// a.trozos, a.hechos, a.fuera, a.secretosRedactados, a.nota
```

El importador (`core/mind/importers/rea.ts`) lee un JSON **ya exportado** y
no ejecuta nada: ejecutar REA es otra historia (la puerta `proc:spawn`), y va
por separado.

## 6. Lo que esto NO es

- **No es un antivirus.** REA dice qué hay en un programa; no dice si es
  malo. La diferencia entre «esto es lo que hay» y «esto es bueno» la decide
  la persona.
- **No es una puerta trasera.** `proc:spawn` es una pieza más de la puerta, con
  su lista de programas, sus topes y su confine. No abre la cápsula.
- **No mete 58 MB en la mente.** El grafo completo se queda fuera; a la mente
  llegan decenas de hechos y la cuenta de lo que no se vio.
- **No presume.** Un efecto desconocido no se presume inocuo; una operación
  ausente del catálogo no se concede; un análisis sin cobertura declarada se
  lee como incompleto.

## 7. Cómo se comprueba

| Qué | Dónde |
|---|---|
| La forma de la evidencia y del catálogo | `tests/rea.test.ts` |
| Los hechos, lo que no se vio y el presupuesto | `tests/rea.test.ts` |
| Las cuatro guardas de `proc:spawn` | `tests/rea.test.ts` (la puerta) y `tests/capsula.test.ts` (el anfitrión entero) |
| El libro de los programas y la cadena entera | `tests/programas.test.ts` (libro → runtime → anfitrión → hijo real) |
| Que la spec y el código son la misma cosa | `tests/specs-codigo.test.ts` (check 11) |
| Que zod no se arrastra al núcleo | `tests/consumible.test.ts` |
| Que una evidencia se absorbe por la CLI | `tests/mind-cli.test.ts` |
