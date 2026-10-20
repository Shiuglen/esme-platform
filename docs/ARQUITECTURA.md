# ESPECIFICACIÓN DE ARQUITECTURA ESME/DAIMON
## 15 decisiones para el runtime de la mente local

> **Dónde estás:** este repo es la **mitad MIT** de Esme — los contratos, los
> formatos, las firmas, la Tienda y el extension host. La ventana
> (`apps/desktop/`), el Taller y el cerebro en Python viven en el repo de la
> app; las dos mitades se hablan por `estandar/cerebro-frontera.spec.yaml`.
> Cuando una decisión habla de `apps/desktop/` o de `pnpm dev`, habla del
> conjunto: aquí los comandos son `npm run …` (ver
> `docs/COLABORADOR-KIT/RUNBOOK-DEV.md`).

---

### 1. Open Core — Frontera MIT vs Licencia Comunitaria

**Decisión:** Core = MIT. Todo lo que corre en el proceso del cerebro (`core/`, `motores/`, `modulos/nucleo/`, `estandar/`) es MIT. Fuera del core: `apps/desktop/`, `tienda/`, cualquier servicio hosted, adaptadores propietarios, UI de marca → licencia comunitaria (ESME-CL v1.0: source-available, no-compete para hosted SaaS, permite forks locales y módulos).

**Ruta exacta:** `LICENSE` (MIT), `LICENSE-COMMUNITY.md` (ESME-CL), `core/licensing.ts` (guarda runtime check).

**Component shape:**
```ts
// core/licensing.ts
export enum LicenseTier { Core = "MIT", Community = "ESME-CL", ThirdParty = "VARIES" }
export function assertCoreOnly(feature: string): void { /* throw si feature ∉ core */ }
```

**Por qué:** El foso es la localidad de la mente (ONNX en proceso, 0 red para inferencia). Si el core es MIT, cualquiera puede integrar Esme en su stack sin pedir permiso. La capa comunitaria protege la identidad visual (Tinta y Luz) y evita que un hosted service capture el valor del ecosistema sin contribuir de vuelta. Apps de terceros (`apps/desktop/` forks) y servicios hosted quedan fuera — si quieren usar la marca, firman ESME-CL.

---

### 2. Extension Host — Proceso Separado, V8 Isolate + WASM

**Decisión:** Plugins corren en **child process** (Node `worker_threads` con `isolated-vm`) + **WASM** para código de confianza parcial. `vm2` está descartado explícitamente: abandonado y con fugas de sandbox conocidas. Sandbox por defecto: `deny-all` capability list. Permisos: `mind:read`, `mind:write`, `ipc:emit`, `fs:project`, `net:fetch`, `ui:render`. Cada permiso pide consentimiento interactivo la primera vez (modal Tinta y Luz). Plugins hablan con la mente vía **IPC tipado** (MessagePort + schema Zod), no RPC.

**Ruta exacta:** `core/extension-host/host.ts`, `core/extension-host/permissions.ts`, `core/ipc/mind-schema.ts` (el contrato), `core/ipc/sdk.ts` (lo que ve el módulo).

**La puerta hacia dentro:** el módulo **pide**, no recibe. El host le pone `globalThis.mente` al arrancar su worker, y eso no es la mente: es una llamada que cruza la puerta y vuelve con la respuesta (o con el fallo). El host decide: permiso declarado (`mind:read` / `mind:write`), forma verificada con zod, y la mente se queda en su proceso. Un módulo que no tiene a quién preguntar lo sabe (`mente()` lo dice) en vez de fingir que preguntó.

```ts
// lo que ve el módulo (core/ipc/sdk.ts)
import { mente } from "esme-platform/sdk";   // en el kit: core/ipc/sdk.ts
const r = await mente().rumbo();     // para qué trabaja esta mente
```

