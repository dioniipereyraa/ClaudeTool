# Changelog

All notable changes to Exportal (VS Code extension) and Exportal
Companion (Chrome extension) are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/).

## [0.10.0] — 2026-04-26

Bump minor: el FAB flotante de Exportal ahora aparece también en
**chatgpt.com**. Click → conversación importada en VS Code en menos
de 2 segundos, sin pasar por el ZIP de export por mail. Hito 30.

### Added

- **One-click export desde chatgpt.com (Hito 30)**:
  - El Chrome companion ahora se inyecta en `https://chatgpt.com/*`
    además de `https://claude.ai/*`. El FAB aparece en cualquier
    `chatgpt.com/c/<conversation-id>`.
  - Click → fetch de la conversación vía `/api/auth/session`
    (NextAuth, obtiene access token JWT) + `/backend-api/conversation/<id>`
    (Bearer auth) → POST al bridge local de VS Code → Markdown abierto.
  - El secondary button ("Preparar export oficial") está hidden en
    chatgpt.com porque no hay equivalente útil — el ZIP path requiere
    navegación manual del user a Settings → Data controls → Export.
- **Bridge protocol**: nuevo campo opcional `provider: 'claude' | 'chatgpt'`
  en el payload de `/import-inline`. Backward compat: absent = claude
  (Companions pre-Hito-30 siguen funcionando sin cambios).
- **`chrome/pure.js`**: nueva función `extractChatGptConversationIdFromPath`
  + `routeFromPath(pathname, host)` ahora dispatcha por host (claude.ai
  o chatgpt.com) para evitar accidental cross-matches.
- **`src/extension/extension.ts`**: nuevo branch `handleChatGptInline`
  que valida con `parseSingleConversation` del schema chatgpt y formatea
  con `formatChatGptConversation`. Reusa `persistAndOpenMarkdown` y
  `attachToClaudeCodeIfAvailable` (provider-agnostic).
- **13 tests nuevos** (232 totales): 10 cubren la detección de rutas
  ChatGPT en pure.js (incluyendo defensiva contra cross-matches:
  `/c/<uuid>` solo matchea si host === 'chatgpt.com'), 3 cubren el
  nuevo provider field en el bridge protocol.

### Notes

- **No `.jsonl` para `/resume` desde imports de ChatGPT**: la envelope
  Anthropic asume claude shapes (claude.ai/Claude Code messages),
  no maneja la estructura de mapping/branching de ChatGPT
  directamente. Para v1 solo `.md`.
- **No bundling de attachments multimodal**: si una conversación de
  ChatGPT tiene imágenes uploadeadas, el `/backend-api/conversation/<id>`
  devuelve `image_asset_pointer` references pero no los bytes. Para
  bundlear los archivos al `.md`, scrapear también `/backend-api/files/<id>/download`
  queda como Tier 3 del Hito 21 (futuro).
- **Sensible al cambio de chatgpt.com**: si OpenAI cambia su
  `/api/auth/session` o `/backend-api/conversation/<id>`, el FAB
  silenciosamente rompe. El error toast da el código específico
  (`session_expired`, `not_found`, etc.) para que cuando un user
  reporte el problema, podamos diagnosticar rápido.

## [0.9.2] — 2026-04-26

Hot-fix sobre 0.9.1: el import del export grande del usuario validaba en
0.9.1 (chunked reader funciona) pero después fallaba 30% de las
conversaciones porque OpenAI manda `null` (no missing) en varios fields
opcionales — y nuestro Zod rechazaba el null como "expected string,
received null".

### Fixed

- **Schema `MessageContentSchema`**: todos los `.optional()` ahora son
  `.nullable().optional()`. OpenAI manda `null` (no omitted) para
  fields que no aplican al `content_type` actual. Sin esto, ~30% de los
  mensajes de cuentas reales fallaban validación por
  `tether_id: null`, `assets: null` o `response_format_name: null`.
- **Reader: parsing per-conversation**. Antes usábamos
  `parseConversations(raw)` que delegaba a `z.array(...).safeParse`,
  el cual aborta el array completo si una sola conversación falla. Ahora
  cada conversación se parsea individualmente — las malas se skipean
  con warning, las buenas se importan. Robustez sobre strictness.
- **Formatter `renderTetherCitation`**: coerce explícito de
  `string | null | undefined` a `string | undefined` con `?? undefined`.
  Antes los checks `!== undefined` trataban `null` como "valor presente",
  rompiendo la lógica de fallback.
- **Formatter `case 'code'`**: pasa `content.language ?? undefined` a
  `fenceCode` (que espera `string | undefined`, no nullable).

### Added

