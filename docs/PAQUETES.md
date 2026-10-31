# Los paquetes: una sola forma para todo lo que se instala

> Este documento explica qué es un paquete (el `module.yaml` v2), cómo una
> plantilla junta varios en una forma de trabajar, qué pide cada uno y dónde
> corre, y cómo se traen los de otros (plugins de Claude Code, skills,
> servidores MCP, recetas de goose) sin traer lo que nadie puede vigilar.
>
> Referencia: `estandar/paquete.spec.yaml` (la spec, que manda),
> `core/paquetes/`, `tienda/paquete-disco.ts`, `tienda/importa-*.ts`,
> `scripts/paquete.ts`.

## 0. La pregunta

Esme ya instalaba siete cosas, cada una con su lista y su forma: pieles de
casa y de la Tienda, productos, skills, herramientas MCP, tareas del Taller y
motores. Y fuera hay otras tantas: plugins y marketplaces de Claude Code,
skills sueltas, el registro MCP, recetas de goose. Cada forma nueva era un
camino más para instalar, con sus permisos aparte, y otra puerta por la que
algo podía entrar sin que nadie lo mirara.

Un **paquete** es la respuesta: una sola forma para todo lo instalable. El
núcleo de Esme se queda mínimo, y lo demás llega en paquetes.

## 1. Qué es un paquete: aporta, usa y pide

Un paquete es una carpeta con su `module.yaml` y los ficheros que nombra.
Dice tres cosas:

- qué **APORTA**: sus contribuciones, en doce puntos cerrados (§2);
- qué **USA**: otros paquetes, cada uno fijado por su huella (`uses`, §5);
- qué **PIDE**: sus permisos, con alcance (§3).

```yaml
schema_version: 2
id: "esme.ana.tarjetas"          # esme.<autor>.<nombre>
version: "0.4.1"                 # semver estricto
name: "Tarjetas"
kind: "package"                  # package | template
description: "Prepara tarjetas de estudio y te las pregunta."
author: "Ana"
license: "MIT"
contributes:
  tasks:
    - id: "tarjetas"
      title: "Prepara tarjetas"
      prompt: "Prepara diez tarjetas de {{tema}}."
      inputs: [{ key: "tema", description: "el tema", type: "text" }]
permissions:
  - kind: "net:fetch"
    hosts: ["ankiweb.net"]
```

Las claves van en inglés, como en la v1 (salvo las del `oficio` de una
plantilla, §5, que van como las nombró el diseño de la interfaz); los
mensajes, en castellano. La licencia es una de las que deja la spec (MIT,
Apache-2.0, ESME-CL, BSD-2-Clause, BSD-3-Clause, ISC o Unlicense).

**La v1 sigue valiendo tal cual.** `core/ipc/module-schema.ts` la lee como
siempre y, además, `deV1` la ve como un paquete de una sola contribución
(`category: tool` es una herramienta, `category: memory` va a la mente…):
quien lista, resuelve o enseña paquetes no tiene dos caminos. Lo que no vale
es un v2 a medias: `category`, `entry` o `runtime` arriba del todo en un v2
se rechazan, diciendo dónde va cada cosa ahora.

**Lo que no hay: hooks libres.** Un hook corre código en cada paso sin pasar
por los permisos. Lo que haría un hook lo hace una herramienta o una rutina,
que sí pasan por ellos.

## 2. Los doce puntos

Cada contribución va en su punto, y cada punto dice de qué está hecho y dónde
corre: en la **ventana** (la interfaz), en la **sesión** (cuando trabajas),
**siempre** (sin sesión: lo que corre solo) o en la **mente** (la memoria).

