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
3. **Empaque reproducible** (`tienda/empaque.ts`): tarball determinista —
   misma carpeta → mismos bytes → mismo sha256. La firma vive FUERA del
   paquete (`tienda/firmas/<id>.artefacto.json`), si no el paquete cambia en
   cada firma y el sha nunca se estabiliza.
4. **Firma:** Ed25519 vía `node:crypto` (cero dependencias). El manifiesto
   declara la huella de la clave que firmó; el libro de `tienda/firmas/`
   guarda la firma de los bytes. El índice completo se re-firma cada ciclo.
5. **Verificación del consumidor** (`scripts/verificar.ts`, `tienda/receptor.ts`):
   quien descarga no confía — verifica la firma del índice, el hash del
   índice contra el libro, los bytes del tar contra lo firmado, y solo
   entonces desempaqueta (`npm run verificar`, `npm run instalar <id>`).
6. **Activación** (`scripts/instalar.ts`): el módulo corre en SU worker del
   extension host con los permisos exactos del manifiesto; la mente nunca
   sale del core (`core/extension-host/host.ts`).

## Instalación

Solo se instala un módulo si: `module.yaml` pasa el validador, la firma se verifica
y el hash coincide. Los permisos (`mind:read`, `mind:write`, `net:fetch`,
`fs:project`, `ui:render`, `ipc:emit`) piden consentimiento interactivo la primera
vez, con el modal de Tinta y Luz.

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

```bash
npm run firma:index   # firma + verifica en un paso
```

Estado actual:
- [x] `tienda/index.json` firmado (v1, clave dev — pendiente la de release)
- [x] verificación con tests de manipulación (`tests/tienda-firma.test.ts`)

