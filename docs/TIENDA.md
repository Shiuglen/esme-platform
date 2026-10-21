# La tienda — NPM y App Store juntos, sin peajes

> Especificación de referencia: `docs/ARQUITECTURA.md` §4 y
> `estandar/module-manifest.spec.yaml`.

## Qué es

En `tienda/` vive el **índice público de módulos** (`index.json`), firmado con
minisign. La tienda distribuye: MCP del mundo, plugins, skills, modelos locales
(«¿cabe en tu PC?»), temas y bichitos.

## Flujo (safe-by-default)

```
build → medir (bench) → empaquetar (tgz reproducible) → firmar (Ed25519)
     → índice firmado → panel → instalar → verificar → extension host
```

1. **Validador** (`modulos/nucleo/manifest-validator.ts`): Zod + verificación de
   firma. Rechaza si `category` está fuera del enum, si se pide un permiso no
   declarado, o si `entry` no existe tras el build.
2. **Bench de la Prueba 0** (`core/bench/`, `tienda/bench.ts`): cada módulo responde
   por lo que promete — los `memory` por el examen de recall (determinista,
   ≥ +0,01 o −10% tokens), los `tool` por el **ciclo de extremo a extremo**
   (`BenchCiclo`: ≥ 3 escenarios, tope 500 tokens/ciclo). `npm run bench`
   mide, registra, firma y publica el panel en un solo comando.
3. **Empaque reproducible** (`tienda/empaque.ts`, `tienda/tar.ts`, `tienda/gzip.ts`):
   tarball determinista — misma carpeta → mismos bytes → mismo sha256. La firma
   vive FUERA del paquete (`tienda/firmas/<id>.artefacto.json`), si no el
   paquete cambia en cada firma y el sha nunca se estabiliza.
   El tar y el gzip se escriben **aquí**, no se invocan del sistema: los flags
   que hacen reproducible un tar son de GNU tar (en macOS y Windows no
   existen) y la cabecera de gzip lleva el sistema operativo dentro (el mismo
   módulo daba dos hashes según dónde se empaquetara). Los modos del paquete
   son canónicos (0644/0755), no los del disco: dependen del `umask` de cada
   máquina. Con eso, **los bytes son los mismos en Linux, macOS y Windows** —
   y la CI lo comprueba en los tres.
4. **Desempaquetado propio** (`tienda/untar.ts`): el paquete de un módulo es
   un tar escrito por alguien de otra casa, así que el confine lo pone el
   código, no la herramienta: un nombre con `..`, una ruta absoluta o un
   enlace simbólico que apunte fuera se **rechazan** (no se limpian: se dice
   que no).
5. **Firma:** Ed25519 vía `node:crypto` (cero dependencias). El manifiesto
   declara la huella de la clave que firmó; el libro de `tienda/firmas/`
   guarda la firma de los bytes. El índice completo se re-firma cada ciclo.
6. **Verificación del consumidor** (`scripts/verificar.ts`, `tienda/receptor.ts`):
   quien descarga no confía — verifica la firma del índice, el hash del
   índice contra el libro, los bytes del tar contra lo firmado, y solo
   entonces desempaqueta (`npm run verificar`, `npm run instalar <id>`).
7. **Activación** (`scripts/instalar.ts`): el módulo corre en SU worker del
   extension host con los permisos exactos del manifiesto; la mente nunca
   sale del core (`core/extension-host/host.ts`).

## Instalación

Solo se instala un módulo si: `module.yaml` pasa el validador, la firma se verifica
y el hash coincide. Los permisos (`mind:read`, `mind:write`, `net:fetch`,
`fs:project`, `ui:render`, `ipc:emit`) piden consentimiento interactivo la primera
vez, con el modal de Tinta y Luz.

## Cuando publica alguien que no es el creador

La tienda no es un estante: **es un juez**. Y un juez que sólo puede juzgar sus
propios piezas no es un juez: es un avaro con sello. Así que el camino de un
módulo de cualquiera es el mismo que el de los de la casa, con dos diferencias:

