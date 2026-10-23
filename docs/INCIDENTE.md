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
y la ceremonia CORRIÓ — la llave viva rotó (`adaaf799 → b85925e4`) y la
privada vieja se reescribió sin copia.

**Consecuencia en el estado de confianza.** Certificado dual-firmado con
motivo «--ayuda» en el ledger (append-only: queda, no se corrige). El índice
y los veredictos se re-firman con la llave viva nueva; los artefactos que
firmara la vieja siguen verificando por la cadena de sucesiones. Ningún
consumidor se rompe: caminan la estirpe como siempre.

**La lección en la casa (cómo se hace imposible que vuelva):** `rotar`
ahora se niega si el argumento huele a flag (`--…`) y EXIGE el motivo por
escrito (una llave no muere sin causa): `tests/rotar-guard.test.ts`.

**Por qué esto importa:** una ceremonia irreversible que ve ejecutada por
un argumento que nadie entendió es un incidente de seguridad que aún está
esperando su caso. El guard vale para la persona y para la IA que la usa.


## Reproducir cada pieza (para auditar a mano)

| Verificar | Cómo |
|---|---|
| índice firmado | `node:crypto verify` con `indice.claves[signed_by]` |
| sucesión válida | ambas firmas del cert contra las pubs que declara |
| estirpe viva | `llevaDeRaiz(huellaRaiz, signed_by, ledger, pubRaiz)` |
| artefacto íntegro | `sha256(tar) == artefacto.tar` + firma Ed25519 |
| revocación válida | firma `revocar:<huella>` validada por la pub viva |
