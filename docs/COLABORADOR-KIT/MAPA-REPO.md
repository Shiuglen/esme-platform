# Mapa del repo — el runtime de la mente local

```
esme/
├── README.md                     # el manifiesto de la era abierto
├── docs/
│   ├── ARQUITECTURA.md           # LAS 14 DECISIONES — léelo primero
│   ├── ESME.md                   # fuente de verdad del producto
│   ├── PRUEBA-0.md               # el examen que regula todo
│   ├── LAYA.md                   # motor de decisiones del núcleo
│   ├── TIENDA.md                 # distribución firmada, sin peajes
│   ├── ENTRADA.md                # la puerta de entrada: crea y publica un módulo
│   ├── MOTORES.md                # los motores: la misma mente, muchos cerebros
│   ├── PIELES.md                 # las pieles: el tema es un documento, y hay juez
│   ├── PUNTOS.md                 # los puntos: el estado de tu PC, medido
│   ├── SYNC.md                   # mente portable (.mind) y sync criptográfico
│   ├── REA.md                    # los ojos de la mente: mirar dentro de un programa
│   └── COLABORADOR-KIT/          # ENTRY: COLABORADORES.md, ADRs, runbook
├── estandar/                     # las specs abiertas (versionadas)
│   ├── module-manifest.spec.yaml
│   ├── motor-capability.spec.yaml
│   ├── rea.spec.yaml             # la evidencia de REA y su catálogo
│   └── mind-format.spec.yaml     # a redactar (ARQUITECTURA §7 tiene el extracto)
├── modulos/
│   ├── ejemplo-hola-mundo/       # el módulo vivo de referencia
│   └── nucleo/                   # módulos del core (MIT, sí entran)
├── tienda/index.json             # índice público firmado
├── core/                         # MIT: mente, Tálamo, extension host, IPC
│   ├── extension-host/           # la cápsula, la puerta y los programas (proc)
│   ├── rea/                      # la evidencia, el catálogo y el conocimiento
│   └── modulos/                  # el registro, los permisos y el libro de programas
├── motores/                      # proveedor es: claude-code, opencode, gemini, shell…
├── apps/desktop/                 # ESME-CL: la ventana, Tinta y Luz, el Taller
├── tests/                        # INCLUDING test:offline (garantía de independencia)
└── .github/workflows/            # ci.yml, release.yml, spec-lint.yml, offline.yml
```

Dos reglas de lectura que no son evidentes:

- **El núcleo no arrastra dependencias.** zod entra sólo en los ficheros de
  contrato (los validadores de forma). La lista exacta está en
  `tests/consumible.test.ts`, y es una lista, no un criterio.
- **Ningún fichero del núcleo está sin prueba.** Lo comprueba
  `scripts/estandar/alcance.ts` (y `npm run spec:lint`): se recorre el grafo
  de imports desde `tests/` y los que quedan fuera se dicen con su nombre.

Regla de lectura: si algo contradice a `docs/ESME.md`, gana `docs/ESME.md`; si
contradice a `docs/ARQUITECTURA.md` sobre plataformas, gana `ARQUITECTURA.md`.
Los conflictos se anotan en el fichero ganador, nunca se esconden.
