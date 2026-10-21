# LOS MOTORES — la misma mente, muchos cerebros

> La mente es una sola. El cerebro que habla con ella cambia: claude-code,
> opencode, codex, gemini, el shell, ollama o el local. Eso es lo que hace que
> Esme no sea un producto: es una plataforma donde la mente sobrevive al
> motor.

## Las dos cosas que se confunden

| | Qué es | Dónde vive |
|---|---|---|
| **El motor** | el cerebro que habla con la mente (un LLM, o el shell) | fuera de la casa, o dentro (el local) |
| **El módulo** | una herramienta que vive en la casa de la persona | el extension host (`core/extension-host/`) |

Por eso la compatibilidad se pregunta al revés de lo que parece: no «qué
módulos sabe usar este motor», sino **«qué motores pueden alojar este
módulo»**.

## Lo que declara un motor

Todo está en [`estandar/motor-capability.spec.yaml`](../estandar/motor-capability.spec.yaml):
un motor = un documento. Y lo que declara lleva la fuente de donde sale
(`source`) y la fecha en que se miró (`verificado_en`): un número sin fuente
es una opinión, y aquí las opiniones se escriben en otro sitio.

| Campo | Qué dice |
|---|---|
| `runtimes` | qué runtime puede alojar (`nodejs`, `wasm`, `python`) |
| `tools` | si el motor ve herramientas (eventos, vistas) |
| `net` | si el motor llega a la red |
| `max_context` | la ventana de contexto que declara |
| `local_only` | si nada sale de la casa |
| `pricing` | `api` \| `local` \| `gratuito` |
| `cancel_support` | si se puede parar la ejecución |
| `adapter` | el fichero que sabe cómo se habla con él |

El `adapter` tiene que EXISTIR: el lint de specs lo comprueba. Un puntero a
un fichero fantasma es un motor que nadie sabe usar (y la spec señalaba a uno:
`motores/acp-motores.ts` no estaba escrito; ahora sí).

## Las reglas del alojo

`npm run compat -- <módulo>` cruza el manifiesto con la spec y dice, motor por
motor, si puede alojarlo **y por qué**:

1. **runtime** — el motor tiene que poder alojar el runtime del módulo.
   Un módulo `nodejs` no lo aloja un motor que sólo habla `wasm`.
2. **herramientas** — un módulo que emite eventos (`ipc:emit`) o pinta vistas
   (`ui:render`) necesita un motor con `tools: true`.
3. **red** — un módulo que pide `net:fetch` necesita un motor con `net: true`.
4. **procesos** — un módulo que pide `proc:spawn` también necesita `tools: true`:
   sus efectos quedan **fuera de la cápsula**, y si el motor no ve
   herramientas, lo que el módulo hizo en la máquina no lo ve nadie. El módulo
   trabaja a ciegas.
5. **declaración** — si el módulo declara con qué motores trabaja
   (`engines:` en su manifiesto), esa declaración manda sobre las cuatro
   anteriores.

Cada «no» lleva su motivo: una puerta cerrada sin llave no se puede
arreglar.

```bash
$ npm run compat -- modulos/ejemplo-hola-mundo --presencia
módulo : esme.nucleo.hola-mundo
  ✓ claude-code  — puede alojarlo (runtime nodejs)
  ✓ opencode     (instalado) — puede alojarlo (runtime nodejs)
  ✗ ollama       (instalado) — ollama no aloja ningún módulo (runtime nodejs)
  ✗ local        (instalado) — local no aloja runtime nodejs (aloja: python, wasm)
pueden : claude-code, opencode, codex, gemini, shell
```

`--presencia` añade si el binario del motor está en esta máquina. Ojo:
**instalado no es funcionando** — puede faltar la llave, el modelo o la red.

## Los motores, de uno en uno

| Motor | Qué es | Runtimes | Red | Notas |
|---|---|---|---|---|
| `claude-code` | el CLI de Anthropic | nodejs, wasm, python | sí | API |
| `opencode` | el CLI de opencode | nodejs, wasm, python | sí | el que se instala por defecto |
| `codex` | el CLI de OpenAI | nodejs, wasm, python | sí | API |
| `gemini` | el CLI de Google | nodejs, wasm, python | sí | API |
| `shell` | el terminal, sin modelo | nodejs, wasm, python | no | el motor sin cerebro: para lo mecánico |
| `ollama` | modelos locales | — | no | aloja herramientas, no módulos |
| `local` | el cerebro de la casa | python, wasm | no | el que no sale de la máquina |

### El shell, sin modelo

El shell es un motor sin modelo: no guarda contexto (`max_context: 0`) y no
piensa. Es el motor de lo mecánico — compilar, buscar, mover ficheros — donde
un modelo grande sería un peaje sin sentido.

### El local, sin modelo tampoco pero con memoria

El `local` es el cerebro que vive dentro (llamacpp / ONNX): aloja `python` y
`wasm`, no ve herramientas y no sale de la casa. Es el motor de la regla de
oro — «la mente es local» — y por eso es el que el router elige primero
cuando puede.

## El router

El orden de preferencia lo decide `ordenPreferencia`
(`motores/laya-adapter.ts`): **primero lo gratis, luego lo local, luego la
API**. Y Laya (el clasificador System One, gratis y local) es quien elige el
motor de cada paso, sin gastar un token de modelo grande
([`docs/LAYA.md`](LAYA.md)).

## Referencia

| Qué | Dónde |
|---|---|
| La spec (los motores) | `estandar/motor-capability.spec.yaml` |
| El cargador y el router | `motores/laya-adapter.ts` |
| Cómo se habla con cada motor | `motores/acp-motores.ts` |
| Las reglas del alojo | `motores/compat.ts` |
| El compat-check | `scripts/estandar/compat-check.ts` |
| El lint que lo vigila | `scripts/spec-lint.ts` |
