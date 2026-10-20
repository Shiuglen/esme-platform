# Kit de entrada para colaboradores

## Tu primer PR en 10 minutos

```bash
git clone <este-repo> && cd esme
pnpm install
module_template() {          # scripts/create-modulo (a construir; tu primer PR puede ser este)
  pnpm create:modulo mi-modulo
}
pnpm spec:lint               # valida tu module.yaml contra estandar/
pnpm test:offline            # la prueba de no-dependencia
```

Un módulo mínimo es cuatro ficheros:

```
modulos/mi-modulo/
├── module.yaml        # copia estandar/module-manifest.spec.yaml y pon tus datos
├── package.json       # build del módulo
├── src/index.ts       # registra un MindMethod (recall/inject) mínimo
└── test/index.test.ts # mide con la Prueba 0: +0,01 recall o -10% tokens
```

Después: PR → `spec-lint` + `security-scan` → firma minisign → entra al
`tienda/index.json`.

## Reglas del core (leído rápido)

1. **No tocar la identidad visual.** Tinta y Luz tiene tokens inmutables.
2. **No inferencia en servidor.** El servidor solo sync criptográfico — la app
   se demuestra 100% funcional offline en CI (`pnpm test:offline`).
3. **Todo pasó por la Prueba 0.** Si tu módulo no mejora el recall o los tokens,
   no queda de la era publicada (`pnpm prueba0 --delta`).
4. **Sin estado es global:** Laya opina, no ejecuta ni aprende (ver docs/LAYA.md).
5. **La estética no decidida por consenso** (System Two): System One solo rutea.

## ADRs (Decision Architecture Records)

Cada decisión de plataforma importante acaba en
`docs/COLABORADOR-KIT/DECISION-ADR/NNN-<título>.md` — las 14 decisiones mère van
en `docs/ARQUITECTURA.md`; cuando una se contradice, ganada aquel fichero como
fuente de verdad de producto, `docs/ESME.md`.
