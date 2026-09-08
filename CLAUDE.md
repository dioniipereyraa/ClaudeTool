# CLAUDE.md: Exportal

Puente entre **claude.ai / ChatGPT** y **Claude Code** (VS Code). Tres piezas en un repo: la
extensión de VS Code (`src/extension/`), el CLI (`src/cli/`, `src/core/`) y el Chrome Companion
(`chrome/`). El Companion habla con la extensión por un bridge HTTP en `127.0.0.1`, emparejado
por token.

**Este archivo son dos cosas y nada más: las reglas específicas del proyecto, y los bugs que ya
nos costaron caro.** Se lee entero antes de tocar código.

| archivo | qué es | cuándo se lee |
|---|---|---|
| `CLAUDE.md` (este) | reglas del proyecto y bugs con su regla | entero, antes de tocar código |
| `HANDOFF.md` | estado vigente y el próximo paso, en presente | al arrancar la sesión |
| `DEVLOG.md` | la historia del proyecto, una entrada por sesión, en pasado | cuando la versión corta no alcanza |
| `ROADMAP.md` | la cola larga de ideas y lo que queda fuera de scope | al planificar |
| `CHANGELOG.md` | los releases, formato Keep a Changelog | al cortar release |
| `SECURITY.md` | modelo de amenazas y controles | antes de tocar redacción, bridge o Companion |
| `CONTRIBUTING.md` | setup, scripts, cómo correr la extensión con F5 | para relanzar |

`DEVLOG.md` es público, lo linkean la landing y `CONTRIBUTING.md`; por eso no se renombra.

---

## Reglas del proyecto

### Idioma y forma

- **Inglés:** código, comentarios, strings de UI por defecto, README (los dos), CHANGELOG,
  commits, PRs, respuestas en issues. **Castellano:** `CLAUDE.md`, `HANDOFF.md`, `DEVLOG.md`,
  `ROADMAP.md`, y las traducciones `es` (`package.nls.es.json`, `l10n/bundle.l10n.es.json`,
  `chrome/_locales/es`). Decidido el 2026-04-29: el mercado es angloparlante.
- Commits estilo `feat(scope): …`, `fix(scope): …`, `docs: …`, `chore(release): x.y.z`. Sin
  firma de Claude (regla global).
- **Sin em dashes** en markdown informativo ni en copy de tiendas. Se usan comas, dos puntos o
  puntos. Dionisio los saca a mano cuando aparecen (2026-04-29 en la short description, 2026-09
  en la landing y en la documentación).
- **Dual README:** `README.md` (GitHub, con imágenes y sección Development) y `README.vsix.md`
  (Marketplace, sin imágenes) se mantienen en sync a mano; `scripts/package-vsix.mjs` los
  intercambia al empaquetar.
- Los `console.warn` de diagnóstico quedan en inglés y no pasan por i18n. Los badges del Companion
  (`OK`/`SET`/`AUTH`/`OFF`/`OLD`/`ERR`) no se traducen.

### Cómo se trabaja

- **Medir antes de diseñar.** Antes de asumir el formato de algo ajeno (un ZIP, un endpoint, un
  `.jsonl`) se mira una muestra real; el regex de `data-YYYY-MM-DD` y el `is_mcp_app: null` se
  cayeron por no hacerlo. El issue #1 se cerró con un test que probó que ya funcionaba.
