# Laya — el motor de decisiones locales del núcleo

> Clasificación local y gratuita (~150–250 ms, sin API, sin tokens de modelo grande).
> Referencia: `docs/ARQUITECTURA.md` §5.

Laya es un clasificador *System One*: convierte estado (tarea, contexto) en decisiones
tipadas (`choice`, `score`, `noul`) sin gastar un solo token de un modelo grande.
En Esme es la capa de decisión rápida del núcleo y un contrato disponible para módulos.

## Dónde SÍ encaja

| Componente | Ruta | Qué decide |
|---|---|---|
| Router de motores | `motores/laya-adapter.ts` | ¿qué motor responde esta tarea? (claude-code, opencode, codex, gemini, shell, ollama, local) |
| Tálamo | `core/talamus/laya-router.ts` | ¿qué memoria entra al paquete de contexto? (relevant / marginal / noise) |
| Sandbox de módulos | `core/extension-host/permissions.ts` | ¿este módulo merece el permiso X? (opinión ponderada, no sentencia legal) |
| Niveles del taller | `app/src/main/router/niveles.ts` | ¿qué presupuesto merece la tarea? (paso 1: el router actual da los niveles) |

## Dónde NO (prohibido)

- **Identidad visual (Tinta y Luz).** Laya no diseña. Un clasificador heurístico no
  puede sostener la coherencia narrativa de la era visual. La estética vive en
  `estandar/design-tokens.spec.json` y se gobierna con el style guide.
- **Ejecución de código** — solo decide, solo opina; ejecutarse es de la sandbox.
- **Estado persistente o aprendizaje en runtime** — Laya no entrenar en caliente.
- **Preferencias de usuario** — eso lo decide el humano en la UI, siempre.

## Contrato

```ts
// motores/laya-adapter.ts
export interface LayaDecision {
  route: "claude-code" | "opencode" | "codex" | "gemini" | "shell" | "ollama" | "local";
  confidence: number;        // 0–1
  reasoning: string;         // trazabilidad obligatoria en revisión de PR
  fallback?: LayaDecision;   // obligatoria si confidence < 0.6
}
```

## Reglas para módulos de tienda

- Un módulo puede consultar decisiones vía IPC, pero **no puede entrenar ni persistir**
  nada de Laya (el sandbox lo bloquea).
- `decision_criteria` en `module.yaml` es declarativa: pesos entre 0 y 1, y `when`
  una etiqueta semántica; CI `spec-lint` la valida.
- Acuerdo con el Tálamo humano: el bench del módulo mide concordancia objetivo
  ≈ 0,7 con las decisiones del creador antes de publicarse.

Cada decisión en runtime se anota en un registro anonimizado (`laya.jsonl`, 120 días)
para medir calidad del enrutamiento sin guardar datos personales.

## El paladar: la memoria que sale de las catas

El router tiene **tres** memorias, y van en este orden (de la persona hacia
abajo):

| # | Memoria | Qué es | Dónde |
|---|---|---|---|
| 1 | **la persona** | su veredicto sobre *esta* tarea exacta | `Aprendido.tabla` |
| 2 | **el paladar** | lo que ganó las catas a ciegas de *esa categoría* | `Aprendido.paladar` |
| 3 | **el router** | lo que supone Laya, cuando no hay nada aprendido | `motores/laya-adapter.ts` |

El paladar es una memoria más burda que la tabla (no sabe de una tarea
concreta, sino de una categoría: «para pruebas, tu cata dice Qwen»), pero con
más cata detrás: son muchas carreras medidas, no una frase suelta. Y sólo
entra si la cata fue **limpia** (el compromiso verificó) y hubo catas de
suficia (3 por motor): una impresión no es un paladar, y un paladar con miedo
no sirve de nada.

```bash
$ npm run router -- laya.jsonl --arenas catas.jsonl --tarea "arregla el test que falla"
paladar     : 1 categorías con cata de sobra
  pruebas → esme.nucleo.troceo-pro (2/3 catas)

para «arregla el test que falla» (pruebas): esme.nucleo.troceo-pro — de paladar
```

Referencia: `core/arena/paladar.ts`, `core/arena/arena.ts`, [`docs/ARENA.md`](ARENA.md).
