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

## El banco real (en el kit, con los datos de este equipo)

El examen de muestra (el hallazgo del 12-oct) está en `core/bench/examen-real.ts`.
El banco de verdad se construye con lo que dice esta misma constitution:

```bash
npm run banco -- --construir   # sus preguntas (las transcripciones) + sus documentos (su Vault)
npm run banco -- --validar     # el humano elige el oro de cada caso: ESO es la validación humana
npm run banco -- --medir       # mide los dos mundos: el documento entero y el troceado por filas
```

- El **constructor no decide**: propone cinco candidatos por pregunta y la
  persona elige uno (o ninguno). El oro sin elegir no cuenta.
- El **oro se identifica por texto**, no por id de trozo: por eso el mismo caso
  vale para los dos mundos y la comparación es honesta.
- El banco es **privado**: vive en `~/.esme/prueba0-banco.json`, fuera del repo.
  Las preguntas del usuario y su Vault no van a un repositorio.
- La puerta (`tests/prueba0.test.ts`) mide contra el benchmark **commiteado**:
  si el número empeora, el cambio no entra.

## La prueba de REA: la mente con ojos, medida

La puerta `proc:spawn` le da a la mente la capacidad de mirar dentro de un programa. Eso es una mejora, y las mejoras se miden. El caso de REA en el banco
tiene su oro **mecánico** (es lo que el análisis produjo, no una suposición
de un humano), y su medición va de punta a punta:

```bash
npm run banco -- --rea /ruta/de/una/app.asar   # el caso entra en el banco
npm run prueba0:rea -- /ruta/de/una/app.asar    # la medición entera
```

Qué hace la medición, en orden:

1. REA mira el programa (**por la puerta**: si no está en el libro de los
   programas, no se lanza) y el kit convierte lo que vio en hechos;
2. la mente real se **copia** (la de la persona no se toca jamás), se le da
   lo que vio como un fichero, y la mente lo trocea y lo embebe;
3. se le pregunta a la mente de verdad qué vio;
4. el veredicto: ¿contestó lo que vio, o no?

Medido el 21-oct-2026 con el asar por defecto de Electron: 1.278 nodos →
47 hechos → **la mente recuerda lo que vio** (1.945 tokens, 1.212 ms).

Lo que se mide aquí es el **recuerdo** de lo aprendido. La calidad de la
evidencia se mide aparte (`tests/rea-real.test.ts`), y el contrato, en la
frontera (`tests/frontera-rea.test.ts`).

Fuentes completas de la Prueba 0 y Fase 1: `docs/superpowers/plans/` del repo vivo.