- **`scripts/chatgpt-validate.mjs`**: utility local de diagnóstico que
  corre el schema de Zod contra cada conversación del export y reporta
  cuántas fallan + agrupado por path + error code, sin leak de
  contenido. Útil para futuros bugs de schema sin pedirle al user
  compartir el zip.
- **2 tests nuevos** (219 totales): uno cubre `null` en
  `tether_id`/`assets`/`response_format_name`/`url`/`title`, otro
  cubre el skip de una conversación mal formada en el medio del array
  (las otras se importan).

### Notes

- 0.9.1 sigue importando cuentas chicas/medianas correctamente — la
  regression solo afecta cuentas con uso intenso de browsing/code
  interpreter (donde aparecen los `tether_id: null` y similares).
- Cuando aparezca el próximo bug del schema, correr
  `scripts/chatgpt-validate.mjs <zip>` da el output exacto sin pedir
  al user que comparta el archivo.

## [0.9.1] — 2026-04-26

Validación contra un export real de cuenta grande (145 conversaciones, 2339 mensajes, 161 multimodal con imágenes) reveló dos cosas que 0.9.0 no manejaba: el formato chunked del export, y varios `content_type` que solo aparecen en cuentas con uso real. Esta versión cubre ambos.

### Fixed

- **Bug bloqueante: import de cuentas grandes de ChatGPT.** OpenAI exporta las conversaciones en archivos `conversations-NNN.json` (chunked) en vez de un solo `conversations.json` cuando la cuenta supera cierto umbral (observado a 145 conversaciones, posiblemente menos). El reader buscaba solo el archivo singular y fallaba con *"missing conversations.json"* en estas cuentas. Ahora detecta ambos layouts: si encuentra `conversations.json` lo usa; si no, busca `conversations-NNN.json`, los ordena por nombre y los concatena. Per-chunk failures generan warning + continúan en lugar de abortar.
- **Logos de cada proveedor en el panel.** Los placeholders `C`/`G`/`g` (mockup del diseño) reemplazados por los logos reales (Anthropic, OpenAI, Google Gemini), inline como SVG dentro del chip de marca. Paths de Simple Icons (CC0).

### Added

- **Soporte para cinco `content_type` nuevos** observados en exports reales:
  - **`thoughts`** — reasoning intermedio de modelos tipo o1/o3. Render como `<details><summary>Reasoning</summary>` colapsado por default.
  - **`reasoning_recap`** — resumen del razonamiento. Render como `> *Reasoning recap.* ...` en italic blockquote.
  - **`tether_quote`** y **`tether_browsing_display`** — citations de browsing. Render como blockquote con título + link 🔗 + texto citado.
  - **`system_error`** — errores de tools. Render como warning callout `> ⚠️ \`<error_name>\` ...`.
- **Multimodal real**: las imágenes uploadeadas (`image_asset_pointer` dentro de `parts[]`) ahora se renderizan como `*[Image: file-XXXX]*` legible en vez del JSON dump anterior. Los archivos físicos siguen viviendo dentro del ZIP del export — exponerlos al workspace queda como Tier 3 futuro.
- **Schema con campos nuevos** observados en `MessageContentSchema`: `url`, `title`, `domain`, `tether_id`, `thoughts`, `summary`, `content`, `name`, `result`, `assets`, `response_format_name`, `source_analysis_msg_id`. Todos opcionales. Backward compat preservado.
- **Tests nuevos** (221 totales, +11): 6 tests para el reader chunked (single, chunked, mixed, empty, partial parse failure, all-bad), 5 tests para los nuevos content_type handlers + multimodal.

### Notes

- Tu cuenta grande de ChatGPT con 145 conversaciones / 2339 mensajes ahora importa. El shape report mostró que ~95% de los mensajes ahora se renderean con handler dedicado (vs ~82% en 0.9.0); el 5% restante (recipients raros tipo plugins de terceros o `t2uay3k.sj1i4kz`) sigue cayendo al fallback genérico — son casos chiquitos y poco frecuentes.
- **Lo que sigue para 0.10.0** (Tier 3): exponer las imágenes físicas del ZIP al workspace (`<workspace>/.exportal/<title>/file-XXXX.jpeg`) y reescribir las references en el `.md` para apuntar a ellas. Permitirá renderizar imágenes inline en el preview de markdown.

## [0.9.0] — 2026-04-26

Release grande con dos cambios visibles importantes: **soporte multi-IA** (ChatGPT entra al ecosistema, antes solo claude.ai) y **rediseño de la sidebar tab** (de lista plana a menú direccional con auto-detect de descargas).

### Added

