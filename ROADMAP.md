# Exportal — Roadmap

Ideas y hitos futuros. Vivo, se actualiza cada vez que surge algo nuevo.
Items concretos y cerrados se mueven al `DEVLOG.md`. Releases formales al
`CHANGELOG.md`. Este archivo es solo la cola de lo pendiente.

## Near-term

- [ ] Verificar el flujo de instalación en una máquina limpia (vsix +
  zip del companion desde releases, emparejar, probar ambos sentidos).
- [ ] Esperar aprobación de Chrome Web Store de la submission 0.11.2
  (enviada el 2026-04-29 reemplazando la 0.5.7 que llevaba semanas
  trabada). Cuando apruebe: ejecutar el plan de visibilidad —
  PRs/issues a awesome-lists, post r/ClaudeAI, thread X, Show HN
  (copy listo en `.exportal/3-exportal-ejemplos-copy.md`).
- [ ] Re-empaquetar el companion 0.11.6 (`npm run package:chrome`)
  y submitearlo al Chrome Web Store post-aprobación de la 0.11.2.
  Sin cambios funcionales en el companion, el bump es por simetría
  con la VS Code extension.
- [ ] Subir `exportal-0.11.6.vsix` al VS Code Marketplace (portal
  web o `vsce publish` con PAT). La 0.11.6 incluye el cluster
  ergonomía completo (Hitos 32+33+34) más el security release
  (rate limiting, Slowloris timeouts, URL whitelist, RTL filter,
  CSP en docs).
- [ ] Verificar `exportal.dev` en Google Search Console (TXT record
  via Cloudflare DNS, 2 min) para activar el badge "URL oficial
  verificada" en el listing de Chrome Web Store. No es bloqueante
  para la review actual — task post-aprobación.
- [ ] Reemplazar las promo screenshots de la landing por capturas
  reales del producto funcionando (FAB real, panel de VS Code real,
  @-mention real en Claude Code). Snipping Tool. Las promo en español
  generan inconsistencia de idioma con el resto en inglés.
- [ ] Re-renderizar las screenshots de la sección s0-s6 con headlines
  en inglés (alineado con la decisión de idioma primario tomada el
  2026-04-29). Trabajo de diseño, requiere herramientas que Dioni
  todavía no tiene contratadas.
- [ ] Grabar video/GIF de 30-60 segundos del flow completo (FAB en
  claude.ai → markdown generado → @-mention en Claude Code). Audio
  en español propio (no TTS), problema en 8s + solución en 20s. Va
  arriba del README y del hero de la landing — reemplaza la pared
  de texto actual. Lift más alto del plan de visibilidad.
- [ ] Blog post "Why I built Exportal" en `exportal.dev`: historia
  personal del problema + decisiones técnicas no obvias (no abstraer
  importers hasta tener tres providers, Chrome antes que Firefox,
  zero-network como principio). Contenido citable por interés propio,
  no por venderse.

## Próximos hitos — en orden de prioridad

El orden acá es deliberado: lo de arriba arranca antes que lo de
abajo. Cambios al orden se discuten explícitamente.

### Cluster ergonomía/UX — cerrado en 0.11.5

Hitos 30 (onboarding wizard de dos pasos), 31 (sonido al exportar),
32 (badge inteligente del icono Chrome), 33 (FAB en Claude Design
no tapa el submit) y 34 (templates post-import) cerraron en
0.11.4 + 0.11.5. Ver DEVLOG entries del 2026-04-30 y CHANGELOG.

**Pendiente**: smoke test del Hito 33 cuando Dioni tenga tokens
de Claude Design. Sin bloqueante para el release — el path de
chat normal de claude.ai/ChatGPT no quedó tocado por el cambio.

### Hitos 35+ — siguientes en cola

**Hito 35 — Pairing landing en `exportal.dev/pair`**

Hoy el "Copy and open Chrome" del Step 2 abre `https://claude.ai/`
con el fragment `#exportal-pair=<token>`. El content script del
companion (declarado en `manifest.json` con `matches: ['*://claude.ai/*',
'*://chatgpt.com/*']`) lee el fragment y completa el pairing.
Costo: el user ve abrirse una pestaña de claude.ai sin razón
visible, solo para servir de trampoline al token.

