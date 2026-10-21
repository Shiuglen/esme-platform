# Cómo colaborar en Esme

Este repo es **la mitad MIT** de Esme: los contratos, los formatos, las firmas,
la Tienda y el extension host. La otra mitad (la ventana, el Taller y el
cerebro en Python) vive en el repo de la app, y las dos se hablan por un
contrato escrito: [`estandar/cerebro-frontera.spec.yaml`](estandar/cerebro-frontera.spec.yaml).

**El kit de entrada está en [`docs/COLABORADOR-KIT/`](docs/COLABORADOR-KIT/):**

| Fichero | Qué te dice |
|---|---|
| [`COLABORADORES.md`](docs/COLABORADOR-KIT/COLABORADORES.md) | Quién es quién y qué toca a cada uno. |
| [`DECISION-ADR.md`](docs/COLABORADOR-KIT/DECISION-ADR.md) | Cómo se toma una decisión (y se escribe). |
| [`MAPA-REPO.md`](docs/COLABORADOR-KIT/MAPA-REPO.md) | El mapa del repo: qué hay y qué NO hay. |
| [`RUNBOOK-DEV.md`](docs/COLABORADOR-KIT/RUNBOOK-DEV.md) | El runbook: qué se corre y en qué orden. |

## Las tres reglas (no se negocian)

1. **La mente es local.** El servidor sólo hace sync criptográfico. Nunca
   inferencia.
2. **La regla de oro:** toda mejora se mide contra la [Prueba 0](docs/PRUEBA-0.md)
   o contra usuarios reales. Si el número no mejora, no entra.
3. **Entre dos lenguas sólo sobrevive lo que está escrito.** Si tocas un
   contrato, tocas su spec (`estandar/`) y el test que la cumple.

## Antes de abrir un PR

```bash
npm ci
npm test            # la batería completa
npm run lint        # los tipos no mienten
npm run spec:lint   # cada module.yaml contra su spec
npm run build       # el paquete compila
```

**Antes de nada:** Node `>=22.22.2` y npm `12.2.0` (el `packageManager` del
`package.json` lo fija). Con npm 12 los scripts de instalación de las
dependencias están bloqueados salvo los que el proyecto aprueba en
`allowScripts`: si añades una dependencia con `postinstall`, apúntala ahí o su
instalación fallará.

Si tocas un contrato de la frontera (los dos lados), corre además:

```bash
npm run prueba0:real   # la puerta de la Prueba 0: el número no puede empeorar
```

## Publicar un módulo

Copia [`modulos/ejemplo-hola-mundo`](modulos/ejemplo-hola-mundo), cambia su
`module.yaml` (id, versión, categoría, permisos) y escribe el módulo. El
contrato es [`estandar/module-manifest.spec.yaml`](estandar/module-manifest.spec.yaml).

Un módulo habla con la mente por la puerta (nunca con la mente):

```ts
import { mente } from "esme-platform/sdk";
const r = await mente().rumbo();
```

Y para que entre en la Tienda, el juez lo mide (no se estima): carga, forma,
mejora contra su propio mínimo, coste por punto de acierto y permisos usados
vs. declarados. El veredicto va **firmado**: `npm run modulos:juzgar`.

Detalle: [`docs/MODULOS.md`](docs/MODULOS.md).
