# El paquete (module.yaml v2), Fase 1: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** un solo formato de paquete para todo lo que Esme instala, con su spec, su esquema, sus pruebas y un adaptador para cada lista de hoy, sin tocar la app.

**Arquitectura:** el contrato (la forma, los permisos con alcance, los rangos, el resolver y el lock) vive en `core/paquetes/` sin YAML, como `core/ipc/module-schema.ts`. Lo que lee disco o YAML (la carpeta de un paquete, los importadores) vive en `tienda/`, como `tienda/modulo-manifiesto.ts`. La v1 se sigue leyendo con su esquema de siempre, y además se puede ver como un paquete v2 de una sola contribución.

**Pila:** TypeScript con tsx, zod 4, js-yaml 5 (solo en `tienda/` y `scripts/`), vitest 5.

**Spec:** el documento aprobado «Esme: paquetes, plantillas y sesiones en todas partes» (https://claude.ai/artifact/FY8aiRcfcooLCesSqa4A94), sección «La Fase 1, fichero a fichero», mitad B.

## Restricciones globales

- Cada spec de `estandar/` declara `schema_version: 1` (regla 0 de `scripts/estandar/conformidad.ts`). La spec nueva es `estandar/paquete.spec.yaml` (spec v1) y describe el manifiesto v2. `module-manifest.spec.yaml` solo gana una nota.
- La spec y su código van en el mismo PR, y la conformidad los compara campo a campo.
- Ningún fichero de `core/` importa `js-yaml`.
- Todo `.ts` nuevo de `core/`, `tienda/` y `motores/` lo alcanza alguna prueba (`scripts/estandar/alcance.ts`).
- Los module.yaml v1 de `modulos/` siguen pasando `npm run spec:lint` sin cambiar ni un byte.
- Las claves del manifiesto van en inglés, como en la v1; los mensajes, los comentarios y los documentos van en castellano, con la voz del kit.
- Los datos de prueba son copias de ficheros de la app (repo público, MIT, del mismo dueño) o sintéticos. Nunca datos de la persona.
- No se toca la app, ni `app/package.json`, ni `scripts/publicar.py`, ni lo del hilo de sesiones (`core/sesiones/`, `estandar/sesion.spec.yaml`).
- Los commits llevan título en castellano narrativo y las dos líneas de atribución de la sesión.

## Foco de revisión

1. **Un enlace simbólico que se sale de la carpeta del paquete.** El confinamiento léxico (`resolve`) lo deja pasar; se espera un error con su nombre.
2. **Hosts que se parecen.** `evil-example.com`, `example.com.evil.net`, `EXAMPLE.com.` y el dominio desnudo frente a `*.example.com`: se espera que `permiteHost` compare por etiquetas, sin mayúsculas y sin el punto final.
3. **Una huella que cambia con los mismos permisos.** Se espera que vuelva a pedir permiso. Quitar un paquete no lo pide.
4. **El diamante.** A usa B y C, y los dos usan D con la misma huella: se espera que resuelva, no que lo llame ciclo ni choque. D 1.0.0 frente a D 2.0.0 sí choca.
5. **Un manifiesto v2 a medio migrar.** `category`, `entry` o `runtime` arriba del todo en un v2 (el `passthrough` los aceptaría en silencio y el código se perdería): se espera un error que diga dónde va cada cosa.

---

### Task 1: permisos con alcance y rangos de versión

**Ficheros:**
- Crear: `core/paquetes/permisos.ts`, `core/paquetes/semver.ts`
- Probar: `tests/paquete-permisos.test.ts`, `tests/paquete-semver.test.ts`

**Interfaces:**
- Consume: `CAPABILITIES`, `Capability` de `core/extension-host/capability.ts`; `comparaVersiones(a, b): number` de `core/modulos/actualiza.ts`.
- Produce:
  - `ALCANCES: Record<Capability, readonly Alcance[]>`, con `Alcance = "hosts" | "paths" | "programs"`. Valores: `net:fetch → [hosts]`, `fs:project → [paths]`, `proc:spawn → [programs]` y las demás `→ []`.
  - `type PermisoConAlcance = { kind: Capability; hosts?: string[]; paths?: string[]; programs?: string[] }`
  - `type Permiso = Capability | PermisoConAlcance`
  - `PermisoSchema` (zod). La forma corta es la capacidad sin límite. La larga lleva solo las claves de `ALCANCES[kind]`, con al menos un valor. Un objeto sin alcance es un error: «usa la forma corta».
  - `unePermisos(...listas: Permiso[][]): Permiso[]`: canónica, en el orden de `CAPABILITIES`, con listas sin duplicados y ordenadas. Sin límite gana a con límite.
  - `permisosNuevos(antes: Permiso[], ahora: Permiso[]): Permiso[]`: lo de `ahora` que `antes` no cubre.
  - `permiteHost(ps: Permiso[], host: string): boolean` y `permitePrograma(ps: Permiso[], programa: string): boolean`.
  - `esRango(r: string): boolean` y `cumple(version: string, rango: string): boolean`.

- [ ] **Paso 1: las pruebas que fallan.**
  - `permiteHost([{kind:"net:fetch",hosts:["*.example.com"]}], h)` da true para `a.example.com` y `a.b.example.com`, y false para `example.com`, `evil-example.com` y `example.com.evil.net`.
  - `permiteHost([{kind:"net:fetch",hosts:["example.com"]}], "EXAMPLE.com.")` da true. `permiteHost(["net:fetch"], "x.y")` da true. `permiteHost([], "x.y")` da false. Un host con `/`, `:` o espacios da false.
  - `PermisoSchema` rechaza `{kind:"mind:read",hosts:["a.com"]}` (alcance que no es suyo), `{kind:"net:fetch"}` (sin alcance), `{kind:"net:fetch",hosts:["https://a.com"]}`, `{kind:"proc:spawn",programs:["/usr/bin/node"]}` (un programa va por su nombre, no por su ruta) y `{kind:"fs:project",paths:["../x"]}`.
  - `unePermisos([{kind:"net:fetch",hosts:["b.com"]}], [{kind:"net:fetch",hosts:["a.com","b.com"]}, "mind:read"])` da `["mind:read", {kind:"net:fetch",hosts:["a.com","b.com"]}]`. Si una lista trae `"net:fetch"` sin límite, el resultado es `"net:fetch"`.
  - `permisosNuevos([{kind:"net:fetch",hosts:["*.a.com"]}], [{kind:"net:fetch",hosts:["x.a.com","b.com"]}])` da `[{kind:"net:fetch",hosts:["b.com"]}]`. `permisosNuevos(["net:fetch"], [{kind:"net:fetch",hosts:["b.com"]}])` da `[]`. `permisosNuevos([{kind:"net:fetch",hosts:["b.com"]}], ["net:fetch"])` da `["net:fetch"]`.
  - `cumple`: `^1.0` acepta 1.4.2 y no 2.0.0; `^0.4` acepta 0.4.9 y no 0.5.0; `^0.0.3` acepta solo 0.0.3; `~1.2.3` acepta 1.2.9 y no 1.3.0; `1.2` acepta 1.2.7 y no 1.3.0; `>=1.2` acepta 3.0.0 y no 1.1.9; `*` acepta todo; `1.2.3` y `=1.2.3` aceptan solo 1.2.3. `esRango` es false para `^`, `1.x.y`, `>1` y `1 || 2`.
- [ ] **Paso 2:** `npx vitest run tests/paquete-permisos.test.ts tests/paquete-semver.test.ts` falla porque no existen los módulos.
- [ ] **Paso 3:** implementar. Un host vale si cumple `^(\*|(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*)$`, y se compara por etiquetas. Un programa cumple `^[A-Za-z0-9._+-]+$`. Una ruta de `paths` es relativa y sin `..`. Los rangos son `*`, `=`, `^`, `~` y `>=`, con versión parcial: nada de prereleases, `||` ni espacios.
- [ ] **Paso 4:** las dos pruebas en verde.
- [ ] **Paso 5:** commit: «Los permisos con alcance y los rangos de versión: lo que un paquete pide, dicho con límites».

### Task 2: el manifiesto v2, su spec y la conformidad

**Ficheros:**
- Crear: `core/paquetes/manifiesto.ts`, `estandar/paquete.spec.yaml`, `scripts/estandar/conformidad-paquete.ts`
- Modificar: `scripts/estandar/conformidad.ts` (un import y una llamada), `estandar/README.md` (una fila), `estandar/module-manifest.spec.yaml` (una nota de cabecera)
- Probar: `tests/paquete-manifiesto.test.ts`

**Interfaces:**
- Consume: lo de la Tarea 1; `ManifestSchema`, `Manifest` y `RUNTIMES` de `core/ipc/module-schema.ts` (se reutilizan `ManifestSchema.shape.signatures`, `.benchmarks` y `.decision_criteria`); `LICENCIAS_PERMITIDAS` de `tienda/skills.ts`.
- Produce:
  - `PUNTOS`: los doce puntos, cada uno con `{ naturaleza, corre, claves }`. Naturaleza: `"datos" | "código" | "código aislado"`. Corre: `"ventana" | "sesión" | "siempre" | "mente"`.

    | punto | naturaleza | corre | claves |
    |---|---|---|---|
    | themes | datos | ventana | id, file |
    | skills | datos | sesión | id, path, remote, scripts |
    | tools | código | sesión | id, entry, runtime, mcp |
    | views | código aislado | ventana | id, entry, title |
    | agents | datos | sesión | id, file, format |
    | teams | datos | sesión | id, file |
    | tasks | datos | sesión | id, title, prompt, steps, roles, category, icon, inputs |
    | routines | datos | siempre | id, when, task, agent |
    | channels | datos | siempre | id, tool |
    | memory | código | mente | id, entry, runtime |
    | engines | datos | sesión | id, name, binaries, args, install, repo, login, compliance, verified |
    | commands | datos | ventana | id, title, task |

  - `type Punto = keyof typeof PUNTOS`; `TIPOS_PAQUETE = ["package", "template"]`; `FORMATOS_AGENTE = ["receta", "claude-md", "comando"]`.
  - `LICENCIAS_PAQUETE`: las de la v1 más las de las skills: `MIT, Apache-2.0, ESME-CL, BSD-2-Clause, BSD-3-Clause, ISC, Unlicense`.
  - `NIVELES`: `0 datos, 1 WASM, 2 cápsula, 3 caja del sistema, 4 microVM`.
  - `CLAVES_PAQUETE`: `schema_version, id, version, name, kind, description, author, license, uses, contributes, permissions, settings, success, source, works_with, decision_criteria, benchmarks, signatures`.
  - `ManifiestoV2Schema` y `type ManifiestoV2`.
  - `type PaqueteDatos = { manifiesto: Record<string, unknown>; ficheros: Record<string, string | Uint8Array> }`
  - `interface LecturaPaquete { ok: boolean; version: 1 | 2 | null; paquete?: ManifiestoV2; errores: string[]; avisos: string[] }`
  - `leePaquete(raw: unknown): LecturaPaquete` (v1 o v2), `deV1(m: Manifest): ManifiestoV2`, `rutasDe(m): { punto: string; id: string; ruta: string; codigo: boolean }[]`, `nivelDe(m): 0|1|2|3|4`, `compruebaFicheros(m, leer: (ruta: string) => string | null, opts?: { exigirEntrada?: boolean }): string[]`, `validaPaqueteDatos(p: PaqueteDatos): LecturaPaquete`.
  - Variables que Esme sustituye en `mcp.command`, `args` y `env`: `${ESME_PAQUETE}` (la carpeta instalada) y `${ESME_DATOS}` (sus datos, que sobreviven a las actualizaciones).

- [ ] **Paso 1: las pruebas que fallan.**
  - El ejemplo de la doc («Esme para estudiar», `kind: template`, dos `uses`, `agents`, `routines`, `settings`, `success` y un `net:fetch` con `hosts`) es válido, y `nivelDe` da 0.
  - Errores, cada uno con su mensaje:
    - una plantilla con `tools`, `views` o `memory`: «una plantilla es solo datos»;
    - un paquete con `settings`;
    - nada en `contributes` y nada en `uses`;
    - dos entradas con el mismo `id` en un punto;
    - `contributes.hooks`: «Esme no admite hooks libres»;
    - un `channels[].tool` o un `commands[].task` que no existe en el paquete;
    - un `uses` sin `sha256`, o con un rango que no es rango;
    - un `uses` repetido;
    - `tools[].mcp.url` a un host que `permissions` no cubre;
    - `tools[].mcp.command` o `engines[].binaries` sin `proc:spawn` que los cubra;
    - una ruta absoluta, con `..` o con `\`;
    - `category`, `entry`, `runtime`, `dependencies`, `sideEffects` o `engines` arriba del todo en un v2 (Foco 5);
    - `skills[]` con `path` y `remote` a la vez, o sin ninguno de los dos;
    - `tools[]` con `entry` y `mcp` a la vez, o con `entry` sin `runtime`.
  - Avisos, sin rechazo: una clave desconocida arriba o dentro de una entrada; un punto desconocido que no es `hooks`; `net:fetch` con `hosts: ["*"]`.
  - Los cuatro `modulos/*/module.yaml` (`yaml.load` en la prueba) se leen con `leePaquete`: v1, `ok`, una contribución (`hola-mundo`, `puerta` y `rea` en `tools`; `troceo-pro` en `memory`), los mismos permisos y `nivelDe` 2.
  - `nivelDe`: `tools` wasm da 1, nodejs da 2, python da 3, `mcp.command` da 3, `mcp.url` da 0, `views` da 2 y `skills` con `scripts: true` da 3.
  - `validaPaqueteDatos` da error si una ruta de `rutasDe` no está en `ficheros`, y si un agente `format: comando` lanza un binario que `proc:spawn` no cubre.
  - `compruebaConformidad()` sigue dando `[]` (lo pide `tests/specs-codigo.test.ts`).
- [ ] **Paso 2:** `npx vitest run tests/paquete-manifiesto.test.ts tests/specs-codigo.test.ts` falla.
- [ ] **Paso 3:** implementar `manifiesto.ts`. Arriba del todo y en cada entrada, `passthrough` más un aviso por cada clave desconocida (los campos extra se notifican, no se rechazan). Escribir `paquete.spec.yaml` con secciones `manifiesto`, `tipos`, `licencias`, `puntos`, `alcances`, `niveles` y `lock`, más las reglas en comentarios. `conformidad-paquete.ts` exporta `compruebaPaquete(anota)`: compara cada sección con su constante (claves, naturaleza, corre, alcances, niveles, licencias, tipos y las claves del lock de la Tarea 5), y `compruebaConformidad` la llama al final.
- [ ] **Paso 4:** las dos pruebas en verde y `npx tsx scripts/spec-lint.ts` sin fallos nuevos.
- [ ] **Paso 5:** commit: «El paquete, escrito: module.yaml v2 con doce puntos, plantillas y permisos con alcance (la v1 sigue valiendo)».

> Las claves del lock las fija la Tarea 5. Para que la conformidad no apunte a nada, `CLAVES_LOCK` y `CLAVES_ENTRADA_LOCK` nacen aquí en `core/paquetes/lock.ts`, solo con esas dos constantes.

### Task 3: el paquete en disco

**Ficheros:**
- Crear: `tienda/paquete-disco.ts`
- Modificar: `scripts/spec-lint.ts`. Un module.yaml con `schema_version: 2` se valida como v2; los v1 se validan como hoy y además se mira su vista v2.
- Probar: `tests/paquete-disco.test.ts`

**Interfaces:**
- Consume: `leePaquete`, `compruebaFicheros` y `PaqueteDatos` (Tarea 2); `confinaRuta` de `core/modulos/rutas.ts`; `arbolSha256` de `tienda/empaque.ts`.
- Produce:
  - `interface DictamenPaquete { dir: string; id: string; ok: boolean; version: 1 | 2 | null; paquete?: ManifiestoV2; errores: string[]; avisos: string[] }`
  - `leePaqueteDeCarpeta(dir: string, opts?: { exigirEntrada?: boolean }): DictamenPaquete`
  - `escribePaquete(p: PaqueteDatos, dir: string): void`: `module.yaml` con `yaml.dump`, y luego los ficheros.
  - `conocidoDeCarpeta(dir: string): PaqueteConocido | DictamenPaquete`: `{ manifiesto, sha256: arbolSha256(dir) }` si vale, o el dictamen si no.

- [ ] **Paso 1: las pruebas que fallan.**
  - Un paquete escrito con `escribePaquete` se relee con `leePaqueteDeCarpeta`, `ok`, con el mismo manifiesto.
  - Falta un fichero de `rutasDe`: error con la ruta.
  - `entry` de código sin construir: error, salvo con `exigirEntrada: false`.
  - Un `piel.json` que es un enlace simbólico a un fichero fuera de la carpeta: error «se sale del paquete» (Foco 1).
  - Un YAML roto: error «no se puede leer», sin lanzar.
  - `conocidoDeCarpeta` da `sha256 === arbolSha256(dir)`, y cambiar un byte cambia la huella.
- [ ] **Paso 2:** la prueba falla.
- [ ] **Paso 3:** implementar. Cada ruta pasa por `confinaRuta` y, si existe, por `realpathSync`, comparada con `realpathSync(dir)` por segmentos.
- [ ] **Paso 4:** en verde, y `npx tsx scripts/spec-lint.ts` imprime para cada módulo v1 la línea nueva `✓ también como paquete v2`.
- [ ] **Paso 5:** commit: «El paquete en disco: se lee, se escribe y no se sale de su carpeta (ni por un enlace)».

### Task 4: las siete listas de hoy, como paquetes

**Ficheros:**
- Crear: `scripts/paquetes/fixtures-app.ts`; `tests/fixtures/app/{pieles-casa,pieles-tienda,productos,skills,herramientas,tareas,motores-acp,espejo-acp}.json`; `core/paquetes/adaptadores/{comun,pieles,productos,skills,herramientas,tareas,motores}.ts`
- Probar: `tests/paquete-adaptadores.test.ts`

**Interfaces:**
- Consume: `PaqueteDatos`, `validaPaqueteDatos` y `LICENCIAS_PAQUETE` (Tarea 2); `type SkillCatalogo` de `tienda/skills.ts`.
- Produce:
  - `interface Adaptados { paquetes: PaqueteDatos[]; fuera: { origen: string; motivo: string }[] }`. Nada se pierde en silencio: lo que no se adapta va a `fuera`, con su motivo.
  - `slug(texto: string): string`: minúsculas, sin tildes, todo lo demás pasa a `-`.
  - `paquetesDePielesCasa`, `paquetesDePielesTienda`, `paquetesDeProductos`, `paquetesDeSkills`, `paquetesDeHerramientas`, `paquetesDeTareas`, `paquetesDeMotoresAcp` y `paquetesDelEspejoAcp`, todas `(datos: unknown[]) => Adaptados`.
  - `herramientaMcp(nombre: string, conexion: ConexionMcp): { entrada, permisos, avisos }`, compartida con el importador MCP de la Tarea 6.
- Ids y contribuciones:

  | lista | id | contribución |
  |---|---|---|
  | pieles de casa | `esme.casa.piel-<nombre>` | themes, `piel.json` |
  | pieles de la Tienda y productos de tipo piel | `esme.tienda.piel-<id>` | themes, `piel.json` |
  | productos de tipo agente | `esme.tienda.agente-<id>` | agents, `agente.json` en formato `comando`, más `proc:spawn` con su binario |
  | skills | `esme.<grupo>.<nombre>` | skills, con `remote` fijado por commit y `arbolSha256`; `scripts` = `tieneScripts` |
  | herramientas | `esme.mcp.<slug>` | tools, `mcp` remoto con `net:fetch` a su host, o `npx -y <paquete>@<versión>` con `proc:spawn: [npx]` |
  | tareas del Taller | `esme.casa.tarea-<id>` | tasks |
  | motores ACP | `esme.casa.motor-<id>` | engines, más `proc:spawn` con sus binarios |
  | espejo del registro ACP | `esme.acp.<id>` | engines, informativo: nada que lanzar |

  Las versiones numéricas pasan a `<n>.0.0`. Las que no traen versión son `0.0.0`, con `source.commit` cuando lo hay. `source.from` dice la lista (`app:pieles-casa`, …).

- [ ] **Paso 1: el script de fixtures, y las fixtures.** `npx tsx scripts/paquetes/fixtures-app.ts <app>` importa `PIELES_CASA`, `PIELES_TIENDA`, `PLANTILLAS_CASA` y `MOTORES_ACP`, y lee los tres JSON y el literal `ESPEJO` de `catalogo-registry.ts` (desde `= [` hasta la primera línea `]`). Escribe cada lista como `{ fuente: { repo: "Shiuglen/esme", commit, fichero }, datos }`, sin fechas, para que dos pasadas sobre el mismo commit den los mismos bytes. Se ejecuta sobre la app en `bdb809f` y se commitea lo que sale.
- [ ] **Paso 2: las pruebas que fallan.**
  - Cada elemento de cada fixture da exactamente un paquete, `fuera` está vacío y cada paquete pasa `validaPaqueteDatos`.
  - Los ids son únicos entre todas las listas, con una sola excepción: los productos de tipo piel dan los mismos paquetes, byte a byte, que `PIELES_TIENDA`. Las dos listas son una sola verdad.
  - «Boreal» de casa y `boreal` de la Tienda dan ids distintos.
  - Cada `piel.json` de casa y de la Tienda es el objeto de la app, sin cambios.
  - Un producto de tipo `app` sintético va a `fuera` con motivo.
  - Un elemento roto (sin `id` o sin `nombre`) va a `fuera`, no lanza.
- [ ] **Paso 3:** la prueba falla.
- [ ] **Paso 4:** implementar los adaptadores.
- [ ] **Paso 5:** en verde.
- [ ] **Paso 6:** commit: «Las siete listas de hoy salen como paquetes: pieles, productos, skills, herramientas, tareas y motores, sin cambiar ni una».

### Task 5: plantillas, resolver y lock

**Ficheros:**
- Crear: `core/paquetes/resolver.ts`
- Completar: `core/paquetes/lock.ts`
- Probar: `tests/paquete-resolver.test.ts`

**Interfaces:**
- Consume: `ManifiestoV2` (Tarea 2); `cumple` y `unePermisos` / `permisosNuevos` (Tarea 1).
- Produce:
  - `interface PaqueteConocido { manifiesto: ManifiestoV2; sha256: string }`
  - `interface Resolucion { ok: boolean; errores: string[]; paquetes: PaqueteConocido[]; permisos: Permiso[]; lock: Lock | null }`. Los paquetes van en orden topológico, primero las dependencias, sin la raíz.
  - `resuelve(raiz: ManifiestoV2, conocidos: PaqueteConocido[], opts?: { sha256Raiz?: string }): Resolucion`
  - `CLAVES_LOCK = ["lock_version", "raiz", "paquetes", "permisos"]` y `CLAVES_ENTRADA_LOCK = ["id", "version", "sha256", "permisos"]`
  - `interface Lock { lock_version: 1; raiz: { id: string; version: string; sha256?: string }; paquetes: { id: string; version: string; sha256: string; permisos: Permiso[] }[]; permisos: Permiso[] }`
  - `escribeLock(ruta: string, lock: Lock): void`: JSON con dos espacios, paquetes por id y un salto de línea final.
  - `leeLock(ruta: string): Lock | null`: un lock roto o ausente da null, que equivale a «nada consentido».
  - `interface CambiosLock { nuevos: string[]; quitados: string[]; huellas: { id: string; antes: string; despues: string }[]; permisosNuevos: Permiso[]; pideConsentimiento: boolean }`
  - `cambiosDesde(antes: Lock | null, ahora: Lock): CambiosLock`. Pide consentimiento si hay algo nuevo, una huella cambiada o un permiso nuevo. Quitar no lo pide.

- [ ] **Paso 1: las pruebas que fallan** (paquetes sintéticos, huellas `"a".repeat(64)` y similares).
  - El diamante resuelve, con D una sola vez y antes que B y C (Foco 4).
  - D 1.0.0 frente a D 2.0.0: error «viene en dos versiones a la vez», con quién pide cada una.
  - A → B → A: error «ciclo: esme.t.a → esme.t.b → esme.t.a». Una plantilla que se usa a sí misma también.
  - Una huella que no tiene ninguna versión conocida: error con los 12 primeros caracteres.
  - Una versión fijada que no cumple su rango: error.
  - Un id desconocido: error.
  - Todos los errores se juntan en una sola pasada.
  - `permisos` es la unión de la raíz y de todo lo resuelto.
  - El lock hace ida y vuelta por disco; un fichero roto da null.
  - `cambiosDesde(null, l)` pide consentimiento.
  - Cambiar solo la huella de D, con los mismos permisos, pide consentimiento, y `huellas` nombra a D (Foco 3).
  - Quitar C no lo pide.
  - Añadir un host nuevo lo pide, con ese host en `permisosNuevos`.
- [ ] **Paso 2:** la prueba falla.
- [ ] **Paso 3:** implementar. Búsqueda en profundidad con la pila del camino, para ver ciclos, y un mapa id → `{ sha256, version, por }`, para ver choques. El orden es post-orden.
- [ ] **Paso 4:** en verde, y la conformidad también.
- [ ] **Paso 5:** commit: «Las plantillas se resuelven: una versión por paquete, sin ciclos, y si cambia una huella se vuelve a pedir permiso».

### Task 6: importar de otros ecosistemas

**Ficheros:**
- Crear: `tienda/importa-skill.ts`, `tienda/importa-claude.ts`, `tienda/importa-mcp.ts`, `tienda/importa-goose.ts`
- Crear fixtures sintéticas (escritas aquí, no copiadas): `tests/fixtures/importar/plugin-claude/` (`.claude-plugin/plugin.json`, `skills/repasar/SKILL.md`, `commands/resumen.md`, `agents/revisor.md`, `hooks/hooks.json`, `.mcp.json`, `LICENSE`), `tests/fixtures/importar/marketplace.json`, `tests/fixtures/importar/receta-goose.yaml`, `tests/fixtures/importar/server.json`, `tests/fixtures/importar/skill-suelta/`
- Probar: `tests/paquete-importar.test.ts`

**Interfaces:**
- Consume: `PaqueteDatos` y `validaPaqueteDatos` (Tarea 2); `slug` y `herramientaMcp` (Tarea 4); `leerSkillMd` y `cabeceraDe` de `tienda/skill-md.ts`.
- Produce:
  - `type Importe = { ok: true; paquete: PaqueteDatos; avisos: string[]; descartado: { que: string; motivo: string }[] } | { ok: false; errores: string[] }`
  - `importaCarpetaSkill(dir, opts?: { autor?: string; licencia?: string }): Importe`
  - `importaPluginClaude(dir, opts?): Importe`
  - `importaMarketplaceClaude(ruta): { importados: Importe[]; pendientes: { nombre: string; motivo: string }[] }`
  - `importaServidorMcp(json: unknown): Importe`
  - `importaRecetaGoose(ruta, opts?): Importe`
- Reglas: la licencia sale del manifiesto, del `license` de la cabecera, de la primera línea de `LICENSE` («MIT License», o «Apache License» con «Version 2.0») o de `opts.licencia`. Si no sale de ningún sitio o no está en `LICENCIAS_PAQUETE`, el importe es un error, salvo en un `server.json`: ahí el paquete son datos generados y es MIT, con aviso. `${CLAUDE_PLUGIN_ROOT}` pasa a `${ESME_PAQUETE}`, y `${CLAUDE_PLUGIN_DATA}` a `${ESME_DATOS}`.
- Lo que se descarta, siempre con su motivo:

  | componente | motivo |
  |---|---|
  | hooks | un hook corre código en cada paso sin pasar por los permisos |
  | bin/ | pone programas en el PATH sin pedir permiso |
  | monitors | un proceso que corre siempre; en Esme es una rutina con permisos |
  | userConfig | llega con las llaves de Esme, en la Fase 2 |
  | lspServers, outputStyles, themes de terminal, workflows y settings | sin punto en Esme todavía |
  | dependencies | no traen huella: se instalan aparte y se fijan al resolver |
  | en goose: settings, activities, sub_recipes y `retry.checks` | el motor lo eligen Esme y la persona; las sugerencias son de su interfaz; una sub-receta por ruta no trae huella; un check de shell es código |

- [ ] **Paso 1: las pruebas que fallan.**
  - El plugin de prueba sale como un paquete válido con:
    - `skills: [repasar]`;
    - `tasks` y `commands: [resumen]`;
    - `agents: [revisor]` en formato `claude-md`;
    - `tools` desde `.mcp.json`, con `${ESME_PAQUETE}` en `args`;
    - el `proc:spawn` que lo cubre;
    - `hooks` en `descartado`;
    - `source.from = "claude-plugin"`.
  - Sin licencia ni `LICENSE`, el importe es un error; con `--licencia MIT`, vale.
  - El marketplace importa la entrada relativa. La entrada `github` queda en `pendientes` («fuente remota: se trae al instalar, fijada por su sha»).
  - La receta de goose sale como un paquete con:
    - una tarea cuyo `prompt` junta `instructions` y `prompt`;
    - las `inputs` de `parameters`;
    - una herramienta `stdio`, con `proc:spawn` sobre su `cmd`, y otra `streamable_http`, con `net:fetch` sobre su host;
    - la `builtin` descartada;
    - `success.check = "schemas/respuesta.json"`, con el esquema dentro.
  - El `server.json` con `remotes` y `packages` da una sola herramienta, la remota, y el paquete npm queda descartado como «otra forma de llegar al mismo servidor».
  - La skill suelta sale con `path: "."`, y `scripts: true` si trae `scripts/`.
  - Todos pasan `validaPaqueteDatos`.
- [ ] **Paso 2:** la prueba falla.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** en verde.
- [ ] **Paso 5:** commit: «Esme lee los paquetes de otros: plugins de Claude Code, skills, servidores MCP y recetas de goose (sin hooks)».

### Task 7: la CLI, los scripts y el documento

**Ficheros:**
- Crear: `scripts/paquete.ts`, `docs/PAQUETES.md`
- Modificar: `package.json`. Solo dos scripts nuevos: `"paquete": "tsx scripts/paquete.ts"` y `"paquetes:fixtures": "tsx scripts/paquetes/fixtures-app.ts"`.
- Probar: `tests/paquete-cli.test.ts`

**Interfaces:**
- Consume: todo lo anterior.
- Produce: `cli(argv: string[]): { code: number; lineas: string[] }`, con la misma guarda de `scripts/mind-cli.ts` para ejecutarse sola. Verbos:
  - `<carpeta>`: qué aporta (punto, id y dónde corre), qué pide, su nivel y sus avisos.
  - `importar <skill|claude|marketplace|mcp|goose> <ruta> [--salida <carpeta>] [--licencia <spdx>]`
  - `resolver <plantilla> --en <carpeta de paquetes> [--lock <ruta>] [--aceptar]`. Escribe el lock solo con `--aceptar`, que es el sí de la persona.

- [ ] **Paso 1: las pruebas que fallan.**
  - `cli([dir de hola-mundo])` da `code` 0, y sus líneas incluyen `tools`, `sesión`, `mind:read` y `nivel 2`.
  - `cli(["importar", "claude", <plugin>, "--salida", tmp])` escribe una carpeta que `leePaqueteDeCarpeta` da por buena.
  - `resolver` sin `--aceptar` no escribe el lock y dice «pide tu permiso»; con `--aceptar` lo escribe.
  - Un verbo desconocido da `code` 2 y el uso.
- [ ] **Paso 2:** la prueba falla.
- [ ] **Paso 3:** implementar la CLI, y escribir `docs/PAQUETES.md`: qué es un paquete, los doce puntos, plantillas, permisos con alcance, niveles, resolver y lock, adaptadores, importadores y lo que se descarta, y lo que no entra en la Fase 1.
- [ ] **Paso 4:** en verde.
- [ ] **Paso 5:** commit: «npm run paquete: qué aporta, qué pide y dónde corre, y de dónde se importa».

### Task 8: verificación y PR

- [ ] `npm run build:modulos`, `npx vitest run`, `npx tsc --noEmit` y `npx tsx scripts/spec-lint.ts`. Se espera lo mismo que en `main` más las pruebas nuevas en verde. Los dos fallos que ya había en `main` en este contenedor (`empaque.test.ts`, la huella firmada de hola-mundo; `consumidor-remoto.test.ts`, la estirpe de la raíz) se dicen como lo que son.
- [ ] Una revisión fresca de la rama entera.
- [ ] Push de `claude/paquetes-fase1`, PR en borrador y suscripción.

---

## Autorrevisión

- **Cobertura de la spec.** La mitad B de la doc pide cinco cosas:
  - manifiesto v2: Tarea 2;
  - manifiesto, resolver y lock: Tareas 2 y 5;
  - adaptadores por lista: Tarea 4;
  - `npm run paquete`: Tarea 7;
  - las pruebas «cada elemento de las siete listas es válido», «ciclos y choques se rechazan, una huella cambiada vuelve a pedir permiso» y «la v1 sigue pasando el spec-lint»: Tareas 4, 5, 2 y 3.

  Los importadores (Tarea 6) son el «escala un poco más» de jin. La doc decía `module-manifest.spec.yaml` versión 2; la regla 0 lo impide, así que la v2 vive en `paquete.spec.yaml` y la doc se corrige.
- **Tipos coherentes.** `PaqueteDatos`, `LecturaPaquete`, `PaqueteConocido`, `Lock` y `Adaptados` se definen una vez y se nombran igual en cada Interfaces.
- **Proporción.** El plan fija nombres, formas, valores y pruebas. Los cuerpos los escribe quien implementa.
