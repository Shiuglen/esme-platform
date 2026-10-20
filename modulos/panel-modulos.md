# El juez de los módulos

Veredicto firmado por adaaf79999a7296f (1792529756819).
Catálogo juzgado: `c0bef5c2eaf70f9a…`

| | módulo | versión | nivel | forma | números | por qué |
|---|---|---|---|---|---|---|
| ⚠ | esme.nucleo.hola-mundo | 0.1.0 | aviso | ciclo | ciclo ok: true, 19.166666666666668 tokens/ciclo, 3 casos | el ciclo funciona: 3 escenarios, 19 tokens por ciclo. Pide más de lo que la medición le vio usar: mind:read, mind:write, ui:render (puede que lo use en otro camino; quien lo instala, lo decide) |
| ⚠ | esme.nucleo.puerta | 0.1.0 | aviso | memoria | recall 0.2 → 0.8 (delta 0.6000000000000001), coste 2.1666666666666665 tokens/punto | mejora 0.6000 (mínimo 0.01) y usa lo que pide. Pide más de lo que la medición le vio usar: mind:read, mind:write (puede que lo use en otro camino; quien lo instala, lo decide) |
| ⚠ | esme.nucleo.troceo-pro | 0.1.0 | aviso | memoria | recall 0.25 → 1 (delta 0.75), coste 2.1813725490196076 tokens/punto | mejora 0.7500 (mínimo 0.01) y usa lo que pide. Pide más de lo que la medición le vio usar: mind:write (puede que lo use en otro camino; quien lo instala, lo decide) |

La firma cubre el árbol que se miró: si el módulo cambia de bytes, el
veredicto deja de aplicar y la app lo vuelve a poner en «sin medir».
