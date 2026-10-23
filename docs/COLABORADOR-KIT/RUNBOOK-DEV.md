# Runbook de desarrollo

## Cómo se publica una versión del kit

La era abierta no es «el creador publica»: es **cualquiera publica**. El
procedimiento está escrito para que no dependa de que nadie recuerde el
orden.

```bash
npm run release:check     # el pre-vuelo: dice lo que falta (ver más abajo)
git tag v0.2.0 && git push --tags   # y el workflow hace el resto
```

### Antes de etiquetar: la llave de release tiene que estar avalada

El workflow firma con `ESME_RELEASE_KEY_PEM` (un secret de GitHub, el PEM
nunca vive en el repo ni en esta máquina). Pero una llave que la estirpe no
avala no firma: el paso 3 de la release se cae a propósito. La primera vez,
el derecho se otorga **por delegación** (no hace falta rotar la dev key):

```bash
# 1. genera el par FUERA de la máquina (la privada es sagrada: va al secret)
openssl genpkey -algorithm ed25519 -out esme-release.pem
openssl pkey -in esme-release.pem -pubout -out esme-release.pub.pem

# 2. la llave viva de la casa avala la de release (una vez, queda en el ledger
#    público con su motivo — el cert lleva la pub dentro, nada más que copiar)
npm run delegar -- esme-release.pub.pem \
    --motivo "la primera release: la llave de release firma en la CI"

# 3. el contenido de esme-release.pem va al secret ESME_RELEASE_KEY_PEM
#    y los ficheros locales se destruyen (shred -u esme-release.pem esme-release.pub.pem)
```

El consumidor acepta el índice por la vía «delegada»: la raíz sigue siendo
la raíz, y la delegación se puede revocar con `npm run revocar <huella>`
si la llave de release se compromete.

Qué comprueba el pre-vuelo (todo lo que se puede comprobar SIN la llave de
release, que nunca vive en el repo):

| # | Comprobación | Por qué |
|---|---|---|
| 1 | **la versión ha subido** | publicar un número repetido no es publicar |
| 2 | **tipos, pruebas y specs en verde** | nada entra sin pasar |
| 3 | **el paquete compila y lleva lo nuevo** | el contrato nuevo, la puerta nueva, su spec y su documento |
| 4 | **la tienda verifica** (índice y artefactos) | no se publica una tienda rota |

Y lo que hace el workflow (`.github/workflows/release.yml`), que es lo único
que necesita la llave:

1. vuelve a pasar la calidad (por si acaso);
2. construye los módulos de ejemplo;
3. **firma el índice** con la llave de release — y si esa llave no está en la
   estirpe de la raíz congelada, **la release no sale** (publicar sin derecho
   no es publicar; el workflow dice por qué);
4. verifica la tienda firmada con la raíz congelada;
5. arma el tarball (`npm pack`) y publica la release en GitHub;
6. avisa al canal.

Lo que **no** se hace: publicar sin la llave, publicar un número sin
subirlo, publicar con los tests en rojo, ni tocar el índice firmado sin volver
a firmarlo (si cambian sus bytes, su firma deja de valer).

## Comandos del kit (este repo)

