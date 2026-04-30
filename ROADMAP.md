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
- [ ] `vsce publish` de la 0.11.2 al VS Code Marketplace para que
  el nuevo `displayName` ("Exportal — Bridge between Claude.ai/
  ChatGPT and Claude Code") tome efecto en el listing. Bloqueado
  por: PAT de Microsoft, pendiente que Dioni lo configure local.
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

### Hitos 30-34 — Ergonomía y UX (prioridad inmediata)

Estos cinco salen antes que el avance multi-IA. Razón: el funnel
real de adopción se rompe en onboarding y en detalles UX visibles
(FAB que tapa el submit, estados rojos sin acción evidente, falta
de feedback en el momento de éxito). Lo que ya funciona necesita
pulido antes de sumar más superficie.

**Hito 30 — Onboarding wizard de instalación**

Hoy el flujo de primer uso es: instalar VS Code extension → ver
panel con token → copiar token → instalar Chrome companion → abrir
options page → pegar token → emparejar. Aún con el botón "Copiar
y abrir Chrome" son dos instalaciones en dos lugares antes de
ver valor. Funnel-killer #1.

**Scope**:
- En el primer activate del VS Code extension sin pairing previo,
  disparar un wizard visual de dos pasos.
- Step 1 of 2: "Install Chrome companion" — link directo al Chrome
  Web Store (cuando apruebe la 0.11.2) o a las instrucciones de
  sideload del ZIP mientras tanto. Detect del estado de la review
  via setting (manual por ahora, eventualmente fetch del listing).
- Step 2 of 2: "Pair" — el panel muestra el token con copy
  automático al clipboard + botón "Open Chrome companion options".
- Post-pairing: notificación "Probalo ahora — andá a un chat de
  claude.ai/ChatGPT y tocá el botón Exportar". Una sola decisión
  visible.
- Setting `exportal.onboardingComplete` para no repetir.
- Skippable con "Skip — ya sé lo que hago" para users avanzados.

**Risk**: el wizard puede ser intrusivo si el user reinstala. El
setting `onboardingComplete` debe ser per-machine, no per-workspace.

**Hito 31 — Sonido al exportar (default ON, opt-out)**

Feedback auditivo en el momento de éxito. Slack, GitHub Desktop
y Stripe lo hacen — funciona como confirmación + dopamina chica.
Default ON: la mayoría de la gente lo descubre solo si suena.
Quien lo encuentre molesto lo apaga con un toggle obvio.

**Scope**:
- Setting `exportal.exportSound` (default `true`).
- Toggle visible en Settings de la extensión y en el popover del
  Chrome companion. Tiene que ser fácil de encontrar — el camino
  para silenciarlo no debe requerir más de 2 clicks.
- Primer export exitoso: toast no-bloqueante "Exported ✓ — silenciar
  sonido" con link al toggle, para que quien quiera apagarlo lo
  vea sin tener que ir a buscar.
- Sonido corto (200-400ms), tipo "click" o "swoosh" sutil. Estilo
  iMessage send, no notificación de WhatsApp. Asset WAV/MP3 ~5KB
  embebido en el VSIX y en el ZIP del companion.
- Donde dispara: Chrome (al confirmar export) y/o VS Code (al
  recibir el archivo). Una sola fuente — probablemente Chrome,
  más cerca del click del usuario.
- Respetar mute global del SO / del browser: si el usuario tiene
  el tab muteado o el sistema en silencio, no forzar sonido.

**Risk**: el sonido elegido puede ser molesto. Mitigación: toggle
obvio + probar con varios devs antes de shippear. Si la gente lo
pide, agregar 1-2 alternativas ("click", "chime", "off") como
setting separado.

**Hito 32 — Badge inteligente del icono Chrome companion**

Hoy el badge muestra estado (`OK`/`SET`/`OFF`/`AUTH`/`OLD`/`ERR`).
El usuario que ve `AUTH` rojo no sabe qué hacer sin abrir el
popover y leer. Fricción innecesaria de recuperación.

**Scope**:
- Click en el icono cuando hay estado de error abre directo a la
  página de fix del error específico, no al popover genérico:
  - `AUTH` → página de pairing con el token a la vista.
  - `OFF` → instrucciones cortas de levantar el bridge en VS Code
    + botón de reintentar.
  - `OLD` → CTA de upgrade del companion / VSIX con el delta de
    versión visible.
  - `ERR` → log con el último error capturado y botón "Retry".
- Estado verde (`OK`/`SET`) sigue abriendo el popover normal.
- Tooltip al hover en estado de error: síntoma + acción primaria
  en una línea.

**Risk**: bajo. Cambio aislado al click handler del action +
páginas dedicadas para cada error state (algunas ya existen
parcialmente).

**Hito 33 — FAB en Claude Design no debe tapar el submit**

Bug observado por Dioni: en Claude Design (flow de design questions
de claude.ai), el FAB tapa ~85% del submit button. El submit sigue
siendo clickeable (la zona descubierta basta), pero visualmente
está oculto y la UX se rompe — el user piensa que no puede enviar
mientras Exportal esté activo.

**Scope**:
- Detectar el layout de Claude Design vs claude.ai chat normal
  (URL pattern + DOM signature del flow de design questions y su
  CTA inferior). Probar el detect en sesión real antes de shippear.
- Cuando estamos en flow de design con CTA inferior, reposicionar
  el FAB: arriba a la derecha, o más arriba que en chat normal,
  o auto-ocultar mientras hay CTA activo (decidir cuál basado en
  prueba real — el objetivo es 0% overlap visual con el submit).
- Test manual: ciclo completo de design question respondiendo
  con el submit visible al 100%.
- Considerar también para chat normal: FAB más chico por default,
  expandirse en hover. Decisión adyacente — puede salir en este
  mismo hito o quedar como mejora de seguimiento.

**Risk**: el detect "estamos en flow de design" puede ser frágil
si Anthropic cambia el DOM. Fail-safe: si no detecta, mantener
posición actual — peor caso queda como hoy (submit clickeable
pero tapado), no peor que el bug actual.

**Hito 34 — Templates post-import**

Cuando el usuario importa un chat a Claude Code, lo siguiente que
hace es escribir un prompt tipo "continuá esto, vengo de claude.ai".
Si el extension le ofrece templates seleccionables después del
import, reducimos fricción y educamos sobre qué se puede hacer
con el contexto importado.

**Scope**:
- Después de un import exitoso, el panel de Exportal en VS Code
  muestra 3-4 templates clickables:
  - "Continuar la conversación"
  - "Resumir y planear próximos pasos"
  - "Convertir los puntos discutidos en issues de GitHub"
  - "Generar tests basados en lo conversado"
- Click en un template → genera el prompt en el textbox de Claude
  Code (no auto-submit — el user revisa y dispara).
- Templates editables vía setting `exportal.postImportTemplates`
  (array de strings) para que power users los customicen.
- Mostrar solo cuando el panel está abierto post-import; no como
  toast modal.

**Risk**: bajo. Feature aditiva, ignorable, no afecta a quien no
la quiere usar.

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