**Scope**:
- Landing `https://exportal.dev/pair` servida desde `docs/` del
  propio repo (GH Pages). Página minimalista: "✓ Pairing complete
  — you can close this tab" con el branding de Exportal.
- Update al `chrome/manifest.json` del companion: agregar
  `*://exportal.dev/pair*` a `host_permissions` y a
  `content_scripts[].matches`.
- Update al `chrome/content-script.js` del companion: aceptar
  también `exportal.dev` como host válido para capturar el
  fragment `#exportal-pair=<token>`.
- En la VS Code extension: cambiar `PAIRING_TRAMPOLINE_HOST` de
  `'claude.ai'` a `'exportal.dev'` y el `path` del Uri de `/` a
  `/pair`.
- Re-empaquetar el companion (`npm run package:chrome`) y
  re-submitir al Chrome Web Store. Espera de review (1-3 días
  típico, hasta 2 semanas en peor caso).
- Versioning: bump del companion (no de la VS Code extension —
  el cambio del trampoline host es trivial; el lift está en el
  companion).

**Por qué es valioso**:
- UX: el usuario que pareó alguna vez no quiere ver claude.ai
  abrirse cada vez que el wizard re-aparece. Una landing propia
  comunica que el pairing es interno de Exportal, no algo que
  involucra a Anthropic / OpenAI.
- Independencia: hoy si Anthropic cambia algo en `claude.ai/` que
  rompa nuestro content script (improbable pero posible), el
  pairing falla. Con landing propia controlamos los dos extremos.
- Branding: la landing es real estate marketing — "✓ Paired with
  Exportal" con CTA a docs/exportal.dev es mucho más memorable
  que la home de claude.ai con un fragment misterioso.

**Risk**:
- Latency del Chrome Web Store. La review puede demorar — durante
  la espera, los usuarios ya en producción tienen el companion
  viejo (sin el match `exportal.dev`). Mitigación: hasta que
  apruebe, mantener `claude.ai` como trampoline. Cambio del
  `PAIRING_TRAMPOLINE_HOST` se hace post-aprobación + después de
  que la mayoría de usuarios reciba el update automático del
  companion (24-48h después de la aprobación).
- Si Cloudflare/GH Pages cae, el pairing rompe. El fallback a
  claude.ai serviría de seguro: detectar el fail e intentar
  abrir claude.ai como fallback. Trabajo extra pero defensivo.

**Disparador**: Dioni mostró interés explícito el 2026-04-30. Sin
bloqueante upstream.

### Hitos 20-23 — Soporte multi-IA (pausados)

**Decisión 2026-04-30**: con Claude.ai + ChatGPT cubiertos, los
hitos de Gemini y la abstracción asociada quedan pausados. Razón:
sin demanda concreta de usuarios pidiendo Gemini, el costo de
mantener un tercer importer + popover unificado no se justifica.
Reabrir cuando lleguen requests reales (no por simetría).

**Hito 20 — Abstracción del core para múltiples proveedores** (pausado)
- Hoy `importers/` tiene dos implementaciones paralelas (claude.ai +
  chatgpt). El refactor a union type sigue pendiente — descartado
  hasta el momento porque las dos shapes son lo suficientemente
  distintas que la abstracción terminaría leakeando.
- **Disparador**: cuando entre el tercer proveedor, revisar si los
  patrones se repiten lo suficiente como para justificar generalizar.
  Si solo dos shapes, no vale.

**Hito 22 — Import de Gemini** (pausado)
- Camino oficial: Google Takeout export — ZIP con HTML/JSON por
  conversación. Menos uniforme que ChatGPT.
- Camino one-click: content script en `gemini.google.com`. La API
  interna de Gemini puede cambiar más que la de los otros dos;
  aceptar frágil.
- **Risk**: shape menos estable que Claude y ChatGPT.
- **Disparador**: señal real de demanda (issues, comments, mensajes
  de usuarios pidiéndolo). No avanzar por simetría con los otros.

**Hito 23 — Popover multi-IA en el Chrome companion** (pausado)
- Unificar: un único icon + badge, el popover detecta el dominio
  activo (claude.ai / Claude Design / chat.openai.com /
  gemini.google.com) y muestra las acciones relevantes.
- Bloqueado por: Hito 22 (Gemini), que está pausado. Hasta que
  Gemini no entre, dos popovers es lo correcto.