1. **Quien construye, firma su artefacto con SU llave** (`npm run verificar:modulo
   -- <módulo> --firmar`). La firma viaja con el paquete (`pub` incluida: sin ella
   el consumidor no puede verificar a un firmante nuevo).
2. **Quien mantiene la tienda mete el módulo en el índice firmado**
   (`npm run publicar:modulo -- <módulo> --firma <artefacto.json>`), declara la
   clave del firmante dentro del cuerpo firmado y re-firma el índice.

Lo que NO cambia: el juez. `npm run publicar:modulo` vuelve a VERIFICAR el
módulo (construir, medir, juzgar) antes de tocar el índice. Un módulo que el
juez echa, no entra — ni aunque traiga la firma puesta, ni aunque lo traiga
alguien de confianza.

Y lo que nunca se negocia: quien no tiene derecho no publica. La llave que
firma el índice tiene que estar en la estirpe de la raíz congelada
(`tienda/rotacion.ts`); si no, el índice que sale no lo verifica nadie y la
tienda se queda sin confianza en silencio.

El camino entero, escrito como prueba: `tests/tienda-publicar-modulo.test.ts`
(crear → verificar → publicar → instalar, con una tienda de mentira).

## El catálogo de productos (la Tienda, firmado)

La Tienda vende productos: pieles, herramientas, agentes, apps. Van en un solo
fichero, `catalogo.json`, con la firma Ed25519 de quien publica. La app solo
muestra lo que trae una firma válida: cambiar una coma de un producto la rompe.

- **La app nunca firma.** Genera el catálogo *sin firmar*
  (`app/scripts/catalogo-productos.mjs` → `app/src/main/tienda/productos.json`).
- **El kit firma y publica** (`npm run tienda:publicar -- --productos <ruta>`):
  con la llave de release si el entorno la apunta (`ESME_PRIV_KEY`), si no con la
  dev key local. Antes de escribirlo lo comprueba con la misma puerta que tiene
  la app: no se publica lo que no se puede verificar.
- **La app lo baja y lo comprueba** (`app/src/main/tienda/ipc.ts`): la red primero,
  luego la copia local (para estar sin conexión), y si no, la colección de casa.
- **Lo firmado manda sobre lo empaquetado**: si una piel de la red tiene el
  mismo id que la que viaja en la app, la de la red la sustituye.

El formato es una spec abierta (`estandar/catalogo-productos.spec.yaml`): el
orden de las claves es parte del contrato, y `tests/catalogo-productos.test.ts`
lo fija con un ejemplo firmado por el propio código de la app, así que el kit y
la app no pueden separarse sin que se caiga el test.

La llave de las licencias es otra: una llave que firma licencias no firma la
Tienda. La app tiene las suyas en `app/src/main/claves.ts`.

## El juez de las skills

Los módulos de la tienda se miden contra la Prueba 0. Las **skills** no: una
skill son instrucciones, no un módulo de memoria, y su valor no sale de un
recall. Lo que sí se puede comprobar de una skill son **hechos**: que el
commit está fijado, que hay huella del árbol, que la licencia deja
redistribuir, que no trae scripts sueltos y que no pesa una barbaridad.

`tienda/skills.ts` es ese juez. Juega el catálogo de skills que publica la app
y dicta, skill por skill, si entra, con qué riesgo y por qué:

| nivel | cuándo |
|---|---|
| `ok` | commit fijado, huella del árbol y licencia que deja redistribuir |
| `aviso` | entra, pero trae scripts, pesa más de 1 MiB, trae más de 40 ficheros o ocupa mucho contexto |
| `fuera` | id inválido, sin commit, sin huella, licencia que no deja redistribuir o un `SKILL.md` que no se puede leer |