| Punto | Qué es | De qué está hecho | Dónde corre |
|---|---|---|---|
| `themes` | una piel (`piel.json`) | datos | ventana |
| `skills` | una skill: local (`path`, con su `SKILL.md`) o remota, fijada a su commit y su huella | datos | sesión |
| `tools` | código del paquete (`entry` con `runtime`) o un servidor MCP (`mcp`), nunca las dos | código | sesión |
| `views` | una vista propia, en su cápsula | código aislado | ventana |
| `agents` | un agente: receta del kit, `claude-md` o `comando` (una línea de comandos) | datos | sesión |
| `teams` | un equipo de agentes | datos | sesión |
| `tasks` | un encargo listo para lanzar, con sus `inputs` (`{{clave}}` en el prompt; con `type`, se piden con un formulario) | datos | sesión |
| `routines` | lo que corre solo, a su hora (`when`) | datos | siempre |
| `channels` | por dónde llega trabajo (una herramienta del paquete) | datos | siempre |
| `memory` | código de la mente | código | mente |
| `engines` | un motor (Claude Code, opencode…): sus binarios y cómo se entra | datos | sesión |
| `commands` | un atajo de la ventana que lanza una tarea del paquete | datos | ventana |

Lo que se nombra existe: `channels[].tool` es una herramienta del paquete y
`commands[].task`, una tarea suya. Un id no se repite dentro de su punto.

## 3. Lo que pide: permisos con alcance

La regla que lo sostiene todo: **lo que lanzas o con quien hablas, lo pides.**
Un servidor MCP remoto sin un `net:fetch` que cubra su host no entra; uno
local, un motor con binarios o un agente `comando` sin un `proc:spawn` que
cubra su programa, tampoco.

Un permiso tiene forma corta (la capacidad sola, sin límite) o larga (con su
límite):

| Capacidad | Límite | Ejemplo |
|---|---|---|
| `net:fetch` | `hosts` | `ankiweb.net`, `*.figma.com` (sus subdominios, no `figma.com`) o `*` (toda la red, y se avisa) |
| `proc:spawn` | `programs` | `npx`, `node`, `uvx`: por su nombre, nunca por su ruta |
| `fs:project` | `paths` | `notas/`, relativas al proyecto (sin `..` ni caracteres de control); `**` es todo |
| `mind:read`, `mind:write`, `ipc:emit`, `ui:render` | ninguno | siempre en su forma corta |

Los hosts se comparan por piezas, en minúsculas y sin el punto final, nunca
por texto: `*.figma.com` no cubre `evil-figma.com` ni
`mcp.figma.com.evil.net`. La spec trae la lista que la conformidad prueba.

Lo que se lanza va **por su nombre**: el `command` de un servidor MCP local
y el `comando` de un agente son `npx`, `node`, `uvx`…, y el anfitrión decide
dónde están. Una ruta no vale, tampoco una del propio paquete
(`${ESME_PAQUETE}/bin/npx`): lanzaría código del paquete con el permiso de un
programa del sistema. Y una URL (la de un servidor, `homepage`) no lleva
usuario ni contraseña: una credencial no viaja en el manifiesto.

## 4. Dónde tiene que correr: los niveles

El nivel de un paquete es el más alto de lo que trae:

| Nivel | Dónde | Qué lo pide |
|---|---|---|
| 0 | datos | pieles, tareas, recetas, rutinas, una skill sin scripts |
| 1 | WASM | código `runtime: wasm` |
| 2 | cápsula | JavaScript (`runtime: nodejs`) y las vistas, cada una en la suya |
| 3 | caja del sistema | un proceso: Python, un servidor MCP local, un motor con binarios, un agente `comando`, una skill con scripts |
| 4 | microVM | no lo pide un paquete: lo elige quien ejecuta (por ejemplo, en la nube) |

Una skill con `scripts: true` sube al 3: sus scripts son código, aunque la
skill sea un texto.

## 5. Plantillas, el resolver y el candado

Una **plantilla** (`kind: template`) es un paquete solo de datos que junta
otros paquetes y unos ajustes en una forma de trabajar lista para usar
(«Esme para estudiar»). No trae código (ni `tools`, ni `views`, ni `memory`):
si hace falta, va en un paquete, y la plantilla lo usa. Sus `settings` (el
rumbo, el presupuesto por día) son solo de las plantillas, y `success` dice
cómo se ve que funciona.