**Hito 24 — `.jsonl` para `/resume` desde imports de ChatGPT**

Hoy el setting `exportal.alsoWriteJsonl` solo aplica a imports de
claude.ai. Para ChatGPT escribimos solo `.md` — el CHANGELOG de
0.10.0 lo dejó marcado explícitamente: *"la envelope Anthropic
asume claude shapes ... no maneja la estructura de mapping/branching
de ChatGPT directamente. Para v1 solo `.md`."*

**Scope**: traducir el mapping/branching de ChatGPT a la shape
`.jsonl` que Claude Code consume en `/resume` — eventos
`user`/`assistant` encadenados por `uuid`/`parentUuid`, bloques
`thinking`/`text`/`tool_use` shaped como Anthropic los emite.

Subtareas:
- Mapeo de `content_type` → bloques Anthropic: `text` → `text`
  directo; `thoughts` → `thinking` (semánticamente cercano,
  puede perder fidelidad); `multimodal_text` con `image_asset_pointer`
  → `image` blocks (requiere base64, ya hay path desde Tier 3 del
  Hito 21 si se cierra antes); `tool_use` con `recipient: 'browser'`
  / `python` → `tool_use` blocks (mapeo de IDs sintético, no
  reusable cross-session).
- Generación de UUIDs sintéticos para `parentUuid`/`uuid` que sigan
  la shape RFC-4122 que Claude Code valida.
- Decidir el `model` field — placeholder tipo `'gpt-4o (imported)'`
  o un valor que Claude Code tolere sin especular.
- Sidecar metadata (`ai-title`, `custom-title`, `last-prompt`) para
  que la conversación importada aparezca con título correcto en
  `/resume`.
- **Warning explícito al user**: el formato `.jsonl` ya está marcado
  experimental (es ingeniería inversa). Sumar otra capa de
  translation entre ChatGPT shapes y Anthropic shapes multiplica la
  fragilidad — toast "experimental, may break across Claude Code
  versions" cuando el feature se activa.

**Risk**: el feature parece nativo de Claude Code y silenciosamente
podría fallar tras un release que cambie shapes. Mitigación:
warning + setting opt-in separado (`exportal.alsoWriteJsonlChatGpt`)
para que el user que prefiera evitar el riesgo no se vea forzado.

**Disparador**: Hito 22 (Gemini import) cerrado o avanzado, así el
trabajo de mapping cubre dos providers de una.

## Backlog

Tier más abajo — útiles pero no en la cola activa.

### Imágenes inline del export de ChatGPT (Tier 3 del Hito 21)

Hoy las imágenes uploadeadas en chats de ChatGPT (`image_asset_pointer`
dentro de `parts[]`) se renderizan como `*[Image: file-XXX]*` legible
pero sin linkear al archivo físico. Los `file-XXX.jpeg` viven dentro
del ZIP del export.

**Scope para Tier 3**:
- Al importar un chat de ChatGPT, copiar los `file-XXX.jpeg`
  referenciados al `<workspace>/.exportal/<title>/` (carpeta hermana
  del .md, mismo patrón que Claude Design).
- Reescribir las references en el .md como `![](./file-XXX.jpeg)`
  para que el preview de markdown muestre las imágenes inline.
- Manejar también `metadata.attachments[]` (149 mensajes en el shape
  report del user) — son archivos uploadeados por canal distinto al
  multimodal_text. Verificar shape primero contra data real.

**Por qué no shippeó en 0.9.1**: requiere ampliar `JSZip.loadAsync()`
para extraer múltiples archivos del export, no solo `conversations.json`.
Reescribir references en el markdown post-render. Trabajo más grande
que justifica un release aparte.

### Flake intermitente de `npm run ci` en Windows (no reproducible)

Reportado durante los releases de 0.8.1 y 0.8.2: la primera corrida
de vitest falla con
`TypeError: Cannot read properties of undefined (reading 'config')`
en los 22 test files y la segunda pasa limpia.

**Sesión de investigación 2026-04-24**:
- 30 corridas consecutivas de `npm run ci` en frío (cache `.vite`
  borrado entre cada una, archivos tocados, full lint+typecheck+test+build) → **0 fallas**.
- 4 escenarios de `results.json` corrupto → vitest los maneja graceful.
- El error literal no aparece en las sources de vitest (es runtime
  error de JS), no se puede grepear el origen exacto.
