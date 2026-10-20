# Prueba 0 — el examen que regula todo

> Regla de oro del proyecto: **si el número no mejora, la mejora no entra.**

La Prueba 0 mide de forma justa si una capa de memoria mejora a la IA con las tareas
reales del usuario. Es la puerta de entrada de la plataforma: todo cambio de código,
todo módulo de tienda, toda decisión Laya y todo release se mide contra ella (o contra
un usuario real cuando la métrica no exista).

## Datos (todo local)

1. Transcripciones de los agentes del creador (`~/.claude/projects/**/*.jsonl`, y las de
   OpenCode/qwen-code en `~/.config/daimon-app/motores/*/projects/`).
2. Vault de Obsidian (`~/Documentos/Obsidian/`).
3. Documentación de `~/Sakoi` y `~/Ingresos`.
4. Investigación en `~/.local/share/sakoi-research/`.

## Filtros obligatorios (inviolables)

- **Redacción de secretos** (claves, tokens, `.env*`).
- **Exclusión total** de cualquier fragmento que mencione el proyecto de la empresa
  del creador o su ruta (se nombra en los documentos sin su nombre).
- Exclusión de datos de terceros.

## Qué mide

- **Preguntas reales:** las que el usuario hizo a las IAs; la respuesta correcta se
  propone desde lo que pasó después en esa misma sesión.
- **Preguntas generadas:** hechos, decisiones y su *por qué*, preferencias, multi-salto,
  temporales («¿qué decidimos antes/después de X?»), obsoletas («¿sigue vigente X?»).
- **Validación humana:** el creador valida el oro rápidamente.

## Estado y umbral de entrada

| Dato | Valor de referencia |
|---|---|
| Última medida (11-oct) | recall **0,77** con EmbeddingGemma-300M |
| Recall en producción | 160–290 ms, 0.929 con 917 tokens (vs BM25 0.900 con 1.495) |
| Pendiente | validación humana del oro + comparación punta a punta |

**Umbral para módulos de tienda:** aportar al menos **+0,01 recall** o **−10% tokens**
en su categoría, medido con el test del módulo contra la Prueba 0. Si no, no se publica.

## Cómo lo aplican los colaboradores

1. A conceptual contra: `pnpm prueba0` corre el banco local y te da tu número.
2. En un PR camino madre: `pnpm prueba0 --delta` pinta antes/después.
3. El módulo sube un `bench.json` a su `module.yaml` (`benchmarks:` campo opcional);
   el coche de la tienda comprobará y firmará su veredicto.

Fuentes completas de la Prueba 0 y Fase 1: `docs/superpowers/plans/` del repo vivo.
