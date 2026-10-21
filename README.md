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
| `docs/ARQUITECTURA.md` | **Las 16 decisiones** de la plataforma. Léelo primero. |
| `docs/COLABORADOR-KIT/` | Tu kit de entrada: colaboradores, ADRs, mapa, runbook. |
| `docs/LAYA.md` | El motor de decisiones locales del núcleo. |
| `docs/TIENDA.md` | La tienda: manifiesto → scan → firma → índice → panel. |
| `docs/PRUEBA-0.md` | El examen que regula todo. |
| `docs/SYNC.md` | La mente portable (`.mind`), en carpeta o en un solo fichero. |
| `docs/INCIDENTE.md` | El runbook: si una llave se cae, qué se hace. |
| `docs/MODULOS.md` | Los módulos: la cápsula, la puerta, el juez y el runtime. |
| `docs/ENTRADA.md` | La puerta de entrada: construir y publicar un módulo, en tres comandos. |
| `docs/MOTORES.md` | Los motores: la misma mente, muchos cerebros (y qué motor aloja qué módulo). |
| `docs/PIELES.md` | Las pieles: el tema es un documento, y hay un juez que lo comprueba. |
| `docs/PUNTOS.md` | Los puntos: el estado de tu PC, medido (un punto por agente, con su RAM). |
| `estandar/RACI.md` | Quién decide qué en las specs (RACI lite). |
| `estandar/contexto.spec.yaml` | Los tres modos del contexto y el ahorro medido. |
| `docs/TURNOS.md` | El turno: la conversación como dato, y la limpieza del chat medida. |
| `estandar/equipo.spec.yaml` | El equipo: varios agentes, un presupuesto repartido. |
| `estandar/bot.spec.yaml` | El bot: la mente desde un mensajero, por la misma puerta. |
| `estandar/router.spec.yaml` | El router que aprende de los veredictos de la persona. |
| `estandar/deseo.spec.yaml` | Los deseos: lo que guardaste es lo que falta por construir (y va firmado). |
| `estandar/recurso.spec.yaml` | Los recursos: las piezas con las que se construye (y a qué deseo iluminan). |

Y las otras dos puertas: `npm run verificar:skill -- <carpeta>` (una skill de
cualquiera, juzgada en local) y `npm run crear:modulo` (un módulo, con su
juicio y su forma). Y `npm run cambios -- <antes> <despues>`: qué cambió
entre dos versiones, con el diff de Myers y los números que no se saben
dichos (null, no 0). Y `npm run ejecutar -- <módulo> "<consulta>"`: un turno de
verdad, con su puerta, sus tokens, su limpieza y sus cambios. Y
`npm run puertas`: **todas** las puertas de la casa en una carrera (crear,
verificar, publicar, juzgar, medir, ejecutar, delegar…) — es lo que corre la CI
en cada PR, porque una puerta que no se prueba se pudre.
| `estandar/` | Las specs abiertas (manifiesto, mente `.mind`, frontera, veredicto…). |
| `core/mind/` | La mente portable: importadores, troceo, redacción, rumbo, delta, ZIP. |
| `core/extension-host/` | La cápsula y la puerta de los módulos (qué no puede tocar, qué puede, y sólo si se le concede). |
| `core/ipc/` | Los contratos: la mente (`mind-schema.ts`), el módulo (`module-schema.ts`) y el SDK (`sdk.ts`). |
| `core/modulos/` | El runtime de los módulos: el libro de permisos, el registro y el juez. |
| `core/bench/` | La maquinaria de medición: el examen, el ciclo y la medida de los módulos. |
| `modulos/` | Módulos de ejemplo (`ejemplo-hola-mundo`, `ejemplo-troceo-pro`, `ejemplo-puerta`). |
| `tienda/` | El índice público firmado, los paquetes, las firmas y la raíz congelada. |
| `motores/` | El adaptador de Laya (las decisiones locales, sin nube). |

## Lo que se puede hacer aquí, ahora

