# LA PUERTA DE ENTRADA — construye un módulo de Esme desde cero

> Si has llegado hasta aquí y no sabes por dónde empezar: **tres comandos**.
> No hace falta saber cinco cosas a la vez. Esto es lo que la era abierta
> promete: que cualquiera pueda construir encima.

```bash
npm run crear:modulo -- --id esme.tu.mi-modulo --nombre "Mi módulo"
npm run verificar:modulo -- modulos/mi-modulo
# y una PR en tienda/ con el paquete que sale en salida/
```

Lo primero **nace Juzgado**: el constructor no te deja un module.yaml en
blanco, te deja un módulo entero (manifiesto, código, prueba) y lo pasa por el
verificador, que lo construye, lo mide de verdad y lo juzga. Si el juez lo
echa, te lo dice ahí mismo, con el motivo — no tres días después en la tienda.

---

## 1. El módulo: qué es y qué NO puede ser

Un módulo de Esme es **un programa ajeno que vive en la casa de la persona**.
Por eso tiene tres cercos (ver [`docs/MODULOS.md`](MODULOS.md)):

| Cerco | Qué es | Dónde vive |
|-------|--------|------------|
| La **cápsula** | lo que no puede ni tocar (`fetch`, `node:fs`, `process.env`…) | `core/extension-host/sandbox.ts` |
| La **puerta** | lo que puede, y sólo si la persona se lo concede | `core/extension-host/puerta.ts` |
| El **juez** | si entra o no, y por qué | `core/modulos/veredicto.ts` |

La consecuencia práctica: **un módulo no importa nada**. Todo lo que necesita
del mundo llega por `globalThis.esme` (la puerta). El constructor te escribe
así el módulo, y por eso funciona a la primera.

```ts
export async function ciclo(consulta: string) {
  const puerta = globalThis.esme;
  if (!puerta?.mente) return { respuesta: "no hay puerta a la mente" };
  const r = await puerta.mente.recall({ query: consulta, budget: 400 });
  return { respuesta: r[0]?.texto ?? "no sé nada de eso" };
}
```

## 2. La convención: `ciclo(consulta)` (o `trocea(fuente, texto)`, si es de memoria)

Todo módulo que quiera ser medido exporta **una** función:

```ts
export async function ciclo(consulta: string): Promise<{ respuesta: string }>
```

El verificador le hace tres consultas (las mismas para todos), mira si contesta
y cuenta los tokens que cuesta cada respuesta. Con eso hay número, y con un
número hay veredicto.

Y si el módulo es de **memoria** (category: `memory`), la convención es otra:
exporta `trocea(fuente, texto)` y devuelve los trozos. El examen de la casa
(core/bench/memoria.ts) lo mide con el mismo documento y las mismas preguntas
— y con el mismo presupuesto: el mundo base (la tabla entera) se queda en
0,25 de recall y el módulo que trocea por filas llega a 1,00.

> El oro del examen es el **texto** de la respuesta, no su identificador: por
> eso un módulo de fuera, que trocea con sus propios ids, se puede medir con
> el mismo examen que los de la casa.

Es la misma convención para módulos de dentro y de fuera: una sola forma de
medir, una sola verdad.

## 3. Qué hace el verificador (y en qué orden)

```bash
npm run verificar:modulo -- <carpeta-del-módulo> [--salida <dir>] [--firmar] [--json]
```

| # | Paso | Qué mira | Si falla |
|---|------|----------|----------|
| 1 | **dictamina el manifiesto** | forma, id, permisos, entry | dice qué campo está mal |
| 2 | **construye** | esbuild, los mismos flags que la casa | dice el error de compilación |
| 3 | **mide** | abre el worker real, habla por la puerta, cuenta tokens | el módulo no carga |
| 4 | **escribe el informe** | `bench.json` con los números MEDIDOS | — |
| 5 | **juzga** | carga, forma, mejora, permisos | dice el veredicto y el porqué |
| 6 | **empaqueta** (y firma si puede) | tarball reproducible + firma Ed25519 | dice que esta llave no publica |

El código de salida es **0 si entra y 1 si no**: por eso la CI puede leerlo, y
por eso un módulo malo es un resultado, no un fallo del script.

## 4. Lo que el juez exige (las cuatro cosas que no se negocian)

1. **Carga**: el módulo arranca y contesta. Un módulo que no arranca, no entra.
2. **Su forma de examen**: cada módulo se mide como lo que es. El de
   herramienta, por su ciclo; el de memoria, por el recall (base vs. con).
3. **Mejora y coste**: la mejora es la que el módulo prometió como mínimo, y el
   coste se mide **por punto** de acierto (pagar 40 tokens por 0,01 de recall
   no es mejorar: es un peaje).
4. **Permisos**: lo que **usa** está dentro de lo que **declara**, y lo que
   declara y no usa se dice (pide más de lo que necesita: eso lo tiene que
   saber quien lo va a instalar).

## 5. Cómo se publica

1. `npm run verificar:modulo -- <carpeta>` — tiene que decir **ENTRA**.
2. El paquete queda en `salida/` (`.tgz` + su `sha256`).
3. Abre una **PR en `tienda/`** con el paquete y el veredicto.
4. Quien mantiene la tienda lo mete en el **índice firmado**
   (`npm run bench`) y lo firma con la llave de release.

Y si quieres llevarte el paquete tú mismo, con **tu** llave:

```bash
npm run verificar:modulo -- <carpeta> --firmar     # firma los bytes con tu llave
npm run publicar:modulo -- <carpeta> --firma salida/<id>.artefacto.json
```

El publicador **vuelve a verificar** el módulo antes de tocar el índice (el
juez manda sobre los dos) y declara tu clave dentro del cuerpo firmado del
índice, que es lo que permite al consumidor verificar tu paquete.

> La tienda no es un estante: **es un juez**. Y un juez que sólo juzga sus
> propias piezas no es un juez. Por eso el camino del módulo de cualquiera es
> el mismo que el de los de la casa, con la diferencia de quién firma.

Y la regla que no se negocia: quien publica sin derecho no publica. Su firma
no la avala nadie y el módulo no se instala (`tienda/receptor.ts` lo
comprueba).

## 6. La CI lo comprueba por ti

El job `puerta-de-entrada` de [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
crea un módulo de la nada, lo verifica y exige que entre. Si la puerta se
rompe, la CI lo dice en el PR — antes de que lo descubra quien publica.

## 7. Referencia

| Qué | Dónde |
|-----|-------|
| El verificador | `scripts/verificar-modulo.ts` |
| El constructor | `scripts/crear-modulo.ts` |
| La medida genérica (herramientas) | `core/bench/ciclo.ts` |
| La medida genérica (memoria) | `core/bench/memoria.ts` |
| El juez | `core/modulos/veredicto.ts` |
| El contrato del módulo | `estandar/module-manifest.spec.yaml`, `core/ipc/module-schema.ts` |
| Los módulos de la casa | `docs/MODULOS.md` |
| La Tienda | `docs/TIENDA.md` |
