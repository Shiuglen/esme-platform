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

## Lo que se PLLIEGA y lo que no

Plegar no es esconder: el texto sigue ahí, con su coste. Lo que cambia es lo
que la persona lee sin pedirlo. Por eso los dos números van aparte:

- `actividad`: lo que costó (con los detalles);
- `actividad_plegada`: lo que se ve (una línea).

Y por eso **plegar es lo que mantiene el chat limpio**: un paso con 4 000
caracteres de detalle no ensucia el chat, porque nadie lo lee hasta que lo
pide.

## De dónde viene la idea

De las capturas de PandaCode (las de los marcadores de X): *«Tool steps fold
away, the chat stays clean»*, *«Every turn's changed files & diffs»*,
*«200K context»* y el *«Token saver»* (Standard | Team | Saver). La idea que
se absorbe: **la conversación es una lista de datos**, y lo que la persona
lee se puede DECIDIR y MEDIR en lugar de heredarse de cómo se programó el
chat.