- Patrón observado: aparece SOLO durante workflows con edición
  concurrente intensa (Claude Code escribiendo archivos mientras CI
  corre). En CI normal (GitHub Actions Linux) no se ve nunca.

**Datos frescos 2026-04-26** (durante el ciclo de Hito 29):
- **Reproducido una vez** después de ~6 ediciones consecutivas a
  `control-panel.ts` y `extension.ts` en el mismo segundo.
  Output exacto: 23 test files failed con "Tests no tests",
  duration 1.80s (vs ~4-7s normal — confirma que falló al cargar,
  no al correr). Mensaje: `TypeError: Cannot read properties of
  undefined (reading 'config')` en `tests/importers/claudeai/schema.test.ts:30:1`.
- Reintento inmediato (segundo `npm run test`) → 210/210 limpio.
- Confirma la hipótesis original: race entre file system writes
  recientes y el bootstrap de vitest. Sigue intermitente — no
  reproduce siempre, solo bajo ciertas combinaciones de timing.

**Datos frescos 2026-04-30** (durante el ciclo de Hito 30,
iteración 3 del cleanup):
- Reproducido **dos veces seguidas** (no resolvió con simple
  reintento esta vez). Misma firma: 24 test files failed,
  duration 1.67s y 1.69s.
- `rm -rf node_modules/.vite node_modules/.vitest && npm run test`
  → 252/252 limpio en 4.27s.
- Refina la hipótesis del race: los caches `.vite` y `.vitest`
  pueden llenarse de entries inconsistentes durante una cadena de
  edits rápidos a varios archivos (`extension.ts`, `package.json`,
  `package.nls*.json`, `bundle.l10n.es.json` en este caso). El
  reintento sin clear del cache reusa los entries inconsistentes
  y el flake persiste.
- **Mitigación pragmática a probar**: si reaparece, primer paso
  ahora es `rm -rf node_modules/.vite` antes del retry.

**Conclusión**: sin reproducción confiable, cualquier fix sería
cargo-culting. Las opciones consideradas y descartadas:
- `pool: 'forks'` con `singleFork: true`: enlentece tests 2-3x sin
  garantía de atacar la causa real.
- Auto-retry en el script de CI: esconde flakes transitorios pero
  agrega ruido visual ("Retrying...") en el caso raro.
- Cambiar de vitest a otro runner: cambio masivo para un bug raro.

**Reabrir cuando**: el flake reaparezca con datos frescos (output
completo, qué archivos se editaron antes, qué procesos corrían).

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

### Mejoras ergonómicas (segundo plano)

Items chicos de UX que entran cuando termine la cola de Hitos 30-34.
Bajo riesgo, valor incremental.

- README del repo: rehacer el header con GIF de 15s arriba + 2
  bullets ("qué hace" / "cómo lo instalo") y mover todo el detalle
  abajo. La pared de texto actual castiga al lector casual.
- `.exportal/README.md` auto-generado: cuando se crea la carpeta
  por primera vez, dejar un README chico que explique qué se guarda
  ahí + sugerir `.gitignore`. Evita que devs vean carpeta con punto
  y la borren por reflejo.
- FAB tamaño chico por default + expandirse en hover: aplica al
  chat normal de claude.ai. Hito 33 cubre Claude Design específicamente,
  esto es la mejora general adyacente.
- Histórico de imports en el panel de VS Code: lista de los últimos
  N imports con timestamp + título + botón "Reabrir .md". Memoria
  del producto, valor compuesto con uso prolongado.
- Quick-share del export: botones post-export "Copiar markdown al
  clipboard" y "Copiar como Gist link" (este último requiere `gh`
  CLI instalado). Abre caso de uso de compartir conversaciones con
  compañeros sin tocar Claude Code.

### Features nuevas — fáciles

Útiles, bajo riesgo, claro valor. Entran después de los Hitos 30-34
si no surge nada más urgente del primer batch de usuarios reales.

- **Búsqueda full-text en imports anteriores** (`.exportal/`).
  Search box en la tab de Exportal que devuelva matches sobre los
  `.md` ya importados. Valor crece con uso prolongado. No trivial
  pero no requiere infra nueva — `ripgrep`-like sobre el directorio.
