# Exportal — Roadmap

Ideas y hitos futuros. Vivo, se actualiza cada vez que surge algo nuevo.
Items concretos y cerrados se mueven al `DEVLOG.md`. Releases formales al
`CHANGELOG.md`. Este archivo es solo la cola de lo pendiente.

## Near-term

- [ ] Verificar el flujo de instalación en una máquina limpia (vsix +
  zip del companion desde releases, emparejar, probar ambos sentidos).
- [ ] Subir los screenshots nuevos al listing del Chrome Web Store
  y al del VS Code Marketplace. Las capturas ya están hechas en
  Claude Design (incluida una nueva del bundling de assets que
  agregamos en hito 28). Pendiente también: pisar
  `docs/screenshots/fab.png`, `onboarding.jpeg`, `options.png` con
  los nuevos para que el README y el detail page del Marketplace
  dejen de mostrar las capturas del navy+orange viejo.
- [ ] Investigar el flake de `npm run ci` en Windows: la primera
  corrida de vitest falla con `TypeError: Cannot read properties of
  undefined (reading 'config')` en los 18 test files y la segunda
  pasa limpia. Hipótesis de trabajo: race entre `tsc --noEmit` y el
  transform cache de vitest 4 sobre NTFS. No afecta CI en GitHub
  Actions (corre en Linux).

## Próximos hitos — en orden de prioridad

El orden acá es deliberado: lo de arriba arranca antes que lo de
abajo. Cambios al orden se discuten explícitamente.

### Hito 19 — Import como "chat del historial" (reconstruir `.jsonl`) — próximo (v0.8.x)

**Idea**: en vez de (o además de) abrir un `.md`, generar un `.jsonl`
válido en `~/.claude/projects/<cwd-encoded>/` para que la conversación
aparezca en `/resume` de Claude Code como si fuera un chat local.

**Why**: UX ideal — el usuario "continúa" la conversación de claude.ai
en Claude Code sin pasos extra. Hoy tienen que arrancar un chat nuevo
y adjuntar el `.md` como contexto (Hito 18 hace el adjunto auto pero
sigue siendo un chat NUEVO con un attachment, no la continuación
semánticamente fluida).

**Versión**: 0.8.0 ships el feature core. Patches +1 (0.8.1, 0.8.2…)
para cada bug que aparezca durante smoke tests reales — el formato es
ingeniería inversa así que esperamos iteración.

**Recon necesario antes de codear** (ningún probe alcanza, hay que
inspeccionar fixtures reales en `~/.claude/projects/`):
- Estructura exacta de los eventos `user` / `assistant` /
  `queue-operation` y cualquier otro tipo nuevo que haya aparecido
  desde las notas iniciales (`reference_jsonl_format.md` en
  memoria — verificar que sigue vigente).
- Reglas de encadenamiento de `uuid` / `parentUuid`: ¿pueden ser
  null en root? ¿pueden saltar messages? ¿qué pasa con branching?
- Campos que el state manager de Claude Code lee y valida: `cwd`,
  `sessionId`, `gitBranch`, `toolUseResult`, `version`. Algunos
  pueden ser opcionales, otros load-bearing.
- Cómo manejar `tool_use` y `tool_result` blocks (claude.ai tiene
  algunos; Claude Code tiene su propio set distinto). Probable que
  los tool calls de claude.ai no se puedan replicar 1:1 — opciones:
  (a) skipearlos del .jsonl reconstruido, (b) convertirlos a
  text-only con un comentario, (c) intentar mapear los más comunes.

**Plan tentativo (post-recon)**:
1. **Reader-side**: extender el bridge handler para escribir
   también un `.jsonl` además del `.md`. Posible flag
   `exportal.jsonlMode = 'both' | 'only-md' | 'only-jsonl'` para
   no forzar el rebuild a usuarios que estén contentos con `.md`.
2. **Generator nuevo** en `src/formatters/claude-code-jsonl.ts`:
   `formatAsJsonl(conversation, opts: {cwd, sessionId, gitBranch})`
   → string de NDJSON. Tests con fixtures reales del usuario.
3. **Path encoding**: `~/.claude/projects/<encoded>/` necesita el
   mismo `encodeProjectDir` que ya tenemos en
   `src/core/paths.ts`. Reusar.
4. **Test de integración con Claude Code**: imposible de unit-testear
   end-to-end (depende del state manager de Claude Code). Smoke
   test manual: generar el `.jsonl`, abrir Claude Code, ver si la
   conversación aparece en `/resume`, intentar continuar el chat.

**Risks**:
- Formato `.jsonl` no documentado, basado en ingeniería inversa.
  Si Anthropic cambia campos, hay que re-auditar.
- Tool calls / tool_results pueden no ser portables entre
  superficies (claude.ai vs Claude Code).
