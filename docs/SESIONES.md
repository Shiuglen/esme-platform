# LA SESIÓN — un registro al que solo se añade

> Una sesión es su registro, y su estado es lo que sale de leerlo de
> principio a fin. Por eso cualquier aparato con una copia enseña la misma
> sesión, y la puede retomar.

El contrato está en [`estandar/sesion.spec.yaml`](../estandar/sesion.spec.yaml).
El código, en [`core/sesiones/`](../core/sesiones/).

## Qué es

Un fichero `eventos.jsonl`. Cada línea es un evento: lo que dijo el motor, lo
que pidió una persona o lo que hizo la sesión. Desde el formato 2, cada línea
lleva también un **sobre** en su raíz:

| Clave | Qué lleva |
|---|---|
| `n` | su número de orden (la primera es la 0) |
| `epoca` | la época del dueño que la escribió |
| `de` | el aparato que la escribió |
| `ts` | la hora, en ms (los trozos entre latido y latido no la llevan) |
| `ant` | la huella de todo lo anterior: `h(k) = sha256(h(k-1) + "\n" + línea k)` |

Tres reglas que, sin contrato, se rompen sin que nadie lo note:

1. **Solo se añade.** Si algo cambia, se apunta otro evento. Cambiar o quitar
   una línea rompe la huella de todas las que vienen detrás.
2. **Un solo escritor.** Solo el dueño escribe; los demás aparatos mandan
   órdenes. Cada `dueno` nuevo sube la época, y lo que se escriba con una
   época vieja se rechaza.
3. **Reproducir da lo mismo.** El mismo registro da el mismo estado (los
   turnos, el plan, lo gastado, los permisos que esperan), en cualquier
   aparato.

El formato 1 son las líneas que el Taller escribe hoy, sin sobre: se leen tal
cual, sin migrar nada. Un registro puede empezar en el 1 y seguir en el 2,
nunca al revés.

## Las tres formas de una sesión

Los mismos eventos pueden estar escritos de tres maneras
([`core/sesiones/formas.ts`](../core/sesiones/formas.ts)), y las tres dan la
misma traza y el mismo estado:

| Forma | La tarea más larga de hoy (110.484 eventos) |
|---|---|
| como la escribe hoy el Taller: un trozo de texto por línea | 110.484 líneas · 5,3 MB |
| con sobre, juntando los trozos hasta el siguiente latido | 13.962 líneas · 3,8 MB |
| compactada: otro registro, con los trozos juntos del todo | 10.643 líneas · 3,3 MB |

Juntar al escribir ya deja la sesión en una octava parte de las líneas.
Compactar escribe **otro** registro (el de antes no se toca) y no pierde nada
de lo que usan el estado o la traza: la hora de cada trozo se queda en
`latidos`.

## La regla 10, medida

La regla 10 de la spec es el listón: la tarea más larga de hoy, con sobre, se
lee, se verifica y se reproduce (su estado y su traza) en menos de 200 ms en
un portátil de 4 núcleos, **también la primera vez** que se abre. Tal como la
escribe hoy el Taller, basta con que lo haga ya en marcha.

Los milisegundos dependen de la máquina, así que no los fija una prueba. Se
miden donde se corren:

```bash
$ npm run sesion -- medir
La tarea más larga de hoy, sintética: 110.484 eventos. En esta máquina (límite de la regla 10: 200 ms):

                                     líneas    tamaño   la primera vez     en marcha
  como la escribe hoy el Taller     110.484    5,3 MB         196 ms        140 ms ✓
  con sobre, juntando por latido     13.962    3,8 MB         124 ms ✓       54 ms ✓
  compactada                         10.643    3,3 MB         112 ms         48 ms

Cumple: llega en 200 ms.
```

- **La primera vez** es un proceso nuevo, que no ha calentado nada: lee el
  fichero del disco y lo abre. Es la mediana de tres.
- **En marcha** es lo mismo en un proceso que ya lo hizo una vez (la mediana
  de cinco vueltas).
- Solo se juzga lo que pide la regla (✓ o ✗); la compactada se enseña, pero
  no se juzga. Sale con 1 si algo no llega. Con `--limite` se juzga contra
  otro límite.