**Component shape:**
```ts
// core/ipc/mind-schema.ts
export const MindMethods = {
  inject: z.object({ vectors: z.array(z.number()), metadata: z.record(z.unknown()) }),
  recall: z.object({ query: z.string(), budget: z.number().default(1500) }),
  remember: z.object({ text: z.string(), kind: z.enum(["note","decision","preference"]).default("note") }),
  intake: z.object({ source: z.string(), content: z.string(), tags: z.array(z.string()) }),
  rumbo: z.object({})    // para qué trabaja la mente: se LEE. Escribirlo es cosa de la persona
} as const;
```

**Por qué:** Child process aísla crashes y memoria. WASM permite módulos Rust/Go/C++ compilados por la comunidad sin Node. MessagePort evita serialización JSON en hot path (recall 160-290 ms). El core nunca se bloquea: `host.call()` retorna Promise, Tálamo sigue procesando.

---

### 3. Manifiesto de Módulo — Formato Exacto (YAML)

**Decisión:** `module.yaml` en raíz del módulo. Campos obligatorios + opcionales. Categoría en tienda = `category` enum. Permisos = capabilities declarativas. Laya se usa **solo** para `decision_criteria` (routing de sugerencias, no ejecución).

**Ruta exacta:** `estandar/module-manifest.spec.yaml`, `modulos/nucleo/manifest-validator.ts`, ejemplo en `modulos/ejemplo-hola-mundo/module.yaml`.

**Ejemplo completo:**
```yaml
# modulos/ejemplo-hola-mundo/module.yaml
schema_version: 1
id: "esme.nucleo.hola-mundo"
name: "Hola Mundo"
version: "0.1.0"
category: "tool"  # tool | agent | theme | memory | integration | thinking
description: "Saluda al usuario y demuestra recall/inject"
author: "usuario@ejemplo.com"
license: "MIT"
entry: "dist/index.js"          # o "dist/index.wasm" para WASM
runtime: "nodejs"               # nodejs | wasm | python
permissions:
  - mind:read
  - mind:write
  - ui:render
decision_criteria:              # Laya evalúa esto para routing
  - when: "user_greeting"
    weight: 0.9
    tags: ["saludo", "onboarding"]
  - when: "test_recall"
    weight: 0.6
    tags: ["debug", "memory"]
dependencies:
  - "esme.core@^1.0"
  - "esme.ui@^1.0"
signatures:
  minisign: "RWQ...base64..."
  signed_by: "usuario@ejemplo.com"
  signed_at: "2026-10-19T12:00:00Z"
```

**Validador:** `modulos/nucleo/manifest-validator.ts` usa Zod + minisign verify. Rechaza si `category` no está en enum, si `permissions` pide `net:*` sin `net:fetch` explícito, si `entry` no existe tras build.

---

### 4. Tienda — Git + Minisign + Index Firmado

**Decisión:** Tienda = repo Git público (`tienda/`) + `index.json` firmado con minisign/ed25519. Flujo: `build → scan → sign → publish`. **Safe-by-default:** módulo se instala **solo** si `module.yaml` pasa validador + firma verificada + hash coincide. Revisión comunitaria = PR a `tienda/index.json` con 2 approvals (bot + humano) o 1 maintainer. Como NPM (registry) + App Store (review + firma) juntos.

**Rutas exactas:**
- `tienda/index.json` (index canónico, firmado)
- `tienda/index.json.minisig` (firma detachada)
- `tienda/pubkey.minisign` (clave pública del creador)
- `scripts/tienda/build-scan-sign.sh`
- `scripts/tienda/publish.sh`
- `core/store/client.ts` (cliente verificación)

**Component shape:**
```ts
// tienda/index.json (formato)
{
  "schema": 1,
  "updated": "2026-10-19T12:00:00Z",
  "modules": {
    "esme.nucleo.hola-mundo": {
      "versions": {
        "0.1.0": {
          "manifest_url": "https://github.com/user/esme-hola-mundo/raw/v0.1.0/module.yaml",
          "artifact_url": "https://github.com/user/esme-hola-mundo/releases/download/v0.1.0/esme.nucleo.hola-mundo-0.1.0.tar.gz",
          "sha256": "a3f2...",
          "minisig": "RWQ...",
          "verified": true,
          "reviewed_by": ["bot-security-scan", "maintainer-esme"],
          "yanked": false
        }
      }
    }
  }
}
```