- El state manager puede tener side effects al ver chats que no
  generó él (`history` corrupto, indexes desincronizados).

**Trade-off vs. Hito 18**: Hito 18 (auto-attach del .md como
@-mention) ya cubre el caso "traer contexto al próximo chat" con
cero fricción extra. Hito 19 sería "el chat es el mismo chat, con
historial replay-able". Vale el cost porque Hito 18 deja al usuario
en un nuevo chat con contexto-vía-attachment, no continuando la
sesión original — algunas operaciones (revisar mensajes anteriores,
búsqueda en el historial) sólo funcionan con el .jsonl real.

### Hitos 20-23 — Soporte multi-IA

Bloque de hitos que se habilitan mutuamente. Orden interno:

**Hito 20 — Abstracción del core para múltiples proveedores**
- Hoy `importers/` y los tipos de dominio asumen claude.ai. Agregar
  otro proveedor sin abstraer duplica lógica rápido.
- Scope: definir `ExportedConversation` como union type
  (claude / chatgpt / gemini) con metadata común, refactorizar
  `formatters/` para consumir la union en vez del tipo específico.
- **Risk**: cada proveedor tiene shape distinto para tool use,
  multimedia, branching. La abstracción puede filtrarse y terminar
  siendo menos útil que hacer formatters por proveedor. Decidir al
  empezar el primer import no-claude — probablemente durante Hito 21.
- Parte del work puede adelantarse en Hito 27 (Claude Design) si el
  formatter termina siendo suficientemente distinto.

**Hito 21 — Import de ChatGPT**
- Camino oficial: Settings → Data controls → Export → ZIP por email
  con `conversations.json`. Formato semi-documentado; tool use
  (code interpreter, browsing) requiere parsing específico.
- Camino one-click: extensión de Chrome scrapea la API interna de
  `chat.openai.com`. Mismo patrón que el Hito 10e de claude.ai.
- Entrega mínima: reader + schema + formatter, sin one-click (se
  agrega después si hay demanda).

**Hito 22 — Import de Gemini**
- Camino oficial: Google Takeout export — ZIP con HTML/JSON por
  conversación. Menos uniforme que ChatGPT.
- Camino one-click: content script en `gemini.google.com`. La API
  interna de Gemini puede cambiar más que la de los otros dos;
  aceptar frágil.
- **Risk**: shape menos estable que Claude y ChatGPT.

**Hito 23 — Popover multi-IA en el Chrome companion**
- Unificar: un único icon + badge, el popover detecta el dominio
  activo (claude.ai / Claude Design / chat.openai.com /
  gemini.google.com) y muestra las acciones relevantes.
- Bloqueado por: Hitos 21 y 22 al menos parcialmente (Claude Design
  ya queda cubierto si cerramos Hito 27 antes).

## Backlog

Tier más abajo — útiles pero no en la cola activa.

### Hito 14 — Optimización de latencia para usuarios multi-org (re-scopeado)

**Original**: "agarramos `organizations[0]` sin preguntar". Ese
diagnóstico quedó desactualizado — hoy `fetchConversation` en
`chrome/content-script.js` itera todas las orgs y prueba cada una con
el UUID de la conversación, pasando si devuelve 404 y exportando si
devuelve 200. El comportamiento correcto para casi todos los casos
está resuelto.

**Scope residual**: usuarios con 3+ orgs en claude.ai pagan ~100-500ms
de latencia extra por orgs erradas antes de encontrar la que tiene
el chat. Medible, probablemente invisible (la UI ya muestra un
spinner). Opciones si decidimos atacar esto:
- Cachear la última org exitosa por-tab en `chrome.storage.session` y
  probarla primero.
- Probar orgs en paralelo (`Promise.allSettled`) y tomar el primer
  200. Costo: burst de ~N requests; gain: latencia ≈ max(orgs) en
  vez de sum(orgs).
- UI de selector explícito en la options page (overkill para este
  caso).

**Disparador**: primer bug report real de alguien con 3+ orgs que
note la latencia. Hasta entonces YAGNI. El código actual es correcto,
solo es sub-óptimo en ese percentil.

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

- Cada idea nueva → se agrega acá (near-term, próximos hitos, o
  backlog según urgencia).
- Cuando un hito arranca → queda en ROADMAP con estado "en curso" y
  la bitácora real (qué se hizo / decisiones) se va escribiendo en
  `DEVLOG.md` en el mismo commit que el código.
- Cuando cierra → entrada completa en `DEVLOG.md` + item eliminado de
  acá (no dejamos "done" viejos — para eso está el DEVLOG).
- Cuando el scope de un hito cambia respecto a cómo está descrito
  acá → se re-escribe la entrada, no se deja texto stale.
