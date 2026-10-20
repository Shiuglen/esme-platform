# Sync — la mente te sigue, la nube nunca piensa

> `docs/ARQUITECTURA.md` §6–§7. El servidor hace **solo** sync criptográfico.

## El papel exacto del servidor

| Sí (dumb pipe) | NUNCA |
|---|---|
| backup/restore de `.mind` | inferencia |
| compartido cifrado entre dispositivos (XChaCha20-Poly1305 sobre HKDF de la Vault Key) | embedding |
| métricas anónimas opt-in | recall |
| | hosting de módulos, marketplace transaccional |

**Garantía dura:** la app es 100% funcional offline (`pnpm test:offline` en CI lo
demuestra con la red desconectada: Taller, recall, Tinta y Luz, módulos locales
arrancan sin servidor). Si el servidor cae → 0 impacto. Si el servidor se vuelve
SaaS → el fork toma `sync://localhost`.

## Formato `.mind` (espec abierta, extracto)

Archivo único (ZIP) o directorio:

```
embeddings/      # pesos ONNX + binarios
metadata.json    # schema versionado
cognition.sig    # firma Ed25519 del hash de cognición (detecta corrupción)
crs-delta/       # delta entre versiones (refresh OTA sin re-embedding completo)
redaction-rules.json   # patrones PII, claves API
exclusion-list.json    # paths que NUNCA se exportan:
    /work/**/**, /company/**/**, /*.env*/, /*.pem/, /*.key/
```

Importadores: `core/mind/importers/{obsidian,notion,markdown,json}.ts`.
La spec completa se redactará tras ejecutar el extractor con la Prueba 0
(solventar: comprobación de exclusión de empresa, datos de terceros, calidad de redacción).
