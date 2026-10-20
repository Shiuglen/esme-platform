# Esme — el runtime de la mente local

> **La era abierta:** la mente no vive en ninguna nube. Vive en tu PC. Y ahora cualquiera
> — humano o IA — puede construir encima.

Esme es un **sistema cognitivo con red neuronal propia** que envuelve a *cualquier* IA
(Claude, GPT, Gemini, DeepSeek, Qwen local…) y la hace más lista con el conocimiento de
tu mente: memoria que crece y se puede borrar de verdad, atención aprendida, y saber
cuándo duda y cuándo verificar.

## Las reglas de la era (no se negocias)

1. **La mente es local.** Recall en 160–290 ms, en el proceso del cerebro, sin nube.
   El servidor solo hace sync criptográfico. **Nunca inferencia.**
2. **La regla de oro:** toda mejora se mide contra la [Prueba 0](docs/PRUEBA-0.md)
   (el examen de «me conoce») o contra usuarios reales. Si el número no mejora, no entra.
3. **No hay dos iguales:** la identidad visual es **Tinta y Luz**, protegida por tokens
   inmutables. Los módulos no pueden romperla (ver [gobernanza](docs/ARQUITECTURA.md)).
4. **Todo se puede tocar:** open core MIT + tienda abierta + specs públicas en `estandar/`.

## Mapa del repo

| Ruta | Qué hay |
|---|---|
| `docs/ARQUITECTURA.md` | **Las 14 decisiones** de la plataforma. Léelo primero. |
| `docs/ESME.md` | Fuente de verdad del producto (cada paso se registra). |
| `docs/COLABORADOR-KIT/` | Tu kit de entrada: mapa, primer PR en 10 min, runbook, ADRs. |
| `docs/LAYA.md` | El motor de decisiones locales del núcleo. |
| `docs/TIENDA.md` | La tienda: manifiesto → scan → firma → índice. |
| `docs/PRUEBA-0.md` | El examen que regula todo. |
| `estandar/` | Las 3 specs abiertas de la era (manifiesto, mente `.mind`, motores). |
| `modulos/` | Módulos de la comunidad. `ejemplo-hola-mundo` es el ejemplo vivo. |
| `tienda/` | Índice público firmado. |
| `core/`, `motores/`, `apps/desktop/` | El runtime (ver ARQUITECTURA §1 para la frontera MIT/comunitaria). |

## Colaborar

Clona → lee `docs/COLABORADOR-KIT/PRIMER-PR.md` → tu primer módulo en 10 minutos:

```bash
pnpm create:modulo mi-modulo   # scaffoldea module.yaml + src + test
pnpm spec:lint                 # valida contra las specs de estandar/
pnpm test:offline              # la garantía: funciona sin red
```

Todo el resto del detalle, en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).
