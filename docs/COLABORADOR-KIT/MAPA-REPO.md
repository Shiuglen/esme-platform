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
│   ├── SYNC.md                   # mente portable (.mind) y sync criptográfico
│   └── COLABORADOR-KIT/          # ENTRY: COLABORADORES.md, ADRs, runbook
├── estandar/                     # las specs abiertas (versionadas)
│   ├── module-manifest.spec.yaml
│   ├── motor-capability.spec.yaml
│   └── mind-format.spec.yaml     # a redactar (ARQUITECTURA §7 tiene el extracto)
├── modulos/
│   ├── ejemplo-hola-mundo/       # el módulo vivo de referencia
│   └── nucleo/                   # módulos del core (MIT, sí entran)
├── tienda/index.json             # índice público firmado
├── core/                         # MIT: mente, Tálamo, extension host, IPC
├── motores/                      # proveedor es: claude-code, opencode, gemini, shell…
├── apps/desktop/                 # ESME-CL: la ventana, Tinta y Luz, el Taller
├── tests/                        # INCLUDING test:offline (garantía de independencia)
└── .github/workflows/            # ci.yml, release.yml, spec-lint.yml, offline.yml
```

Regla de lectura: si algo contradice a `docs/ESME.md`, gana `docs/ESME.md`; si
contradice a `docs/ARQUITECTURA.md` sobre plataformas, gana `ARQUITECTURA.md`.
Los conflictos se anotan en el fichero ganador, nunca se esconden.
