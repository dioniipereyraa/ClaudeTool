# Security — Exportal

Exportal maneja datos potencialmente sensibles: historiales de conversación con Claude que pueden contener credenciales, código propietario, paths internos y PII. Este documento describe el modelo de amenazas y los controles implementados.

## Modelo de amenazas

| Activo | Amenaza | Control |
|---|---|---|
| API keys / tokens leídos por tools durante la sesión | Export pegado en claude.ai o committeado a un repo público | Detector de secretos por regex (Anthropic, OpenAI incl. service-account/admin, Google, Stripe, Slack incl. app, GitHub classic + fine, AWS access + STS, NPM, DigitalOcean, Twilio, Mailgun, SendGrid, Discord bot, MongoDB Atlas URI, PEM private keys). Redacción activa por defecto |
| Paths absolutos del sistema | Revela estructura interna, leve doxxing | Reemplazo por placeholder `<PATH>`. Cubre Windows drives, UNC `\\server\share`, `/home`, `/Users`, `/var`, `/etc`, `/opt`, `/srv`, `/mnt`, `/tmp`, `/root`, `/private`, `/Volumes`, `file://` URIs, `~/` |
| PII (email, IPv4, IPv6) | Fuga involuntaria | Opt-in via `--redact-pii` flag en CLI. Cobertura limitada a formatos de bajo FP (email, IP). Nombres y telefonos quedan fuera de scope (precisión insuficiente con regex) |
| Código propietario o `.env` leídos por tool `Read` durante la sesion | Fuga de IP / credenciales | Sin filtro automático: el contenido leído por las herramientas forma parte de la conversación y queda en el export. Mitigación: el detector de secretos cubre los patrones comunes en `.env`. El usuario debe revisar el preview antes de compartir |
| Bridge HTTP local accedido por proceso hostil | Otro proceso del usuario invoca el bridge | Bind a 127.0.0.1 + Bearer token de 256 bits (`timingSafeEqual`) + Origin header restringido a `chrome-extension://*` + rate limiting per-endpoint con sliding 60s window + Slowloris timeouts (5s/30s) + body cap (64 KB / 50 MB) |
| ZIP gigante crashea el extension host | Local DoS | Cap de 100 MB en file-picker + 50 MB en auto-discovery |
| Filename hostil (path traversal, RTL spoof, Windows reserved) | Escape del workspace | `sanitizeAssetFilename`: rechaza null bytes, drive letters, `..` y `.` segments, U+202A-E + U+2066-9 (bidi override), U+FEFF (BOM), CON/PRN/AUX/NUL/COM[1-9]/LPT[1-9] (Windows reserved). Path final via `vscode.Uri.joinPath`, no concat |
| Webview compromise invoca comandos de VS Code arbitrarios | RCE via `workbench.action.terminal.sendSequence` | Whitelist de comandos en `runCommand` handler. Solo `exportal.import*` / `exportal.send*` se aceptan |
| URL `javascript:` / `data:` en citaciones | Render malicioso al compartir el `.md` | `safeMarkdownLink` / `safeAutoLink` / `safeUrlForFootnote`: whitelist `http:`, `https:`, `mailto:`. Esquemas no seguros se renderean como código inline |
| ANSI escape codes en stdout del CLI | Terminal injection (window-title spoof, OSC 52 clipboard) | `stripTerminalControl` filtra C0/C1 control chars antes de stdout. El path con `--out` preserva los datos para inspección |
| Path traversal en `--project` del CLI | Listar directorios arriba de `~/.claude/projects/` | `assertSafeProjectName` rechaza `..`, separadores de path, null bytes, strings vacíos |
| Transmisión de datos por red | Telemetría / fuga | **Zero-network por diseño**. Cero fetch a third-party desde el extension/CLI. Bridge solo en localhost. Content scripts solo same-origin a claude.ai/chatgpt.com (host APIs del propio sitio) |

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
