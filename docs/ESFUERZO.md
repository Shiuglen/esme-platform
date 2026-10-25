# EL ESFUERZO — cuánto piensa cada modelo, por escrito.

> **De dónde viene:** el creador, 23-oct-2026: «pon modos de esfuerzo por
> los modelos... y en los siguientes deseos recuerda que tenemos que serlo
> todo y totalmente modificables». No fue un marcador de X: fue una orden
> de la casa. Y la casa la escribe como escribe todo: documento primero,
> código después (y el código no sabe nada de modelos).

## La pregunta que responde

La misma tarea con «apretado» suele salir más barata y más rápida; con
«profundo», mejor en lo que importa y más cara. Lo que NO se hacía: la
casa adivinaba — o peor, nada. Ahora el esfuerzo se **pide**, se
**resuelve de la tabla** y se **manda** como el parámetro que el extremo
del motor ya entiende.

## Lo que hay

| Qué | Dónde |
|-----|-------|
| El contrato + la tabla | `estandar/esfuerzo.spec.yaml` |
| El resolver | `core/esfuerzo.ts` |
| La CLI | `npm run esfuerzo [--json]`, `npm run esfuerzo -- --motor X --modelo Y --modo profundo [--encima fichero.yaml]` |

Los tres modos de la casa: **apretado** (lo justo), **normal** (el punto
de fábrica), **profundo** (a fondo; cuesta más: se pide).

## Cómo se manda (umbral que la mente ya no cruza)

Un modelo se puede nombrar con su ficha, o hablar por la **reserva**
(`modelo: "*"`) de su motor. La ficha dice el `parametro` —
`reasoning_effort`, `budget_tokens`, `think`... — y los `valores` por
modo, en la lengua de ese motor:

```
npm run esfuerzo -- --motor opencode --modelo glm-5.3-flash-free --modo profundo
→ {"reasoning_effort": "high"}
```

## Las reglas

1. **Documento, no código:** cambiar la tabla es editar el fichero. Nada
   se recompila. Es la misma era que las pieles: *el tema es un documento*.
2. **La mente manda:** cada mente puede poner SU tabla encima
   (`--encima fichero.yaml` o `ESME_ESFUERZO`); lo que tú escribes gana,
   pieza por pieza — y una ficha que la casa no trajo, entra igual.
3. **Honesto:** un modo que la tabla no declara → NO se manda nada
   (`params: null`). Sin «media» paces inventados. Un motor sin
   parámetro de esfuerzo (la de `local`, hoy) → nada, y se dice.
4. **`normal` con valor `null` = no decir nada de esfuerzo:** el punto de
   fábrica del motor *(gemini, hoy)*.
5. **La fuente manda sobre la opinión:** cada ficha lleva `fuente` y
   `verificado` (`probado | sin-mirar`). Lo «sin-mirar» es lo que la
   fuente declara y aún no se probó contra el motor real — se corrige
   editando, no callando.

## Qué queda abierto (dicho, no callado)

- La tabla de la casa trae los extremos **por reserva** (`"*"` por motor):
  los nombres exactos de los modelos de cada casa se corrigen con tu
  documento encima (ese es el diseño: la casa trae la corriente, tú pones
  el vaso).
- La ficha del `local` (llama.cpp): hoy no hay parámetro de esfuerzo; si
  el motor lo saca, la ficha se edita y el código no cambia.
- Que el router (Laya) también pida el modo de la tarea es la pieza
  siguiente; el resolver ya está, y el `route` de la decisión puede
  llevar a partir de ahora su `esfuerzo` en la mano.