- **Diff entre dos imports del mismo chat**. Caso: el user importó
  la semana pasada, sigue la conversación en claude.ai, vuelve a
  importar. Mostrar qué turnos son nuevos. Único en el mercado —
  ningún competidor lo tiene.

### Features nuevas — diferenciadoras (más difícil, mayor defensibilidad)

Estas requieren scope serio pero son lo que separa Exportal de un
exporter genérico si Anthropic eventualmente lanza sync nativo
claude.ai ↔ Claude Code. No empezar antes de tener tracción real
de los hitos previos.

- **Watch mode para una conversación**: marcar un chat como "live",
  cualquier turno nuevo en claude.ai se importa al `.md`
  automáticamente. Polling o WebSocket. Caso: dev con claude.ai
  abierto en otra pestaña, contexto siempre fresco en VS Code.
- **Bidirectional context sync**: una vez exportado, "linkear" la
  sesión de Claude Code resultante con el chat original; updates
  en Claude Code pueden ir de vuelta a claude.ai como mensaje
  nuevo. Convierte Exportal en capa de coordinación entre dos
  surfaces, no solo en puente. Donde está la verdadera defensibilidad
  si Anthropic lanza sync nativo.
- **Smart context trimming completo**: Hito 17 cubre "desde mensaje
  X". La versión completa: UI para seleccionar todos / últimos N /
  desde mensaje X / rango específico antes de exportar. Crítico
  para conversaciones largas — segunda feature más pedida según
  intuición.
- **Plugins / hooks system**: post-import, ejecutar script local
  del user. Casos: subir el `.md` a su wiki, agregarlo a un dataset,
  procesarlo con tooling propio. Solo vale si hay masa crítica de
  power users — no antes de 6 meses.

### Visibilidad y comunicación (plan extendido)

Complementa los items de visibilidad ya en Near-term. Acá la cola
detallada por canal y orden de retorno esperado.

**Canales en orden de prioridad**:

- `r/ClaudeAI` — público hyper-targeted, modera bien. Framing en
  primera persona ("I built a tool to bridge claude.ai and Claude
  Code"), no "check out Exportal".
- `r/vscode` — más grande, menos targeted. Ángulo "VS Code extension
  that does X" funciona si el demo es claro.
- **Show HN** — alto upside si pega, un solo intento. No quemar
  hasta tener: (a) Chrome Store aprobado, (b) VSIX en Marketplace
  estable, (c) video bueno, (d) `exportal.dev` funcionando.
- Twitter/X — amplificador, no fuente. Responder a posts donde
  otros mencionen el problema; no spammear.
- Discord de Anthropic + comunidades de Claude Code (Discord/Slack)
  — bajo costo de entrada, alto contexto.

**Awesome-lists** (bajo esfuerzo, SEO de cola larga):
`awesome-claude-code`, `awesome-vscode`, `awesome-chrome-extensions`.
PRs con una línea descriptiva.

**Issues temáticos** en repos donde aparece el problema (ej:
`anthropics/claude-code` discussions, threads de claude.ai donde
alguien pregunta "cómo paso este chat a Claude Code"). Comentario
útil que mencione Exportal entre varias opciones — relevancia,
no spam.

**Mientras Chrome Web Store sigue en review**: usar VS Code
Marketplace como producto principal del funnel (la 0.11.3 ya está
viva), y posicionar el Chrome companion como "step 2" que se
desbloquea post-aprobación. Subóptimo pero permite arrancar.

**NO hacer**:
- LinkedIn, salvo que tu audiencia esté ahí. No es donde está el
  público técnico que adopta tools indie.
- Product Hunt — Exportal demasiado nicho, PH premia generalismo.
- Pagar ads — el público (devs que ya usan Claude Code) no se
  alcanza bien por ads.

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
- **AI-powered summary del chat antes de importar**: viola zero-network,
  requiere API key del user, valor real bajo. Claude Code ya puede
  resumir el chat localmente cuando lo recibe.
- **Export a múltiples formatos sin demanda concreta** (PDF, Notion,
  Obsidian, JSON estructurado): scope creep enorme; cada formato
  trae su propio ecosistema de bugs. Si la respuesta mayoritaria
  del user es "solo lo uso para Claude Code", no agregar formatos.
  Reabrir si llega un caso de uso concreto y recurrente.

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
