# Exportal — Roadmap

Ideas y hitos futuros. Vivo, se actualiza cada vez que surge algo nuevo.
Items concretos y cerrados se mueven al `DEVLOG.md`. Releases formales al
`CHANGELOG.md`. Este archivo es solo la cola de lo pendiente.

## Near-term

- [ ] Verificar el flujo de instalación en una máquina limpia (vsix +
  zip del companion desde releases, emparejar, probar ambos sentidos).
- [ ] Recapturar `docs/screenshots/fab.png`, `onboarding.jpeg`,
  `options.png` con el branding citrus (hoy siguen siendo capturas del
  navy+orange viejo, desaliniadas con la UI real). Después subir las
  nuevas al listing del Chrome Web Store y al del VS Code Marketplace.
- [ ] Investigar el flake de `npm run ci` en Windows: la primera
  corrida de vitest falla con `TypeError: Cannot read properties of
  undefined (reading 'config')` en los 18 test files y la segunda
  pasa limpia. Hipótesis de trabajo: race entre `tsc --noEmit` y el
  transform cache de vitest 4 sobre NTFS. No afecta CI en GitHub
  Actions (corre en Linux).

## Próximos hitos — en orden de prioridad

El orden acá es deliberado: lo de arriba arranca antes que lo de
abajo. Cambios al orden se discuten explícitamente.

### Hito 27 — Soporte para Claude Design (próximo)

**Problema**: Claude Design está ganando tracción y hoy no hay camino
de exportación directa — el usuario tiene que descargar el ZIP oficial
de claude.ai y correr `Exportal: Import claude.ai ZIP` para cada
conversación que quiera llevar a VS Code. El one-click que tenemos en
`claude.ai/chat/<uuid>` no aplica porque Claude Design usa otra ruta.

**Recon (cerrado 2026-04-23)**:
- **Dominio**: same-origin con claude.ai (`https://claude.ai/design`).
  Implicación: nuestro content script ya se inyecta acá (matchea
  `https://claude.ai/*`), no toca `manifest.json`, no hay re-review
  en CWS por permisos, cookies de sesión compartidas. El único
  motivo por el que el FAB no aparece hoy es que
  `extractConversationIdFromPath` filtra por `/chat/<uuid>`.
- **URL pattern**: `claude.ai/design/p/<UUID>` con UUID en el mismo
  formato RFC-4122 que ya matcheamos. Variante con archivo abierto:
  `?file=<filename>` (no afecta la identidad de la conversación).
- **API**: endpoints relevantes durante navegación de un proyecto:
  - `POST /design/anthropic.omelette.api.v1alpha.OmeletteService/GetProject`
  - `POST /design/anthropic.omelette.api.v1alpha.OmeletteService/GetProjectData`
  - también `ListFiles`, `ListComments`, `ListOrgProjects`,
    `UpdateProjectData`, todos bajo el mismo prefijo de servicio.
  Transport: **Connect-RPC** sobre JSON (negociación confirmada).
  Headers requeridos:
  ```
  Content-Type: application/json
  Accept: application/json
  Connect-Protocol-Version: 1
  ```
  Body: `{"project_id": "<UUID>"}` (snake_case, no `id` ni
  `projectId`). Cookies de sesión via `credentials: 'same-origin'`.
  Errores también vienen en JSON con shape Connect estándar:
  `{code, message, details: [{type: 'buf.validate.Violations', value, debug}]}`.
  El server-side usa `buf.validate` para validación de schema, lo
  que implica que la API es protobuf-first con la JSON como
  fachada. La shape del response 200 — pendiente de capturar.
- Tab de Claude Design = mismo storage / sesión que claude.ai/chat,
  no requiere login separado.

**Plan**:

1. **Pure helper**: agregar `extractDesignProjectIdFromPath(pathname)`
   en `chrome/pure.js`, análogo al existing `extractConversationIdFromPath`,
   matching `/^\/design\/p\/([0-9a-f-]{36})/`. Tests en
   `tests/chrome/pure.test.ts`.
2. **Routing del FAB**: `currentConversationId()` en
   `chrome/content-script.js` ahora devuelve `{kind: 'chat'|'design', id}`
   en vez de un string. `syncPanel`, `panelConversationId`, etc se
   adaptan. El FAB renderiza igual (mismo design) — solo cambia la
   ruta del fetch interno.
3. **Fetch del Design**: nueva función `fetchDesignProject(projectId)`
   que llama el endpoint correcto (a determinar tras la captura de
   payload) y devuelve la conversación normalizada al mismo shape
   que ya espera el bridge `/import-inline`. Si la shape de Design
   difiere mucho de la de chat, normalizamos del lado del content
   script para que el bridge no se entere.
4. **Formatter**: si los messages de Design tienen el mismo shape
   básico (role + content), el formatter actual sirve. Si tienen
   estructura distinta (referencias a archivos generados, code
   artifacts diferenciados), agregar un caso al formatter o un
   formatter dedicado bajo `src/formatters/`.
5. **Fallback ZIP**: el ZIP oficial de claude.ai ya incluye los
   chats de Design — si el fetch inline falla, el path
   `Exportal: Import claude.ai ZIP` sigue funcionando.

**Bloquea ahora**: capturar la response de `GetProject` o
`GetProjectData` (URL completa + body JSON). Sin eso no podemos
escribir el step (3).

**Riesgo medio**: la API de Design puede ser más reciente / menos
estable que la de chat. Vale dejar el feature flag `data-exportal-
design-enabled` para poder esconder la entrada si Anthropic rompe
el endpoint.

**Side benefit**: si el formatter de Design termina siendo distinto,
adelantamos parte de la abstracción que pide el Hito 20.

### Hito 19 — Import como "chat del historial" (reconstruir `.jsonl`)

**Idea**: en vez de abrir un `.md`, generar un `.jsonl` válido en
`~/.claude/projects/<cwd-encoded>/` para que la conversación aparezca
en `/resume` de Claude Code como si fuera un chat local.

**Why**: UX ideal — el usuario "continúa" la conversación de claude.ai
en Claude Code sin ningún paso extra. Hoy tienen que arrancar un chat
nuevo y adjuntar el `.md` como contexto.

**Risks**:
- El formato `.jsonl` es ingeniería inversa; los `uuid` / `parentUuid`
  tienen reglas de encadenamiento no documentadas.
- El state manager de Claude Code puede rechazar o ensuciarse si
  mapeamos mal algún campo (`cwd`, `sessionId`, `gitBranch`,
  `toolUseResult`).
- Si Anthropic cambia el formato, nuestro generator se rompe hasta
  que lo auditemos de nuevo.

**Bloqueado por**: auditoría a fondo del formato y fixtures reales
(varias conversaciones con tool use, thinking, code interpreter, y
conversaciones con branching). Hay notas en memoria sobre el shape.

**Trade-off vs. Hito 18**: Hito 18 (auto-attach del .md como
@-mention) ya cubre el caso "traer contexto al próximo chat" con
cero fricción extra. Hito 19 sería "el chat es el mismo chat, con
historial replay-able". Vale el cost solo si Hito 18 deja faltando
algo que usuarios piden.

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