**Cliente:** `core/store/client.ts` verifica firma del `index.json` contra `pubkey.minisign` embebido en binario, luego verifica cada módulo. `npm install` style pero con firma criptográfica obligatoria.

---

### 5. LAYA — Dónde Encaja (y Qué NO Debe Hacer)

**Decisión:** Laya **SÍ** para: (a) routing de sugerencias de motores (¿qué motor responde a esta tarea?), (b) decisión del Tálamo (qué memoria entra al paquete de contexto), (c) opinión de módulos vs sandbox (¿este módulo merece permiso X?). Laya **NO** para: (d) decisiones en la UI (eso es preferencia de usuario, no clasificación), (e) ejecución de código, (f) cualquier cosa que requiera estado persistente o aprendizaje.

**Ruta exacta:** `motores/laya-adapter.ts`, `core/talamus/laya-router.ts`, `core/talamus/context-packager.ts`.

**Component shape:**
```ts
// motores/laya-adapter.ts
export interface LayaDecision {
  route: "claude-code" | "opencode" | "codex" | "gemini" | "shell" | "ollama" | "local";
  confidence: number;        // 0-1
  reasoning: string;         // para debug/trazabilidad
  fallback?: LayaDecision;   // si confidence < 0.6
}

export async function layaRoute(task: string, context: MindContext): Promise<LayaDecision> {
  // llama a tools.laya.laya_decide({ state: { task, context }, questions: {...} })
}

// core/talamus/context-packager.ts
export async function selectMemoriesForPack(query: string, candidates: Memory[], budget: number): Promise<Memory[]> {
  // Laya clasifica cada candidate: relevant | marginal | noise
  // Top-k por score hasta budget tokens
}
```

**Problema — Qué NO debería intentar Laya:** **La estética y la identidad visual (Tinta y Luz).** Laya es un clasificador System One (~150-250 ms, heurístico). La identidad visual requiere System Two: coherencia narrativa, intención de diseño, "no hay dos iguales". Si Laya decide colores, tipografía, spacing → output genérico. La estética vive en `estandar/design-tokens.spec.json` y `apps/desktop/src/identity/`, gobernada por `mech-life.style-guide.md` (decisión 12). Laya solo ruta; no diseña.

---

### 6. Riesgos — Solo Sync Criptográfico, Nunca Inferencia

**Decisión:** Servidor ligero (`apps/desktop/src/backend/sync/`) hace **solo**: backup/restore de `.mind`, compartido cifrado entre dispositivos del mismo usuario (clave derivada de Vault Key), métricas anónimas opt-in. **Nunca:** inferencia, embedding, recall, hosting de módulos, marketplace transaccional. Métrica de no-dependencia: **app 100% funcional offline** (test en CI: `npm run test:offline` desconecta red y verifica que Taller, recall, Tinta y Luz, módulos locales arrancan).

**Rutas exactas:**
- `apps/desktop/src/backend/sync/server.ts` (Node + Fastify, ~200 LOC)
- `apps/desktop/src/backend/sync/crypto.ts` (XChaCha20-Poly1305, clave = HKDF(vault_key, "esme-sync"))
- `core/mind/portable-format.ts` (ver decisión 7)
- `tests/offline.test.ts` (Prueba 0 offline)

**Garantía:** Binario desktop incluye `pubkey.minisign` y `sync-pubkey` hardcoded. Sin red → sync no-op, todo lo demás funciona. Si servidor cae → 0 impacto en UX. Si servidor se vuelve SaaS → fork del binario apunta a localhost o tira sync.

---

### 7. Formato de Mente Portable — `.mind` (Open Spec v1)