- **Soporte para ChatGPT (Hito 21)**:
  - **Importar .zip de ChatGPT**: comando `exportal.importFromChatGptZip` + botón en la sidebar tab. Lee el ZIP exportado desde *Settings → Data controls → Export*, recorre el árbol de mensajes (sigue solo la rama activa, ignora regenerated replies viejas), y produce un `.md` con el mismo estilo visual que los imports de claude.ai. Los `content_type` desconocidos (browsing, code interpreter, multimodal) se preservan como markers `[type] {json}` para no perder info.
  - **Enviar sesión de Claude Code a ChatGPT**: comando `exportal.sendSessionToChatGpt` espejo del flow a claude.ai. Copia el markdown al portapapeles, guarda el `.md` en `.exportal/` como fallback drag-drop, y abre `chatgpt.com`.
- **Rediseño de la sidebar tab (Hito 29)** — pasa de lista plana de 6 items a menú jerárquico:
  - **Settings** — los dos toggles existentes.
  - **↓ Importar al workspace** — header con badge direccional + una fila por proveedor (claude.ai, ChatGPT, Gemini disabled "soon").
  - **↑ Exportar la sesión actual** — header con badge direccional + filas espejo.
  - **Bridge status** — fila clickeable con dot pulsante (verde/rojo). Click expande para mostrar endpoint, token con botón copy + rotar, y "Logs".
  - **Footer** — versión + links docs/changelog.
  - Diseño hecho en Claude Design (Variante B "filas direccionales") con fidelidad visual al theming nativo de VS Code (`var(--vscode-*)`, codicons).
- **Auto-detect de descargas frescas en el panel**:
  - Cuando el panel se abre (o se hace visible), escanea `~/Downloads` y `~/Desktop` por ZIPs de claude.ai/ChatGPT modificados en las últimas 2h.
  - Detecta el proveedor por contenido (peek a `conversations.json`) — claude.ai por `chat_messages`, ChatGPT por `mapping`+`current_node`.
  - La fila del proveedor matchea muestra un sub-hint verde con el filename + tiempo relativo.
  - Click en una fila con detection → import directo, sin file picker.
- **Watch en tiempo real del Downloads folder**: mientras el panel está visible, `fs.watch` con debounce de 1.5s detecta nuevos ZIPs apenas terminan de descargarse (Chrome cierra el `.crdownload` y renombra al `.zip` final). El watcher se cierra al ocultar/cerrar el panel — cero costo cuando no se usa.
- **Auto-pick de sesión activa** en send-to-AI: el QuickPick que listaba todas las sesiones de Claude Code era confuso cuando varias compartían título por compactación. Ahora se elige automáticamente la más reciente por mtime — la que estás usando ahora mismo. El toast de éxito incluye el título de la sesión enviada para transparencia.
- **Drag-drop fallback para sesiones largas**: cuando enviás una sesión a claude.ai/ChatGPT, además del clipboard se guarda el `.md` en `.exportal/<timestamp>-<slug>-cc-export.md`. claude.ai/ChatGPT truncan silenciosamente pastes >100K chars; ahora podés arrastrar el `.md` al chat (botón "Reveal file" en la notification).
- **QuickPick title-aware** (cuando el auto-pick no aplica): el reader reconoce los event types `ai-title`, `custom-title` y `last-prompt` que Claude Code escribe como sidecar metadata. La QuickPick prioriza `customTitle ?? aiTitle ?? firstUserText` para el label, suma git branch + cwd basename al detail line, y ordena por `lastActiveAt` (file mtime).
- **Discoverability tip** del `.jsonl` para `/resume` en la pairing panel (heredado de 0.8.2 — ya estaba en main desde antes).
- **Botón "Abrir tab de Exportal"** en la pairing panel.
- **Codicons** ahora ship-ean dentro del vsix (`assets/codicons/`) — copiados al build via `esbuild.config.mjs`.

### Changed

- **El comando `Send Claude Code session to claude.ai`** ya no abre QuickPick (ver auto-pick arriba). El usuario que necesite elegir una sesión específica puede seguir invocando el flow por palette — vamos a agregar una variante "pick specific session" si llegan reportes.
- **El warning modal a 150KB** del send-to-claude.ai (que mostraba *"Copy anyway"*) está eliminado. Reemplazado por mensaje inline en la notification post-acción + el `.md` siempre guardado como fallback de drag-drop.

### Removed

- Drag-drop de archivos externos sobre el panel (intentado pero estructuralmente bloqueado por VS Code — el workbench intercepta los drops antes de que lleguen al webview). Cubierto por el auto-detect + watch.

### Fixed

- **Repository URL en `package.json`** sin prefijo `git+` para que el package linter de VS Code deje de quejarse de URLs relativas en README.md.

### Notes