Cada `uses` lleva **id, rango y huella**: el `sha256` del árbol del paquete
(el mismo que firma un veredicto, `tienda/empaque.ts`). La huella elige; el
rango solo comprueba que la huella fijada es de una versión que se quería.

**El resolver** (`core/paquetes/resolver.ts`) recorre los `uses`:

- una versión por paquete: si dos piden el mismo paquete en dos versiones, o
  la misma versión con dos huellas, es un choque, con quién pidió cada una;
- el diamante vale: si B y C usan D con la misma huella, D va una vez, antes
  que los dos;
- un ciclo se dice con su camino (`A → B → A`);
- el resultado va en orden: primero las dependencias.

**El candado** (`core/paquetes/lock.ts`) guarda lo que se resolvió y lo que
la persona consintió: cada paquete con su versión, su huella y sus permisos.
Al volver a resolver se compara, y **se vuelve a pedir permiso** si hay:

- un paquete nuevo;
- una huella cambiada, aunque pida los mismos permisos: unos bytes nuevos
  con los permisos de antes es justo lo que haría una actualización
  envenenada;
- un permiso nuevo, mirado paquete a paquete: que otro ya hablara con un
  host no se lo da a uno que antes no lo pedía.

La plantilla es uno más: el candado guarda su huella y sus propios permisos,
y si cambian, se pregunta (una plantilla también trae skills, tareas y
agentes: lo que se le dice al modelo). Quitar un paquete no pide nada por sí
mismo, porque lo que se va ya no puede nada; pero la plantilla que lo quita
es otra, así que se pregunta una vez. Un candado roto, ajeno (de
otra plantilla) o que no está equivale a «nada consentido»: equivocarse aquí
es preguntar de más, nunca de menos. Se escribe siempre igual (paquetes por
id, dos espacios), para que un diff del candado diga solo lo que cambió.

### El oficio: lo que la plantilla monta al abrirla

Una plantilla puede decir cómo se ve al abrirla: su `oficio`. Es solo de
las plantillas (un paquete aporta piezas; la plantilla dice cómo se
montan), y sus claves van en castellano, como las nombró el diseño de la
interfaz.

```yaml
oficio:
  piel: "esme.casa.piel-estudio/estudio"   # un tema suyo, o <paquete de uses>/<tema>
  secciones:
    - { id: "hoy", nombre: "Hoy" }         # la primera, siempre, y tal cual
    - { id: "repasos", nombre: "Repasos", vista: "esme.tareas", filtro: "etiqueta:repaso" }
    - { id: "pendiente", nombre: "Te necesita", vista: "esme.hoy", filtro: "estado:te-necesita" }
    - { id: "apuntes", nombre: "Apuntes", vista: "esme.memoria" }
  ordenes: ["tarjetas", "esme.ana.tarjetas/repasar"]
```

Es cerrado a propósito: lo que monta lo pinta una app que no escribió quien
hizo la plantilla, y abrir más tarde no rompe ninguna plantilla; cerrar, sí.

- **Topes:** hasta 12 secciones y 40 órdenes; un id, un nombre, una
  etiqueta o una option, hasta 32 caracteres.
- **Secciones:** la primera es `hoy`, sin vista ni filtro (es tu día
  entero). Las demás llevan una vista de la lista: `esme.hoy`,
  `esme.tareas`, `esme.memoria`, `esme.terminal` o `esme.mesa`; la app que
  aún no tenga la que se nombra enseña `esme.tareas`. Los ids van en
  kebab-case y no se repiten; los nombres, sin espacios a los lados ni nada
  invisible.
