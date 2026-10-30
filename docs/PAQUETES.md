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
      inputs: [{ key: "tema", required: true }]
permissions:
  - kind: "net:fetch"
    hosts: ["ankiweb.net"]
```

Las claves van en inglés, como en la v1; los mensajes, en castellano. La
licencia es una de las que deja la spec (MIT, Apache-2.0, ESME-CL,
BSD-2-Clause, BSD-3-Clause, ISC o Unlicense).

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
| `tasks` | un encargo listo para lanzar, con sus `inputs` (`{{clave}}` en el prompt) | datos | sesión |
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
| `fs:project` | `paths` | `notas/`, relativas al proyecto; `**` es todo |
| `mind:read`, `mind:write`, `ipc:emit`, `ui:render` | ninguno | siempre en su forma corta |

Los hosts se comparan por piezas, en minúsculas y sin el punto final, nunca
por texto: `*.figma.com` no cubre `evil-figma.com` ni
`mcp.figma.com.evil.net`. La spec trae la lista que la conformidad prueba.

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

Quitar no lo pide: lo que se va ya no puede nada. Un candado roto, ajeno (de
otra plantilla) o que no está equivale a «nada consentido»: equivocarse aquí
es preguntar de más, nunca de menos. Se escribe siempre igual (paquetes por
id, dos espacios), para que un diff del candado diga solo lo que cambió.

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
   licencia que un paquete no puede llevar (GPL, una cerrada…) es un error,
   no un aviso, aunque digas otra; y si el original dice una y su LICENSE es
   de esas, no se adivina cuál vale: error. Un correo nunca es un autor.
2. **Nada se pierde en silencio.** Lo que no viaja se descarta con su
   motivo, y lo que cambia por el camino se avisa.
3. **Los valores no viajan.** De las variables de entorno y las cabeceras
   viaja el nombre, nunca el valor: los pone quien instala. Y los ficheros
   que suelen guardar secretos (`.env`, `.npmrc`, `.netrc`, claves `id_*`,
   `*.key`…) no viajan nunca; `.env.example` sí.

Lo que se descarta, y por qué:

| Qué | Por qué |
|---|---|
| hooks (de un plugin, de una skill o de un agente) | corren código en cada paso sin pasar por los permisos |
| `bin/` de un plugin | pone programas en el PATH sin pedir permiso |
| `monitors` | un proceso que corre siempre: en Esme es una rutina, con permisos |
| `userConfig`, `${user_config.*}` | llega con las llaves de Esme, en la Fase 2 |
| `dependencies` de un plugin | no traen huella: se instalan aparte y se fijan al resolver |
| servidores LSP, estilos de salida, temas, workflows y `settings` de Claude Code | aún no tienen punto en Esme |
| `allowed-tools`, `permissionMode` | dan permisos sin pasar por los del paquete (se quitan y se avisa) |
| un servidor `.mcpb` o `.dxt` | aún no se abre: en la Fase 2 |
| una skill que el plugin no carga, o con una licencia que no se puede llevar | no viaja |
| un enlace simbólico, `node_modules/` | se copia el fichero de verdad; las dependencias se instalan donde corre |
| en goose: extensiones `builtin`/`platform`, `frontend`, `inline_python`, `settings`, `activities`, `sub_recipes`, los `checks` y `on_failure` de `retry` | son de goose por dentro, o son código de shell, o no traen huella |
| del registro MCP: las otras formas de llegar al mismo servidor | se elige una (remoto streamable-http, SSE, npm o PyPI, por ese orden) |

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
  marcan `scripts: true`.
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
- **Las sesiones en el móvil y en la nube**, que el diseño aprobado pone
  junto a los paquetes: van en su propio trabajo.

Y lo que no entrará en ninguna: hooks libres.