```bash
npm ci
npm test                 # la batería completa (331 tests)
npm run lint             # tsc --noEmit: los tipos no mienten
npm run spec:lint        # cada module.yaml contra su spec
npm run test:offline     # la garantía: funciona sin red
npm run build            # compila el paquete (lo que se publica es JS, no TS)
```

**Medir y publicar en la Tienda** (lo que hace el mantenedor):

```bash
npm run bench            # mide (examen + ciclo), empaqueta, firma y publica
npm run tienda           # bench + verificar (la tienda se comprueba)
npm run panel            # el panel de la tienda, en markdown
npm run skills:juzgar    # el juez de las skills: el veredicto medible de cada una
npm run modulos:juzgar   # el juez de los módulos: mide, dicta y FIRMA
npm run tienda:publicar-modulos -- --repo <ruta> --push   # el store de módulos, público
```

## Publicar el kit (una vez)

El kit es un paquete npm (`esme-platform`, MIT). Todo está listo: el build
compila el paquete, `npm pack` lo arma y `prepublishOnly` pasa por la puerta
(lint + tests + spec-lint + build). Lo que falta es la cuenta:

```bash
npm login                # la cuenta de npm del mantenedor
npm publish              # publica esme-platform@0.1.0
```

Mientras tanto, quien lo consuma puede apuntar a una copia local:

```json
"esme-platform": "file:../esme-platform"
```

Y quien quiera sólo la puerta de los módulos:

```ts
import { modulos } from "esme-platform/core/modulos/api";
import { mente } from "esme-platform/sdk";
```

El store de módulos vive en `Shiuglen/esme-tienda` (ficheros firmados, nada
más). Instalar desde fuera, con la raíz congelada:

```bash
npm run instalar -- --url https://raw.githubusercontent.com/Shiuglen/esme-tienda/main
```

**Usar los módulos** (la puerta de los módulos: instalar, consentir, activar,
llamar y juzgar):

```bash
npm run modulos -- lista
npm run modulos -- instala esme.nucleo.troceo-pro
npm run modulos -- concede esme.nucleo.troceo-pro mind:write
npm run modulos -- activa esme.nucleo.troceo-pro
npm run modulos -- llama esme.nucleo.troceo-pro filasDe '[[{"tipo":"fila-tabla"}]]'
npm run modulos -- juzga
```

Detalle: `docs/MODULOS.md`.

**La Prueba 0 de verdad** (el banco real, con los datos locales del usuario):

```bash
npm run banco -- --construir   # propone los casos: sus preguntas y sus documentos
npm run banco -- --validar     # el humano elige el oro (eso es la constitution)
npm run banco -- --medir       # mide: el módulo no puede empeorar el número
npm run prueba0:real           # la Prueba 0 REAL: el cerebro de verdad, con sus memorias
```

`prueba0:real` copia el hogar de la mente, arranca un cerebro sobre la copia
(su candado y sus recuerdos no se tocan) y le pregunta cada caso: ese es el
recall de producción, con la Lente de verdad y no con el proxy del kit.

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

Hay puerta de entrada: **tres comandos** y el módulo nace ya juzgado.

```bash
npm run crear:modulo -- --id esme.tu.mi-modulo --nombre "Mi módulo"
npm run verificar:modulo -- modulos/mi-modulo
```

Y si es un módulo de **memoria** o un **tema**, también hay puerta:
`--categoria memory` (trocea por filas) y `--categoria theme` (trae su piel,
que el juez comprueba).

El primero te deja el módulo entero (manifiesto, código, prueba) y lo pasa por
el verificador; el segundo lo construye, lo **mide de verdad** (abre su worker,
le habla por la puerta y cuenta los tokens) y lo juzga. El contrato del módulo
es [`estandar/module-manifest.spec.yaml`](estandar/module-manifest.spec.yaml)
y `npm run spec:lint` lo comprueba. Todo el camino está en
[`docs/ENTRADA.md`](docs/ENTRADA.md).

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