- **Filtros:** `estado:` con `te-necesita`, `en-marcha`, `terminado` o
  `quieto`, o `etiqueta:` con una en kebab-case; y solo en una vista que
  lista tareas (`esme.hoy` o `esme.tareas`). Nada de expresiones: ni `&&`,
  ni `||`, ni otras claves.
- **Órdenes:** un comando de la plantilla, o de un paquete que usa
  (`<paquete>/<comando>`), y su tarea se lanza con un formulario: cada
  campo dice su `type` (`text`, `number` o `choice`, este con sus
  `options`) y su `description`, que es su etiqueta; se rellena (nada de
  `required: false`); su clave va en kebab-case y sale en el prompt, o en
  sus pasos, como `{{clave}}`; y el prompt no tiene huecos que no sean
  campos. Como mucho 10 campos.
- **Dentro del oficio, una clave de más no se ignora:** se rechaza, y se
  dice cuál. Fuera (arriba del todo, en una entrada) se sigue avisando.

Lo que el oficio nombra de la propia plantilla se mira al leerla; lo que
nombra de un paquete (su tema, su comando y los campos de su tarea), al
resolver, con ese paquete delante, fijado por su huella.

Un campo con tipo vale en cualquier tarea, no solo en las órdenes: su
`default`, si lo lleva, es de su tipo (un número como `7`, `-2` o `2.5`; en
un `choice`, una de sus `options`).

## 6. Lo de casa, como paquetes: los adaptadores

Las siete listas de la app (pieles de casa y de la Tienda, productos,
skills, herramientas destacadas, tareas del Taller y motores ACP, con el
espejo del registro) salen como paquetes, un paquete por elemento y sin
cambiar ni un byte de la app (`core/paquetes/adaptadores/`). Lo que no se
puede adaptar va a `fuera`, con su motivo; nunca se pierde en silencio.

Las listas se copian de un commit de la app con
`npm run paquetes:fixtures -- <carpeta app/>`, que no copia nada si las
fuentes tienen cambios sin commitear.

## 7. Lo de otros: los importadores, y lo que se queda fuera

`tienda/importa-*.ts` traen como paquetes:

| De | Qué sale |
|---|---|
| una **skill** suelta (carpeta con `SKILL.md`) | un paquete con una skill en `.` |
| un **plugin de Claude Code** | sus skills, sus comandos (como tareas y atajos), sus agentes (`claude-md`), sus servidores MCP (`.mcp.json` y `mcpServers`) y sus canales |
| un **marketplace** de Claude Code | un paquete por plugin local; los remotos quedan pendientes, con cómo se traerán |
| un **`server.json`** del registro MCP | un paquete con una herramienta: el puntero al servidor |
| una **receta de goose** | una tarea (con sus `inputs`) y sus extensiones como herramientas |

Tres reglas:

1. **Lo escrito manda.** El autor, la licencia y la versión salen del
   original; `--autor` y `--licencia` solo rellenan lo que no dice. Una
   licencia que un paquete no puede llevar (GPL, una cerrada, una abierta
   con una cláusula que la cierra, como la Commons Clause, «solo no
   comercial», «solo uso personal» o «no para ganar dinero») es un error,
   no un aviso, aunque digas otra. Esas cláusulas se buscan por sus frases
   de siempre: una escrita de otra forma pasa, y «para uso comercial o no
   comercial» (lo que dice el Unlicense) no cierra nada. Si el original
   dice una y su LICENSE es de esas, no se adivina cuál vale: error. Si su
   LICENSE no se reconoce, se avisa. En un marketplace, el autor y la
   licencia son los del `plugin.json` (la entrada solo los rellena): si la
   entrada dice otra licencia, error. Un correo nunca es un autor.
2. **Nada se pierde en silencio.** Lo que no viaja se descarta con su
   motivo, y lo que cambia por el camino se avisa.
