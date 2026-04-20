# Exportal — Roadmap

Ideas y hitos futuros. Vivo, se actualiza cada vez que surge algo nuevo.
Items concretos y cerrados se mueven al `DEVLOG.md`. Releases formales al
`CHANGELOG.md`. Este archivo es solo la cola de lo pendiente.

## Near-term (release hygiene)

### Release v0.2.0
- [ ] `git tag v0.2.0 && git push --tags` — el Action de release corre
  solo y adjunta los dos artifacts.
- [ ] Verificar el flujo de instalación en una máquina limpia (vsix
  desde release + zip del companion sideloaded).

## Medium-term (distribución)

### Hito 12 — Publicación al VS Code Marketplace
- Requisitos: cuenta de publisher en Azure DevOps, `vsce publish`.
- **Por qué**: `code --install-extension exportal-*.vsix` funciona pero
  exige descarga manual. Marketplace da auto-update.
- Bloqueado por: decisión del usuario (no urgente hasta tener feedback).

### Hito 13 — Publicación al Chrome Web Store
- Requisitos: cuenta de developer ($5 one-time), review process.
- **Por qué**: "Load unpacked" exige modo desarrollador activado en
  Chrome. CWS es un click install.
- Bloqueado por: validar ToS del store (extensiones que hablan con
  otros sitios pueden requerir justificación extra) + decisión del
  usuario.

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

### Hito 15 — Import reverso (Claude Code → claude.ai)
- Idea: desde VS Code, "Send this session to claude.ai" genera un
  mensaje inicial pegable en un chat nuevo.
- Bloqueo técnico: claude.ai no expone API de *write* para crear
  mensajes. Tendría que ser copy-to-clipboard + instrucción al usuario.
- Valor real: cuestionable vs. simplemente pegar el Markdown manual.
- **Why low priority**: el usuario puede hacerlo a mano en 10s.

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
