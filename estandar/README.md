# `estandar/` — los contratos públicos

> Entre dos lenguajes sólo sobrevive lo que está escrito. Esto es lo escrito.
> Cada spec es un **contrato**: algo que el kit implementa, que la app puede
> leer y que un tercero puede usar sin preguntar.

## El mapa

| Spec | Qué fija | Quién lo implementa |
|---|---|---|
| [`module-manifest.spec.yaml`](module-manifest.spec.yaml) | la forma de un `module.yaml` (id, categoría, permisos, entrada, examen) | `core/ipc/module-schema.ts` |
| [`module-veredicto.spec.yaml`](module-veredicto.spec.yaml) | cómo se firma el veredicto de los módulos y qué contiene | `tienda/veredictos-modulos.ts` |
| [`motor-capability.spec.yaml`](motor-capability.spec.yaml) | lo que declara cada motor (ventana, herramientas, red, MCP, desbordamiento) | `motores/laya-adapter.ts`, `motores/acp-motores.ts` |
| [`contexto.spec.yaml`](contexto.spec.yaml) | los tres modos de contexto y sus presupuestos | `core/talamus/modos.ts` |
| [`turno.spec.yaml`](turno.spec.yaml) | lo que lleva un turno (respuesta, pasos plegados, cambios, tokens, coste) | `core/turnos/turno.ts` |
| [`equipo.spec.yaml`](equipo.spec.yaml) | un equipo de agentes: un arquitecto, un presupuesto repartido, sin conflictos | `core/equipo.ts` |
| [`bot.spec.yaml`](bot.spec.yaml) | un bot: la puerta, los permisos concedidos y el techo por hora | `core/bot.ts` |
| [`agente.spec.yaml`](agente.spec.yaml) | la receta de un agente (motor, encargo, presupuesto, memoria) | `tienda/agente.ts` |
| [`piel.spec.yaml`](piel.spec.yaml) | la forma de una piel (opciones cerradas, lectura WCAG) | `tienda/piel.ts` |
| [`deseo.spec.yaml`](deseo.spec.yaml) | la demanda: qué falta, de dónde viene y con qué se cumplió | `core/tienda/deseos.ts` |
| [`recurso.spec.yaml`](recurso.spec.yaml) | la oferta de piezas y cuánto las ha mirado la casa | `core/tienda/recursos.ts` |
| [`puntos.spec.yaml`](puntos.spec.yaml) | el estado medido de tu PC (un punto por proceso) | `core/motores/puntos.ts` |
| [`router.spec.yaml`](router.spec.yaml) | las decisiones del router y lo que aprende de tus veredictos | `core/router/aprende.ts` |
| [`skill-veredicto.spec.yaml`](skill-veredicto.spec.yaml) | cómo se juzga una skill (hechos, no recall) | `tienda/skills.ts` |
| [`mind-format.spec.yaml`](mind-format.spec.yaml) | la mente portátil (`.mind`) | `core/mind/` |
| [`catalogo-productos.spec.yaml`](catalogo-productos.spec.yaml) | el catálogo de productos de la tienda (piel, herramienta, agente, app) | `tienda/catalogo.ts` |
| [`cerebro-frontera.spec.yaml`](cerebro-frontera.spec.yaml) | la frontera entre el cerebro (Python) y la app (TypeScript) | ambos |

## La regla que las mantiene vivas

Una spec que no se comprueba es un documento. Y una spec que se comprueba
contra el código se avergüenza si el código se mueve sin ella.

Por eso hay **una** comprobación (`scripts/estandar/conformidad.ts`), que usa
el lint de specs (`npm run spec:lint`) y un test:

- los **estados** y las **opciones** que la spec declara son los que el
  código usa (ni uno más, ni uno menos);
- los **presupuestos y umbrales** que la spec escribe son los del código;
- y las **formas** (los campos) que la spec declara son las del tipo: si la
  spec promete un campo que el código no tiene, se dice.

Si añades una opción al código, la spec tiene que ir detrás. Si cambias la
spec, el código tiene que ir detrás. No hay tercera vía.

## Cómo se cambian

1. PR a `estandar/` (la spec **y** su código, en el mismo PR: si no, el test
   de conformidad falla y lo dice).
2. `npm run spec:lint` en verde: la spec se lee, declara su versión y cuadra
   con el código.
3. Un maintainer aprueba (RACI lite: [`RACI.md`](RACI.md)).