**Decisión:** `.mind` = archivo único (ZIP con estructura interna) o directorio `.mind/`. Contiene: `embeddings/` (`.onnx` + `.bin` weights), `metadata.json` (schema versionado), `cognition.sig` (firma Ed25519 del hash de cognición), `crs-delta/` (encoding delta entre versiones), `rumbo.json` (opcional: para qué trabaja la mente — pilares y objetivos; viaja con ella). Privacidad: `redaction-rules.json` (patrones PII, claves API, datos de empresa/terceros) + `exclusion-list.json` (paths que nunca se exportan). Importadores en `core/mind/importers/`.

**Rutas exactas:**
- `estandar/mind-format.spec.yaml` (spec completa)
- `core/mind/portable-format.ts` (serialización/deserialización)
- `core/mind/mind-file.ts` (export/import con verificación de cognición)
- `core/mind/mind-zip.ts` (la misma mente en un solo fichero)
- `core/mind/zip.ts` (el contenedor, en bytes y sin dependencias)
- `core/mind/rumbo.ts` (el rumbo: espejo exacto de `daimon/rumbo.py`)
- `core/mind/delta.ts` + `core/mind/delta-pack.ts` (crs-delta: la mente viaja por diferencias)
- `core/mind/redaction.ts` (motor de redacción)
- `core/mind/importers/{obsidian,markdown,json}.ts` (el pipeline en `arbol.ts`)

**Component shape:**
```yaml
# estandar/mind-format.spec.yaml (extracto)
schema_version: 1
format: "application/esme.mind+zip"
structure:
  embeddings/
    model.onnx: "EmbeddingGemma-300M quantizado INT8"
    vectors.bin: "float32 little-endian, row-major [N, 300]"
  metadata.json: |
    {
      "schema": 1,
      "created": "2026-10-19T12:00:00Z",
      "version": 3,
      "memory_count": 2334,
      "embedding_model": "embeddinggemma-300m",
      "embedding_dim": 300,
      "cognition_hash": "sha256:...",
      "privacy": { "redacted": 47, "excluded": ["work/*", "api-keys/*"] }
    }
  cognition.sig: "detached Ed25519 signature of metadata.json + embeddings/"
  crs-delta/
    v2_to_v3.patch: "binary diff (bsdiff) para updates incrementales"
  redaction-rules.json: |
    { "patterns": ["sk-[a-zA-Z0-9]{32,}", "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b"] }
  exclusion-list.json: |
    [ "work/**", "company/**", ".env*", "*.pem", "*.key" ]
```

**Versionado:** `schema` en metadata. `crs-delta` permite update OTA sin re-embedding completo. Firma de cognición = hash del estado semántico (no binario) → detecta corrupción silenciosa.

---

### 8. Estandar/ — Specs Multi-Motor + RACI Lite

**Decisión:** `estandar/` = 3 specs vivos (Markdown + JSON Schema):
1. `module-manifest.spec.yaml` (decisión 3)
2. `mind-format.spec.yaml` (decisión 7)
3. `motor-capability.spec.yaml` (cada proveedor declara: `streaming`, `tools`, `context_window`, `pricing`, `local_only`).

**MCP** (Module Capability Protocol) = contrato entre core y módulos (IPC schema, permisos, lifecycle). **UCP** (Universal Capability Protocol) = contrato entre core y motores (capability manifest + health check + cancel token). Aceptación: PR a `estandar/` + CI `spec-lint` pasa + 1 maintainer approve = merged. No committee burocrático.

**RACI Lite:**
- **R** (Responsible): Creator (merge final), bots (CI, spec-lint, compat-check)
- **A** (Accountable): Creator
- **C** (Consulted): Discord #estandar (cualquiera puede comentar)
- **I** (Informed): Release notes auto-generadas desde CHANGELOG.spec

**Rutas exactas:**
- `estandar/motor-capability.spec.yaml`
- `estandar/RACI.md`
- `.github/workflows/spec-lint.yml`
- `scripts/estandar/compat-check.ts` (verifica módulo contra motor capability)

**Motor capability example:**
```yaml
# estandar/motor-capability.spec.yaml (para claude-code)
id: "claude-code"
version: "1.0"
capabilities:
  streaming: true
  tools: true
  max_context: 200000
  local_only: false
  pricing: "api"
  health_endpoint: "http://localhost:1234/health"
  cancel_support: true
```

