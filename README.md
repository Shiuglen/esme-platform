# Esme — el kit: el cuerpo de la mente local

> **La era abierta:** la mente no vive en ninguna nube. Vive en tu PC. Y ahora cualquiera
> — humano o IA — puede construir encima.

Este repo es la **mitad MIT** de Esme: los contratos, los formatos, las firmas, la
Tienda y el extension host. La otra mitad —la ventana (Tinta y Luz), el Taller y el
cerebro en Python— vive en el repo de la app, y las dos se hablan por un contrato
escrito: [`estandar/cerebro-frontera.spec.yaml`](estandar/cerebro-frontera.spec.yaml).
Entre dos lenguas solo sobrevive lo que está escrito.

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
| `docs/COLABORADOR-KIT/` | Tu kit de entrada: colaboradores, ADRs, mapa, runbook. |
| `docs/LAYA.md` | El motor de decisiones locales del núcleo. |
| `docs/TIENDA.md` | La tienda: manifiesto → scan → firma → índice → panel. |
| `docs/PRUEBA-0.md` | El examen que regula todo. |
| `docs/SYNC.md` | La mente portable (`.mind`), en carpeta o en un solo fichero. |
| `docs/INCIDENTE.md` | El runbook: si una llave se cae, qué se hace. |
| `estandar/` | Las specs abiertas (manifiesto, mente `.mind`, frontera, veredicto…). |
| `core/mind/` | La mente portable: importadores, troceo, redacción, rumbo, delta, ZIP. |
| `core/extension-host/` | El worker de los módulos y la puerta (permisos, forma, nada más). |
| `core/ipc/` | El contrato de mente (`mind-schema.ts`) y el SDK del módulo (`sdk.ts`). |
| `core/bench/` | La maquinaria de medición: el examen y el ciclo de un módulo. |
| `modulos/` | Módulos de ejemplo (`ejemplo-hola-mundo`, `ejemplo-troceo-pro`). |
| `tienda/` | El índice público firmado, los paquetes, las firmas y la raíz congelada. |
| `motores/` | El adaptador de Laya (las decisiones locales, sin nube). |

## Lo que se puede hacer aquí, ahora

```bash
npm ci
npm test                 # la batería completa (205 tests)
npm run lint             # tsc --noEmit: los tipos no mienten
npm run spec:lint        # cada module.yaml contra su spec
npm run test:offline     # la garantía: funciona sin red
```

**Medir y publicar en la Tienda** (lo que hace el mantenedor):

```bash
npm run bench            # mide (examen + ciclo), empaqueta, firma y publica
npm run tienda           # bench + verificar (la tienda se comprueba)
npm run panel            # el panel de la tienda, en markdown
npm run skills:juzgar    # el juez de las skills: el veredicto medible de cada una
```

**La Prueba 0 de verdad** (el banco real, con los datos locales del usuario):

```bash
npm run banco -- --construir   # propone los casos: sus preguntas y sus documentos
npm run banco -- --validar     # el humano elige el oro (eso es la constitution)
npm run banco -- --medir       # mide: el módulo no puede empeorar el número
```

El banco vive FUERA del repo (`~/.esme/prueba0-banco.json`): las preguntas del
usuario y su Vault no van a un repositorio.

**Mover la mente** (formato portable, con sus garantías):

```bash
npm run mind -- absorber ~/Vault ~/salida.json      # vault, nota o volcado → trozos
npm run mind -- exportar records.json mi-mente.mind/ # recuerdos → .mind
npm run mind -- zip records.json mi-mente.mind.zip  # la misma mente, en un fichero
npm run mind -- info mi-mente.mind/                 # metadatos y exclusión
npm run mind -- rumbo mi-mente.mind/                # para qué trabaja esta mente
npm run mind -- importar mi-mente.mind/ recalls.json
```

**Instalar un módulo** (lo que hace un forastero, con la raíz congelada):

```bash
npm run instalar         # verifica, desempaqueta y lo deja listo para el host
npm run verificar        # la tienda se verifica: índice y artefactos, byte a byte
```

## Publicar un módulo (tu primer PR)

No hay scaffolder todavía: se copia [`modulos/ejemplo-hola-mundo`](modulos/ejemplo-hola-mundo),
se cambia el `module.yaml` (id, versión, categoría, permisos) y se escribe el módulo.
El contrato del módulo es [`estandar/module-manifest.spec.yaml`](estandar/module-manifest.spec.yaml)
y `npm run spec:lint` lo comprueba.

Un módulo habla con la mente por la puerta (nunca con la mente):

```ts
import { mente } from "esme-platform/sdk";   // en el kit: core/ipc/sdk.ts
const r = await mente().rumbo();             // para qué trabaja esta mente
```

## Lo que este repo NO es

- **No es la ventana.** La app (Tinta y Luz, el Taller) está en su propio repo.
- **No es el cerebro.** El Python (embeddings, rango, memoria, sueño) también.
  Aquí vive el otro lado del contrato: [`estandar/cerebro-frontera.spec.yaml`](estandar/cerebro-frontera.spec.yaml).
- **No es el servidor de sync.** Aquí está el formato que él transporta.

Si algo de esto no cuadra, manda [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).