Con `--medir` el juez baja el `SKILL.md` de cada skill del commit fijado y
mide el fichero de verdad: si se lee, cuánto ocupa (tokens, la misma cuenta que
la vista previa de la app) y si dice lo que dice. El catálogo es lo que alguien
escribió; la medida es del fichero que el usuario va a leer. Como la medida va
dentro del veredicto firmado, la app puede enseñar el coste real de una skill
**antes** de descargarla.

Lo que el juez **no** hace: estimar el ahorro de contexto. Eso lo mide la app
en la vista previa, con el `SKILL.md` delante. Inventar un número aquí sería
justo el tipo de promesa que la tienda no vende.

**El veredicto va firmado.** La firma cubre la huella del árbol que se juzgó,
así que la app puede negarse a instalar un árbol que no sea exactamente el que
el juez miró (hasta ahora se comparaba contra el catálogo, que puede cambiar
de mano entre la revisión y la descarga). Y además el veredicto declara **qué
catálogo juzgó** (`catalogoSha256`): si el catálogo de la app cambia, el
veredicto deja de aplicar y las skills vuelven a «sin medir». El juez pone el
listón, nunca lo quita.

```bash
npm run skills:juzgar -- --catalogo /ruta/catalogo.json
# → skills/veredictos.json (firmado) y skills/panel.md (legible)
```

El formato firmado es una spec abierta: `estandar/skill-veredicto.spec.yaml`.
Quien produce y quien verifica sacan los mismos bytes porque el orden de las
claves es parte del contrato. Sin veredicto válido, la app no bloquea nada:
lo dice («sin medir»). El juez pone el listón, no lo quita.

## Escudo (lo que NUNCA se tolera)

- Código que toca caminos de exclusión (`work/**`, `company/**`, `.env*`, `*.pem`,
  `*.key`) sin permiso declarado.
- Red no declarada en el manifiesto → rechazo en el validador; red descubierta en
  producción de un módulo publicado → revocación de firma y expulsión del índice.
- Módulos que copian la identidad visual (los tokens de Tinta y Luz son inmutables).
- **Peaje cero:** la tienda no cobra comisión; distribución no es transacción. Si un
  colaborador quiere cobrar por su módulo, cobra su propia licencia fuera del flujo.

## Índice

Cada entrada de `tienda/index.json` guarda: `id`, `version`, `hash`,
`bench.json` (veredicto de la Prueba 0), `pubkey` minisign y fecha de firma.
El índice **entero** va firmado con Ed25519 (`tienda/firma.ts`, bytes canónicos
con claves ordenadas): un solo byte cambiado en el cuerpo invalida la firma.
Claves: borna del mantenedor por env (`ESME_PRIV_KEY`), dev auto en `.keys/`
(ignorada por git).

**La raíz congelada manda.** El repo trae `tienda/raiz.pub.pem`: la clave
pública que el consumidor fija de confianza (es pública; no hay nada que
esconder). Todo lo que firma la tienda tiene que estar en su estirpe: el
índice y los artefactos los firma la llave **viva**, y la cadena de
rotaciones (`tienda/rotaciones.json`) demuestra que esa llave viene de la
raíz. Por eso:

```bash
npm run firma:index   # firma + verifica en un paso
npm run rotar         # certifica una llave nueva: la vieja atestigua, la nueva firma
```

- Una llave que la raíz **no** avala **no puede publicar**: `npm run bench`
  mide y dice que no publica, y `npm run firma:index` se niega. Publicar sin
  derecho no es publicar: es romper la confianza en silencio.
- El firmante se **declara** dentro del cuerpo firmado (`indice.claves`): sin
  esa declaración el consumidor no puede caminar hasta él.

Estado actual:
- [x] `tienda/index.json` firmado (v1, clave dev — pendiente la de release)
- [x] verificación con tests de manipulación (`tests/tienda-firma.test.ts`)
- [x] raíz congelada en el repo + estirpe de rotaciones (`tests/tienda-publicar.test.ts`)