---

### 9. Docs y Kit de Colaborador — Estructura Exacta

**Decisión:** `docs/` = source of truth. Kit de colaborador = onboarding en <10 min para primer PR.

**Rutas exactas:**
```
docs/
├── ARQUITECTURA.md           # Este documento
├── ESME.md                   # Fuente de verdad del producto (Florida)
├── COLABORADOR-KIT/
│   ├── MAPA-REPO.md          # Árbol con 1-liner por carpeta
│   ├── PRIMER-PR.md          # "Clona → pnpm i → pnpm dev → cambia X → PR" (10 min)
│   ├── RUNBOOK-DEV.md        # Comandos, logs, debug, test:offline, sandbox
│   ├── DECISION-ADR.md       # Plantilla ADR + índice de ADRs aceptadas
│   └── ESTILO-MECH-LIFE.md   # Design language (decisión 12)
├── SPECS/
│   ├── module-manifest.spec.yaml
│   ├── mind-format.spec.yaml
│   └── motor-capability.spec.yaml
├── API/
│   ├── core-ipc.md
│   ├── extension-host.md
│   └── mind-portable.md
└── GUIAS/
    ├── crear-modulo.md
    ├── publicar-tienda.md
    ├── migrar-mind.md
    └── debug-recall.md
```

**Primer PR en 10 min:** `COLABORADOR-KIT/PRIMER-PR.md` usa `modulos/plantilla-hola-mundo/` (template con `module.yaml`, `package.json`, `src/index.ts`, test). `pnpm create:modulo mi-modulo` scaffoldea todo.

---

### 10. CI/CD — GitHub Actions, 1 Creador + Bots

**Decisión:** Matrix 3 OS (ubuntu-latest, windows-latest, macos-latest) × Node 20/22 × Python 3.11/3.12. Jobs: `lint`, `test:unit`, `test:integration`, `test:offline`, `security-scan` (syft + grype en artifacts), `sign-artifacts` (minisign + cosign), `release-channel` (nightly/beta/stable via tags `v*`, `v*-beta.*`, `v*-nightly.*`). **1 creador + bots = equipo:** Dependabot + Renovate (deps), CodeQL (sec), custom bot `esme-bot` (triaje issues, label PRs, run compat-check, commenta resultados).

