# Exportal — Roadmap

Ideas y hitos futuros. Vivo, se actualiza cada vez que surge algo nuevo.
Items concretos y cerrados se mueven al `DEVLOG.md`. Releases formales al
`CHANGELOG.md`. Este archivo es solo la cola de lo pendiente.

## Near-term

- [ ] Verificar el flujo de instalación en una máquina limpia (vsix +
  zip del companion desde releases, emparejar, probar ambos sentidos).

## Medium-term (distribución)

### Hito 13 — Publicación al Chrome Web Store
- Requisitos: cuenta de developer (US$5 one-time), review process
  (~días), justificación de permisos `downloads` + `host_permissions`.
- **Por qué**: "Load unpacked" exige modo desarrollador activado en
  Chrome. CWS es un click install, más creíble para terceros.
- Orden sugerido: después del Marketplace — el flujo más fricción
  (pago + review) espera a tener el camino de VS Code sólido.

## Medium-term (soporte multi-IA)

### Hito 20 — Abstracción del core para múltiples proveedores
- **Por qué primero**: hoy `importers/` y los tipos de dominio asumen
  claude.ai. Agregar otro proveedor sin abstraer duplica lógica y
  acumula deuda rápido.
- Scope: definir `ExportedConversation` como union type
  (claude/chatgpt/gemini) con metadata común, refactorizar
  `formatters/` para consumir la union en vez del tipo específico.
- **Risk**: cada proveedor tiene shape distinto para tool use,
  multimedia, branching. La abstracción puede filtrarse y terminar
  siendo menos útil que hacer formatters por proveedor. Decidir al
  empezar el primer import no-claude.

### Hito 21 — Import de ChatGPT
- Camino oficial: Settings → Data controls → Export → ZIP por email
  con `conversations.json`. Formato semi-documentado; tool use
  (code interpreter, browsing) requiere parsing específico.
- Camino one-click: extensión de Chrome scrapea la API interna de
  `chat.openai.com`. Mismo patrón que Hito 10e de claude.ai.
- Entrega mínima: reader + schema + formatter, sin one-click (se
  agrega después si hay demanda).

### Hito 22 — Import de Gemini
- Camino oficial: Google Takeout export — ZIP con HTML/JSON por
  conversación. Menos uniforme que ChatGPT.
- Camino one-click: content script en `gemini.google.com`. La API
  interna de Gemini puede cambiar más que la de los otros dos;
  aceptar frágil.
- **Risk**: Gemini tiene menos estabilidad de shape en su API
  interna que los otros dos. Valor real depende de cuánto lo use
  el target de usuarios.

### Hito 23 — Popover multi-IA en el Chrome companion
- Unificar: un único icon + badge, el popover detecta el dominio
  activo (claude.ai / chat.openai.com / gemini.google.com) y muestra
  las acciones relevantes.
- Bloqueado por: Hitos 21 y 22 al menos parcialmente.

## Long-term (features)

### Hito 19 — Import como "chat del historial" (reconstruir .jsonl)
- Idea: en vez de abrir un `.md`, generar un `.jsonl` válido en
  `~/.claude/projects/<cwd-encoded>/` para que la conversación aparezca
  en `/resume` de Claude Code como si fuera un chat local.
- **Why**: UX ideal — el usuario "continúa" la conversación de claude.ai
  en Claude Code sin ningún paso extra.
- **Risks**: el formato `.jsonl` es ingeniería inversa; los `uuid` /
  `parentUuid` tienen reglas de encadenamiento no documentadas; el
  state manager de Claude Code puede rechazar o ensuciarse si mapeamos
  mal algún campo (`cwd`, `sessionId`, `gitBranch`, `toolUseResult`).
- **Bloqueado por**: auditoría a fondo del formato y fixtures reales.
  Vale la pena solo si Hito 18 resulta insuficiente en la práctica.

### Hito 14 — Selector de org para cuentas con múltiples organizaciones
- Estado actual: agarramos `organizations[0]` sin preguntar.
- Impacto: probablemente afecta al 1-5% de usuarios.
- Disparador: primer bug report real. Hasta entonces YAGNI.

### Hito 16 — Soporte para artifacts de claude.ai
- claude.ai embebe artifacts (React components, code snippets
  interactivos, HTML). Hoy el parser los ignora silenciosamente.
- Scope: detectar artifact blocks en la API interna, volcarlos a
  fenced code blocks o links.
- **Why**: conversaciones "ricas" pierden contexto al exportar.

### Hito 17 — Export parcial ("desde mensaje X")
- UI: click derecho en un mensaje de claude.ai → "Exportar desde acá".
- Caso de uso: conversaciones largas donde solo los últimos turnos son
  relevantes para el contexto que se lleva a Claude Code.

### Hito 24 — Internacionalización (i18n)
- Hoy ~40-50 strings hardcodeados en español en ambas extensiones.
- Chrome: `_locales/<lang>/messages.json` + `chrome.i18n.getMessage()`
  en `background.js`, `content-script.js`, `options.html`, `pure.js`.
- VS Code: `package.nls.json` + `package.nls.<lang>.json` para
  strings del manifiesto; `vscode.l10n.t()` para strings en runtime
  (requiere `l10n` field en package.json apuntando a un bundle).
- Alcance inicial: es + en. Otros idiomas solo si hay feedback real.
- **Why**: apunta a audiencia internacional — la extensión en
  Marketplace/CWS con UI en español pierde alcance.
- **Risks**: textos de error y estados del badge (`OK`/`SET`/`AUTH`)
  hay que re-evaluarlos — ¿traducimos, abreviamos en cada idioma, o
  dejamos los códigos iguales? Decisión a tomar al empezar.

## Fuera de scope (explícito)

- **Sync bidireccional automático**: viola el principio zero-network y
  multiplica la superficie de bugs. Si el usuario quiere sync, usa
  ambos entornos a propósito.
- **Telemetría / analytics**: zero-network es un principio, no una
  conveniencia.
- **Cifrado del export en disco**: el SO ya tiene FDE. Duplicar esa
  capa en la app es teatro.
- **Manejo de múltiples cuentas de claude.ai**: el browser ya resuelve
  multi-cuenta con profiles/containers.

## Cómo se actualiza este archivo

- Cada idea nueva → se agrega acá (short-term, medium-term o long-term
  según urgencia).
- Cuando un hito arranca → queda en ROADMAP con estado "en curso" hasta
  que cierre.
- Cuando cierra → entrada completa en `DEVLOG.md` + item tachado acá o
  eliminado (no dejamos "done" viejos — para eso está el DEVLOG).