- **Validación de ChatGPT contra data real pendiente**: el schema y el formatter están escritos contra docs públicas + 1 export real chico. Casos raros (browsing con many tabs, code interpreter con outputs binarios, custom GPTs con instructions largas, multimodal con varios images por turno) pueden tener bugs. Reportar `[unknown_content_type]` markers en el `.md` exportado es el síntoma típico.
- **Codicons agregan ~110KB al vsix** (CSS + TTF). Vale el costo por la consistencia visual con el resto de VS Code.

## [0.8.2] — 2026-04-23

### Added

- **Discoverability tip para `.jsonl` en la pairing panel.** El panel
  de emparejamiento (que se abre solo la primera vez que se instala la
  extensión) ahora incluye un card con el mensaje *"Nuevo: también
  escribir .jsonl para /resume"* y un botón "Abrir tab de Exportal"
  que revela la activity-bar tab directamente
  (`workbench.view.extension.exportal`). Quien ignora el panel sin
  explorar la feature se la encuentra igual la primera vez.
- **README.md y README.vsix.md actualizados.** Secciones nuevas que
  documentan el toggle `exportal.alsoWriteJsonl` (aparecer en /resume
  de Claude Code) y la tab dedicada en la activity bar — ambas
  features existían desde 0.8.0 / 0.8.1 respectivamente pero solo
  estaban mencionadas en CHANGELOG/DEVLOG.

### Notes

- Esta versión **no cambia comportamiento funcional**: es puramente
  discoverability y docs. El núcleo (strip de placeholder, tab,
  `.jsonl` generator) viene de 0.8.1 / 0.8.0.

## [0.8.1] — 2026-04-23

### Added

- **Tab dedicada en la activity bar de VS Code.** Antes los toggles
  de `exportal.autoAttachToClaudeCode` y `exportal.alsoWriteJsonl`
  vivían escondidos en `Preferences UI → buscar "exportal"`. Ahora
  aparece un ícono de Exportal en la activity bar con un panel
  propio que reúne los dos toggles más los tres comandos más usados
  (`Mostrar token de emparejamiento`, `Importar .zip de claude.ai`,
  `Enviar sesión de Claude Code a claude.ai`). El panel reacciona en
  vivo a cambios externos del setting (`onDidChangeConfiguration`).
  - Nuevo `src/extension/control-panel.ts`
    (`ExportalControlPanelProvider`, `WebviewViewProvider`).
  - HTML estilizado con `var(--vscode-*)` para que se sienta nativo
    en cualquier theme.
  - CSP estricta: `default-src 'none'`, scripts gateados con nonce.
  - SVG monochrome (`assets/sidebar-icon.svg`) que VS Code colorea
    con `currentColor`.

### Fixed

- **Strip del placeholder de claude.ai antes de generar `.md` y
  `.jsonl`.** El endpoint `chat_conversations?rendering_mode=messages`
  devuelve el literal `This block is not supported on your current
  device yet.` (con o sin fences de triple backtick) en lugar de los
  tool blocks que el "device" llamante no puede renderizar. Esa
  basura se filtraba al `.md` exportado y a las sesiones cargadas en
  `/resume` de Claude Code. Nuevo helper
  `src/importers/claudeai/cleanup.ts`
  (`stripUnsupportedBlockPlaceholders`) que limpia la conversación
  en la capa de datos para que todo formatter aguas abajo vea texto
  limpio. 9 tests unitarios cubren las dos formas observadas
  (fenced + bare line) más casos defensivos.

## [0.8.0] — 2026-04-23

### Added

- **Import como sesión de Claude Code (hito 19, experimental).**
  Nuevo setting `exportal.alsoWriteJsonl` (default `false`). Cuando
  está en `true`, después de escribir el `.md` también se genera un
  `.jsonl` compatible con Claude Code en
  `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`. La
  conversación importada aparece en `/resume` de Claude Code como si
  fuera una sesión local del proyecto actual.
  - Nuevo formatter `src/formatters/claude-code-jsonl.ts` con 9
    tests unitarios (round-trip a través del `parseEvent` del propio
    reader como validación estructural).
  - Conversión lossy (documentada en el header del formatter):
    - `text` → preservado.
    - `thinking` → **descartado** (no podemos generar la `signature`
      criptográfica que Anthropic adjunta a los thinking blocks).
    - `tool_use` → text marker `[Tool: <name>] <input JSON>` (los
      tools de claude.ai no existen en Claude Code, no son
      replay-eables).
    - `tool_result` → text marker `[Tool result] <content>`.
  - Markers sintéticos para identificar imports a ojo:
    `requestId: "exportal-imported-<sessionId>"`,
    `message.id: "msg_imported_<random>"`,
    `message.model: "claude-imported-from-claude-ai"`.
  - Detección best-effort de la versión de Claude Code instalada
    (probe `vscode.extensions.getExtension(...)` con un par de IDs
    candidatos) y de la rama de git activa (`git symbolic-ref
    --short HEAD` con timeout 2s).
  - Wireado en ambos paths: el flujo inline (Companion → bridge) y
    el flujo de import desde ZIP del comando `Exportal: Importar
    ZIP`. Toast `Exportal: también escribí <id>.jsonl para /resume
    en Claude Code.` cuando termina.
  - Fail-soft: si no hay workspace, si no se puede escribir el
    archivo, si el directory no existe — se loggea warning y el
    `.md` queda OK como antes. Nunca rompe el flujo principal.