3. **Los valores no viajan.** De las variables de entorno y las cabeceras
   viaja el nombre, nunca el valor: los pone quien instala. Un servidor con
   una credencial escrita en su URL (un usuario, `?api_key=…`) o en sus
   argumentos (`--token x`, `GITHUB_TOKEN=x`, algo con forma de token) se
   descarta, sin decir el valor. Y los ficheros que suelen guardar secretos
   (`.env`, `.envrc`, `.npmrc`, `.netrc`, `.pgpass`, claves `id_*`, `*.key`,
   `*.pem`, `credentials*`, `secrets*`, las carpetas `.aws/`, `.ssh/` y
   `.gnupg/`…) no viajan nunca; los de ejemplo (`.env.example`,
   `secrets.example.yaml`) sí. Tampoco la configuración de Claude Code
   (`.claude/settings*.json`) ni un `.mcp.json` que no se convierte.

Lo que se descarta, y por qué:

| Qué | Por qué |
|---|---|
| hooks (de un plugin, de una skill o de un agente) | corren código en cada paso sin pasar por los permisos. Si una cabecera los lleva de una forma que no se sabe quitar (con `<<`, `? hooks`…), la skill o el agente no viaja; y al leer un paquete de disco, una skill o un agente con hooks no vale |
| `bin/` de un plugin | pone programas en el PATH sin pedir permiso |
| `monitors` | un proceso que corre siempre: en Esme es una rutina, con permisos |
| `userConfig`, `${user_config.*}` | llega con las llaves de Esme, en la Fase 2 |
| `dependencies` de un plugin | no traen huella: se instalan aparte y se fijan al resolver |
| servidores LSP, estilos de salida, temas, workflows y `settings` de Claude Code | aún no tienen punto en Esme |
| `allowed-tools`, `permissionMode` | dan permisos sin pasar por los del paquete (se quitan y se avisa) |
| un servidor `.mcpb` o `.dxt` | aún no se abre: en la Fase 2 |
| un servidor que se lanza por una ruta del paquete o relativa | un programa va por su nombre; lo que trae el paquete va en los argumentos (una ruta absoluta del sistema va por su nombre, con aviso) |
| una skill que el plugin no carga, o con una licencia que no se puede llevar | no viaja |
| un enlace simbólico, `node_modules/` | se copia el fichero de verdad; las dependencias se instalan donde corre |
| en goose: extensiones `builtin`/`platform`, `frontend`, `inline_python`, `settings`, `activities`, `sub_recipes`, los `checks` y `on_failure` de `retry` | son de goose por dentro, o son código de shell, o no traen huella |
| del registro MCP: las otras formas de llegar al mismo servidor | se elige una (remoto streamable-http, SSE, npm o PyPI, por ese orden). Un paquete de npm o PyPI cuyo nombre no es un nombre (o cuya versión empieza por «-») no se lanza |

Lo que cambia por el camino:

- **`${ESME_PAQUETE}` y `${ESME_DATOS}`**: `${CLAUDE_PLUGIN_ROOT}`,
  `${CLAUDE_SKILL_DIR}` y `${CLAUDE_PLUGIN_DATA}` pasan a ser las de Esme,
  en el comando y los argumentos de un servidor y también en lo que lee el
  modelo (el `SKILL.md`, la receta de un agente, el prompt de una tarea).
  Así un plugin importado sigue encontrando sus ficheros.
- **Los argumentos de un comando** pasan a entradas de la tarea:
  `$ARGUMENTS` es `{{argumentos}}`, `$0` y `$ARGUMENTS[0]` son
  `{{argumento-1}}`, y un argumento con nombre (`$tema`) es `{{tema}}`.
- **Las órdenes que Claude Code corre al leer** (`` !`…` ``) se quedan como
  texto: en una tarea de Esme no se ejecutan, y se avisa. En una skill,
  marcan `scripts: true`. Y si el plugin trae código en cualquier sitio,
  todas sus skills llevan `scripts: true`: una skill puede correr cualquier
  fichero del paquete.