- **Las decisiones de diseño se consultan** con la medición hecha y las opciones sobre la mesa
  (Hito 19: cuatro preguntas antes de codear; issue #2: opt-in con toggle).
- `npm run ci` (lint + typecheck + test + build) antes de cada commit. Es lo mismo que corre
  GitHub Actions.
- La lógica que se pueda testear sin `vscode` ni `chrome.*` va en módulos puros
  (`chrome/pure.js`, `src/extension/export-paths.ts`, `zip-finder.ts`, `http-server.ts`).
  Los webviews y el DOM del content script se prueban con smoke test manual, y el DEVLOG dice
  qué se probó y qué no.
- Cada release lleva smoke test con VSIX instalado y Companion cargado, contra un chat real.
- Silent patches (sin bump) se acumulan en `main` y se consolidan en el CHANGELOG del próximo
  bump; no se pierden.
- El "por qué" de cada decisión va al DEVLOG en el mismo commit; git ya tiene el "qué".
- No se abstrae un patrón hasta el tercer consumidor (dos importers paralelos hasta que entre
  Gemini; `pairAndOpenChrome` se extrajo recién con el tercer caller).

### Principios de producto que no se negocian

- **Zero-network en el producto:** ningún `fetch` fuera de `127.0.0.1` y de la API interna del
  sitio donde corre el content script. La landing puede cargar terceros, el producto no.
- **Fail-closed:** redacción activa por defecto (`--no-redact` pide confirmación), preview antes
  de escribir a disco, escritura atómica, `--yes` explícito sin TTY.
- **Todo lo que es PII o ingeniería inversa es opt-in:** `--redact-pii`, `alsoWriteJsonl`,
  `includeAccountEmail`. Y opt-in **en todas las capas**: si el toggle está apagado el Companion
  ni consulta el endpoint (2026-09-08).
- **El Companion no scrapea el DOM ni automatiza la UI.** Usa los mismos endpoints internos que
  el frontend del sitio, con la sesión del usuario, o el export oficial. Consumer Terms de
  Anthropic §3 (2026-04-18). Para escribir en claude.ai se copia al portapapeles y pega el
  usuario.
- **Cada permiso nuevo del manifest dispara re-review en Chrome Web Store** para todos los
  usuarios. `clipboardRead`, `notifications`, `webRequestBlocking` se descartaron por eso.

### Release

1. Bump en `package.json`, `package-lock.json` (dos campos: `version` y `packages[""].version`),
   `chrome/manifest.json`. El Companion se bumpea por simetría aunque no cambie.
2. Entrada en `CHANGELOG.md` con fecha. Si hubo silent patches, se consolidan acá.
3. `npm run package:vsix` y `npm run package:chrome`. Los artefactos son ignorados por git.
4. Tag `vX.Y.Z` → `release.yml` corre `npm run ci`, empaqueta y crea el GitHub Release. Hay un
   chequeo de que el nombre del artefacto coincide con el tag.
5. Subida a las tiendas: manual mientras no exista el paso de CI (plan en `HANDOFF.md`).
   Chrome Web Store pasa por review (horas a días); un rebote llega por mail.

### Bridge y Companion, lo que hay que saber

- Bridge en `127.0.0.1:9317-9326`, Bearer de 256 bits comparado con `timingSafeEqual`, rate
  limit por endpoint antes del auth, timeouts anti Slowloris, body cap 64 KB / 50 MB, Origin
  restringido a `chrome-extension://` si viene. `/ping` confirma pairing y publica flags
  (`wantsAccountEmail`).
- El token vive en el `globalState` de VS Code: uno por perfil, no por ventana ni por navegador.
  Cualquier Companion con el token habla con el mismo bridge.
- Un Companion cargado *unpacked* tiene **otro id de extensión** que el de la tienda: storage
  vacío, pairing aparte. Se empareja con `https://claude.ai/#exportal-pair=<token>`.
- MV3: el service worker se evicta a los ~30 s. Listeners a nivel de módulo, sin estado en
  variables de módulo, `chrome.storage.session` para estado de runtime y `local` para
  preferencias, `Port` persistente para polling largo.

### Landing (`docs/`)

- GitHub Pages desde `main`. CSP estricto: `font-src 'self'`, fuentes vendoreadas en
  `docs/fonts/`, `script-src 'self'` sin inline.
- Marca vigente: monocromo estricto, tinta `#1F1F1F`, sin acento de color. `design-cds/` es
  anterior al rebrand y no sirve de referencia.
- Los HTML de `docs/` no pasan por prettier (solo `script.js`).

---

# Los bugs, por familia, para no repetirlos

> Cada uno es el síntoma, la causa y la regla que salió. El relato completo está en `DEVLOG.md`
> en la fecha que se indica.

## A · Los formatos ajenos: lo que el otro sistema emite no es lo que uno supone

- **`optional()` no acepta `null`, y los dos proveedores mandan `null` explícito** · claude.ai
  emite `is_mcp_app: null`; OpenAI expresa "no aplica" con `null` en `tether_id`, `assets`,
  `response_format_name`: 43 de 145 conversaciones rebotaban. **Regla:** todo campo opcional de
  un formato ajeno es `.nullable().optional()`, y el consumidor coalesce con `??`. (2026-04-17,
  2026-04-26)
- **Un `discriminatedUnion` estricto convierte un bloque desconocido en cero conversaciones** ·
  claude.ai empezó a mandar `thinking` en Claude Design y todo el import daba `invalid_shape`.
  **Regla:** fail-soft ante tipos desconocidos, escrito desde el Día 0 y violado en un solo
  lugar; se filtran los tipos no modelados antes de validar. (2026-06-16)
- **La unidad de fallo tiene que ser el ítem, no el array** · una conversación con shape distinto
  tiraba las 145. **Regla:** parsear por conversación con warning, importar el resto; per-chunk
  también. (2026-04-26)
- **El export "grande" de ChatGPT no tiene `conversations.json`** · tiene `conversations-000.json`,
  `-001`… más `export_manifest.json`, y el reader fallaba con "is this the right ZIP?".
  **Regla:** validar contra un export real de una cuenta grande antes de dar por cerrado un
  importer; el shape report (`scripts/chatgpt-shape-report.mjs`) reporta metadata sin contenido.
  (2026-04-26)
- **Un `.passthrough()` de Zod 4 propaga `{[x:string]: unknown}` y rompe el tipado** · en el
  importer de ChatGPT `mapping[k]` terminaba `any`. **Regla:** passthrough en claude.ai (campos
  futuros), strip con campos explícitos en ChatGPT; se decide por schema, no por costumbre.
  (2026-04-23)
- **El nombre del ZIP no es lo que la documentación dice** · `data-YYYY-MM-DD` no existía; el
  real era `data-<uuid>-<ts>-<hash>-batch-0000.zip`. **Regla:** el regex de un nombre ajeno se
  escribe con un archivo real al lado, y el test lleva el nombre real. (2026-04-17)
- **`atob()` devuelve Latin-1 y `JSON.parse` no chista** · el chat de Claude Design salía con
  `extensiÃ³n`. **Regla:** todo base64 se decodifica a bytes y después con `TextDecoder('utf-8')`;
  `res.json()` lo hace solo, `atob` no. (2026-04-23)
- **El endpoint `?rendering_mode=messages` sustituye los bloques que "el device" no renderiza
  por un literal** · `This block is not supported on your current device yet.` aparecía 11 veces
  en el `.md` y en el `.jsonl`. **Regla:** limpiar en la capa de datos, antes de cualquier
  formatter, con match exacto y un test de near-miss. (2026-04-23)
- **`model_editable_context` y similares son configuración interna, no conversación** · bloques
  `## Assistant` huecos. **Regla:** lista `INTERNAL_CONTENT_TYPES` y test de invariante "un solo
  heading Assistant". (2026-04-26)
- **Los eventos sidecar del `.jsonl` (`ai-title`, `custom-title`, `last-prompt`) se descartaban
  como "unmodeled"** y la QuickPick no tenía título. **Regla:** al inspeccionar un formato,
  listar todos los tipos que aparecen, no solo los que se renderizan. (2026-04-25)
- **El `thinking` del `.jsonl` de Claude Code lleva una `signature` firmada por Anthropic** que
  no se puede forjar. **Regla:** skip total, no "emitir sin firma y rezar". (2026-04-23)
- **claude.ai trunca en silencio pegados de más de 100K caracteres.** **Regla:** el `.md` se guarda
  siempre en `.exportal/` como fallback para arrastrar; el modal de "copiar igual" era un callejón.
  (2026-04-25)
- **Un fixture con un secreto demasiado corto cae en el patrón siguiente** · `sk-ant-…` de 18
  caracteres se redactó como `openai`. **Regla:** respetar el largo mínimo de cada patrón en los
  fixtures. (2026-04-17)

## B · Chrome MV3 y el Companion: el transporte tiene reglas propias

- **El service worker se evicta a los ~30 s y se lleva los listeners dinámicos y las variables de
  módulo** · **Regla:** listeners top-level en `onChanged`, estado en `chrome.storage`, y para
  polling largo un `Port` persistente que mantiene vivo el SW. (2026-04-18, 2026-04-26)
- **`chrome.tabs.create({url:'vscode://'})` desde el SW no abre VS Code** · el dispatch de un
  scheme custom exige un gesto de usuario reciente, que vive en la página y se pierde al pasar
  por `sendMessage`. **Regla:** el wake se dispara con un iframe oculto desde el content script.
  (2026-04-26)
- **El `setTimeout` de una pestaña en background se congela** · el polling en page context se
  paraba al cambiar de pestaña. **Regla:** el polling va en el SW vía Port; la página solo espera.
  (2026-04-26)
- **"ECONNREFUSED es instantáneo en localhost" no vale con firewall estricto** · en Windows con
  antivirus cada puerto cerrado esperaba ~2 s de TCP timeout: diez puertos en serie, 20 s. Los
  logs decían `pingBridge: 20165ms`. **Regla:** probes en paralelo con `Promise.allSettled` y
  `AbortController` de 500 ms; nunca asumir el entorno del usuario. (2026-04-26)
- **`Uri.parse` re-encodea el `=` del fragment en algunas builds de VS Code** y el regex del
  Companion no matcheaba. **Regla:** `Uri.from` con componentes explícitos. (2026-04-22)
- **claude.ai puede vaciar `window.location.hash` antes de `document_idle`** · **Regla:** fallback
  a `performance.getEntriesByType('navigation')[0].name` para recuperar la URL original.
  (2026-04-22)
- **Agregar una `kind` en `pure.js` y olvidar la whitelist del consumidor** · el FAB en
  chatgpt.com se renderizaba y el click moría en silencio. **Regla:** una sola fuente de verdad
  (`KNOWN_ROUTE_KINDS`), test de invariante "toda kind emitida está en la whitelist", y un
  `console.warn` permanente en cada silent-return. (2026-04-26)
- **`instanceof Error` falla entre realms** (content script, página, `vm` de los tests) ·
  **Regla:** `explainError` duck-typea `.message`. (2026-04-20)
- **`pure.js` no puede ser ESM** · los `content_scripts` y los SW clásicos no aceptan
  `type: module`. **Regla:** IIFE clásica con `module.exports` al pie; un archivo, tres
  consumidores. (2026-04-20)
- **Un `display: inline-flex` más específico pisa el atributo `hidden`** · dos pills vacíos en el
  banner. **Regla:** `button:not([hidden])` y `button[hidden] { display: none }`. (2026-04-30)
- **Un banner que se renderiza desde `?reason=` queda pegado mostrando un estado viejo** ·
  **Regla:** escuchar `chrome.storage.onChanged` del `badgeState` y actualizar en vivo.
  (2026-04-30)
- **El click en el icono borraba el badge de error antes de que el usuario leyera nada** ·
  **Regla:** el estado del badge se persiste en `storage.session` y el click enruta al fix;
  solo `OK` es transitorio. (2026-04-30)
- **Un guard "no editar el token si ya está pareado" impedía cambiar de token** · **Regla:**
  comparar contra el token guardado, no bloquear el input. (2026-04-30)
- **`chrome.runtime.openOptionsPage()` no acepta query string** · **Regla:** para pasar `reason`
  se usa `tabs.create` con la URL completa. (2026-04-30)
- **Cada export creaba un `AudioContext` y Chrome acumula hasta avisar** · **Regla:** `close()`
  después del tail del sonido. (2026-04-30)
- **El Companion pierde el token al recargarse unpacked** (Chrome resetea `chrome.storage` de un
  id nuevo) · el FAB fallaba con "Error, see console". **Regla:** `no_token` abre Options con un
  mensaje específico. (2026-04-26, 2026-04-29)
- **"Difiere entre A y B" no es "está instalado"**: Chrome no expone si otra extensión existe.
  **Regla:** la única señal fiable de Companion instalado es su `/ping`. (2026-04-30)

## C · El bridge y la extensión de VS Code

- **El bridge respondía `200 ok:true` cuando el import fallaba** · `openConversationFromZip`
  atrapaba el error y lo mostraba en VS Code. **Regla:** en la ruta del bridge `{ rethrow: true }`;
  el llamador externo tiene que enterarse. (2026-04-18)
- **Race en `activate()`: el dispose se registraba en el `.then()`** · si VS Code desactivaba
  antes, quedaba un server huérfano con el puerto tomado. **Regla:** registrar el disposable
  sincrónicamente con flag `disposed`. (2026-04-18)
- **`ExtensionContext` está congelado** · `context.pairingPanel = …` tiraba
  `object is not extensible`. **Regla:** singletons en variables de módulo. (2026-04-22)
- **`vscode.l10n.t()` en tiempo de carga del módulo devuelve la clave sin traducir** · **Regla:**
  se llama adentro de la función que la usa, después de que cargó el bundle. (2026-04-21)
- **`insertAtMention` de Claude Code lee el editor activo y `asRelativePath`** · un documento
  untitled no resuelve. **Regla:** persistir a `<workspace>/.exportal/` antes del @-mention.
  (2026-04-20)
- **Un toast después de `claude-vscode.focus` le roba el foco al input** · **Regla:** el foco es
  la última operación del handler; sin toast. (2026-04-30)
- **El toast de "paired" se disparaba en cada `/ping`** (el Companion pingea en cada carga de
  claude.ai) y salían tres toasts por export. **Regla:** flag `pairConfirmedForToken` en
  `globalState`, uno por token; el rotate lo limpia. Y un toast por import, el `.jsonl` va como
  sufijo. (2026-04-30)
- **El drop de archivos externos nunca llega al iframe del webview**: el workbench lo intercepta.
  **Regla:** no insistir con workarounds; auto-detect de descargas con `fs.watch` gateado por
  visibilidad. (2026-04-26)
- **Chrome escribe `.crdownload` y renombra** · reaccionar al primer evento encuentra un archivo
  incompleto. **Regla:** debounce de 1,5 s. (2026-04-26)
- **Un `notifyPostImport` fire-and-forget se pierde si el panel está cerrado**, que es justo el
  caso real. **Regla:** `pendingImportFilename` con versión para no borrar el import siguiente
  desde el dismiss del anterior. (2026-04-30)
- **`vsce` no honra excepciones `!node_modules/…` en `.vscodeignore`** · **Regla:** esbuild copia
  los codicons a `assets/` y de ahí entran al VSIX. (2026-04-26)
- **`vsce` rechaza `files` en `package.json` junto con `.vscodeignore`**, y exige
  `@types/vscode` ≤ `engines.vscode`. **Regla:** solo `.vscodeignore`; types `~1.85.0`.
  (2026-04-18)
- **El README estaba en UTF-16 LE** (redirección de PowerShell) y se veía como jeroglíficos en el
  Marketplace. **Regla:** UTF-8 sin BOM, y las imágenes con URL absoluta a
  `raw.githubusercontent.com`. (2026-04-18, 2026-04-20)
- **`fetch` de Node mantiene un pool keep-alive por origen** · un socket a un server ya cerrado
  en el mismo puerto revienta con `ECONNRESET` en el test siguiente. **Regla:** en los tests del
  bridge se usan sockets crudos (`agent: false`), y las funciones puras (`checkRateLimit`) se
  prueban como puras con `now` inyectado. (2026-04-30, 2026-09-08)
- **Respuestas tempranas sin drenar el body desincronizan un keep-alive pipelined** · **Regla:**
  `sendErrorJson` hace `req.resume()`. (2026-04-30)
- **`Content-Length` no numérico hacía `NaN > cap`**, siempre falso. **Regla:**
  `Number.isFinite` antes de comparar. (2026-04-29)
- **Un extension host al 100% de CPU no es necesariamente nuestro** · tras una recarga el bridge
  no contestaba ni un 404 durante cinco minutos; el perfil por el inspector (puerto `/json` que
  VS Code ya expone) mostró a Copilot escaneando el workspace. **Regla:** antes de culpar a
  Exportal, perfilar; y un bridge que no contesta un 404 es el proceso, no la ruta. (2026-09-08)

## D · Redacción y seguridad

- **El regex de paths se comía el backtick de cierre de un code span** · **Regla:** excluir
  `` ` `` `"'<>|` de la clase de caracteres; test de regresión. (2026-04-16)
- **Los patrones de secretos tienen falsos negativos por diseño** · **Regla:** el detector es
  una señal; la preview obligatoria y la confirmación son la otra mitad. Los falsos positivos
  sobre fixtures propios son el comportamiento correcto. (2026-04-17)
- **La landing decía "PII redactada" y el código no lo hacía** (deriva doc/código del audit) ·
  **Regla:** `--redact-pii` real (email, IPv4, IPv6) y `SECURITY.md` reescrito con lo que hay.
  Nombres y teléfonos fuera de scope por precisión. (2026-04-30)
- **Un filename puede escapar de la carpeta o spoofear la extensión** · `..`, drive letters,
  `cool[U+202E]gnp.exe`, `CON`/`PRN`. **Regla:** `sanitizeAssetFilename` rechaza todo eso; el
  regex bidi se construye con `new RegExp('\\u…')` para no tropezar con
  `no-irregular-whitespace`. (2026-04-23, 2026-04-30)
- **Una URL `javascript:` en una cita renderiza un link malicioso** · **Regla:** whitelist
  `http:`, `https:`, `mailto:`; lo demás va en backticks. (2026-04-30)
- **Un webview comprometido podía ejecutar cualquier comando de VS Code** · **Regla:** whitelist
  en `runCommand`, sin loguear el comando rechazado (sería otro leak). (2026-04-30)
- **El rate limit va ANTES del auth** para que spam de tokens malos no mantenga
  `timingSafeEqual` caliente. Per-IP no aplica en loopback. (2026-04-30)
- **`Origin` ausente se permite** (curl, tests, VS Code interno); el Bearer es la frontera real.
  (2026-04-29)
- **Un link `claude.ai/#exportal-pair=ATTACKER` puede pisar el token del Companion** · peor caso:
  el próximo export falla con `AUTH` y el usuario re-empareja. Documentado, aceptado. (2026-04-22)
- **`readJsonl` sin cap** ante un `.jsonl` patológico. **Regla:** 200 MB. Y 100 MB en el file
  picker, 50 MB en auto-discovery. (2026-04-29, 2026-04-30)
- **ANSI en stdout del CLI es terminal injection** · **Regla:** `stripTerminalControl` antes de
  imprimir; `--out` preserva los datos. (2026-04-30)

## E · Tiendas, release y la landing

- **Chrome Web Store dejó una versión semanas en review** (0.5.7) mientras el producto avanzaba
  seis minors. **Regla:** reemplazar la submission trabada por la actual; las justificaciones del
  listing tienen que coincidir con el manifest que se sube (el reviewer las compara).
  (2026-04-29)
- **Los content scripts NO son "código remoto"** en el form de CWS: viajan en el `.crx`.
  (2026-04-29)
- **La short description del manifest no se edita desde el dashboard**: hay que re-empaquetar.
  (2026-04-29)
- **`package-lock.json` quedó cinco releases atrás** porque el bump manual no lo tocaba.
  **Regla:** el bump toca los dos campos del lock (alineado el 2026-09-08). (2026-04-26)
- **GitHub sanitiza `<video>` en el README y una URL pelada no embebe** · **Regla:** subir el
  MP4 por la UI de GitHub (comment box) y usar la URL `user-attachments`. (2026-04-29)
- **Un GIF de 816 KB era el LCP y los hints de preload no movían la aguja** · **Regla:** MP4 con
  ffmpeg (`-crf 28 -preset slow`, 165 KB); el peso manda, no la prioridad. (2026-04-29)
- **El texto literal del Contributor Covenant lo marcan los clasificadores de contenido** ·
  **Regla:** CoC por link canónico + contacto. (2026-04-29)
- **Cloudflare no acepta un Worker con custom domain si el apex ya apunta a GitHub Pages** ·
  **Regla:** las subpáginas viven en `docs/<ruta>/index.html`. (2026-04-29)
- **`chrome --headless --window-size=390` no da 390 en macOS** (clampa a 500 y recorta) ·
  **Regla:** medir `innerWidth`; para móvil, `<iframe width="390">` o emulación por CDP.
  (2026-09-07)
- **Un audit de accesibilidad sobre una página con fade-in mide el contraste con la opacidad del
  momento** · 99 fallas imposibles. **Regla:** auditar una copia con las animaciones apagadas.
  (2026-09-07)
- **`pathLength="1"` + `non-scaling-stroke` y `offset-path` sobre `<circle>` no son universales**
  (Safari) · **Regla:** `getTotalLength()` + transición CSS, y `<animateMotion>` + `<mpath>`
  nativos. (2026-09-07)
- **El flake de vitest en Windows** (`Cannot read properties of undefined (reading 'config')`,
  corrida de <2 s, cwd con la letra del drive en minúscula) · **Regla:**
  `rm -rf node_modules/.vite node_modules/.vitest` y reintentar; aparece tras ráfagas de edición.
  (2026-04-17 en adelante)
- **Cada `sharp` postinstall sale a la red** (dev-only, aceptado). Los artefactos no van firmados;
  las tiendas son el trust anchor. (2026-04-30)

## F · Proceso: lo que costó tiempo sin ser un bug de código

- **Cinco slides promocionales en español en una landing en inglés** parecían "el producto", y
  no lo eran. **Regla:** en la landing va un sample real de Markdown y un diagrama, o capturas
  reales. (2026-04-29)
- **Una feature nueva que nadie descubre** (`.jsonl` para `/resume`, tab dedicada) porque solo
  vivía en el CHANGELOG. **Regla:** README y un tip en el onboarding en el mismo release.
  (2026-04-23)
- **Un QuickPick "¿dónde emparejar?" que nadie necesitaba** se agregó y se sacó una semana
  después. **Regla:** hardcodear el caso del 99% (claude.ai) y sacar el comando muerto entero,
  con sus strings. (2026-04-30)
- **Un mensaje de error genérico ("Error, see console") es un funnel-killer.** **Regla:** cada
  código de error del Companion tiene su string y su acción (`no_token` abre Options, `OFF`
  ofrece Retry y Open VS Code). (2026-04-29, 2026-04-30)
- **Un `.gitignore` con `settings.local.json` deja pasar el próximo archivo de `.claude/`** ·
  **Regla:** ignorar la carpeta. (2026-04-29)
- **El botón secundario del popover se mostraba en Claude Design donde no podía funcionar**
  (la URL expone el project UUID, no el chat UUID). **Regla:** esconder lo que daría un no-match
  silencioso. (2026-04-23)
- **El FAB tapaba el Send de Claude Design** · se prefirió un offset estático por ruta a detectar
  el CTA por DOM, que se rompe en silencio. (2026-04-30)
- **Un sonido "de victoria" se iteró cuatro veces** (frecuencias, duración, arpegio, A/B con
  cuatro variantes). **Regla:** cuando el criterio es perceptual, armar un bloque DEV-only con
  variantes para comparar y borrarlo después. (2026-04-30)