**Rutas exactas:**
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.github/workflows/spec-lint.yml`
- `.github/workflows/offline.yml`
- `.github/bots/esme-bot/` (Node script, corre en Actions scheduled)
- `scripts/ci/sign-release.sh`

**Release flow:** Push tag `v1.2.3` → `release.yml` builda binarios 3 OS → firma → sube a GitHub Releases + actualiza `tienda/index.json` (solo core) → Discord webhook anuncio. Nightly = cron daily en `main`.

---

### 11. Números de Meta Q1 — Ajuste DORA

**Decisión:** Metas Q1 (13 semanas):
| Métrica | Target | DORA Reality Check |
|---------|--------|-------------------|
| Módulos comunidad | 10 | **Realista** si `create:modulo` + kit + tienda lista W4 |
| Mentes test compat | 100 | **Realista** si export `.mind` one-click + importers W3 |
| Colaboradores Discord | 50 | **Absurdo** sin launch público → ajuste: 20 (early adopters) |
| Releases/semana | 1 | **Realista** (nightly auto + beta semanal + stable mensual) |
| 100% offline-capable | ✓ | **Non-negotiable** (gate en CI) |

**DORA ajustado para 1 persona + bots:**
- Deployment frequency: **7/semana** (nightly) → lead time: **<2h** (bot hace todo)
- MTTR: **<30 min** (revert tag + rebuild auto)
- Change failure rate: **<5%** (gate: `test:offline` + `security-scan` + `compat-check`)

**Faltan dimensiones:** *Time-to-first-contribution* (target: <30 min desde clone a PR merged), *Module install success rate* (target: >95%), *Recall latency p95* (target: <350 ms). Añadidas a `docs/METRICS.md`.

---

### 12. Gobernanza — Control Creativo + Comunidad Sin Distro Genérica

**Decisión:** Creador mantiene **control creativo absoluto** sobre: identidad visual (Tinta y Luz), naming, roadmap, specs `estandar/`, `apps/desktop/` UX. Comunidad contribuye: módulos (`modulos/`), importers, fix bugs, docs, tests, ports. **Mech Life** = design language documentado en `docs/COLABORADOR-KIT/ESTILO-MECH-LIFE.md` (tokens, motion, copy voice, "no hay dos iguales"). PRs que rompen Mech Life → **request changes** automático (bot valida tokens vs `estandar/design-tokens.spec.json`).

**Rutas exactas:**
- `docs/COLABORADOR-KIT/ESTILO-MECH-LIFE.md`
- `estandar/design-tokens.spec.json` (source of truth tokens)
- `apps/desktop/src/identity/tokens.css.ts` (generado desde spec)
- `.github/bots/mech-life-guard.ts` (valida PR contra tokens)

**Mecanismo:** `mech-life-guard` corre en cada PR. Si `apps/desktop/**/*.tsx` usa color/no token → fail. Si módulo declara `category: "theme"` pero no exporta `tokens.css.ts` compatible → fail. Esto evita distro genérica: la estética **es** el producto, no skinneable.

---

### 13. Roadmap 90 Días — W1-W13, Entregables Medibles

| Semana | Entregable Medible (Prueba 0 o Usuario Real) |
|--------|---------------------------------------------|
| **W1** | `core/extension-host/` funcional: `pnpm dev` carga `modulos/plantilla-hola-mundo/` en sandbox, `mind:read` + `ui:render` works. **Prueba 0:** `tests/extension-host.test.ts` pasa. |
| **W2** | `module.yaml` validator + minisign sign/verify. **Usuario real:** Creador instala módulo firmado localmente via `esme module install ./modulos/plantilla-hola-mundo`. |
| **W3** | `.mind` export/import (ZIP + crs-delta v1→v2). **Prueba 0:** `tests/mind-portable.test.ts` roundtrip 2334 recuerdos = identical recall. |
| **W4** | `tienda/` repo + `index.json` firmado + `core/store/client.ts` verify. **Usuario real:** `esme module add esme.nucleo.hola-mundo@0.1.0` desde tienda local. |
| **W5** | Laya adapter integrado en Tálamo (routing motores + context packaging). **Prueba 0:** `tests/talamus-laya.test.ts` 100 queries → routing correcto >90%. |
| **W6** | `estandar/` 3 specs publicadas + `spec-lint` CI + `compat-check` bot. **Usuario real:** Contribuyente externo abre PR a `estandar/` → merged en <1h. |
| **W7** | `docs/` completa + `COLABORADOR-KIT/` + `pnpm create:modulo`. **Prueba 0:** Cronómetro: clone → PR merged en <10 min (bot auto-merge si pasa CI). |
| **W8** | CI/CD matrix 3 OS + security-scan + sign + release channels. **Prueba 0:** Tag `v0.1.0-nightly.1` → binarios 3 OS firmados en <15 min. |
| **W9** | Sync server (backup/restore cifrado) + `test:offline` gate. **Usuario real:** Creador usa 2 dispositivos, sync .mind, desconecta red → ambas funcionan. |
| **W10** | Motor capability manifest para 5 motores (claude-code, opencode, codex, gemini, ollama). **Prueba 0:** `compat-check` valida módulo contra cada motor. |
| **W11** | Mech Life guard bot + design-tokens.spec.json. **Prueba 0:** PR con hardcoded color → bot rechaza con diff sugerido. |
| **W12** | 3 módulos comunidad reales (no del creador): reclutados via Discord #colaboradores. **Usuario real:** 3 PRs merged a `tienda/` de gente ajena. |
| **W13** | **Hito "Colaboradores":** Release `v0.2.0-beta` con 3 módulos ajenos, 20 early adopters en Discord, 100 mentes test compat, 100% offline. **Prueba 0:** Usuario ajeno clona, `pnpm dev`, instala módulo comunidad, recall works, zero config. |

---

### 14. Nombre y Signatura de la Era

**Posicionamiento:** **"El runtime de la mente local."** No "formato de la mente" (eso es `.mind`, spec abierta). No "app de notas" (eso es Obsidian/Notion). Esme = **motor que hace la mente computable, portable y soberana**.

**Frase:** *"Tu mente, tu hardware, tus reglas — el resto son módulos."*

**Anti-Matrix (qué NUNCA se hace):**
1. **Nunca** inferencia en servidor (ni "opcional", ni "híbrido", ni "fallback"). Local-only es innegociable.
2. **Nunca** telemetría obligatoria ni phone-home. Opt-in, anónima, local-first.
3. **Nunca** marketplace con take-rate % (NPM no cobra, Apple 30% → nosotros 0%). Tienda = distribución, no transacción.
4. **Nunca** single-point-of-failure en el creador. Bus factor ≥2 para core (docs + bots + specs abiertas).
5. **Nunca** breaking changes sin `crs-delta` migration path. `.mind` v1 → v2 = patch, no re-embed.
6. **Nunca** copiar el modelo de permisos de Chrome Web Store (opaco, todo o nada). Permisos = granulares, consentimiento interactivo, revocables.
7. **Nunca** priorizar "ecosistema" sobre "individuo". Un solo usuario con su mente soberana > 10k usuarios en hosted.
8. **Nunca** diluir Tinta y Luz para "accesibilidad genérica". Accesibilidad SÍ, estética NO negociable.

**Firma de la era:** `esme-runtime@1.0.0` — primera versión que pasa Prueba 0 completa (W13). Todo lo anterior es prólogo.

---

### 15. El Cerebro es Python, la App es TypeScript — Una Sola Puerta

**Decisión:** Esme es un programa en dos lenguas, y la frontera entre ellas es un contrato escrito, no una costumbre.

- **Python piensa** (`daimon/`): la Lente (embeddings: ONNX, model2vec, Ollama), el Tálamo (ranking, MMR, presupuesto), el Hipocampo (SQLite + vectores `.npy`), el Atlas (UMAP + KDE), el sueño, la voz (Whisper/Piper), la ingesta. Es el stack estándar de IA y no hay razón para inventar otro.
- **TypeScript es el cuerpo** (`app/`, el kit): ventana, IPC, Tienda, Taller, contratos, formatos, firmas. Una sola lengua de punta a punta en todo lo que el usuario toca.
- **Una sola puerta** (`app/src/main/mente/cliente.ts`): el proceso principal es el único que habla con el Python. La ventana pide por IPC; los agentes externos, por MCP. El token de la mente no sale del proceso principal.
- **El contrato es spec abierta** (`estandar/cerebro-frontera.spec.yaml`): rutas, cuerpos, tiempos, errores. Entre dos lenguas solo sobrevive lo que está escrito.

**Por qué no otras lenguas:**
- **C++**: no se escribe. Está debajo (onnxruntime, tokenizers, llama.cpp): se usa, no se reescribe.
- **Rust**: candidato real solo para el aislamiento del extension host (código de módulos ajenos). No para la mente: la mente no es un problema de memoria, es de modelo.
- **Mojo**: sintaxis de Python a velocidad nativa. En medio de un cerebro que ya habla con numpy y ONNX, sería un tercer dialecto en el mismo proceso.
- **R / Julia**: el examen (Prueba 0) y los benches son de análisis de datos en Python y TypeScript; R y Julia no aportan nada aquí.

**Anti-Matrix (qué NUNCA se hace):**
9. **Nunca** un segundo cliente del cerebro. Un contrato, un cliente, un test que lo hace imposible de romper (`app/src/main/frontera.test.ts`).
10. **Nunca** el token de la mente en el renderer: la ventana es la parte menos de fiar de la casa.
11. **Nunca** lógica de IA en TypeScript (embeddings, tensores, ONNX): si necesita numpy, va al Python.