Lo que sale en una máquina en la nube de 4 núcleos compartidos, con ruido de
una vuelta a otra: con sobre, entre 100 y 125 ms la primera vez y entre 50 y
80 ms en marcha. Como la escribe hoy el Taller, entre 130 y 160 ms en marcha,
y entre 195 y 215 ms la primera vez: esa casilla **no** llegaría, y la regla no
se la pide. Es una razón más para escribir con sobre.

Lo que sí fija una prueba ([`tests/sesion-escala.test.ts`](../tests/sesion-escala.test.ts))
es lo que no depende de la máquina: que las tres formas dan lo mismo, cuánto
pesa cada una, y que reproducir es lineal (diez veces más eventos cuestan unas
diez veces más, no cien).

## Desde la terminal

```bash
npm run sesion -- ver <registro> [--en <n>] [--json]
npm run sesion -- verificar <registro> [--json]
npm run sesion -- compactar <registro> <salida>
npm run sesion -- importar <sesión de Claude Code> <salida> --de <aparato> [--sesion <id>] [--json]
npm run sesion -- bifurcar <registro> <n> <salida> --de <aparato> --sesion <id> [--desde <id>]
npm run sesion -- medir [--eventos <N>] [--vueltas <V>] [--limite <ms>] [--json]
npm run sesion -- abrir <registro> [--json]    # lo que tarda abrirlo aquí (medir lo usa)
```

Nada se pisa: lo que se escribe va a un fichero nuevo, y si ya existe, se dice
y no se escribe. Sale con 0 si va bien, con 1 si lo que se comprueba no
cuadra (o algo falla) y con 2 si la orden está mal escrita.

```bash
$ npm run sesion -- ver sesion.jsonl
Sesión cc-sintetica-1 · formato 2 · 19 eventos · de portatil, época 1
Gastado: 26 de entrada, 187 de salida (6 pensando).
2 turnos:
  1. «El reloj del panel va una hora tarde. ¿Lo miras?»
     → «Arreglado: el desfase era -1. Queda una prueba de la alarma que falla p…» · 3 herramientas (1 con error) · acabó en 14,0 s
  2. «Apunta lo que falta en un plan.»
     → «Hecho: dos pasos, y el primero en marcha.» · plan de 2 pasos · acabó en 4,0 s
```

## Rebobinar y bifurcar

**Rebobinar es leer.** El estado tras el evento `n` se saca reproduciendo
hasta ahí (`estadoEn`, `ver --en n`): el registro no se toca. Dentro de una
sesión, la orden `rebobinar` devuelve el contenido a como estaba, pero lo
gastado no vuelve (corregir un mensaje no borra lo que costó).

**Bifurcar** abre una sesión nueva con las líneas 0..n de otra, tal cual (su
cadena sigue valiendo), y sigue con un `dueno` que dice de dónde salió: la
sesión de origen, `n` y la huella hasta ahí, con la que quien tenga el origen
comprueba que lo copiado es lo que había.

- Solo se bifurca por un **sitio de fiar**: `verificar` dice hasta dónde lo
  es. Una huella que no casa en la línea k pone en duda las de antes que no
  confirmaba nadie; así se rescata lo bueno de un registro roto, bifurcando
  antes del daño.
- Un registro del Taller de hoy no dice de qué sesión es: hay que darla
  (`--desde`).
- Dos copias de la misma sesión que se separaron se reconcilian solas: gana
  la de época mayor en la primera línea distinta y, si empatan, la de huella
  menor, para que cualquier aparato elija la misma sin hablar con nadie.

## Importar una sesión de Claude Code

`importarClaudeCode` ([`core/sesiones/claude-code.ts`](../core/sesiones/claude-code.ts))
lee el `.jsonl` de una sesión de Claude Code y da un registro de Esme, con un
`dueno` de origen `claude-code`. Es puro: el mismo fichero da siempre el mismo
registro.

Claude Code no publica este formato. Lo que el importador sabe sale de mirar
la **estructura** de ficheros reales (nombres de campos, valores de
enumeración, cuentas), nunca su contenido. Las pruebas usan ficheros
sintéticos. Lo que una versión nueva traiga y no se conozca no se pierde en
silencio: se cuenta.