- **Un `server.json` del registro** es el puntero al servidor: su autor es
  el espacio de quien lo publica (`io.github.ana`), y va con licencia MIT;
  el servidor sigue con la suya. El espacio `mcp` no vale: es el de las
  herramientas de Esme.
- **Los args de goose** que son un número o un sí/no van como texto (`8080`,
  `true`); otra cosa descarta la extensión, con su motivo.
- Un `npx` o un `uvx` sin versión fija se avisa: bajaría la última cada vez.

## 8. La orden: `npm run paquete`

```
npm run paquete -- <carpeta>
npm run paquete -- importar <skill|claude|marketplace|mcp|goose> <ruta> [--salida <carpeta>] [--autor <nombre>] [--licencia <spdx>]
npm run paquete -- resolver <plantilla> --en <carpeta de paquetes> [--lock <ruta>] [--aceptar]
```

**`<carpeta>`** dice qué aporta (punto, id y dónde corre), qué usa, qué pide
y su nivel. Es el dictamen antes de construir: el código que aún no está se
avisa (sin él no se instala), y el que ya está no puede salirse del paquete,
ni por un enlace.

```
esme.nucleo.hola-mundo 0.1.0 · Hola Mundo · paquete (module.yaml v1)
  Saluda al usuario y demuestra el ciclo completo recall-inject de la mente.
Qué aporta:
  tools · hola-mundo · código, corre en la sesión · nodejs: dist/index.js
Qué pide:
  mind:read
  mind:write
  ui:render
Aislamiento: nivel 2 (cápsula)
```

**`importar`** enseña lo que saldría, lo que se descarta y los avisos. Sin
`--salida` no escribe nada. Con `--salida`, la carpeta tiene que ser nueva o
estar vacía (lo que sobrara entraría en la huella del paquete), y lo escrito
se relee de disco antes de darlo por bueno. Un marketplace escribe cada
plugin en `<salida>/<su id>`.

**`resolver`** resuelve la plantilla con los paquetes de `--en` (uno por
subcarpeta), dice cuántos son, qué piden entre todos, hasta qué nivel hace
falta y qué es nuevo desde el candado. **El candado solo se escribe con
`--aceptar`**, que es el sí de la persona. Va, si no se dice otro sitio, al
lado de la plantilla (`<plantilla>.lock.json`): dentro cambiaría la huella
de su árbol.

Códigos: 0 bien; 1 no vale o no se pudo; 2 mal dicho (y el uso).

## 9. Lo que no entra en la Fase 1

- **Instalar de verdad.** La app todavía instala con sus siete listas; esta
  fase es el contrato, sus pruebas y la orden. No se toca la app.
- **Las llaves:** `userConfig`, los valores de las variables y de las
  cabeceras, las variables en la URL de un servidor remoto y los argumentos
  que pone quien instala. Llegan con las llaves de Esme, en la Fase 2.
- **Traer de fuera:** las fuentes remotas de un marketplace (GitHub, git,
  npm, un archivo) y los servidores `.mcpb` se traen al instalar, fijados por
  su commit o su huella, no al importar.
- **Publicar paquetes v2 en la Tienda**, con su índice firmado: hoy firma y
  publica la v1.
- **Los puntos que aún no existen:** servidores LSP, estilos de salida,
  temas y workflows de Claude Code.
- **Las vistas de un paquete en el oficio** (`<paquete>/<vista>`): hoy solo
  valen las de la lista. Se abrirá cuando la app enseñe las vistas de un
  paquete en su cápsula.
- **Los tipos al importar:** los importadores aún no ponen `type` a los
  campos (de una receta de goose con `input_type: select`, el campo sale
  sin tipo, con sus opciones en la descripción): para lanzarla como orden, la
  plantilla la envuelve en una tarea suya con sus campos con tipo.
- **Las sesiones en el móvil y en la nube**, que el diseño aprobado pone
  junto a los paquetes: van en su propio trabajo.

Y lo que no entrará en ninguna: hooks libres.
