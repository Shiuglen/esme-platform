# El juez de los módulos

Veredicto firmado por b85925e489b76cfc (1792731410366).
Catálogo juzgado: `0e5ba414b4b3974d…`

| | módulo | versión | nivel | forma | números | por qué |
|---|---|---|---|---|---|---|
| ⚠ | esme.nucleo.hola-mundo | 0.1.0 | aviso | ciclo | ciclo ok: true, 29.666666666666668 tokens/ciclo, 3 casos | el ciclo funciona: 3 escenarios, 30 tokens por ciclo. Pide más de lo que la medición le vio usar: mind:read, mind:write, ui:render (puede que lo use en otro camino; quien lo instala, lo decide) |
| ⚠ | esme.nucleo.puerta | 0.1.0 | aviso | ciclo | ciclo ok: true, 53 tokens/ciclo, 3 casos | el ciclo funciona: 3 escenarios, 53 tokens por ciclo. Pide más de lo que la medición le vio usar: mind:read, mind:write (puede que lo use en otro camino; quien lo instala, lo decide) |
| ⚠ | esme.nucleo.troceo-pro | 0.1.0 | aviso | memoria | recall 0.25 → 1 (delta 0.75), coste 2.1813725490196076 tokens/punto | mejora 0.7500 (mínimo 0.01) y usa lo que pide. Pide más de lo que la medición le vio usar: mind:write (puede que lo use en otro camino; quien lo instala, lo decide) |

La firma cubre el árbol que se miró: si el módulo cambia de bytes, el
veredicto deja de aplicar y la app lo vuelve a poner en «sin medir».