### El hilo

El fichero no es una lista sino un árbol: cada línea apunta a la de antes
(`parentUuid`). Así que lo primero es encontrar el hilo, el que acaba en el
último mensaje, de padre en padre:

- **Las compactaciones** cortan el árbol y siguen por `logicalParentUuid`.
  Si ese enlace no llegó al fichero, se empalma con la línea de antes (la que
  enlazan las demás), y se cuenta en `empalmes`.
- **Las llamadas en paralelo**: un mensaje con varias llamadas es una línea
  por bloque, y cada resultado cuelga de su llamada, así que el hilo pasa solo
  por una rama. Lo que cuelga del hilo sin ser otra rama (las otras líneas
  del mismo mensaje y los resultados de sus llamadas) también entra.
- **Lo de los hooks** cuelga de lado: se cuenta, no se importa.
- **Lo que se dejó al rebobinar**, los subagentes (`isSidechain`) y las
  líneas repetidas no entran.

### Los turnos

- Lo que escribe la persona abre un turno (`orden {mensaje}`) o, si el turno
  está en marcha, lo corrige (`orden {corregir}`). Esc lo para.
- Un aviso que compuso el sistema (`isMeta`, `promptSource: "system"`, o un
  `origin` que no es el de la persona) abre su turno como lo que recibió el
  motor (`usuario`), no como una orden. Con el turno en marcha no lo corta:
  solo se cuenta, en `meta`.
- Si Claude Code numera el turno (`turnPosition`), manda su número: uno
  nuevo abre turno aunque venga oculto, y el del turno abierto sigue en él.
- Lo que llega a la cola con el turno en marcha (`queued_command`) sigue la
  misma regla.
- Del motor salen lo que piensa y dice, sus herramientas (con su clase, sus
  rutas, su diff y su error), el plan de TodoWrite, los reintentos y los
  fallos de la API y el cambio de modelo. Cada turno cierra con su `fin` y lo
  que gastó, contado una vez por mensaje (Claude Code lo repite en cada línea
  suya).

**Lo que no está en el fichero no se inventa.** Un turno que se quedó a
medias no lleva `fin`; una herramienta sin resultado se queda esperando; las
imágenes se dicen, no se guardan; de lo que devuelve una herramienta solo se
guarda la salida de una orden o un error (hasta mil caracteres), no el
fichero que leyó.

### El informe

Importar cuenta todo, lo que entró y lo que no:

| Campo | Qué cuenta |
|---|---|
| `lineas`, `rotas` | las líneas con algo, y las que no se leen |
| `hilo`, `fueraDelHilo` | las del hilo, y las que quedaron fuera (lo que se dejó al rebobinar) |
| `laterales`, `repetidos` | las de los subagentes, y los uuid repetidos |
| `aMedias`, `empalmes` | si el hilo empieza a medias, y las compactaciones empalmadas |
| `meta`, `resumenes` | lo oculto o de nadie, y los resúmenes de compactación |
| `otros` | lo demás, por tipo (las líneas que no son mensajes, los adjuntos…) |
| `turnos`, `herramientas`, `sinResultado`, `imagenes` | lo que sale |

En memoria, contra una sesión real de 17 MB (3.636 líneas, 7 compactaciones),
no queda ninguna línea fuera del hilo, la única herramienta sin resultado es
la que seguía corriendo, y se importa en unos 0,1 s.

## Lo que no es

Ni el relevo (cómo viajan los sobres cifrados entre aparatos) ni ACP (cómo
hablan las ventanas con el núcleo): eso es la Fase 2. Esto es lo que viaja.

## Pruebas

Los ficheros `tests/sesion-*.test.ts`: el registro y su cadena, el estado, la
traza, el escritor en disco, compactar, bifurcar y reconciliar, el chat, la
escala, el importador de Claude Code y la terminal. Las reglas nuevas se prueban también con mutantes
(cambiar una regla a mano y comprobar que alguna prueba falla). Y la
conformidad (`npm run spec:lint`) comprueba que cada lista de la spec es la
del código.
