# LA ARENA — la cata a ciegas

> La cata ciega es un juego de la confianza. Sin contrato, se rompe en
> silencio: en el nombre que se cuela, en el mapa que se cambia después, y en
> la cata que se cuenta como si fueran diez.

## Qué es una arena

Una carrera ciega. Dos o más participantes hacen **la misma tarea**, y la
persona elige el winner **sin saber quién es quién**. Al final se revela el
mapa, y ese veredicto —medido, con catas de sobra— es lo que alimenta el
paladar: «para pruebas, tu cata dice Qwen».

El documento es el contrato ([`estandar/arena.spec.yaml`](../estandar/arena.spec.yaml)):

| Campo | Qué lleva |
|---|---|
| `tarea` / `categoria` | lo que se hizo y de qué tipo es (la categoría agrupa las catas) |
| `participantes[]` | **la parte ciega**: la etiqueta (A, B, C…) y las medidas (ms, tokens, cambios, ok) |
| `compromiso` | el hash del mapa con su sal, hecho **antes** de la carrera |
| `veredicto` | la etiqueta que eligió la persona (sin saber quién era) |
| `revelacion` | la sal y las fichas: la identidad, **después** del veredicto |

## Las tres reglas que la sostienen

**1. El ciego es ciego.** El documento ciego no lleva motor, ni modelo, ni
coste. No es una cuestión de confianza: `fugasCiegas()` mira el documento y
dice si algo se coló. Por eso el coste se descubre al final, que es
justamente donde delata al gratuito.

**2. El mapa se compromete antes.** El organizador podría cambiar el mapa
después de ver los resultados (y quedarse con la mejor carrera debajo de la
etiqueta que le conviene). Así que antes de la carrera se publica un
**compromiso**: el hash del mapa con una sal aleatoria dentro. Publicar un
hash no dice nada del mapa —no se puede deshacer— pero ata el mapa a la sal.
Después del veredicto se publica la sal, se rehace el hash, y:

- si cuadra → la arena es **limpia**;
- si no cuadra → la arena está **contaminada**, y no cuenta para nada.

Y por encima, la **huella**: el hash de toda la parte ciega. Se entrega a la
persona *antes* de revelar, así que también se puede comprobar que las
mediciones no se cambiaron a posteriori.

**3. Un paladar necesita catas.** Con una sola cata hay una impresión, no un
paladar. Por eso `MINIMO_CATAS = 3`: un motor con menos catas no propone
nada, y aunque no proponga, la cuenta está a la vista (catas, ganadas, tasa).

## El flujo, de punta a punta

```bash
# 1. la cata: mide, reparte a ciegas y deja el documento ciego
$ npm run arena -- cata --tarea "¿qué se decidió sobre el Taller?" \
    --categoria pruebas --modulo modulos/ejemplo-troceo-pro --modulo modulos/ejemplo-hola-mundo
— la cata, a ciegas —
tarea: ¿qué se decidió sobre el Taller?
categoría: pruebas
  A: 42 ms · 118 tokens · 1 cambios
  B: 61 ms · 96 tokens · 0 cambios

compromiso: 9f2c… (el hash del mapa con su sal)
HUELLA (entrégala antes de revelar): 41ab…

# 2. la persona elige, sin ver nombres
$ npm run arena -- revelar --ciega arena.ciega.json --clave arena.clave.json --elige A
— la revelación —
  A: esme.nucleo.troceo-pro
  B: esme.nucleo.memoria-con ← la elegida

integridad: limpia

# 3. el juez mira cualquier documento
$ npm run arena -- juzgar arena.revelada.json
# 4. y el paladar aprende de varias catas
$ npm run arena -- paladar arena.revelada.json otras/*.revelada.json
— el paladar —
pruebas:
  esme.nucleo.troceo-pro: 2/3 catas (67 %)
  → para «pruebas», tu cata dice esme.nucleo.troceo-pro (2/3)
```

## Qué corre el kit y qué corre la app

| | En el kit | En la app |
|---|---|---|
| Quién corre | los **módulos** de la casa, por su puerta (`core/arena/ejecuta.ts`) | los **motores** (claude, opencode, codex…) |
| Qué produce | el mismo documento | el mismo documento |
| Quién juzga | el kit (`core/arena/arena.ts`) | el kit |

Un contrato, dos lenguas: la app produce el documento y el kit lo juzga, lo
verifica y aprende de él. Lo que NO se hace es duplicar la ejecución de
motores en el kit: esa pieza vive en la app, que ya tiene su cliente ACP.

## Las reglas de la carrera

- **cada participante en su copia**: si compartieran la carpeta, el que
  contesta segundo vería lo que hizo el primero, y la comparación mediría el
  estado del rival y no su trabajo;
- **las medidas se escriben, no se estiman**: si un participante no corrió, su
  medida es `ok: false` y hay una incidencia escrita (un número inventado no
  es una medida);
- **el orden es el de las etiquetas** (A, B, C…), nunca el de llegada: el
  orden de llegada puede delatar el precio.

## El paladar y el router

El paladar es la memoria que sale de las catas, y entra en el router como
segunda memoria, después de la persona:

1. **la persona** — si hay veredicto para esa tarea exacta, va su motor;
2. **el paladar** — si no, el motor que ganó las catas de esa categoría;
3. **el router** — si no hay nada aprendido, decide Laya.

```ts
eligeConAprendido("arregla la puerta", aprendido, () => "laya", "pruebas");
// → { ruta: "qwen", de: "paladar" }
```

## Referencia

- `estandar/arena.spec.yaml` — el contrato
- `core/arena/ciego.ts` — la sal, el reparto, el compromiso y la huella
- `core/arena/arena.ts` — el documento, el juez y las fugas
- `core/arena/paladar.ts` — la agregación y el listón de catas
- `core/arena/ejecuta.ts` — la carrera, con copias aisladas
- `scripts/arena.ts` — la línea de órdenes
- `core/router/aprende.ts` — el paladar en el router
