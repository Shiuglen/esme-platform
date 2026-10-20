# La tienda — NPM y App Store juntos, sin peajes

> Especificación de referencia: `docs/ARQUITECTURA.md` §4 y
> `estandar/module-manifest.spec.yaml`.

## Qué es

En `tienda/` vive el **índice público de módulos** (`index.json`), firmado con
minisign. La tienda distribuye: MCP del mundo, plugins, skills, modelos locales
(«¿cabe en tu PC?»), temas y bichitos.

## Flujo (safe-by-default)

```
build → scan → firma (minisign) → PR a tienda/index.json → instalación verificada
```

1. **Validador** (`modulos/nucleo/manifest-validator.ts`): Zod + verificación de
   firma. Rechaza si `category` está fuera del enum, si se pide un permiso no
   declarado, o si `entry` no existe tras el build.
2. **Scan de seguridad:** syft + grype sobre el artifact (CI); semgrep en el source.
3. **Firma:** el autor firma su artifact con su clave minisign; el índice se firma
   con la clave de release. Los binarios del core llevan `pubkey.minisign` fijo.
4. **Revisión:** PR con 2 approvals (1 bot + 1 humano), o 1 maintainer para
   actualizaciones de un módulo ya publicado.

## Instalación

Solo se instala un módulo si: `module.yaml` pasa el validador, la firma se verifica
y el hash coincide. Los permisos (`mind:read`, `mind:write`, `net:fetch`,
`fs:project`, `ui:render`, `ipc:emit`) piden consentimiento interactivo la primera
vez, con el modal de Tinta y Luz.

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

Pendiente ahora:
- [ ] Primera firma del índice con `esme.hola-mundo@0.1.0`