### Notes

- El formato `.jsonl` es ingeniería inversa, no oficialmente
  documentado. Puede romperse entre versiones de Claude Code. Por
  eso el setting es opt-in. Si encontrás que `/resume` no muestra
  los chats importados o que Claude Code se rompe al continuarlos,
  abrí un issue con la versión de Claude Code que tenés instalada.
- Patches sobre 0.8.x van a ir a `0.8.1`, `0.8.2`, etc. para fixes
  del formato a medida que aparezcan.

## [0.7.1] — 2026-04-23

Prep round antes de arrancar Hito 19 (.jsonl). Sin features nuevos.

### Changed

- READMEs (`README.md` + `README.vsix.md`) refrescados para
  mencionar el soporte de Claude Design (`/design/p/<UUID>`) y el
  bundling de assets generados. La tabla "Formas de exportar"
  ahora aclara qué shortcut funciona en qué surface.
- Header de `chrome/content-script.js` reescrito para reflejar las
  dos surfaces (chat + Design) en lugar de solo `/chat/<UUID>`.

### Removed

- Directiva `eslint-disable-next-line no-console` no usada en
  `src/extension/http-server.ts:214` (la regla `no-console` no
  está activa para `src/`, así que la directiva era no-op y eslint
  mismo la flageó).

## [0.7.0] — 2026-04-23

### Added

- **Claude Design exports now bundle the generated assets (hito 28).**
  When you export a Claude Design conversation, the FAB also fetches
  every top-level file in the project (HTML, JSX, JSON, etc.) and
  ships them alongside the chat. The `.exportal/<ts>-<slug>.md` gets
  a "Generated assets" header listing each file with its size + MIME
  type, and the actual files land in `.exportal/<ts>-<slug>/` next
  to the markdown — ready for Claude Code to read as workspace files.
  - New `ListFiles` + `GetFile` Connect-RPC calls in
    `chrome/content-script.js`, factored through a shared
    `callDesignRpc` helper.
  - Bridge `ImportInlinePayload` extended with optional
    `assets: [{filename, content (base64), contentType}]`.
  - Bridge body cap raised from 10 MB to 50 MB to leave room for
    bundled assets.
  - Filename sanitization in the bridge handler rejects path
    traversal (`..`), absolute paths, null bytes, and Windows drive
    prefixes before writing.

### Changed

- `sendInline` and `forwardInlineConversation` now accept an
  optional second argument of assets; chat exports keep their
  byte-identical payload (no assets field), only Design exports
  populate it.
- The bridge body limit was 10 MB; now 50 MB. Test updated
  accordingly (`returns 413 for payloads larger than 50 MB`).

## [0.6.1] — 2026-04-23

### Fixed

- **Claude Design exports: UTF-8 mojibake in message text** (`extensión`
  shipped as `extensiÃ³n`, `diseño` as `diseÃ±o`, `¡` as `Â¡`, etc).
  `adaptDesignToConversation` was feeding `atob(outer.data)` straight
  into `JSON.parse`. `atob` returns a binary string where each char
  is a single byte, so multi-byte UTF-8 sequences (ñ = 0xC3 0xB1, ó
  = 0xC3 0xB3) decoded as the Latin-1 pair `Ã±` / `Ã³`. JSON.parse
  accepted them silently and the corruption rode through to the
  `.exportal/<...>.md` file. Fix: walk the binary string into a
  `Uint8Array` and decode it with `TextDecoder('utf-8')` before
  parsing. Found via the first real end-to-end smoke test of v0.6.0.

## [0.6.0] — 2026-04-23

### Added