| Comando | Qué corre |
|---|---|
| `npm ci` | deps del kit |
| `npm test` | la batería completa (el número lo dice al terminar) |
| `npm run lint` | `tsc --noEmit`: los tipos no mienten |
| `npm run spec:lint` | cada `module.yaml` contra su spec, la spec contra el código, y ningún fichero del núcleo sin prueba |
| `npm run test:offline` | la garantía: funciona sin red |
| `npm run bench` | mide (Prueba 0 + ciclo), empaqueta, firma y publica |
| `npm run tienda` | bench + verificar: la tienda se comprueba |
| `npm run panel` | el panel de la tienda, en markdown (con lo que pide cada módulo) |
| `npm run tienda:permisos` | declara en el índice lo que pide cada módulo, y lo vuelve a firmar |
| `npm run release:check` | el pre-vuelo de una publicación: qué falta antes de etiquetar |
| `npm run firma:index` | firma el índice y lo verifica (en un paso) |
| `npm run rotar` | certifica una llave nueva: la vieja atestigua, la nueva firma |
| `npm run delegar -- <pub.pem>` | da derecho a publicar a otra llave (la tienda federada) |
| `npm run skills:juzgar -- --medir` | el juez de las skills, con medición real |
| `npm run mind -- <verbo>` | la mente portable (`absorber`, `exportar`, `zip`, `rumbo`…) |
| `npm run instalar` | instala un módulo de la tienda (verifica antes) |
| `npm run verificar` | la tienda se verifica: índice y artefactos, byte a byte |
| `npm run build:ejemplo` | construye los módulos de ejemplo (los flags son uno solo) |
| `npm run build:modulos` | construye TODOS los módulos, incluidos los que llegan de fuera |
| `npm run crear:modulo -- --id esme.tu.mi-modulo --nombre "Mi módulo"` | la puerta de entrada: nace un módulo entero y juzgado |
| `npm run verificar:modulo -- <carpeta>` | lo construye, lo mide de verdad y lo juzga |
| `npm run publicar:modulo -- <carpeta>` | lo publica en el índice firmado (vuelve a juzgarlo antes) |
| `npm run puntos` | el estado de tu PC, medido: un punto por agente, con su RAM |
| `npm run talamo` | el contexto en tres modos, el ahorro MEDIDO y el plan de compactación |
| `npm run tienda:busca -- busca <texto>` | lo que hay en la tienda, ordenado por lo que mejora |
| `npm run turno -- <turno.json>` | la limpieza del chat, en un número (listón 60 %) |
| `npm run equipo -- <equipo.json>` | juzga el equipo y dice el reparto de su presupuesto |
| `npm run bot:check -- <bot.json>` | juzga un bot: la puerta, los permisos y el techo |
| `npm run router -- <registro.jsonl>` | lo que el router aprendió de tus veredictos, y la concordancia |
| `npm run router -- <registro.jsonl> --arenas <catas.jsonl> --tarea "..."` | lo mismo, con el paladar de las catas, y qué motor saldría para esa tarea |
| `npm run deseos -- <deseos.json>` | la lista de deseos de la tienda, y lo que pide la gente |
| `npm run publicar:deseos` | firma la lista de deseos (la demanda, con su firma) |
| `npm run publicar:recursos` | firma el catálogo de piezas (la oferta) y muestra el emparejamiento |
| `npm run doctor` | cómo está esta máquina: módulos, permisos, tienda y memoria |
| `npm run modulos -- actualiza` | el plan de actualización (con `--sí`, se aplica) |
| `npm run programas -- lista` | qué programas se pueden lanzar en esta casa (la puerta `proc:spawn`) |
| `npm run programas -- concede rea --desc "…"` | la persona dice qué se puede lanzar |
| `npm run prueba0:rea -- <programa>` | la mente con ojos, medida: REA mira, la mente aprende, y se pregunta |
| `npm run rea -- catalogo` | qué sabe hacer REA en esta máquina, y qué capacidad pide cada operación |
| `npm run rea -- analiza <ruta>` | REA mira dentro de un programa y escribe la evidencia |
| `npm run verificar:skill -- <carpeta>` | juzga una skill en local (hechos, norecall) |
| `npm run arena -- cata --tarea "..." --modulo <dir> --modulo <dir>` | la cata a ciegas: mide, reparte y deja el documento ciego con su compromiso |
| `npm run arena -- revelar --ciega <f> --clave <f> --elige A` | revela el mapa y comprueba que el compromiso sigue verificando |
| `npm run arena -- paladar <f>...` | lo que la cata enseñó por categoría (con el número de catas al lado) |
| `npm run arena -- revelar --ciega <f> --clave <f> --elige A --archivo <catas.jsonl>` | revela, comprueba el compromiso y archiva la cata (una por línea) |
| `npm run cambios -- <antes> <despues>` | qué cambió entre dos versiones (Myers, con tope) |
| `npm run ejecutar -- <módulo> "<consulta>"` | ejecuta un turno de verdad y lo mide |
| `npm run puertas` | todas las puertas de la casa, en una carrera (lo que corre la CI) |
| `npm run piel:check -- <piel.json>` | juzga una piel (opciones cerradas y que se lea) |
| `npm run agente:check -- <agente.json>` | juzga una receta de agente (motor real y presupuesto con techo) |
| `npm run compat -- <carpeta>` | qué motores pueden alojar ese módulo, y por qué no los otros |

## Comandos de la app (el otro repo)

| Comando | Qué corre |
|---|---|
| `pnpm install` | deps del workspace (app Electron + módulos) |
| `pnpm dev` | modo ventana (Electron vivo, caliente) |
| `pnpm dev:web` | la misma casa en navegador (sandbox ligero) |
| `pnpm build` | build producción |
| `pnpm test` | unit + integración |
| `pnpm test:offline` | desconecta red/las llamadas y demuestra autonomía |
| `pnpm prueba0` | banco local de la Prueba 0 |
| `pnpm prueba0 --delta` | comparar antes/después en este cambio |
| `pnpm spec:lint` | valida specs en `estandar/` + `module.yaml` |
| `pnpm sync:server` | corre el servidor de sync ligero (solo backup/restauro/share) |

## Al arrancar

- Sepa la frontera si entra: `core/`, `motores/`, `modulos/nucleo/`, `estandar/` = MIT.
  `apps/desktop/` = ESME-CL.
- La mente (EmbeddingGemma-300M int8, ONNX) corre en el proceso del cerebro,
  CPU con la mitad de los núcleos, no en Ollama (se dividió el 12-oct).
- Reposo = cero trabajo: nada de bucles ni animaciones sin motivo (regla
  «casi no consumir»).

## Depurar

- Log del cerebro: `scripts/` (a empedrar vida con un PR).
- Las cifras del estado en cada paso están en `docs/ESME.md` (requiere consulta).
- Los límites de: no hay dos iguales en la estética — no toques tokens sin ADR.

## El flujo del taller (esencial para quienes corren los agentes)

- Cada cambio en el repo vivo dentro de `taller/copias/<id>/`.
- Al aplicar la revisión: (a) aplicación a la carpeta madre, (b) guardar en su rama,
  (c) crear un proyecto. Con deshacer.
- Veredictos del motor alimentan al router (niveles + Laya).
