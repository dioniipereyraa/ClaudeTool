# Security — Exportal

Exportal maneja datos potencialmente sensibles: historiales de conversación con Claude que pueden contener credenciales, código propietario, paths internos y PII. Este documento describe el modelo de amenazas y los controles implementados.

## Modelo de amenazas

| Activo | Amenaza | Control |
|---|---|---|
| API keys / tokens leídos por tools durante la sesión | Export pegado en claude.ai o committeado a un repo público | Detector de secretos por regex (Anthropic `sk-ant-`, OpenAI `sk-`, GitHub PAT, AWS, genérico) — redacción activa por defecto |
| Paths absolutos del sistema (`C:\Users\...`, `/home/...`) | Revela estructura interna, leve doxxing | Reemplazo por placeholders (`<HOME>`, `<CWD>`) |
| PII (emails, nombres) | Fuga involuntaria | Regex + flag `--redact-pii` |
| Código propietario o `.env` leídos por tool `Read` | Fuga de IP / credenciales | Exclusión configurable por patrón de archivo |
| Export quedando en disco con permisos laxos | Lectura por otro proceso local | Escritura con permisos restrictivos cuando la plataforma lo permite + aviso explícito + `*.export.md` en `.gitignore` |
| Path traversal en input del CLI | Leer archivos fuera de `~/.claude` | Sanitización + allow-list de directorios raíz |
| Transmisión de datos | Fuga por red | Fase 1 es **zero-network por diseño**. La herramienta no hace HTTP |

## Principios

- **Fail-closed**: redacción activa por defecto. Para desactivarla hay que pasar `--no-redact` y confirmar interactivamente.
- **Preview antes de escribir**: el usuario ve en stdout lo que se va a guardar antes de que toque el disco.
- **Reporte post-export**: al finalizar, resumen de qué se redactó (tipo y conteo, nunca contenido).
- **Defensa en profundidad**: los regex tienen falsos negativos por diseño — no son la única línea; la preview obligatoria y la confirmación explícita las complementan.

## Reportar vulnerabilidades

Este es un proyecto personal de portafolio. Si encontrás una vulnerabilidad, abrí un issue privado en el repo o contactá al autor.

## Alcance explícito (out of scope)

- Cifrado del export en disco.
- Sincronización automática por red.
- Auditoría forense del historial.