- **Claude Design support (hito 27).** The Chrome companion now
  recognizes `https://claude.ai/design/p/<UUID>` URLs and exports the
  active chat of a Claude Design project to VS Code with the same
  one-click flow as `/chat/<UUID>`. No new permissions — Claude
  Design is same-origin with claude.ai, so the existing
  `host_permissions` and `content_scripts.matches` already cover it.
  - New `extractDesignProjectIdFromPath` and `routeFromPath` helpers
    in `chrome/pure.js` (with 11 new unit tests).
  - `chrome/content-script.js` routes the FAB by `{kind, id}` instead
    of a bare conversation id. Switching tab from chat to design (or
    back) rebuilds the popover so the layout matches the active kind.
  - New `fetchDesignProject(projectId)` hits the Connect-RPC endpoint
    `/design/anthropic.omelette.api.v1alpha.OmeletteService/GetProject`
    with JSON content negotiation (`Connect-Protocol-Version: 1`),
    base64-decodes the embedded project blob, picks the active chat
    via `viewState.activeChatId`, and adapts the messages into the
    same shape that `/import-inline` already validates on the bridge.
    No bridge or manifest changes required.

### Changed

- The "Prepare official export" secondary button (and its
  `Alt+Shift+O` shortcut) is hidden on Design pages. The official
  export ZIP matches by chat UUID, but Design URLs only expose the
  project UUID — wiring the button would silently no-match later.
- The kbd chips in the FAB popover collapse from two to one on
  Design pages (`Alt+Shift+E` only).

## [0.5.6] — 2026-04-23

### Changed

- Marketplace/CWS description (`package.nls.json` / `package.nls.es.json`)
  refreshed to describe the current one-click flow + the Claude Code
  auto-attach, instead of the obsolete "run 'Show bridge pairing
  token' to connect" phrasing.

### Removed

Dead-code sweep after the 0.5.x redesign. No runtime behaviour change
— these were all unused declarations that survived the options-page
rewrite and the webview pairing panel:

- Chrome `_locales/{en,es}/messages.json`: 12 dead i18n keys
  (`bannerNotPaired`, `bannerPaired`, `clearButton`, `howToGetToken`,
  `optionsSubtitle`, `saveButton`, `stepCopyToken`, `stepInstall`,
  `stepOpenPalette`, `tokenCleared`, `tokenInvalid`, `tokenSaved`).
  None were referenced from code after the OnboardingChrome
  three-state rewrite.
- VS Code `l10n/bundle.l10n.es.json`: 9 dead translations from the
  old blocking-modal onboarding (`TOKEN:`, `STEPS:`, the three
  numbered step lines, the re-open hint, the two headline variants,
  and `Copy token`). The webview replaced them in v0.5.0.
- `src/extension/http-server.ts`: the `userFullName` field on
  `ImportInlinePayload` that was declared but never populated or
  read.

### Fixed

- Stale comment at `extension.ts:99` still described "show a modal"
  as the onboarding mechanism; replaced with the webview description.
- Header doc of `http-server.ts` only mentioned `POST /import`;
  expanded to cover all three endpoints (`/import`, `/import-inline`,
  `/ping`).
- `docs/screenshots/README.md`: "modal" → "panel" and "banner verde
  de Emparejado" → "chip de Emparejado" to match the shipped UI.
- `docs/CHROME_WEB_STORE_LISTING.md`: the package filename example
  no longer hardcodes `0.3.0`.

## [0.5.5] — 2026-04-23

### Changed

- `README.md` and `README.vsix.md` refreshed: removed the hardcoded
  "v0.3.0" from the status line (it was stale ever since the 0.4.0
  release and kept showing up on the Marketplace landing), and
  rewrote the Chrome companion install section to describe the
  one-click pairing flow instead of the old "paste token manually"
  steps. Also swapped "modal" → "panel" in the VS Code onboarding
  description to match the webview we shipped in v0.5.0.

## [0.5.4] — 2026-04-23

Version-number-only bump: v0.5.3 of the VS Code extension was
uploaded to the Marketplace earlier; the Marketplace permanently
reserves every version number ever registered, so to ship the
centered-options-page fix we need a fresh slot. No behavioral change
vs v0.5.3 on either extension.

## [0.5.3] — 2026-04-23

### Changed

- Chrome options page now flex-centers inside the browser tab instead
  of hugging the top-left corner. `body` gets `min-height: 100vh` +
  `display: flex; align-items: center; justify-content: center;` and
  the card carries the 420px max-width. Cosmetic follow-up to v0.5.2's
  switch to `open_in_tab: true`.

## [0.5.2] — 2026-04-23

### Changed

- **Auto-pair now opens the companion options page.** After the
  claude.ai content script consumes a pairing fragment and stores the
  token, it asks the service worker to call
  `chrome.runtime.openOptionsPage()`. The user lands on the
  `OnboardingChrome` card showing "¡Listo! — Todo conectado" instead
  of only seeing a transient toast on claude.ai. claude.ai stays open
  in its own tab so the user can start exporting immediately.
- `manifest.json` switched `options_ui.open_in_tab` from `false` to
  `true` so the options page opens as a full browser tab (rendering
  the design at its intended size) instead of the small
  `chrome://extensions` embedded popup.

## [0.5.1] — 2026-04-23

