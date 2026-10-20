# Runbook de desarrollo

## Comandos (misma casa, cuatro pisos)

| Comando | Qué correa |
|---|---|
| `pnpm install` | deps del workspace (app Electron + módulos) |
| `pnpm dev` | modo ventana (Electron vivo, caliente) |
| `pnpm dev:web` | la misma casa en navegador (sandbox ligero) |
| `pnpm build` | build producción |
| `pnpm test` | unit + integración |
| `pnpm test:offline` | desconecta red/las llamadas y demuestra autonomía |
| `pnpm prueba0` | banco local de la Prueba 0 |
| `pnpm prueba0 --delta` | compararantes/primero después en este cambio |
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
- Los límites de: no hay پرد dos iguales en la estética — no toques tokens sin ADR.

## El flujo del taller (esencial para quienes correa los agentes)

- Cada cambio en el repo vivo dentro de `taller/copias/<id>/`.
- Al aplicar la revisión: (a) aplicación a la carpeta madre, (b) guardar en su rama,
  (c) crear un proyecto. Con deshacer.
- Veredictos del motor alimentan al router (niveles + Laya).
