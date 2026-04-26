# Exportal — Roadmap

Ideas y hitos futuros. Vivo, se actualiza cada vez que surge algo nuevo.
Items concretos y cerrados se mueven al `DEVLOG.md`. Releases formales al
`CHANGELOG.md`. Este archivo es solo la cola de lo pendiente.

## Near-term

- [ ] Verificar el flujo de instalación en una máquina limpia (vsix +
  zip del companion desde releases, emparejar, probar ambos sentidos).
- [ ] Subir los screenshots nuevos (ya en `docs/screenshots/exportal-s*-1280x800.png`)
  al detail page del Chrome Web Store y al listing del VS Code
  Marketplace. README ya está actualizado; queda el upload manual a
  los dos dashboards (no se puede automatizar).

## Próximos hitos — en orden de prioridad

El orden acá es deliberado: lo de arriba arranca antes que lo de
abajo. Cambios al orden se discuten explícitamente.

### Hitos 20-23 — Soporte multi-IA

**Hito 20 — Abstracción del core para múltiples proveedores**
- Hoy `importers/` tiene dos implementaciones paralelas (claude.ai +
  chatgpt). El refactor a union type sigue pendiente — descartado
  hasta el momento porque las dos shapes son lo suficientemente
  distintas que la abstracción terminaría leakeando.
- **Disparador**: cuando entre el tercer proveedor (Gemini), revisar
  si los patrones se repiten lo suficiente como para justificar
  generalizar. Si solo dos shapes, no vale.

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

### Auto-recovery del pairing token cuando el Companion lo pierde

Si el user reinstala el Chrome companion (loadear como unpacked,
borrar+reagregar, etc.), `chrome.storage` se resetea y el pairing
token desaparece. Hoy el FAB en cualquier site falla con
`no_token` sin guiar al user a la solución.

**Scope**:
- Detectar el caso `no_token` desde el background script (ya
  retornamos el código).
- En lugar de solo flashear el error en el botón, abrir
  programáticamente la options page del companion (donde el campo
  de paste del token vive).
- O mejor: detectar al activar el companion fresh que no hay
  token Y disparar el flow de pairing automático que ya tenemos
  (`exportal:openOptionsPage` mensaje + el toast de VS Code que
  abre el panel de pairing).

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