### Changed

- **Chrome options page — three-state OnboardingChrome flow.** The
  manual-paste fallback (used when the URL-fragment auto-pair doesn't
  kick in) now adopts the `OnboardingChrome` states from design-cds/:
  - `waiting` — empty input. Chip "Esperando…", headline "Pegá el
    token de VS Code".
  - `detected` — input holds a 64-hex string. Chip "Token detectado",
    headline "Encontramos tu token", lime border + shimmer animation
    on the token field, primary button actionable.
  - `paired` — token saved. Chip green "Emparejado", headline
    "¡Listo!", primary button becomes the informational "✓ Todo
    conectado", and a small low-contrast "Desemparejar" text button
    appears so users can clear the state.
- Chrome options also listens to `chrome.storage.onChanged` so that
  if the auto-pair URL-fragment flow completes in another tab, an
  open options tab transitions to the paired state instantly.
- Enter key on the input commits the pair when a valid token is
  typed/pasted, matching the primary button behaviour.

### Removed

- Save / Clear button pair on the options page — replaced by the
  single-primary + unpair-link combo that the new state flow drives.

## [0.5.0] — 2026-04-23

### Added

- **One-click pairing (hito 25).** The "Show bridge pairing token"
  command now opens a webview (previously a blocking modal dialog).
  "Copy and open Chrome" puts the token on the clipboard *and*
  launches claude.ai with `#exportal-pair=<token>` in the URL. The
  Chrome Companion's content script consumes the fragment, asks the
  service worker to save the token, and strips the fragment via
  `history.replaceState` so a reload can't re-pair. Token never
  hits a server.
- **Pair confirmation loop.** After Chrome stores the token it hits
  `POST /ping` on the local bridge with the fresh Bearer. VS Code
  shows a notification ("pairing complete") and, if the pairing
  webview is still open, swaps to a lime check overlay and
  auto-dismisses after 2.5s.
- **First-run onboarding shows the new webview.** The persistent
  "already shown" flag was bumped to v2 so existing users see the
  redesigned flow once on upgrade without having to invoke the
  command manually.
- **Graphite Citrus redesign (hito 26).** Both extensions adopt the
  new design system from `design-cds/`:
  - Chrome: FAB is an ambient orb (surface + ExportalMark + pulse
    dot); popover matches `FabExpanded` (brand header, lime primary,
    ghost secondary, JetBrains-Mono kbd chips). SuccessPulse overlay
    replaces the button-flash on successful export, showing real
    metrics (`{ms}ms · {messages} mensajes`).
  - Chrome options page adopts `OnboardingChrome` — titlebar +
    status chip + numbered steps + monospace token field + local-
    first reassurance block.
  - VS Code pairing webview adopts `OnboardingVsCode` — faux
    titlebar, brand mark, stepper, dashed-border token card.
  - `assets/icon.svg` refined to the ExportalMark: dark surface,
    white E strokes, lime accent bar extending right with an
    arrow-cap.
  - Status bar glyph switched from `$(cloud-download)` to `$(export)`.

### Changed

- Kbd chips in the Chrome popover now display `Alt+Shift+E` /
  `Alt+Shift+O` instead of the Mac-style `⌥⇧` glyphs. The chips
  weren't lying on Mac, but they were on every other platform.
- `bannerPaired`/`bannerNotPaired` i18n strings shortened to fit
  the new header chip in the options page.

### Fixed

- Pairing webview no longer auto-closes when the user clicks "Copy
  and open Chrome". Only the explicit "Later" button (or the tab X)
  dismisses it now — avoids having to re-run the command when Chrome
  doesn't auto-detect the token on first try.
- Fragment URL construction uses `vscode.Uri.from` instead of
  `Uri.parse`; some VS Code builds re-encoded `=` as `%3D` during
  serialization which broke the content-script's fragment parser.
- Pairing panel reference stored at module scope instead of on the
  `ExtensionContext` object (which VS Code freezes and rejects new
  property assignments on) — `showPairingInfo` no longer throws
  "object is not extensible" on a second invocation.

## [0.4.0] — 2026-04-21

### Added

- **Internationalization (hito 24).** Both extensions now ship in English
  and Spanish and follow the user's UI language automatically.
  - VS Code: command titles and configuration are declared via
    `package.nls.json` / `package.nls.es.json`; runtime strings go through
    `vscode.l10n.t()` with bundles under `l10n/`.
  - Chrome: `manifest.json` uses `__MSG_*__` placeholders against
    `_locales/en/` and `_locales/es/`; options page, background worker,
    and claude.ai content script resolve strings via
    `chrome.i18n.getMessage()`. `default_locale` is `en`.
  - `chrome/pure.js` stays chrome.*-free: `explainError()` returns i18n
    message IDs (`errSessionExpired`, `errBridgeOffline`, …) and the
    content script resolves them against the active locale. Unit tests
    updated accordingly.

