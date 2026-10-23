# Runbook de incidente de claves

> La regla de la casa: **una llave no se borra — se muere con papel firmado.**
> Arquitectura: `tienda/rotacion.ts` (sucesiones), `tienda/revocacion.ts`
> (libro de caídas), `docs/TIENDA.md` (flujo completo).

## Qué es una cadena de confianza aquí

```
raíz congelada del consumidor (EL FICHA .keys pub / ESME_PUB_KEY)
  └── índice firmado (declara sus claves dentro: indice.claves)
        └── sucesiones dual-firmadas (tienda/rotaciones.json)
        └── artefactos firmados (tienda/firmas/<id>.artefacto.json)
        └── libro de revocaciones (tienda/revocaciones.json)
```

El consumidor **nunca** necesita actualizar su raíz: camina la estirpe.
Una llave muerta (revocada) mata todo lo que firmó. Un certificado de
sucesión exige firma de las DOS llaves: robar la vieja no basta para
falsificar una rotación.

## Incidente: sospecha de fuga de la llave actual

```
npm run incidente "sospecha de fuga"
```

Hace, en orden y con veredicto visible:

1. **ROTA** — par nuevo toma el mando; papel dual firmado por ambas.
2. **REVOCADA** — la huella muerta queda anotada en el libro, firmado por la viva.
3. **REFIRMA** — índice firmado por la nueva; panel republicado.
4. **VERIFICA** — de punta a punta; los consumidores de la raíz vieja
   siguen por la estirpe (debería decir `firma verificada ✓ (cadena)`).

## Incidente: la llave ya está FUERA (compromiso total)

Si el atacante tiene la privada actual, la rotación `npm run incidente`
AÚN protege la historia (el papel dual exige la privada nueva… que el
atacante ya tiene: ¡no sirve!). Protocolo honesto para compromiso total:

1. Genera un par nuevo **fuera de la máquina** (`tienda/milavec/generar.ts`
  Offline o `openssl genpkey -algorithm ed25519`).
2. Reemplaza `.keys/index-dev.pem` a mano y firma el índice.
3. **NO hay cadena posible**: los consumidores deben re-fijar su raíz por
   un canal aparte (anuncio firmado — mejor: página de la tienda, sticky
   del caso, o el mismo repo).
4. Revisa qué se firmó con la llave robada desde el último punto seguro
   de tiempo (`git log --oneline tienda/firmas/`).

## Verificar el estado de confianza de la tienda

```
npm run verificar            # con la raíz del repo
ESME_PUB_KEY="$(cat mi-raiz.pem)" npm run verificar   # con la raíz del consumidor
```

## Revocación puntual (sin rotar)

```
npm run revocar <huella-de-16-hex> "motivo"
```

## Rotación programada (sin incidente)

```
npm run rotar "rotación trimestral"
npm run bench   # re-firma con la nueva
```

## Incidente: accidentalidad en el guard de rotación (23-oct-2026)

**Qué pasó.** Se llamó `npm run rotar --ayuda` esperando un texto de uso.
El guion no filtraba sus argumentos: el flag `--ayuda` se usó como *motivo*
y la ceremonia CORRIÓ — la llave dev rotó (`adaaf799 → b85925e4`) y la
privada vieja se reescribió sin copia.

**Qué reveló (esto es lo que importa).** El ledger YA tenía una rama desde
`adaaf`: la llave de release de la CI (`adaaf → 76b0d215`, «la llave con la
que la CI firma las releases»). El paseo de estirpe `llevaDeRaiz` era
LINEAL — cogía «el primer salto» de cada llave — así que con dos hijos
certificados la segunda llave dejaba de estar avalada: la primera release
de verdad se habría caído, y el fallo habría salido en producción, no en
la casa. La sorpresa del accidente destapó el bug antes.

**Estado final.**
- El índice, los veredictos y el panel vuelven a estar firmados por
  `adaaf799` (la llave que la app congeló; su verificación no cambia).
- El libro queda con las DOS sucesiones de `adaaf` (--ayuda incluida:
  el ledger es append-only y no se reescribe). El paseo de estirpe ahora
  es de ANCHURA (BFS): con una rama o con diez, las llaves valen por la
  cadena y el camino que se escriba es el REAL (sin ramas muertas),
  `tests/rotacion.test.ts`.
- `rotar` ahora se niega si el argumento huele a flag (`--…`) y EXIGE el
  motivo por escrito (una llave no muere sin causa):
  `tests/rotar-guard.test.ts`.
- La prueba del intérprete-trampa que re-firmaba sin DECLARAR su llave
  ahora declara la clave como lo hace `firma:index`
  (`tests/consumidor-remoto.test.ts`).

**La lección en la casa:** una ceremonia irreversible que corre por un
argumento que nadie entendió es un incidente de seguridad esperando su
caso; y una estirpe que se camina asumiendo que es un hilo, la rompe un
rama. El guard vale para la persona y para la IA que la usa.



## Reproducir cada pieza (para auditar a mano)

| Verificar | Cómo |
|---|---|
| índice firmado | `node:crypto verify` con `indice.claves[signed_by]` |
| sucesión válida | ambas firmas del cert contra las pubs que declara |
| estirpe viva | `llevaDeRaiz(huellaRaiz, signed_by, ledger, pubRaiz)` |
| artefacto íntegro | `sha256(tar) == artefacto.tar` + firma Ed25519 |
| revocación válida | firma `revocar:<huella>` validada por la pub viva |
