# Runbook de desarrollo

## Comandos del kit (este repo)

| Comando | Qué corre |
|---|---|
| `npm ci` | deps del kit |
| `npm test` | la batería completa (209 tests) |
| `npm run lint` | `tsc --noEmit`: los tipos no mienten |
| `npm run spec:lint` | cada `module.yaml` contra su spec |
| `npm run test:offline` | la garantía: funciona sin red |
| `npm run bench` | mide (Prueba 0 + ciclo), empaqueta, firma y publica |
| `npm run tienda` | bench + verificar: la tienda se comprueba |
| `npm run panel` | el panel de la tienda, en markdown |
| `npm run firma:index` | firma el índice y lo verifica (en un paso) |
| `npm run rotar` | certifica una llave nueva: la vieja atestigua, la nueva firma |
| `npm run delegar -- <pub.pem>` | da derecho a publicar a otra llave (la tienda federada) |
| `npm run skills:juzgar -- --medir` | el juez de las skills, con medición real |
| `npm run mind -- <verbo>` | la mente portable (`absorber`, `exportar`, `zip`, `rumbo`…) |
| `npm run instalar` | instala un módulo de la tienda (verifica antes) |
| `npm run verificar` | la tienda se verifica: índice y artefactos, byte a byte |
| `npm run build:ejemplo` | construye los módulos de ejemplo (los flags son uno solo) |
| `npm run build:modulos` | construye TODOS los módulos, incluidos los que llegan de fuera |
| `npm run crear:modulo -- --id esme.tu.mi-modulo --nombre "Mi módulo"` | la puerta de entrada: nace un módulo entero y juzgado |
| `npm run verificar:modulo -- <carpeta>` | lo construye, lo mide de verdad y lo juzga |
| `npm run publicar:modulo -- <carpeta>` | lo publica en el índice firmado (vuelve a juzgarlo antes) |
| `npm run puntos` | el estado de tu PC, medido: un punto por agente, con su RAM |
| `npm run talamo` | el contexto en tres modos, y el ahorro MEDIDO |
| `npm run piel:check -- <piel.json>` | juzga una piel (opciones cerradas y que se lea) |
| `npm run agente:check -- <agente.json>` | juzga una receta de agente (motor real y presupuesto con techo) |
| `npm run compat -- <carpeta>` | qué motores pueden alojar ese módulo, y por qué no los otros |

## Comandos de la app (el otro repo)

| Comando | Qué corre |
|---|---|
| `pnpm install` | deps del workspace (app Electron + módulos) |
| `pnpm dev` | modo ventana (Electron vivo, caliente) |
| `pnpm dev:web` | la misma casa en navegador (sandbox ligero) |
| `pnpm build` | build producción |
| `pnpm test` | unit + integración |
| `pnpm test:offline` | desconecta red/las llamadas y demuestra autonomía |
| `pnpm prueba0` | banco local de la Prueba 0 |
| `pnpm prueba0 --delta` | comparar antes/después en este cambio |
| `pnpm spec:lint` | valida specs en `estandar/` + `module.yaml` |
| `pnpm sync:server` | corre el servidor de sync ligero (solo backup/restauro/share) |

## Al arrancar

- Sepa la frontera si entra: `core/`, `motores/`, `modulos/nucleo/`, `estandar/` = MIT.
  `apps/desktop/` = ESME-CL.
- La mente (EmbeddingGemma-300M int8, ONNX) corre en el proceso del cerebro,
  CPU con la mitad de los núcleos, no en Ollama (se dividió el 12-oct).
- Reposo = cero trabajo: nada de bucles ni animaciones sin motivo (regla
  «casi no consumir»).

## Depurar

- Log del cerebro: `scripts/` (a empedrar vida con un PR).
- Las cifras del estado en cada paso están en `docs/ESME.md` (requiere consulta).
- Los límites de: no hay dos iguales en la estética — no toques tokens sin ADR.

## El flujo del taller (esencial para quienes corren los agentes)

- Cada cambio en el repo vivo dentro de `taller/copias/<id>/`.
- Al aplicar la revisión: (a) aplicación a la carpeta madre, (b) guardar en su rama,
  (c) crear un proyecto. Con deshacer.
- Veredictos del motor alimentan al router (niveles + Laya).