## [0.3.0] — 2026-04-20

### Added

- **Send Claude Code session to claude.ai** (hito 15). New command
  `Exportal: Send Claude Code session to claude.ai` lists the sessions
  for the open workspace's cwd, renders the chosen one as Markdown
  (redaction on, tool/thinking blocks off), copies it to the clipboard
  and opens `claude.ai/new`. The paste is manual because claude.ai has
  no public write API. Warns with a modal when the payload is larger
  than ~150 KB.

## [0.2.2] — 2026-04-20

### Changed

- vsix ships a slimmer `README.vsix.md` without image references. VS Code's
  extension Details viewer only resolves absolute HTTPS image URLs, so the
  relative screenshots from v0.2.1 rendered as broken icons even after the
  `--no-rewrite-relative-links` fix. The GitHub README keeps the screenshots;
  both files are tracked and must be kept in sync by hand. `npm run
  package:vsix` swaps them around `vsce package` automatically.

## [0.2.1] — 2026-04-20

### Fixed

- Packaging: README image references no longer rewritten to
  `github.com/.../raw/HEAD/...` URLs during `vsce package`. The
  v0.2.0 vsix shipped with rewritten URLs that 404 against the
  currently-private repository, so the README rendered with broken
  images in VS Code's extension details view. The `--no-rewrite-
  relative-links` flag preserves relative paths; VS Code resolves them
  against the installed extension directory.

## [0.2.0] — 2026-04-20

### Added

- **Auto-attach to Claude Code**: after importing a conversation, the
  Exportal extension now opens the Claude Code sidebar and inserts the
  exported Markdown as an `@-mention` in the chat input. The user only
  has to type their prompt (or hit Enter) — no manual file-drop needed.
  Requires the official Claude Code extension; fails soft if absent.
- Setting `exportal.autoAttachToClaudeCode` (default `true`) to disable
  the auto-attach behavior.

### Changed

- Imported conversations are now written to
  `<workspace>/.exportal/<timestamp>-<slug>.md` instead of an unsaved
  editor tab. This gives the `@-mention` a real file path to reference
  and leaves a browsable history of imports. Falls back to an untitled
  document if no workspace folder is open.

## [0.1.1] — 2026-04-20

Documentation-only release. No code changes to either extension.

### Changed

- Added screenshots for FAB popover, VS Code onboarding modal, and
  Chrome options page; README image references updated accordingly.
- DEVLOG extended with entries for Hito 10e (one-click export via
  claude.ai internal API) and the v0.1.0 polish/hardening session.

## [0.1.0] — 2026-04-20

First usable release. Both extensions share the same version number;
they are designed to be paired.

### Added

- **VS Code extension (Exportal)**
  - Status bar button + command `Exportal: Import claude.ai ZIP` to
    open a claude.ai export ZIP as a Markdown document.
  - Auto-detection of the most recent `data-*.zip` in Downloads and
    Desktop; content-scan fallback for renamed ZIPs.
  - Local HTTP bridge (127.0.0.1, bearer-token-auth, ports 9317-9326)
    with two endpoints:
    - `POST /import` — import a ZIP by filesystem path.
    - `POST /import-inline` — import a full conversation JSON
      scraped from claude.ai's internal API (no ZIP needed).
  - Permanent first-run modal with pairing token + step-by-step
    instructions for the Chrome companion.
  - Command `Exportal: Show bridge pairing token` to reveal the
    token again after onboarding.
  - Success toast after every import (title + message count).
- **Chrome extension (Exportal Companion)**
  - Circular FAB on `claude.ai/chat/<uuid>` pages that expands a
    popover with two export actions.
  - Keyboard shortcuts `Alt+Shift+E` (export now) and `Alt+Shift+O`
    (prepare official export).
  - Auto-forward of official claude.ai export ZIPs to VS Code once
    they finish downloading.
  - Options page with live pairing status and numbered token-paste
    instructions.
  - Toolbar badge reflecting bridge status (`SET`/`OK`/`AUTH`/
    `OFF`/`OLD`/`ERR`).
  - Hardened error handling: distinct user-facing messages for
    session expiry, claude.ai API shape changes, oversized payloads,
    timeouts, and outdated VS Code bridges.

### Security

- Bridge bound to `127.0.0.1` only, bearer-token auth with
  constant-time comparison, 10 MB body cap on `/import-inline`,
  64 KB cap on `/import`.
- Chrome companion only accepts messages from `https://claude.ai/*`
  tabs; content script reuses the logged-in session (no token
  scraping, no credential handling).
