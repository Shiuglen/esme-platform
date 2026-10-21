# LAS PIELES — el tema de Esme es un documento, y hay un juez

> «La estética **es** el producto, no skinneable» (ARQUITECTURA §12). Eso no
> se protege con una nota de estilo: se protege con un juez que está antes de
> la puerta.

## Qué es una piel

Una piel decide **todo** lo que se ve: color, letra, forma, densidad,
movimiento, fondo, navegación, escenas y piezas. Y es un **documento**, nunca
código: una piel que fuera código podría hacer cualquier cosa, y entonces
«no hay dos iguales» sería una promesa sin guardián.

```json
{
  "nombre": "Cine",
  "color": {
    "tipo": "libre",
    "noche": { "fondo": "#0c0a07", "superficie": "#16120c", "texto": "#f6efe2", "acento": "#e8c26e" },
    "dia":   { "fondo": "#fbf6ec", "superficie": "#fffdf8", "texto": "#1f1a12", "acento": "#7d5d17" }
  },
  "letra": { "titulos": "bodoni", "texto": "instrument", "escala": 1.03 },
  "forma": { "radio": 0.5, "sombra": "honda" },
  "caracter": "pesado",
  "escena": "rayos",
  "piezas": { "superficie": "vidrio", "saludo": "descifrar" }
}
```

## Las tres reglas del juez

1. **La forma.** Los campos son los que dice la spec y las opciones están en
   una lista **cerrada**: una piel no inventa, no «aproxima». Si dices
   `movimiento: "salvaje"`, no existe: fuera.
2. **La lectura.** El texto tiene que contrastar con el fondo y con la
   superficie, de día y de noche (WCAG AA, 4.5). Una piel que nadie lee no es
   una piel: es un adorno roto. Y un tema que rompe la lectura **no entra en
   la tienda**.
3. **La herencia.** Lo que una piel no dice, lo hereda de la base (**Tinta y
   Luz**). Por eso una piel puede ser sólo un color.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| La spec (las opciones y la base) | `estandar/piel.spec.yaml` |
| El juez | `tienda/piel.ts` |
| La línea de comandos | `npm run piel:check -- <piel.json>` |
| El guard (en la puerta) | `scripts/estandar/piel-check.ts` → `npm run verificar:modulo` |
| La piel de la casa | `estandar/piel.spec.yaml` → `base` |

## Un módulo de tema

Un tema es un módulo de categoría `theme` que trae su piel en `piel.json`:

```bash
npm run crear:modulo -- --id esme.tu.mi-tema --nombre "Mi tema" --categoria theme
```

El constructor te deja la piel de la casa para que la cambies, y el verificador
la juzga antes de nada: si no se lee o si trae una opción que no existe, el
veredicto lo dice y el módulo no entra.

## Por qué el kit juzga pieles si la ventana las vestía

Porque el juez tiene que estar **antes** de la puerta. Si la validación vive
sólo en la ventana, quien publica una piel inválida se entera cuando alguien
se la pone — y para entonces ya está en la tienda de todos. Con la spec
escrita, el kit y la ventana juzgan lo mismo: entre dos lenguajes sólo
sobrevive lo que está escrito.

> Nota: la ventana tiene su propia validación (`app/src/renderer/tinta/piel.ts`).
> Esta spec es el contrato entre las dos; cuando la ventana adopte el
> contrato, las dos dirán lo mismo.
