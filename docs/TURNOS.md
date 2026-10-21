# EL TURNO — la conversación como dato

> «Los pasos se pliegan, el chat queda limpio» no es una frase: es un
> **número**. Y un turno que no dice qué tocó no es un turno: es un mensaje.

## Qué es un turno

Lo que pasó entre la pregunta y la respuesta, escrito ([`estandar/turno.spec.yaml`](../estandar/turno.spec.yaml)):

| Campo | Qué lleva |
|---|---|
| `respuesta` | lo que ve la persona |
| `actividad[]` | los pasos de las herramientas (con su estado) |
| `cambios[]` | los ficheros que cambió este turno (+líneas/−líneas) |
| `tokens` | contexto, respuesta, actividad, **actividad_plegada** y el total |
| `coste_usd` | lo que costó (si el motor es de API) |
| `presupuesto` | el techo que este turno respeta |
| `modo` | el modo del contexto que se usó (estándar / ahorrador / equipo) |

## La limpieza, medida

La regla se cumple o no se cumple, y se mira en un número:

- **lo que se lee** = la respuesta + la actividad **plegada** (UNA línea:
  «12 pasos»);
- **limpieza** = la respuesta sobre lo que se lee;
- **listón**: 60 %. Por debajo, el chat se ensució.

Y aparte, el dato que explica un turno pesado: **el trabajo** (los tokens de
la actividad) sobre la respuesta. Diez veces más trabajo que respuesta es un
turno que enseña el proceso y olvida el resultado.

```bash
$ npm run turno -- turno.json
opencode · estandar · 3 250 tokens · limpieza 89% · 1 ficheros · $0.12
limpieza : 89% (listón 60%)
trabajo  : 2.4× la respuesta
```

## Lo que cambió, de verdad (y medido)

Los `cambios` del turno no son una promesa: se calculan. Y el cálculo viene
de la ingeniería inversa de **PandaCode** (Rust/Tauri, `turn_changes.rs`), que
resuelve exactamente este problema. Lo que se trajo:

| De PandaCode | En el kit |
|---|---|
| instantánea por **hash de contenido** (no por fecha) | `core/turnos/cambios.ts` |
| diff de **Myers** (O(ND)) con tope de 512 ediciones | igual, en TS |
| `additions: Option` — un número que no se sabe es **null**, no 0 | igual |
| escaneo con **plazo** (un recorrido infinito es peor que ninguno) | `PLAZO_MS` |
| binarios y truncados se **marcan** | igual |
| «concurrent»: si el árbol cambió midiendo, no se puede atribuir | igual |

Y una corrección que salió al aplicarlo: la instantánea guarda el **texto**
(acotado), no sólo el hash. Con sólo el hash, el diff se calculaba sobre el
disco ya cambiado y salía vacío — y un diff vacío es una mentira.

```bash
$ npm run cambios -- ver1 ver2
     +2     ?  nuevo.txt
     +1    -0  src/a.ts
total    : +3 -0 en 2 ficheros
```

## Lo que se PLLIEGA y lo que no

Plegar no es esconder: el texto sigue ahí, con su coste. Lo que cambia es lo
que la persona lee sin pedirlo. Por eso los dos números van aparte:

- `actividad`: lo que costó (con los detalles);
- `actividad_plegada`: lo que se ve (una línea).

Y por eso **plegar es lo que mantiene el chat limpio**: un paso con 4 000
caracteres de detalle no ensucia el chat, porque nadie lo lee hasta que lo
pide.

## Ejecutar un turno (aquí, en el kit)

Los contratos no sólo se declaran: se EJECUTAN.

```bash
$ npm run ejecutar -- modulos/ejemplo-hola-mundo "¿qué se decidió sobre el Taller?"
turno    : esme.nucleo.hola-mundo@0.1.0
respuesta: {"id":"esme.nucleo.hola-mundo","respuesta":"recuerdo de ¿qué se decidió sobre el Taller?",...}
tokens   : 47 (respuesta 30 · actividad 8)
limpieza : 94%
permisos : montados [mind:read, mind:write, ui:render]
cambios  : nada
```

Lo que hace (`core/turnos/ejecuta.ts`):

1. abre el módulo con su **cápsula** y su **puerta**;
2. le pregunta por la **convención** (`ciclo(consulta)`, o `trocea(fuente, texto)`
   si es de memoria);
3. mide el turno: tokens, limpieza, permisos montados;
4. y calcula **lo que tocó**, en el espacio de trabajo (no en la carpeta del
   módulo: ésa es el código del agente).

Y una regla que se respeta porque es de la casa: **lo concedido manda**. Un
módulo que pide `mind:read` y no lo tiene concedido corre sin puerta (y el
turno lo dice). La cápsula, además, cierra `node:fs`: un módulo que quiere
escribir, escribe por la puerta (`fs:project`), y lo que cambia es el
proyecto.

## De dónde viene la idea

De las capturas de PandaCode (las de los marcadores de X): *«Tool steps fold
away, the chat stays clean»*, *«Every turn's changed files & diffs»*,
*«200K context»* y el *«Token saver»* (Standard | Team | Saver). La idea que
se absorbe: **la conversación es una lista de datos**, y lo que la persona
lee se puede DECIDIR y MEDIR en lugar de heredarse de cómo se programó el
chat.
