# LOS PUNTOS — cada persona con su PC, y sus puntos

> «Cada usuario de Esme tiene su propia PC, al estilo dots.» Esto es el
> contrato de esa idea: **un punto por agente, con lo que really consume,
> medido**.

## La pregunta

Todos los días, la misma: **¿qué se está comiendo la memoria ahora mismo?**
Un agente que se come la RAM no se nota hasta que la máquina va lenta. Y sin
números, la respuesta es una impresión.

```bash
$ npm run puntos
puntos (tope 2048 MiB)
    opencode     4003544   412 MiB     0%  opencode
    opencode     4003370   381 MiB   9.8%  opencode
    opencode     1742352   182 MiB     0%  opencode
```

Un punto por proceso: el motor, el PID, la memoria residente y la CPU, **leídos
del sistema operativo**. Nada estimado.

Y con `--todos`, la máquina entera (no sólo los motores), porque la pregunta
de la RAM no es «cuánto usa el agente» sino «**qué se está comiendo la
máquina**»:

```
$ npm run puntos -- --todos --tope 500
  ! ?            4002821  2987 MiB 108.6%  electron
  ! ?            4002834   720 MiB     0%  python3
  ! ?               5098   671 MiB   9.9%  gnome-shell
    opencode     4003544   416 MiB   3.3%  opencode
```

## El contrato

[`estandar/puntos.spec.yaml`](../estandar/puntos.spec.yaml) es el escrito
(entre dos lenguajes, sólo sobrevive lo que está escrito):

| Campo | Qué dice |
|---|---|
| `id` | estable (motor + pid + arranque) |
| `motor` | el id del motor, o `null` si no se sabe |
| `proceso` | el nombre del proceso |
| `pid` | el proceso |
| `estado` | `vivo` \| `zombi` \| `desconocido` |
| `memoria_mb` | MiB residentes, **medidos** |
| `cpu_pct` | el uso de CPU **de ahora** (dos muestras, no la media histórica) |
| `desde` | cuándo arrancó |
| `pasado` | si se pasa del tope |

## Las reglas

1. **Se mide, no se estima.** La memoria sale de `/proc` (Linux) o de `ps`
   (macOS). Si el sistema no lo dice, el punto lo dice (`null`): no se
   disimula.
2. **Un tope por defecto** (2 GiB por punto): el que se pasa, se ve. Una app
   que se come la RAM se nota *entonces*, no a posteriori.
3. **Es local.** Leer el consumo de tus procesos no sale de tu PC: no hay
   telemetría, no hay servidor. Ni siquiera esto es una nube.
4. **No es un monitor de sistema.** Solo mira los procesos que la casa conoce
   (los motores declarados) y los que le pidas por PID. No mira pantallas,
   ni teclas, ni ficheros.

## De dónde viene la idea

De los marcadores de X: **PandaCode** (una GUI de agentes de 12 MB en Rust, sin
Chromium y sin servidor Node: 180 MB en reposo con 30 agentes) y su
alternativa a **Dots**, que se integra con las apps de mensajería; y de
**Shuh**, que hizo visual la gestión de GPUs («cada tarjeta muestra su
memoria, y con un clic se ajusta la configuración para que encaje»).

La idea que se absorbe no es la herramienta: es la forma de pensar. **Lo que
pasa en tu máquina, se ve en tu máquina, en un punto, con un número al lado.**
Y nada de eso necesita un navegador entero para verse.

## El desglose y el desbordamiento

Dos reglas que la idea de las tarjetas de GPU trajo consigo (el gestor visual
de GPUs que había en los marcadores: «cada tarjeta muestra su memoria, y con un
clic se ajusta la configuración para que encaje»):

1. **El desglose**: no basta con «cuánta memoria» — hay que saber **de qué**
   se compone: **pesos** (el modelo), **caché** (la KV de cada petición: cada
   una lleva la suya) y **libre**. La caché se puede soltar; los pesos, no.
2. **Cuando no hay hueco, a la COLA. Nunca a la nube.** Es la anti-matriz de la
   casa escrita como regla: el desbordamiento de esta máquina se espera aquí,
   no se manda fuera. Está en la spec de los motores (`desbordamiento: "cola"`)
   y en la de los puntos.

## Dónde vive

| Qué | Dónde |
|-----|-------|
| La medida | `core/motores/puntos.ts` |
| La CLI | `npm run puntos [-- --json] [--motor opencode] [--pid 1234] [--tope 2048]` |
| El contrato | `estandar/puntos.spec.yaml` |

La ventana puede dibujarlos como puntos (al estilo Dots) sin que el kit sepa
nada de dibujado: para eso los puntos son **datos**.
