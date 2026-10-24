# EL ÁRBOL — tus ficheros como árbol, medidos.

**Deseo que lo trajo:** «Dibujar el árbol de ficheros como lo que es: un
árbol, y no una lista sangrada» (@FinnoTaylor, la lista de deseos de la
tienda). Y no viene solo: la familia de los puntos (quién engendró a quién,
bcb67b8) ya enseñó la manera — la genealogía sale de la medida.

## La pregunta de todos los días

Tu carpeta es un ÁRBOL, no una lista con sangría. Y el peso no se reparte a
partes iguales: la pregunta útil no es «¿qué hay?» (eso lo contesta
cualquier `ls -R`), es **«¿de dónde SALE el peso?»**. La respuesta es un
número por rama y la rama que más pesa, arriba.

## Lo que hay

| Qué | Dónde |
|-----|-------|
| La medida | `core/ficheros.ts` |
| La CLI | `npm run arbol [-- --ruta src] [--salto node_modules] [--json] [--alfabeto]` |
| El contrato | `estandar/arbol.spec.yaml` |

Un nodo por fichero o carpeta, con su **papa** (el id del progenitor, como
la familia de los puntos trae su pid), su altura, su tipo y su **peso REAL
de `stat`**. Lo que no se pudo mirar, se dice: `ciega: true` y peso
`null` — nunca un cero disimulado. Los enlaces no se siguen: se mide el
enlace, no su destino.

## Por qué está en el kit (y no en la ventana)

Igual que los puntos: el árbol es **dato**, no dibujo. La ventana lo puede
mirar como lo que es — un árbol con sus conectores y la rama que más pesa
primero — sin que el kit sepa nada de dibujado. Y como la era es local,
esta medida no sale de tu PC ni abre el CONTENIDO de nada: nombres,
tamaños y tipos.

## Las reglas que lo gobiernan

1. **Medido, no estimado:** el peso sale de `stat`; en la carpeta, la
   suma de sus ficheros de debajo.
2. **Lo que no se puede mirar, se dice:** carpeta sin permiso → a ciegas;
   su peso queda en el aire (`null`) y el de su papa con él (un total que
   no lo sabe todo, no lleva su número).
3. **La rama que más pesa, arriba** (como en los puntos, el que más come,
   primero). El alfabético se pide por su nombre: `--alfabeto`.
4. **Sin saltos por defecto.** Si árbol ve `.git`, ve `.git`. Lo que salta,
   lo salta tú (`--salto .git`): lo pedido no es silencio.
