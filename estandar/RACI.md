# RACI Lite — quién decide qué en `estandar/`

> No es un comité: es una regla de una línea para que una spec no se quede
> sin dueño. Referencia: docs/ARQUITECTURA.md §8.

## Los cuatro roles

| Rôle | Quién | Qué hace |
|---|---|---|
| **R** (Responsable) | quien propone el cambio | escribe el PR y responde a las observaciones |
| **A** (Accountable) | el creador | el merge final: una spec cambia cuando él lo dice |
| **C** (Consultado) | quien use la spec | se le pregunta antes (Discord `#estandar`) |
| **I** (Informed) | los releases | las notas de la versión se generan del changelog |

## El camino de un cambio

1. **PR a `estandar/`**: cambia la spec Y su ejemplo (una spec sin ejemplo
   ejecutable es un documento, no un contrato).
2. **CI `spec-lint`**: toda spec nueva tiene que parsear, declarar su
   `schema_version` y ser legible por una máquina.
3. **El test de conformidad**: si la spec tiene código que la implementa, el
   test comprueba que código y spec dicen lo mismo. Si no lo tienen, la spec
   está documenting una intención, no un contrato: se puede, pero se dice.
4. **1 maintainer approve** (= el creador) → merge. Sin comité, sin burocracia.

## Lo que NO se hace aquí

- **No hayunstyled distro**: la spec es abierta (cualquiera la propone), pero
  la **identidad visual** (Tinta y Luz) no se skinnea: los tokens son del
  creador, y un módulo `theme` tiene que pasar el juez de las pieles.
- **No hay cambios rompientes sin camino**: una spec que cambia de forma
  declara la migración (`crs-delta`) en el mismo PR.
- **No hay spec sin ejemplo**: lo que no se puede ejecutar, no es un
  contrato (es una intención, y se escribe como tal).
