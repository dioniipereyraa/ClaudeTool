# ClaudeTool — Devlog

Bitácora de desarrollo. Una entrada por sesión de trabajo significativa.
Cada entrada cubre: **qué hicimos**, **por qué**, **qué viene**.

Para releases formales ver `CHANGELOG.md` (cuando exista).
Para el modelo de amenazas ver `SECURITY.md` (cuando exista).

---

## 2026-04-16 — Día 0 · Planificación inicial

### Qué hicimos
- Inspeccionamos el formato `.jsonl` de Claude Code en `~/.claude/projects/` para entender su estructura real: eventos `user` y `assistant` encadenados por `uuid` / `parentUuid`, con `thinking`, `text` y `tool_use` anidados dentro de `message.content`. También eventos internos `queue-operation` a ignorar.
- Definimos el alcance en **tres fases**:
  1. CLI que exporta una sesión de Claude Code a Markdown limpio.
  2. Import desde el ZIP de export de claude.ai a un `context.md`.
  3. Extensión de VS Code que envuelve las dos direcciones con UI.
- Elaboramos el **modelo de amenazas**: activos sensibles (API keys leídas por tools, paths absolutos, PII, código propietario) y controles (redacción default-on, preview obligatoria, zero-network en Fase 1).
- Planeamos la arquitectura en capas puras: **Reader → Parser → Normalizer → Redactor → Formatter → Writer**.

### Decisiones clave y por qué
- **TypeScript + Node 20 LTS** (no Python): reuso directo del `core/` en Fase 3 (extensión VS Code).
- **Single package, no monorepo**: YAGNI. Si Fase 3 crece, se extrae `core/` entonces.
- **Zod para validar cada evento**: el formato `.jsonl` no está documentado; lo tratamos como API externa inestable. Fail-soft ante tipos desconocidos.
- **Stream-first con `readline`**: los `.jsonl` pueden pesar MB, nunca cargar entero en memoria.
- **Redacción activa por defecto**: fail-closed. `--no-redact` requiere confirmación interactiva explícita.
- **Preview antes de escribir**: el usuario nunca debería sorprenderse por lo que termina en el Markdown.

### Fuera de scope (explícito)
- Cifrado del export en disco.
- Sincronización automática bidireccional.
- Transmisión de exports por red.

### Pendiente antes del próximo paso
- Confirmar gestor de paquetes: **`pnpm`** (recomendado) vs `npm`.
- Confirmar visibilidad del repo: **público en GitHub** (para portafolio) vs privado.
- Confirmar si hay ajustes al plan.

### Próximo paso
- **Hito 1 — Bootstrap**: `package.json`, `tsconfig.json` estricto, ESLint, Prettier, vitest, GitHub Actions CI (lint + test + build). Primer commit `chore: bootstrap`.

---

## 2026-04-16 — Hito 1 · Bootstrap de toolchain

### Qué hicimos
- Nombre del paquete definido: **`exportal`** (el directorio y repo siguen como `ClaudeTool`; renombrar el repo de GitHub es decisión futura, no bloquea).
- `package.json` con `type: "module"`, engines Node ≥20, scripts `build`, `dev`, `test`, `lint`, `format`, `typecheck`, `ci`.
- TypeScript estricto (`tsconfig.json`): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`. `tsconfig.build.json` separado para compilación de producción (solo `src/`).
- ESLint 9 flat config con `typescript-eslint` type-checked + stylistic, `eslint-plugin-import-x` (regla `no-extraneous-dependencies` como sustituto del strict-resolution de pnpm), orden de imports, `consistent-type-imports`. Rules type-aware aplicadas solo a `src/` y `tests/`.
- Prettier + `eslint-config-prettier` para evitar conflictos.
- Vitest con cobertura v8 y thresholds (lines/stmts 80%, branches 75%).
- Scaffolding mínimo: `src/index.ts`, `src/cli/index.ts` (placeholder imprimiendo versión), `tests/smoke.test.ts`.
- Meta: `LICENSE` (MIT), `README.md` reescrito en UTF-8 limpio (el original tenía BOM UTF-16), `SECURITY.md` con modelo de amenazas, `.editorconfig`, `.gitignore` (incluye `.claude/settings.local.json`, `*.export.md`, `exports/`).
- CI de GitHub Actions (`ci.yml`): `lint → typecheck → test → build` en `ubuntu-latest` con Node 20.

### Decisiones técnicas del hito
- **Upgrade a vitest 4.x** tomado voluntariamente: vitest 2.x arrastraba `vite@5` + `esbuild@0.24` con CVEs moderados (dev-server path traversal). No nos afectaban en la práctica (`vitest run` one-shot, no watch-server expuesto), pero como tenemos 1 solo test el costo de migración es cero y queda `npm audit` en verde.
- **`overrides.esbuild: ^0.25.0`** en `package.json` como defensa en profundidad: aunque tsx u otras deps pidan `esbuild@0.24`, quedan forzadas al parcheado.
- **Directorio del proyecto queda `ClaudeTool`** aunque el paquete sea `exportal`: renombrar ahora rompería el remote de Git ya linkeado sin ganancia real. Separación paquete/directorio es aceptable.
- **`type: "module"` + NodeNext**: ESM nativo, nada de CommonJS, alineado con el ecosistema actual.
- **No se instalaron aún `commander` ni `zod`**: YAGNI hasta Hito 2.

### Verificación
- `npm run ci` pasa limpio: lint ✓, typecheck ✓, 1/1 test ✓, build ✓.
- `node dist/cli/index.js` → `exportal 0.0.0`.
- `npm audit` → 0 vulnerabilidades.

### Próximo paso
- **Hito 2 — Core: reader + schema + parser**. Implementar:
  - `src/core/reader.ts` — descubrir sesiones en `~/.claude/projects/` y streamear líneas de un `.jsonl`.
  - `src/core/schema.ts` — Zod schemas versionados para los tipos de evento (`user`, `assistant`, `queue-operation`, ...).
  - `src/core/parser.ts` — parseo línea-a-línea con fail-soft.
  - Fixtures sintéticas en `tests/fixtures/` y tests unitarios por módulo.

---

## 2026-04-16 — Hito 2 · MVP end-to-end funcional

### Qué hicimos
Cambio de estrategia respecto al plan original: en vez de ir capa-por-capa (reader → schema → parser → normalizer → formatter), fuimos directo a un **MVP funcional** (`exportal list` + `exportal export <sessionId>`) con todas las capas en su versión mínima. Razón: tener algo usable en días, no semanas, y dejar que los problemas reales guíen el refactor de los siguientes hitos.

**Módulos nuevos en `src/`:**
- `core/types.ts` — interfaces de eventos (`UserEvent`, `AssistantEvent`, `ContentBlock` unión discriminada) + type guards `isUserEvent` / `isAssistantEvent`. Sin Zod todavía.
- `core/paths.ts` — constantes `CLAUDE_HOME` / `PROJECTS_DIR` + `encodeProjectDir(cwd)` que invierte la convención `d:\...` → `d--...` de Claude Code (best-effort, documentado como frágil).
- `core/reader.ts` — `readJsonl(path)` fail-soft: salta líneas mal formateadas en vez de abortar. In-memory por ahora; streaming es refactor futuro.
- `core/session.ts` — `listProjectDirs()`, `listSessionFiles(dir)`, `describeSession(file)` (deriva metadata del primer evento de cada tipo usando `??=`).
- `redactors/paths.ts` — regex para paths Windows y `/home` / `/Users`. Exclusión de ``\`" '<>| ` `` en la clase de caracteres para no romper code spans de markdown.
- `redactors/secrets.ts` — 5 patrones: Anthropic (`sk-ant-`), OpenAI (`sk-`/`sk-proj-`), GitHub clásico (`ghp_`…), GitHub fine-grained (`github_pat_`…), AWS access key (`AKIA…`). Reporta `byType`.
- `redactors/index.ts` — `redact(text, report)` componedor con `RedactionReport` mutable para acumular contadores sin recrear objetos por línea.
- `formatters/markdown.ts` — convierte eventos a Markdown con header + merge de turnos consecutivos del mismo rol. Ignora `tool_use` y `thinking` en MVP.
- `cli/commands/list.ts` — defaults al cwd actual; soporta `--all` y `--project <dir>`.
- `cli/commands/export.ts` — valida `sessionId` con regex, `--out`, `--no-redact`, imprime resumen de redacción a stderr.
- `cli/index.ts` — `commander` como único framework CLI.

**Tests (23 pasando en 8 archivos):**
- Fixture sintética `tests/fixtures/minimal.jsonl` con eventos válidos + línea corrupta + `queue-operation` (basura ignorable) para verificar fail-soft.
- Cobertura directa de reader, session, encodeProjectDir, redactPaths, redactSecrets, composer, formatAsMarkdown.
- Coverage excluye `src/cli/**` y `src/index.ts`: el CLI se smoke-testea manualmente, el core se cubre exhaustivamente.

### Decisiones técnicas del hito
- **Sin Zod todavía**: type guards manuales alcanzan para MVP y son más baratos de escribir. Zod entra en Hito 3 cuando endurezcamos el parsing contra cambios de formato.
- **In-memory vs streaming**: `readJsonl` carga el archivo entero. Trade-off explícito documentado en la docstring. Para sesiones típicas (cientos de KB) es un no-issue; cuando aparezca una sesión de >10MB refactoreamos.
- **Merge de turnos consecutivos**: cuando Claude emite varios `assistant` seguidos (thinking → tool_use → text → tool_use → text…), los colapsamos en un solo `## Assistant`. La alternativa (una sección por evento) producía Markdown ilegible con headers cada 3 líneas.
- **`tool_use` y `thinking` se omiten en MVP**: decisión consciente para que el output sea leíble como conversación. Flags `--include-tools` / `--include-thinking` son iteración futura.
- **Redacción default-on, `--no-redact` imprime WARNING a stderr**: sin prompt interactivo todavía. Prompt interactivo es iteración futura (Hito 3).
- **`RedactionReport` mutable**: no es el estilo más puro, pero evita allocar un objeto por cada string redactado. Sigue siendo testeable porque el composer devuelve el mismo report pasado.

### Verificación
- `npm run ci` — 23/23 tests ✓, lint ✓, typecheck ✓, build ✓.
- Manual: `node dist/cli/index.js list` encontró la sesión actual (111 turnos). `export` la volcó a 516 líneas de Markdown con 6 paths redactados correctamente, code spans preservados.
- Bug encontrado y arreglado en el manual test: regex de paths no excluía backticks, por lo que consumía el cierre de code spans. Agregado ``\` `` a la exclusion class + test de regresión.

### Limitaciones conocidas (para próximos hitos)
- Encoding del project dir es heurístico (``[:\\/.] → -``). Si Claude Code cambia la convención, solo `--all` va a seguir funcionando.
- Sin validación de esquema — un evento con forma inesperada se ignora silenciosamente.
- Sin preview interactiva antes de escribir con `--out`.
- `tool_use` y `thinking` no se renderean.
- Las regex de secretos tienen falsos negativos por diseño (el detector es una señal, no la garantía).

### Próximo paso
- **Hito 3 — Endurecimiento**: Zod schemas versionados, preview interactiva obligatoria antes de `--out`, `--include-tools` y `--include-thinking`, más patrones de secretos, streaming reader para sesiones grandes.

---

## 2026-04-16 — Hito 3 · Zod schemas + soporte de `/compact`

### Qué hicimos
Alcance reducido respecto al plan original: en vez de meter Zod + preview interactiva + flags de tools/thinking en el mismo hito, separamos. **Este hito cubre Zod schemas y compact.** Preview interactiva pasa a Hito 4, tools/thinking a Hito 5 (opcional). Razón: el usuario pidió explícitamente "ir de a poco pero saber que lo que estamos haciendo está perfecto", y Zod + compact ya es un delta sustancial que merece su propia verificación.

**Módulos nuevos y refactors:**
- `src/core/schema.ts` — Zod schemas para todos los tipos de evento (`user`, `assistant`, `system`). Cada objeto usa `.passthrough()` para forward-compat con futuros campos que Claude Code agregue. Los bloques de contenido (`text`, `thinking`, `tool_use`, `tool_result`) son una `z.discriminatedUnion('type', …)`. Export `parseEvent(raw): Event | null` con `safeParse` → fail-soft en la frontera. El tipo `CompactBoundary` se deriva como `SystemEvent & { subtype: 'compact_boundary' }`.
- `src/core/compact.ts` — helpers de compact: `isCompactBoundary`, `isCompactSummaryUser`, `findLatestCompactBoundaryIndex` (scan inverso manual, ver decisión abajo), `skipBeforeLatestCompact` (slice desde el boundary más reciente).
- `src/core/types.ts` — colapsado a re-exports de `schema.ts` + la interfaz `SessionMetadata`, que ahora incluye `compactCount: number`.
- `src/core/reader.ts` — ahora retorna `Event[]` validado. Cualquier línea cuyo `JSON.parse` falle **o** cuyo `parseEvent` devuelva `null` (ej: `queue-operation`, `attachment`, `ai-title`) se descarta silenciosamente. Dos capas de fail-soft.
- `src/core/session.ts` — usa `event.type === 'user' | 'assistant'` directo (ya no hay type guards manuales). Eventos `isCompactSummary: true` **no cuentan** como turno para evitar doble conteo; los `compact_boundary` incrementan el nuevo `compactCount`.
- `src/formatters/markdown.ts` — firma cambió a `events: readonly Event[]`. Renderiza:
  - `compact_boundary` → línea de blockquote con trigger y preTokens.
  - usuario con `isCompactSummary: true` → su propia sección `## Compact summary` (en vez de mislabelarlo como `## User`).
  - `FormatOptions.skipPrecompact` → descarta todo antes del boundary más reciente.
  - Header: `- **Compactions:** N` si hay al menos una, y `- **Pre-compact events:** omitted` si el flag está activo.
- `src/cli/commands/export.ts` — nueva flag `--skip-precompact`.

**Tests (37 pasando en 10 archivos):**
- `tests/core/schema.test.ts` — valida happy-path, passthrough de campos desconocidos, rechazo de tipos unmodeled (`queue-operation`, `attachment`), rechazo de payloads inválidos, soporte de `isCompactSummary`.
- `tests/core/compact.test.ts` — identifica boundary y summary, encuentra el índice del boundary, funciona con sesiones sin compact.
- `tests/fixtures/with-compact.jsonl` — fixture sintética: user, assistant, boundary, compact summary, user, assistant.
- `tests/formatters/markdown.test.ts` — extendido con dos tests de rendering de compact (con y sin `skipPrecompact`).
- Tests existentes de `reader` y `session` actualizados para reflejar la nueva semántica (queue-operation ya no aparece en la salida, `compactCount: 0` en la fixture minimal).

### Decisiones técnicas del hito
- **Validar en el reader, no en callers**: el pre-review inicial dejaba `reader.ts` sin cambios, pero al escribir `parseEvent` quedó claro que la frontera natural es el reader. Mover la validación a los callers duplicaría el `parseEvent` en cada punto de entrada y dejaría el tipo `unknown[]` filtrándose. Desviación explícita del pre-review, documentada aquí.
- **`.passthrough()` en todos los objetos**: el formato `.jsonl` de Claude Code no está documentado. Si Anthropic agrega un campo `turnIndex` mañana, no queremos invalidar eventos válidos. Trade-off: algunos typos pasan desapercibidos. Mitigado por fixtures + tests que chequean campos específicos.
- **Compact summary es `## Compact summary`, no `## Assistant (compact summary)`**: estructuralmente es un evento `user`, pero el contenido fue generado por Claude durante `/compact`. Etiquetarlo como assistant sería engañoso; `## Compact summary` es fiel a la naturaleza bridge-summary del evento.
- **Scan inverso manual para `findLatestCompactBoundaryIndex`**: `Array.prototype.findLastIndex` es ES2023 y el target del proyecto es ES2022. Preferimos un loop manual antes que ampliar `lib` a `ES2023.Array` — menos superficie de cambio por una necesidad puntual.
- **`isCompactSummary` user events no cuentan como turno**: si los contáramos, `describeSession` reportaría 1 turno extra por cada compact. Son sintéticos del harness, no del usuario humano.
- **Reset de `lastRole` tras un boundary o summary**: el merge de turnos consecutivos se interrumpe visualmente al cruzar un compact, así la estructura post-compact comienza con un `## User` o `## Assistant` nuevo aunque el último evento real haya sido del mismo rol.

### Verificación
- `npm run ci` — 37/37 tests ✓, lint ✓, typecheck ✓, build ✓.
- Manual contra una sesión real con 2 compactions (`d--Dionisio-ClockInTransnova/04f5ef13-…jsonl`):
  - Sin flag: 1549 líneas, header reporta `**Compactions:** 2`, ambos boundaries visibles con trigger y preTokens, dos secciones `## Compact summary` intactas, 92 paths redactados.
  - Con `--skip-precompact`: 1180 líneas, solo el boundary más reciente, header muestra `**Pre-compact events:** omitted`, 90 paths redactados.
- Paths post-Windows (`C:\Users\...`) correctamente redactados en ambos casos.

### Limitaciones conocidas (para próximos hitos)
- Sigue sin haber preview interactiva antes de escribir (Hito 4).
- `tool_use` y `thinking` siguen omitidos (Hito 5, opt-in).
- Streaming reader sigue pendiente; in-memory es suficiente por ahora.
- Si Claude Code introduce un nuevo `subtype` de `system`, se parsea (passthrough) pero no se renderea especialmente — solo `compact_boundary` tiene tratamiento.

### Próximo paso
- **Hito 4 — Preview interactiva obligatoria**: mostrar las primeras/últimas N líneas antes de escribir con `--out`, confirmación `[y/N]`, flag `--yes` para CI. Sin prompt para stdout (no es escritura persistente).

---

## 2026-04-17 — Hito 4 · Preview interactiva + hardening de escritura

### Qué hicimos
Este hito arrancó como "preview obligatoria antes de `--out`" y creció a tres mejoras chicas pero relevantes que comparten el mismo espíritu (prevenir sorpresas en la escritura a disco): preview + confirm, no-pisa-sin-permiso, y escritura atómica. Todo pensado para que la semántica se trasvase idéntica a la extensión VS Code en Fase 3, donde el mismo `buildPreview()` alimenta un webview y `confirm()` se reemplaza por un botón.

**Módulos nuevos:**
- `src/cli/preview.ts` — función pura `buildPreview(markdown, outPath, report, redactionEnabled, { headLines, tailLines })` + helper `humanSize(bytes)`. Head/tail/gap si supera el umbral, documento entero si es corto, footer con path + tamaño legible + resumen de redacción. Sin side-effects, 100% testeable.
- `src/cli/prompt.ts` — `confirm(question): Promise<boolean>` con `node:readline/promises`, output a **stderr** para no contaminar stdout. Default **No**: solo `y` / `yes` (case-insensitive, tras `.trim()`) retorna `true`. `stdinIsTTY()` para detectar pipes.

**`src/cli/commands/export.ts` reescrito:**
- Dos ramas: stdout (como antes, sin cambios) vs `--out` (flujo nuevo).
- Nuevas flags: `--yes` / `-y` para saltar el prompt, `--force` / `-f` para pisar archivos existentes. **Ortogonales**: `--yes` salta confirmación de contenido, `--force` salta chequeo de existencia. En CI usás las dos.
- Guardas en orden:
  1. Si el archivo destino existe y no hay `--force` → error claro y abort.
  2. Si no hay `--yes` y stdin no es TTY → error pidiendo `--yes` o terminal interactiva (fail-closed: nunca colgarse esperando input imposible).
  3. Si no hay `--yes` y sí hay TTY → imprime preview a stderr + `WARNING` extra si `--no-redact` está activo + prompt. `n`/Enter/cualquier otra cosa cancela con mensaje "Cancelled. No file was written." (exit 0, no es error).
- **Escritura atómica**: `writeFile(out + '.tmp')` → `rename(tmp, out)`. Un Ctrl+C o falla de disco mid-write deja el archivo original intacto (o ningún archivo), nunca un `.md` truncado. Si el `rename` falla, cleanup best-effort del `.tmp`.

**Tests:**
- `tests/cli/preview.test.ts` con 9 casos: documentos cortos (sin truncar), largos (con marker de N lines omitted), verificación de path/tamaño/lineas en footer, 3 estados del resumen de redacción (con datos / sin datos / desactivada), humanSize en bytes/KB/MB.
- CLI commands siguen excluidos de coverage (smoke-test manual).
- Total: 46/46 tests pasando, 11 archivos.

### Decisiones técnicas del hito
- **Preview a stderr, no stdout**: stdout queda reservado para el markdown en modo "sin --out" (piping). Contaminarlo con líneas separadoras rompería cualquier `exportal export ... > archivo.md`. stderr es el canal correcto para "información para humanos".
- **Default No en el prompt** (consistente con `--no-redact` que tampoco es default): el usuario opta **in** a una acción persistente, nunca opta out por descuido o por apretar Enter rápido.
- **Fail-closed en pipe sin `--yes`**: antes que colgarse esperando input imposible o auto-asumir "sí porque no hay manera de preguntar", error claro que instruye qué hacer. Es el mismo principio que el `WARNING` de redacción: ruido ahora para evitar sorpresas después.
- **`--force` no implica `--yes`**: son dos dimensiones distintas. `--force` dice "sé que existe, pisalo". `--yes` dice "confío en el contenido, no me muestres el preview". Combinándolas das las dos autorizaciones. Forzarlas juntas sería menos expresivo.
- **Umbral del preview = 40 líneas** (head=15 + tail=15 + buffer=10): si el archivo tiene ≤40 líneas se muestra entero (evita truncar un export diminuto y mostrar "[... 0 lines omitted ...]"). Arriba de 40 se trunca simétricamente. Umbrales arbitrarios pero razonables; si después se pide configurabilidad, `--preview-lines N` entra fácil.
- **Atomic write siempre, no opcional**: es gratis en disco local. El costo de "¿y si dejo un `.md` corrupto?" en un hito que se llama "preview obligatoria" sería inconsistente con su propio nombre.
- **Separación `preview.ts` pura + `prompt.ts` con I/O**: la pura se testea a muerte, la de I/O se smoke-testea. Esta frontera es exactamente la que la extensión de Fase 3 va a explotar: reusar `buildPreview()` directo y reemplazar `confirm()` por UI.

### Verificación
- `npm run ci` — 46/46 tests ✓, lint ✓, typecheck ✓, build ✓.
- Smoke tests automatizables (bash):
  1. `--out --yes` → escribe, no deja `.tmp`, exit 0, resumen de redacción post-write. ✓
  2. `--out --yes` sobre archivo existente → error claro "already exists. Pass --force". Archivo original intacto. ✓
  3. `--out --force --yes` sobre archivo existente → pisa OK, sin `.tmp` residual. ✓
  4. `echo "" | node dist/cli/index.js export ... --out X` (stdin pipeado, sin `--yes`) → error claro pidiendo `--yes` o TTY. No escribe archivo. ✓
- Smoke tests interactivos (PowerShell, confirmados por el usuario):
  1. `--out` sobre archivo inexistente → muestra preview + prompt. `y` escribe correctamente. ✓
  2. Mismo comando con archivo existente → rechaza sin `--force`. ✓
  3. `--out --force` (sin `--yes`) → pide confirmación de nuevo (correcto: `--force` y `--yes` son ortogonales). ✓
  4. Responder Enter/`n` al prompt → "Cancelled. No file was written." Archivo original con `LastWriteTime` sin modificar (verificado vía `Get-Item`). ✓

### Flake transitorio (vale mencionarlo)
- El primer `npm run ci` tras abrir PowerShell después del descanso falló en todos los test files con `TypeError: Cannot read properties of undefined (reading 'config')`. El reporte de vitest mostraba el cwd como `d:/Dionisio/ClaudeTool` (minúscula) en vez de `D:/Dionisio/ClaudeTool` (mayúscula). Una segunda ejecución idéntica pasó limpio (path volvió a mayúscula). Parece interacción rara entre npm, vitest v4 y el casing de drives en Windows; no es reproducible on-demand. Queda anotado por si reaparece.

### Limitaciones conocidas (para próximos hitos)
- `tool_use` y `thinking` siguen omitidos del markdown (Hito 5, opcional).
- El preview trunca líneas, no los runs de conversación completos. Si la conversación arranca con una pregunta de 40 líneas, el "head" va a estar todo dentro de ese primer turno. Aceptable: el header antes de los 15 siempre es parte del head.
- Sin paginación del preview para documentos gigantes — si querés ver las 500 líneas del medio, abrís el archivo con `--yes` y lo inspeccionás vos.

### Próximo paso
- **Hito 5 (opcional) — Opt-in render de `tool_use` / `thinking`**: flags `--include-tools` y `--include-thinking`. Decisión de UX pendiente (colapsables, summary-only, full). Podría saltarse si preferimos ir directo a **Hito 6 — Fase 2 (import desde ZIP de claude.ai)**, que tiene más valor de producto.

---

## 2026-04-17 — Hito 5 · Opt-in render de `tool_use`, `tool_result` y `thinking`

### Qué hicimos
Dos flags nuevas, ortogonales, apagadas por defecto: `--include-tools` y `--include-thinking`. El default del exporter sigue siendo "conversación legible como chat" (solo texto). Las flags agregan fidelidad sin romper el caso común. Decidimos hacerlo ahora — en vez de saltarlo hacia Fase 2 — porque es barato y completa la herramienta: la extensión VS Code de Fase 3 va a exponer estas flags como toggles en la UI reusando exactamente el mismo `formatAsMarkdown`.

**`src/formatters/markdown.ts`:**
- `FormatOptions` gana `includeTools?: boolean` e `includeThinking?: boolean`.
- `extractText` reemplazado por `renderBlocks(content, { includeTools, includeThinking })`: itera los bloques en su orden original y emite una línea por cada uno según el tipo. Texto plano sigue pasando igual; thinking/tool_use/tool_result solo si la flag correspondiente está activa. Si `content` viene como string (forma legacy de user events) se devuelve tal cual.
- Render de `thinking`: blockquote multilínea con label `*[thinking]*` en la primera línea. Todas las líneas prefijadas con `> ` para que Markdown las agrupe.
- Render de `tool_use`: `<details><summary>` con nombre de la tool en `<code>` + `id` en `<sub>`. Input serializado como JSON pretty-print dentro de fence `json`.
- Render de `tool_result`: `<details>` análogo con `for id: <tool_use_id>` en el summary. Content puede ser string, array de bloques, u otro JSON: lo manejamos los tres.
- Helper `fenceCode(text)`: usa fence de 4 backticks si el contenido ya contiene ` ``` ` (típico cuando un `tool_result` incluye un bloque de código). Evita que el markdown interno rompa el outer block.
- Header nuevo: `- **Includes:** thinking, tools` aparece si alguna flag está activa.

**`src/cli/commands/export.ts`:**
- `--include-tools` y `--include-thinking` como flags booleanas independientes. Se pasan al formatter solo si están activas (patrón `...(opts.foo === true && { foo: true })` consistente con `exactOptionalPropertyTypes`).

**`tests/formatters/markdown.test.ts`:**
- 5 casos nuevos bajo `formatAsMarkdown — tools and thinking rendering`:
  1. Default sin flags → solo texto, sin `<details>`, sin `*[thinking]*` (regresión explícita).
  2. Solo `includeThinking` → blockquote con label y multilínea; sin `<details>`.
  3. Solo `includeTools` → `<details>` con tool_use y tool_result; redacción aplica a paths dentro del JSON de input.
  4. Ambas flags → header `**Includes:** thinking, tools`, todo renderizado.
  5. Tool result con triple backtick interno → fence exterior de 4 backticks para no escaparse.

### Decisiones técnicas del hito
- **`<details>` HTML sobre Markdown puro**: GitHub y VS Code soportan `<details>`/`<summary>` nativos y los colapsan por default. Un export con 200 tool calls sigue siendo legible como conversación, con los detalles escondidos. La alternativa (usar headers tipo `#### tool: Read`) llenaba el outline con ruido.
- **Orden de bloques preservado**: si el asistente emitió `[thinking, tool_use, text, tool_use, text]`, el markdown lo refleja tal cual. Reordenar (tipo "primero todo el texto, después las tools") rompería el hilo causal.
- **Tool result NO se aparea visualmente con su tool_use**: viven en eventos distintos (assistant emite el call, el siguiente user event trae el result). Apararelos visualmente exigiría indexar los tool_use_ids y reordenar. Decidimos **no hacerlo**: el `id: <toolu_...>` en el summary ya permite correlacionarlos para quien los quiera buscar, y el orden cronológico es más honesto.
- **JSON input pasa por redact()**: los paths y secretos embebidos en un `Write` o `Edit` son exactamente el tipo de cosa que el redactor tiene que atrapar. Confirmado en el smoke test: al exportar nuestra propia sesión con `--include-tools`, la cuenta de paths redactados saltó de 14 a 308 y aparecieron "secretos" (falsos positivos por los fixtures `sk-ant-api03-abcdef...` que copy-pegamos en el código). Comportamiento correcto: fail-safe.
- **Compact summary renderiza siempre como solo-texto**, incluso con flags activas. Un summary es conceptualmente text — no tiene sentido mostrar tools "dentro" de un resumen.
- **Sin truncar inputs enormes**: un `Write` con 5000 líneas genera un `<details>` de 5000 líneas. Aceptable porque está colapsado por defecto. Si en la práctica molesta, `--tool-input-limit N` es un cambio chico. YAGNI por ahora.

### Verificación
- `npm run ci` — 51/51 tests ✓ (5 nuevos), lint ✓, typecheck ✓, build ✓.
- Smoke test sobre la sesión actual del exportal (la que estamos conversando ahora):

  | flags | líneas | redacción |
  |---|---|---|
  | (default) | 1255 | 14 paths |
  | `--include-thinking` | 1256 | 14 paths |
  | `--include-tools` | 9235 | 308 paths + 10 secretos (fp esperados) |
  | ambas | 9235 | idem |

  El salto 1255 → 9235 con `--include-tools` confirma el tamaño: los tool inputs de Write/Edit dominan el output. El default sigue siendo práctico como "chat para leer", `--include-tools` es para auditoría completa.

- Inspección visual del output: `<details>` + `<summary>` correctamente cerrados, fences JSON bien identados, `id:` visible para correlación. Triple-backtick en tool_result escapado con fence de 4 (confirmado en test dedicado).

### Falso positivo conocido
- Grep sobre el export con `--include-tools` lo reporta como "Binary file matches" — hay algún escape de terminal (probablemente ANSI de algún `ls --color` o spinner de npm) capturado en un tool_result. No es problema del formatter; es fidelidad del contenido original. `grep -a` lo trata como texto y funciona normal. Si molesta, podríamos strip de control chars en `renderToolResultContent`, pero arriesgaría alterar contenido legítimo.

### Estado de Fase 1
Con Hito 5 cerrado, Fase 1 (CLI export de Claude Code → Markdown) está **funcionalmente completa**:
- Descubrimiento de sesiones (`list`).
- Export validado con Zod (`export`).
- Soporte de `/compact` (automático + manual, con flag `--skip-precompact`).
- Redacción por defecto (paths + 5 patrones de secretos), `--no-redact` con warning.
- Preview interactiva obligatoria con fail-closed, `--yes` / `--force` / atomic write.
- Opt-in de tools y thinking.

### Próximo paso
- **Hito 6 — Fase 2 (inicio): import del ZIP de claude.ai**. Primero: inspeccionar un export real de claude.ai (pedirle al usuario que exporte su cuenta desde Settings → Export data) para entender estructura del ZIP, formato de los JSONs de conversación, y los assets adjuntos. Recién con eso claro, decidir alcance del hito.

---

## Hito 6 — Import claude.ai ZIP: schema, reader y `import list` (2026-04-17)

### Objetivo
Primer paso concreto de Fase 2: leer un export oficial de claude.ai (`data-*-batch-0000.zip`) y listar las conversaciones que contiene. Sin markdown todavía — primero probamos que el pipeline de apertura + validación funciona, después pensamos el render.

### Inspección previa (antes de escribir código)
- El ZIP trae 4 archivos JSON, cada uno un array top-level:
  - `users.json` — perfiles de cuenta (UUID, nombre, email, teléfono).
  - `memories.json` — el "conversation memory" consolidado de la cuenta.
  - `projects.json` — proyectos del usuario, con docs anidados.
  - `conversations.json` — el payload principal: array de conversaciones con mensajes.
- No hay directorios, ni binarios: los attachments vienen inline con `extracted_content` (texto ya extraído del PDF/DOC/etc.), y los `files` son solo referencias (`file_uuid` + `file_name`, sin los bytes).
- Los senders son `human` / `assistant` (en Claude Code son `user` / `assistant` — atención al mapear después).
- Los bloques de contenido son `text`, `tool_use`, `tool_result`. **No hay `thinking`** en el export web.
- Un `tool_use` tiene muchos campos MCP/integrations (`is_mcp_app`, `mcp_server_url`, `integration_name`, `integration_icon_url`, `icon_name`, etc.) — en la inspección inicial los anotamos todos.
- Un tamaño real: 7 conversaciones, 280 mensajes, la más grande con 246 mensajes.

### Alcance del hito (lo que SÍ entra)
1. **Zod schemas** para los 4 JSON files, todos con `.passthrough()` (misma política que los schemas de Claude Code: aceptar campos futuros sin romper).
2. **Reader** (`readClaudeAiExport(zipPath)`) que abre el ZIP con jszip y parsea los 4 archivos. Fail-hard si falta/rompe `conversations.json`; fail-soft sobre los otros tres (van a `warnings[]`).
3. **CLI**: `exportal import list <zip>` que imprime las conversaciones ordenadas por fecha descendente, con UUID, cantidad de mensajes y título truncado.
4. **Tests**: schema (válidos, passthrough, rechazos) + reader con ZIPs sintéticos construidos in-memory con jszip (happy path, optional missing, optional invalid JSON, optional invalid schema, conversations missing, conversations invalid).

### Alcance del hito (lo que NO entra)
- Markdown output de una conversación — eso es Hito 7.
- Manejo de attachments (solo validamos el schema, no los extraemos).
- UI interactiva para seleccionar conversaciones — el listado por stdout alcanza para probar el pipeline.
- Redactor sobre el output — todavía no estamos emitiendo contenido sensible; solo UUIDs y títulos.

### Decisiones técnicas del hito
- **jszip sobre adm-zip/yauzl**. Razones:
  - API promise-native (`loadAsync`, `file().async('string')`) — encaja con el resto del código que ya es async/await.
  - **Zero native deps**: instalación idempotente en Windows/Linux/Mac sin node-gyp.
  - **Funciona idénticamente en el browser**: cuando lleguemos a Fase 3 (extensión VS Code) podemos reusar el mismo reader sin tocar nada. yauzl y adm-zip son Node-only.
  - `adm-zip` tuvo históricamente CVEs de path traversal. No nos afecta directamente (no extraemos a disco, solo leemos entries nombrados) pero es señal.
- **Namespace `src/importers/claudeai/`**: dejamos la puerta abierta a otros importadores (ChatGPT exports, Gemini, lo que sea) sin refactor. El CLI subcomando `import <source>` también lo prevé — por ahora solo `--source claudeai` (default).
- **Fail-soft en JSONs auxiliares, fail-hard en conversations.json**: la conversación es el payload principal; sin eso no hay herramienta. Los otros tres son contexto útil pero opcional — un usuario podría hacer un export recortado, o Anthropic podría cambiar el formato de `projects.json` sin tocar `conversations.json`, y no queremos que eso rompa el import. Las incidencias se exponen por `warnings[]` y el CLI las imprime a stderr.
- **Schema defensivo en booleans**: `is_mcp_app` aparece como `null` en bloques reales (no `false` ni ausente). Lo definimos `.boolean().nullable().optional()`. Mismo patrón que usamos para los strings de integraciones (`integration_name`, `mcp_server_url`). Lección: nunca asumir `optional` es suficiente — Anthropic emite `null` explícito en varios campos.
- **ZIP in-memory completo (sin streaming)**: exports típicos son <10MB (prose + JSON). Streaming sumaría complejidad sin beneficio medible. Cuando alguien reporte un export de 100MB, revisamos.
- **Tests con ZIPs sintéticos construidos en runtime**: usamos jszip para generar ZIPs en memoria dentro de `mkdtemp(os.tmpdir())`, cleanup con `afterEach`. Ventaja: no chequeamos fixtures binarios al repo, los escenarios (malformed JSON, schema inválido, archivos faltantes) son triviales de expresar en código, y cada test es autocontenido.

### Problema encontrado durante la prueba manual y cómo lo resolvimos
- **Primer run contra el ZIP real**: `conversations.json failed schema validation`. Corrimos un script de debug con `safeParse` directo e imprimimos las 15 primeras issues — todas eran `is_mcp_app: null` en tool_use blocks. Nuestro schema lo tenía como `z.boolean().optional()`. Lo relajamos a `.nullable().optional()` y resolvió las 15 issues sin tocar más nada. Post-fix: el ZIP real lista correctamente las 7 conversaciones.
- **Lint fallo en `import.ts`**: usamos el literal `'claudeai'` como tipo de `opts.source`, y ESLint se quejó de `template literal expression never` en la rama de error (TypeScript inferió `never` porque el if descarta el único valor posible). Solución: tipar `source: string` — es más honesto, el valor viene del runtime de commander y cualquiera puede pasar `--source algo_raro`.

### Verificación
- `npm run ci` → **68/68 tests** ✓ (17 nuevos: 10 schema, 7 reader), lint ✓, typecheck ✓, build ✓.
- Prueba manual contra el ZIP real (`C:/Users/dioni/Downloads/data-...-batch-0000.zip`):
  ```
  # claude.ai export  (7 conversations)
    555f61a8-...  [2026-04-16] messages=6    Exportar chats de Claude AI a VS Code
    792bd257-...  [2026-04-15] messages=4    Dominio y curvas de nivel de función lineal
    09b71f49-...  [2026-04-15] messages=16   Redacción de solicitud para pasantía en TELUS Digital
    289ac9dc-...  [2026-04-13] messages=246  Cotizar y desarrollar web para carnicería familiar
    2d9206b0-...  [2026-04-06] messages=2    Continuidad vs diferenciabilidad en un punto
    5fd4933d-...  [2026-04-06] messages=4    Problemas de conexión con VS Code
    81dce8b5-...  [2026-03-12] messages=2    Exportar conversación de Claude entre sistemas operativos
  ```
  Coincide con la inspección inicial del ZIP. Sin warnings (los 4 JSON se parsearon OK).

### Próximo paso
- **Hito 7 — render Markdown de una conversación de claude.ai**. `exportal import show <zip> <conversationId>` (o `--all`) que toma una conversación y emite Markdown con la misma estética que el export de Claude Code, reusando el redactor. Mapear `human` → `## User`, `assistant` → `## Assistant`. Decidir cómo mostrar tool_use/tool_result web-específicos (web_search con citations es el caso interesante) y cómo tratar attachments (`extracted_content` inline como bloque aparte? ignorar?). Decisión sobre archivos faltantes: probablemente omitir o mostrar solo el nombre.

---

## Hito 7 — Render Markdown de conversaciones claude.ai + `import show` (2026-04-17)

### Objetivo
Segundo paso de Fase 2: `exportal import show <zip> <conversationId>` que toma una conversación web y la emite como Markdown con la misma estética que el export de Claude Code. Con esto ya se puede "unir chats entre plataformas" copy-pasteando el resultado como contexto a Claude Code — el MVP funcional de la visión del producto.

### Alcance del hito (cerrado)
1. **Refactor preparatorio chico**:
   - Extraer helpers compartidos de markdown a `src/formatters/markdown-shared.ts` (`fenceCode`, `stringifyJson`, `renderToolUse`, `renderToolResult`).
   - Extraer I/O del CLI a `src/cli/io.ts` (`writeWithPreview`, `writeSummary`, `atomicWrite`).
   - `src/cli/commands/export.ts` y el futuro `show` consumen los helpers. Sin copy-paste, mismo comportamiento del Hito 4 (preview + atomic + fail-closed).
2. **Formatter nuevo** `src/formatters/claudeai-markdown.ts`:
   - `## User` para sender `human`, `## Assistant` para sender `assistant`.
   - Merge de turnos consecutivos del mismo rol (como el formatter de Claude Code).
   - `--include-tools` reutiliza `<details>` del shared module — idéntica UX visual.
   - `--include-attachments` renderiza `extracted_content` como `<details><summary>📎 adjunto: file.txt</summary>`.
   - `files[]` (referencias a binarios ausentes del ZIP) se imprimen como nota corta `*[archivo adjunto: X — binario no incluido]*`.
   - **Citations → footnotes Markdown** `[^N]` agrupadas al final del párrafo + sección `## Referencias` al pie con las URLs.
3. **CLI nuevo**: `exportal import show <zip> <conversationId>`:
   - Match exacto por UUID o por prefijo único (paste-friendly — podés agarrar los primeros 8 chars del `import list` output).
   - Opciones `--out`, `--no-redact`, `--include-tools`, `--include-attachments`, `--yes`, `--force`, `--source`.
   - Reusa toda la maquinaria de preview interactiva + atomic write + redacción del Hito 4.
4. **Tests** (9 nuevos): header, merge de roles, redacción, citations con footnotes, default oculta tools, flags los muestran, attachments opt-in, file refs siempre visibles, skip de mensajes vacíos.

### Decisiones técnicas
- **Citations como footnotes agrupadas, no inline por offset**. Razón: claude.ai devuelve `start_index` / `end_index` sobre el texto original (pre-render), que puede haber sido modificado por tools. Un offset errado deforma el párrafo entero. Los markers agrupados al final del bloque (`... texto final.[^1][^2][^3]`) es el patrón que usan la mayoría de las UIs de AI (ChatGPT, Perplexity). Simple, robusto, y GitHub/VS Code lo renderizan nativo como nota al pie.
- **Sección final `## Referencias`, no `## Footnotes`**. Argentinismo consciente: todo el resto del output (header, bloques de attachments, warnings) está en español rioplatense. Consistencia con el tono de la herramienta.
- **Attachments opt-in, file refs always-on**. El `extracted_content` de un attachment es potencialmente enorme (un PDF de 20 páginas sale como texto plano) — por default lo escondemos. Las refs a archivos que NO están en el ZIP sí las mostramos siempre porque es info que el lector debería saber para entender por qué "el mensaje menciona una imagen que no veo".
- **Match por prefijo único**. `import list` muestra UUIDs completos pero nadie los paste-ea enteros. `import show ... 81dce8b5` funciona si hay una única conversación que empieza con eso; si hay ambigüedad, explota con un error claro. UX decisión chica que ahorra mucha fricción en la práctica.
- **Shared helpers vs "formatter universal"**. Consideramos unificar en un único formatter con un `adapter` por plataforma, pero los schemas son muy distintos (sender `human`/`user`, presencia/ausencia de `thinking`, citations, attachments). Hubiera terminado siendo un switch gigante. Lo que se puede compartir (render de tool calls, fencing) está en `markdown-shared.ts`; la lógica de ensamblado es específica por formatter. Menos acoplamiento, mismo resultado visual.
- **Redacción pasa también sobre `## Referencias`**. Las URLs tipo `https://github.com/org/repo` rara vez matchean el redactor (no son paths locales ni tokens), pero corro el output por `redact()` igual. Fail-safe.
- **No `--all`** todavía. Pensado para Hito 8 si hace falta — emitiría una carpeta con una MD por conversación, con filename sluggificado a partir del título. Por ahora el patrón "1 conversación = 1 markdown" + preview interactiva cubre el caso principal.

### Problemas durante la implementación
- **Lint**: `parsed === null || parsed[0] === undefined` → arreglado con optional chaining `parsed?.[0] === undefined` (regla `@typescript-eslint/prefer-optional-chain`).
- **Primer test de redacción falló**: usé token `sk-ant-api03-abcdefghij` (18 chars post-prefix) y el redactor me devolvió `<REDACTED:openai>` en vez de `<REDACTED:anthropic>`. El regex de `anthropic` pide `{20,}` post-prefix, mi token era corto → cayó al siguiente patrón (`openai`, más permisivo). Lo arreglé extendiendo el token al mismo que usa el fixture existente (`abcdefghijklmnopqrstuvwxyz01`). Nota para el futuro: si agregamos fixtures con secretos, respetar la longitud mínima de cada patrón.

### Verificación
- `npm run ci` → **77/77 tests** ✓ (9 nuevos del formatter), lint ✓, typecheck ✓, build ✓.
- **Prueba manual contra el ZIP real** (`data-...-batch-0000.zip`, 7 conversaciones, 280 mensajes):

  | Conversación | flags | líneas | elementos rendereados |
  |---|---|---|---|
  | `81dce8b5` (2 msgs, corta) | (default) | ~60 | 1 user + 1 assistant, ceros en tools/atts |
  | `09b71f49` (16 msgs, TELUS) | `--include-tools` | 486 | 4 `<details>` de tool_use/result |
  | `555f61a8` (6 msgs, con web_search) | (default) | 280 | 4 footnotes + sección `## Referencias` con 4 URLs |
  | `289ac9dc` (246 msgs, carnicería) | `--include-tools --include-attachments --out` | **5583** | 123 ## User + 123 ## Assistant + 70 collapsibles + 2 📎 attachments + 51 refs a binarios + 55 paths redactados |

- Match por prefijo funciona: `import show <zip> 81dce8b5` encontró la conversación correcta sin el UUID completo.
- Preview interactiva + atomic write: probado en Hito 4, compartido vía `cli/io.ts`, sin regresiones (76/76 previos siguen verdes).

### Estado del producto tras Hito 7
El bucle completo `claude.ai → Markdown → pegar como contexto a Claude Code` **ya funciona**:
1. Usuario exporta sus chats desde Settings → Export data en claude.ai → descarga el ZIP.
2. `exportal import list <zip>` — ve sus conversaciones con IDs + títulos.
3. `exportal import show <zip> <id> --out conv.md` — obtiene un Markdown limpio, redactado, listo para pegar.
4. Pega `conv.md` a Claude Code como contexto → la sesión de Claude Code arranca sabiendo todo lo que se discutió en la web.

Fase 2 está **funcionalmente completa** para el flujo CLI. Lo que falta es la experiencia de un-click (Fase 3 = extensión VS Code).

### Próximo paso
- **Hito 8 — cerrar bordes y empezar VS Code extension**. Opciones:
  1. `import show --all` para exportar toda la cuenta a una carpeta de una.
  2. Mejorar `export` para que acepte prefijo de sessionId (consistencia con `import show`).
  3. Scaffold de extensión VS Code (`package.json` con activation events, un comando `Exportal: Import claude.ai ZIP`). Reusa `readClaudeAiExport` y `formatConversation` directo — no hay que reescribir nada.
  
  La 3 es la que mueve la aguja hacia "un click"; las 1 y 2 son QoL. Sugerencia: arrancar con (3) porque el pipeline CLI ya es robusto y validado; si aparece un bug lo arreglamos, pero invertir en un-click tiene más retorno.

---

## Motivación de la extensión de VS Code

### El problema real que resolvemos
Claude tiene dos superficies principales hoy: **claude.ai** (web) donde el usuario conversa desde el browser con contexto general, y **Claude Code** (CLI + VS Code) donde el usuario edita código con contexto del repo. Son dos sistemas distintos que **no comparten memoria**.

Escenario típico: en la web discutiste con Claude el diseño de una arquitectura durante 2 horas. Al día siguiente abrís Claude Code en el repo para implementarla — y Claude arranca desde cero, sin saber nada de lo que hablaste ayer. Copy-pastear la conversación entera como contexto es tedioso, frágil y expone secretos si no lo limpiás a mano.

### Por qué un CLI no alcanza
El CLI que acabamos de construir (`exportal import list/show`) ya resuelve el problema **técnicamente**: descargás el ZIP, corrés dos comandos, tenés un `.md` limpio y redactado listo para pegar. Pero el flujo exige:
- saber dónde está el ZIP (downloads, carpeta random),
- saber que existe `exportal`,
- conocer sintaxis de comandos (`--include-tools`, `--out`),
- copiar un UUID que vio en stdout,
- abrir un editor para pegar el markdown.

Son 5 pasos mentales entre "quiero traer la conversación" y "la conversación está en el editor". Cada paso es fricción; la fricción mata la adopción.

### Lo que aporta la extensión
**Tres clicks desde el command palette al editor abierto con la conversación**:
1. `Ctrl+Shift+P` → "Exportal: Import claude.ai ZIP"
2. Diálogo nativo de "elegir archivo" → seleccionás el ZIP.
3. QuickPick con la lista de conversaciones (título + fecha + msgs) → elegís una.

Resultado: se abre un documento markdown en VS Code con el contenido redactado. De ahí el usuario lo guarda donde quiera, o lo copia, o se lo pasa a Claude Code como contexto. **Ningún comando, ningún UUID, ningún path.**

### Por qué es un wrapper delgado (no una reescritura)
Todo el trabajo duro ya está hecho en los hitos 1-7 del CLI:
- **Parseo del ZIP** → `readClaudeAiExport()` ya probado con schemas Zod tolerantes a cambios.
- **Render Markdown** → `formatConversation()` con redacción, citations, tool collapsibles.
- **Redacción** → módulo independiente, cubierto por tests.
- **Decisiones de UX** sobre qué mostrar por default (tools no, attachments no, file refs sí) — ya tomadas y validadas.

La extensión importa esas funciones y las envuelve en 4 llamadas a la API de VS Code (`showOpenDialog`, `showQuickPick`, `openTextDocument`, `showTextDocument`). Nada más. Estimación: ~200 líneas de UI + manifest + bundling. El valor NO está en la cantidad de código — está en que **por fin el usuario final puede usarlo con un click**.

### Por qué jszip era la decisión correcta
En Hito 6 elegimos `jszip` sobre `adm-zip`/`yauzl` por dos razones: zero native deps y compatibilidad browser. La segunda es la que paga ahora: **una extensión VS Code corre en un Electron renderer** (o en un worker Node según API), y `jszip` funciona idéntico en ambos. Si hubiéramos elegido `yauzl`, estaríamos reescribiendo el reader en este mismo hito.

### Por qué VS Code primero (y no una app standalone o un plugin de Claude Code)
- **VS Code es donde ya vive Claude Code**. El usuario no abre una app nueva — extiende la que ya tiene abierta.
- **El marketplace de VS Code** distribuye un `.vsix` con todo adentro (incluidas las deps bundleadas). El usuario hace "Install" y listo. No `npm install`, no Node, no compilación local.
- **La API de VS Code nos da gratis** diálogos nativos, QuickPick, editor, file system access. Construir esto como app standalone duplicaría el trabajo.
- **Plugin para Claude Code**: Claude Code aún no expone una API de plugins suficiente para esto. La extensión VS Code es el siguiente-mejor-lugar porque convive con Claude Code en el mismo proceso.

Cuando Anthropic publique una API de plugins para Claude Code, migrar el core (`readClaudeAiExport`, `formatConversation`) es trivial — por eso los mantuvimos desacoplados del CLI desde el día uno.

---

## Hito 8 — Scaffold de extensión VS Code (2026-04-17)

### Objetivo
Primer MVP visible de Fase 3: una extensión VS Code que ejecuta el pipeline completo `claude.ai ZIP → Markdown en el editor` sin que el usuario toque una terminal. El "click de un botón" de la visión del producto.

### Alcance del hito (cerrado)
1. **Manifest** (`package.json`): agregamos los campos que VS Code exige — `publisher`, `engines.vscode`, `main`, `activationEvents`, `contributes.commands`, `categories`, `keywords`, `displayName`.
2. **Un comando**: `Exportal: Import claude.ai ZIP` registrado como `exportal.importFromZip`.
3. **Entry point** (`src/extension/extension.ts`, ~110 LOC): `activate()` registra el comando, el handler abre `showOpenDialog` → `readClaudeAiExport()` (con `withProgress`) → `showQuickPick` → `formatConversation()` → `openTextDocument` + `showTextDocument`.
4. **Bundling** (`esbuild.config.mjs`): un único `dist/extension/extension.cjs` con todas las deps (jszip, zod, etc.) bundleadas, `vscode` marcado como external porque lo provee el host.
5. **Dev loop** (`.vscode/launch.json` + `tasks.json`): F5 → rebuildea vía task → abre Extension Development Host → listo para probar.
6. **Integración con CI existente**: el script `build` ahora corre `tsc` (CLI) **y** `esbuild` (extensión). Ambos salen a `dist/`. Nada del CLI se rompió — los 77 tests siguen pasando.

### Decisiones técnicas
- **Mismo paquete, no monorepo**. Evaluamos separar en `packages/core`, `packages/cli`, `packages/extension` con workspaces. Conclusión: **overhead sin beneficio** para el tamaño actual (~10 archivos core). Mantenemos un único `package.json` con dos entry points (`bin` → CLI, `main` → extensión bundle). Si en el futuro la extensión y el CLI divergen mucho, se separa; hoy no.
- **`main` pisado por la extensión**. El campo `main` apunta ahora al bundle de la extensión (`./dist/extension/extension.cjs`). VS Code lo necesita ahí. Como el paquete es `private: true` y nadie lo consume como library ESM, reapuntar `main` no rompió nada. Si algún día se usa como library, agregamos un `exports` map.
- **tsc NO emite la extensión**. `tsconfig.build.json` excluye `src/extension/**` — esbuild se encarga de transpilar + bundlear. Ventajas: (1) un único archivo CJS para VS Code, (2) evitamos el dual-package hazard (ESM+CJS conviviendo), (3) `tsc` sigue siendo el sanity check de typecheck global pero no produce outputs duplicados.
- **CJS output, aunque el source es ESM**. VS Code extensions todavía se cargan con `require()` en el Extension Host. esbuild transpila ESM → CJS transparente. En 2026 VS Code está migrando a ESM pero todavía no es mainstream; arrancar con CJS es la opción segura.
- **Redacción forzada, sin toggle**. La decisión de UX del Hito 7 (default on) pasa a ser **no negociable** en la extensión. Quien necesite output raw usa el CLI con `--no-redact`. Simplicidad sobre flexibilidad: la extensión es para el 95% de casos donde "seguro" es más importante que "flexible".
- **`openTextDocument({content})` vs escribir a disco**. El markdown se abre como documento `Untitled` en el editor. El usuario decide si guarda, copia, o tira. Ventaja: nunca dejamos archivos huérfanos ni pisamos cosas; el "save" es una acción explícita del usuario.
- **Progress notification durante el parseo del ZIP**. Un ZIP grande (7 conversaciones, 280 mensajes) tarda 1-2s. Sin feedback visual, el usuario piensa que la extensión se colgó. `vscode.window.withProgress` da la notificación nativa "leyendo ZIP..." sin bloquear la UI.
- **Warnings como `showWarningMessage` non-blocking**. Si el ZIP tiene `users.json` corrupto pero `conversations.json` OK, mostramos un warning y seguimos. No frenamos el flujo principal por información secundaria.
- **`@types/vscode ^1.116.0` pero `engines.vscode: ^1.85.0`**. Los types son los más nuevos (para autocompletado actualizado), pero declaramos compatibilidad desde 1.85 (que cubre VS Code de finales 2023 en adelante) para no excluir a usuarios con instalaciones viejas. Si usamos una API que no existe en 1.85, TypeScript no nos avisa — por ahora solo usamos APIs estables y viejas (showOpenDialog, showQuickPick, openTextDocument, registerCommand, withProgress).

### Lo que NO entra en este hito
- Tests unitarios de la extensión. Requiere `@vscode/test-electron` o mockear toda la API de `vscode` — ambos duplican el código de prueba que ya tenemos sobre el core. Prioridad: cuando la extensión crezca más allá del wrapper delgado actual.
- Publicación al marketplace. Para eso hace falta crear una cuenta de Azure DevOps + Publisher en Visual Studio Marketplace, generar PAT, correr `vsce publish`. Lo dejamos para cuando haya algo que publicar con confianza (después de dogfooding).
- Segundo comando "export Claude Code session". El flujo de claude.ai → Claude Code es el camino crítico del producto. El inverso (Claude Code → markdown) ya lo cubre el CLI `exportal export`; el equivalente en extensión es un nice-to-have de Hito 9+.

### Problemas durante la implementación
- **`node -e "require('./dist/extension/extension.cjs')"` falló con `Cannot find module 'vscode'`**. Esto no es un bug, es **confirmación** de que el bundling funcionó: `vscode` está correctamente marcado como external y Node no puede resolverlo fuera del Extension Host. Lo verificamos con un stub del módulo para inspeccionar exports (`activate` y `deactivate` presentes como funciones).

### Verificación
- `npm run ci` → **77/77 tests** ✓, lint ✓, typecheck ✓, build ✓ (tsc + esbuild, bundle = 832 KB).
- **Prueba manual F5** por el usuario: command palette → "Exportal: Import claude.ai ZIP" → file picker → ZIP real (`data-...-batch-0000.zip`) → QuickPick con 7 conversaciones → selección → editor untitled con markdown completo (header, `## User`, `## Assistant`, redacción activa). **Screenshot confirmado**. El flujo fue literal: **3 clicks desde el palette al editor abierto** — exactamente el valor que la motivación del hito prometía.

### Estado del producto tras Hito 8
Fase 3 tiene MVP funcional:
- Usuario instala la extensión (por ahora F5 dev; marketplace después).
- Elige ZIP de claude.ai desde un diálogo nativo.
- Ve la lista de sus conversaciones y elige una.
- Aparece el markdown listo en el editor, redactado.
- Lo copia o lo guarda según necesite, y lo pega como contexto a Claude Code.

**El círculo se cerró**: lo que empezamos el 2026-04-?? como un CLI de debugging de `.jsonl` de Claude Code terminó hoy como una extensión que une las dos superficies de Claude con un click. Hitos 1-5 fueron la base (parseo + render + redacción + UX segura), 6-7 abrieron la dirección inversa (claude.ai → markdown), 8 lo convirtió en producto usable por humanos.

### Próximo paso
- **Hito 9 — pulido para release**:
  - Icono + README con screenshots.
  - `vscode-test` / `@vscode/test-electron` para tests de integración (aunque sea uno solo que verifique el smoke path).
  - Configurar `vsce package` para generar `.vsix`, probar instalación desde archivo.
  - Considerar publicar al marketplace (requiere cuenta Microsoft + publisher verificado).
  - Bonus: segundo comando `Exportal: Export Claude Code session` para la dirección inversa (para paridad con el CLI).

---

## Hito 8.1 — Auto-detect del ZIP (post-review)

### Motivación
El usuario pidió simplificar aún más el flujo. Hito 8 ya había reducido el camino a 3 clicks (palette → file picker → quick pick de conversación → editor), pero el **file picker seguía siendo el paso molesto**: requiere acordarse de dónde se guardó el ZIP, navegar por carpetas, y encontrar el nombre correcto entre decenas de archivos en Downloads.

### Alcance cerrado
- Nuevo módulo `src/extension/zip-finder.ts` con `findRecentClaudeAiExports()` — busca ZIPs con prefijo `data-` en `~/Downloads` y `~/Desktop`, últimos 7 días, ordenados por mtime descendente. Puro (no importa `vscode`), por lo que es testeable sin el host.
- `pickZipFile()` en `extension.ts` reescrito con 3 ramas:
  - **0 candidatos** → file picker tradicional (fallback transparente).
  - **1 candidato** → importa directo con toast "Exportal: importando {nombre} ({hace N · Downloads})". Sin selector.
  - **N > 1 candidatos** → QuickPick con los ZIPs recientes + opción "Elegir otro archivo…" al final.
- Helpers `formatRelativeTime()` y `formatSize()` para mostrar metadata humana en las UI.
- 13 tests nuevos (`tests/extension/zip-finder.test.ts`) cubriendo: sin matches, match en Downloads, nombres que no matchean, filtro por antigüedad, orden multi-carpeta, carpeta faltante, nombre real claude.ai con UUID+batch, formato relativo (minutos/horas/día singular/días plural), y formato de tamaño (KB/MB).

### Decisiones técnicas
- **Patrón de nombre**: primero usé `^data-\d{4}-\d{2}-\d{2}.*\.zip$` asumiendo formato fecha. **Falló en el test real** porque claude.ai hoy exporta `data-<uuid>-<timestamp>-<hash>-batch-<n>.zip` (UUID + timestamp + batch, no fecha ISO). Lo relajé a `^data-.+\.zip$` y agregué un test con el nombre real capturado de Downloads del usuario. El reader falla limpio ante falsos positivos, así que tolerar un matching más amplio es seguro.
- **Inyección de `home` y `now`**: acepto ambos como opciones opcionales, default a `homedir()` y `new Date()`. Permite tests deterministas sin tocar el home real.
- **Sin peek al contenido del ZIP**: podría validar que cada candidato tenga `conversations.json` antes de mostrarlo, pero eso es O(N) reads de ZIPs potencialmente grandes. El patrón de nombre es suficientemente distintivo, y si entra un falso positivo el reader lo rechaza con mensaje claro.
- **Sin persistencia de "último ZIP usado"**: se consideró, pero agrega estado entre sesiones (manejo de `globalState`) para un beneficio marginal. El auto-detect resuelve el 95% del dolor sin ese costo.

### Problemas durante la implementación
- **Primera prueba F5 del usuario: "Lo noto igual"**. El auto-detect no disparaba porque mi regex asumía formato fecha (`data-YYYY-MM-DD-...`) que ya no existe. Inspeccioné `~/Downloads` y encontré `data-80717880-4ecd-4c84-9c2b-b7692b372888-1776429112-830b1c5f-batch-0000.zip`. Un solo cambio de regex + test nuevo y la segunda corrida F5 funcionó.
- Aprendizaje: no asumir formato de archivos externos sin un sample real. La próxima vez, inspeccionar el entorno del usuario primero.

### Verificación
- `npm run ci` → **90/90 tests** ✓ (77 previos + 13 nuevos), lint ✓, typecheck ✓, build ✓.
- **Prueba manual F5** por el usuario: con 1 ZIP de claude.ai en Downloads, palette → comando → **toast "importando…" → quick pick de conversación → editor**. El file picker desapareció del camino crítico. Usuario confirmó: "Bien! ahora si funciono!".

### Próximo paso
- Sigue en pie el Hito 9 (release polish: icono, README, tests de integración, `.vsix`).
- Posible iteración si el auto-detect necesita más carpetas (macOS `~/Downloads` ya está cubierto; Linux `~/Descargas` en locales en español si aparece un usuario que lo pide) o drag-and-drop.

---

## Hito 8.2 — Fallback por contenido para ZIPs renombrados (post-review)

### Motivación
El usuario preguntó: "si el usuario le cambia el nombre al archivo, este no se detecta, no?". Confirmado — el fast-path por nombre (`data-*.zip`) deja afuera al usuario que renombra a algo como `mi-backup.zip`. El fallback actual era el file picker directo, con el cost psicológico de "la extensión me dijo que no encontró nada" sin intentar más.

### Alcance cerrado
- Nueva función `scanZipsByContent()` en `zip-finder.ts` — escanea todo `*.zip` en Downloads/Desktop y peek con jszip para ver si contiene `conversations.json` en la raíz. Cap de tamaño 50 MB por defecto (configurable) para no abrir los 200 MB de modelos 3D que tiene el usuario en Downloads.
- `pickZipFile()` cambió: cuando 0 candidatos por nombre, **antes** de caer al file picker, muestra un InformationMessage con dos botones: `[Revisar .zip por contenido]` y `[Elegir archivo…]`. Si el usuario acepta revisar, disparo `scanZipsByContent()` con progress notification y reutilizo el quick pick de candidatos existente.
- Si el content-scan tampoco encuentra nada: informo y ofrezco el file picker como última salida.
- 5 tests nuevos cubriendo: detección con `conversations.json` presente, skip sin ese archivo, cap de tamaño, extensión incorrecta ignorada, ZIPs corruptos silenciosamente salteados.

### Decisiones técnicas
- **Opt-in vs automático**: podría correr `scanZipsByContent` siempre tras el fast-path. Lo hice opt-in con botón porque scanear ZIPs es I/O serio (aunque jszip solo lee la tabla central, sigue leyendo el buffer completo a memoria) y el 95% de usuarios no renombran el archivo.
- **Cap de 50 MB**: un export real de claude.ai suele pesar < 10 MB. 50 MB es margen generoso sin arriesgar minutos de scan en ZIPs de modelos 3D / backups pesados.
- **Try/catch silencioso en el peek**: ZIPs corruptos o protegidos con password fallan parseo; los salto sin notificar. El usuario no se entera de qué ZIPs "no son suyos".
- **Sin recursión en subcarpetas**: validamos con el usuario después de su prueba. `Downloads/Claude/data-foo.zip` no se detecta hoy. Pros de recursar (captar subcarpetas organizadas) no compensan los contras (más I/O cada invocación, Downloads suele tener basura profunda como `node_modules` clonados). El caso renombrado-Y-en-subcarpeta queda cubierto por el file picker.

### Problemas durante la implementación
- **Primera corrida de `npm run ci` falló** con `TypeError: Cannot read properties of undefined (reading 'config')` en TODOS los test files. No logré reproducirlo en corridas subsiguientes (5/5 pasaron sin cambios). Parece un hiccup frío de vitest workers al primer load del módulo jszip en un test nuevo. No intervine; quedó como curiosidad.
- **Peek con jszip lee el ZIP completo a memoria**. Para ZIPs chicos (< 50 MB) es aceptable; para ZIPs grandes sería un problema. El cap de tamaño evita el worst case.

### Verificación
- `npm run ci` → **95/95 tests** ✓ (90 previos + 5 nuevos del scan por contenido), lint ✓, typecheck ✓, build ✓.
- **Prueba manual F5** por el usuario con tres escenarios:
  1. Solo renombrado (en Downloads): detectado correctamente ✓
  2. Otro `.zip` liviano no relacionado presente: ignorado correctamente ✓
  3. En otro disco o en subcarpeta de Downloads: no detectado (esperado y aceptado por el usuario).
- Usuario confirmó: "Okay, si los archivos estan en la carpeta de descargas y tienen otro nombre, se identifican correctamente, aun si hay otro comprimido que pesa poco."

### Próximo paso
- Hito 9 sigue en pie: README con screenshots, icono, `@vscode/test-electron` para tests de integración, `vsce package` para generar `.vsix`, considerar marketplace.

---

## Hito 9a — README en UTF-8 y `.vsix` empaquetable (post-review)

### Motivación
Para compartir la extensión con cualquiera fuera del repo (incluso sin marketplace), hace falta un `.vsix` instalable vía `code --install-extension`. Antes de eso, había dos deudas técnicas que el usuario mismo no había notado:
1. **El `README.md` existía en UTF-16 LE** (probablemente generado alguna vez desde PowerShell con redirección). Se ve como jeroglíficos tanto en GitHub como en el marketplace de VS Code.
2. **Faltaba `.vscodeignore`** — sin ese archivo, `vsce package` empaqueta `src/`, `tests/`, `node_modules/` y todo, inflando el `.vsix` a decenas de MB.

### Alcance cerrado
- `README.md` reescrito en UTF-8, reflejando el estado actual del producto (las 3 fases cerradas, no "Fase 1 en curso"). Secciones: qué resuelve, uso de la extensión, uso del CLI, principios, requisitos, desarrollo, licencia.
- `@vscode/vsce` agregado como devDep + script `package:vsix` que corre `build` + `vsce package --no-dependencies` (el `--no-dependencies` es seguro porque el bundle ya incluye todas las deps).
- `.vscodeignore` escrito con filtros agresivos: excluye `src/`, `tests/`, `node_modules/`, config de tooling, y todo `dist/` salvo `dist/extension/extension.cjs` (el único archivo que la extensión necesita al runtime). Incluye también el sourcemap para no inflar el paquete.
- `*.vsix` agregado al `.gitignore`.
- `@types/vscode` bajado de `^1.116.0` a `~1.85.0` para cumplir con la regla de vsce (`@types/vscode` ≤ `engines.vscode`). No rompió nada porque no usamos APIs nuevas.
- Campo `files` removido de `package.json` — vsce rechaza tener ambos (`.vscodeignore` y `files`) declarados, y al ser `"private": true` no publicamos a npm.

### Decisiones técnicas
- **`.vscodeignore` en lugar de `files`**: vsce no soporta combinar ambos. Elegí `.vscodeignore` porque es el idiomático del ecosistema de extensiones y acepta patrones de glob y negación.
- **Sourcemap excluido**: `dist\extension\extension.cjs.map` pesa 1.6 MB. Lo dejo fuera del `.vsix` porque usuarios finales no lo necesitan. Si aparecen bugs opacos en prod, se puede revertir la decisión.
- **`--no-dependencies` en vsce**: nuestro bundle de esbuild es self-contained; no tenemos `node_modules/` que mergear al paquete. Sin esta flag, vsce escanea transitives innecesariamente.
- **`@types/vscode ~1.85.0` en lugar de bumpear `engines.vscode`**: VS Code 1.85 es de nov-2023, una base de usuarios enorme. No usamos APIs más nuevas, así que bajar los types es más seguro que excluir usuarios de VS Code legacy.

### Verificación
- `npm run ci` → 95/95 tests, lint, typecheck, build ✓.
- `npm run package:vsix` → genera `exportal-0.0.0.vsix` con 7 archivos, **142 KB comprimido** (versión anterior con `.vscodeignore` mal configurado: 41 archivos, 451 KB).
- Contenido del `.vsix`: `package.json`, `README.md`, `LICENSE`, `SECURITY.md`, `[Content_Types].xml`, `extension.vsixmanifest`, `dist/extension/extension.cjs` (838 KB descomprimido, todo el código + jszip + zod bundleado).

### Lo que NO entra en este sub-hito
- **Icono**: queda el placeholder default de VS Code. Sin icono la extensión es compartible igual.
- **`@vscode/test-electron` para tests de integración**: defensivo, no bloquea release.
- **Publicación al marketplace**: requiere cuenta Microsoft + Azure DevOps PAT + decisiones de marketing (nombre final, tagline, categorías, screenshots).
- **Screenshots en el README**: requieren un entorno estable con una conversación de muestra. Puede quedar en un sub-hito 9b.

### Próximo paso
- Probar instalación del `.vsix` en un VS Code limpio: `code --install-extension exportal-0.0.0.vsix`.
- Si instala bien, Hito 9b puede ser: icono + screenshots + primer release en GitHub Releases con el `.vsix` como asset (evita la fricción del marketplace pero ya es compartible).

## Hito 9b — Icono + botón en la status bar

**Fecha:** 2026-04-18

### Problema
Post-9a la extensión era instalable desde `.vsix` pero:
1. **Sin icono** — en el panel de Extensions aparecía como genérica.
2. **Descubribilidad pésima** — única forma de disparar el comando era Ctrl+Shift+P → buscar "Exportal". El usuario tenía que *recordar* que la extensión existía.

### Alcance cerrado
- **Icono** (`assets/icon.svg` + `assets/icon.png` 128×128): diseño minimalista, "E" blanca con acento naranja sobre fondo índigo. Script `scripts/build-icon.mjs` convierte SVG→PNG con `sharp`. `assets/*.svg` excluido del `.vsix` (solo se envía el PNG).
- **StatusBarItem** en `extension.ts activate()`: texto `$(cloud-download) Exportal` en la esquina inferior izquierda, tooltip "Importar conversación de claude.ai", click dispara `exportal.importFromZip`. Usa el codicon built-in de VS Code — sin assets extra.
- **`activationEvents: ["onStartupFinished"]`**: antes estaba vacío; con comando-only activation la status bar no aparecía hasta que el usuario ejecutara el comando (círculo vicioso). `onStartupFinished` activa al terminar el arranque, sin impactar el tiempo de carga percibido.
- **`eslint.config.js`**: bloque nuevo para `scripts/**/*.mjs` con globals `console`/`process` — sin esto, `build-icon.mjs` fallaba lint con `no-undef`.

### Decisiones técnicas
- **Status bar > command button en título de editor**: explorar la palette no escala. La status bar es persistente, minimalista y no invade la UI. Alignment Left porque la derecha la ocupan git/errors/etc.
- **Codicon `$(cloud-download)` en lugar de icono custom en la status bar**: VS Code no soporta PNGs arbitrarios en status bar items; solo codicons. Usar el set built-in evita asset pipelines extra.
- **PNG 128×128, no 256×256**: el marketplace usa 128px efectivo. Más resolución infla el `.vsix` sin ganancia visible.
- **`sharp` como devDep**: tiene prebuilt binaries para Windows/Mac/Linux, zero build-time friction. Solo corre en `npm run build:icon`, no en CI regular.

### Verificación
- `npm run ci` → 95/95 tests, lint, typecheck, build ✓.
- `npm run package:vsix` → `exportal-0.0.0.vsix` con 8 archivos, **144 KB** (antes 142 KB; +1.3 KB del PNG).
- Instalado desde el panel de Extensions → **Install from VSIX…**. Reload → status bar muestra "☁ Exportal" al inicio. Click dispara la pickQuickPick de conversaciones. Confirmado por usuario: *"Si! funciona!"*.

### Lo que NO entra
- Screenshots del README (requieren capturas reproducibles de la UI).
- Publicación al marketplace.
- Badge/contador de exports recientes en la status bar (scope creep).

### Próximo paso
- Commit 9b y release en GitHub Releases con el `.vsix` como asset (sigue evitando marketplace).
- Hito 10+: puente Chrome ↔ VS Code (ver memoria `project_chrome_bridge.md`).

## Hito 10a — Servidor HTTP local (puente claude.ai ↔ VS Code, paso 1)

**Fecha:** 2026-04-18

### Decisión de producto antes del código
Revisé los Consumer Terms §3 de Anthropic: "crawl, scrape, or otherwise harvest data" y "access the Services through automated or non-human means" están prohibidos salvo vía API key oficial. Leer el DOM o endpoints internos de claude.ai desde una extensión de Chrome cae bajo esa prohibición.

**Pivot**: en vez de scrapear claude.ai, la extensión de Chrome observa cuando el usuario dispara el export oficial (vía `chrome.downloads` API) y reenvía el path del ZIP a VS Code. Zero scraping — solo automatiza un flujo que el usuario ya inicia manualmente.

### Alcance cerrado (10a)
- `src/extension/http-server.ts` — servidor HTTP local, puro (sin imports de `vscode`), testeable con `fetch`. API: `startServer(token, onImport)` + `generateToken()`. Acepta `POST /import` con `{ zipPath: string }`.
- `tests/extension/http-server.test.ts` — 14 tests cubriendo: método/path incorrectos (405/404), auth (token correcto / incorrecto / ausente / longitud distinta → 401), validación (JSON malo → 400, schema malo → 400, body > 64 KB → 413), handler que tira → 500, selección de puerto en rango 9317-9326, falloff al próximo puerto ocupado, generación de tokens únicos.
- `extension.ts activate()` — arranca el servidor en background, genera/persiste token en `context.globalState`, registra cleanup. Nuevo comando `exportal.showPairingInfo` que copia el token al portapapeles.
- Refactor: extraje `openConversationFromZip(zipPath)` del command original para que el flujo del puente y el flujo del file-picker compartan la misma lógica de renderizado.

### Decisiones técnicas
- **Bind a `127.0.0.1`, no `localhost`**: evita resolución DNS y asegura que nunca expongamos a otras interfaces de red.
- **Token Bearer + comparación timing-safe**: `crypto.timingSafeEqual` sobre buffers del mismo tamaño (con early-return en longitudes distintas). 256 bits crypto-random, hex.
- **Puerto fijo en rango 9317-9326**: Chrome puede probar los 10 en secuencia para descubrir al VS Code activo sin handshake de filesystem (MV3 no da filesystem). 10 puertos cubren múltiples VS Code corriendo a la vez en la misma máquina.
- **Content-Length + streaming limit**: doble defensa. Content-Length rechaza fast path (< 1 ms). Streaming drena el body si el cliente mintió en Content-Length, marca flag `exceeded`, y al `end` rechaza — sin `req.destroy()` porque eso corta el socket antes de que el 413 se flushee al cliente.
- **Zod para validar payload**: ya era dep del proyecto, reutilizable. Trae mensajes de error estructurados gratis.
- **Arranque no bloqueante**: si el puerto no está disponible o el server falla, la extensión sigue funcionando vía status bar — solo se pierde el puente de Chrome.
- **Token persistido en `globalState`**: sobrevive reinstalls del `.vsix`, pero es per-usuario (no per-workspace). El pairing se hace una vez.

### Verificación
- `npm run ci` → 109/109 tests (de 95 → +14), lint, typecheck, build ✓.
- Bundle: 844 KB (+5.6 KB de http-server.ts; zod ya venía).
- No toqué assets ni `.vscodeignore` — el `.vsix` del hito 9b sigue siendo válido conceptualmente; solo crece el bundle ~6 KB al reempaquetar.

### Lo que NO entra acá
- Extensión de Chrome (10b).
- Captura del evento de descarga (10c).
- Handshake de pairing en la UI (Chrome extension pide token → usuario lo copia desde VS Code). Ya está el camino: `exportal.showPairingInfo` copia al portapapeles. La UI del Chrome viene en 10c-d.
- UI visual del puerto actual en la status bar (lo pensé, pero el usuario no necesita saber el puerto — el Chrome ext lo descubre solo probando el rango).

### Próximo paso (10b)
Skeleton de extensión de Chrome MV3: manifest + service worker + options page para pegar el token. Sin funcionalidad real — solo validar que se carga unpacked y que el options page persiste el token en `chrome.storage`.

## Audit pre-10b (bugfixes) + Hito 10b — Chrome companion skeleton

**Fecha:** 2026-04-18

### Audit: bugs encontrados y arreglados (antes de arrancar 10b)

1. **Bridge devolvía `200 ok:true` cuando el ZIP fallaba al leerse** — `openConversationFromZip` atrapaba el error, lo mostraba como `showErrorMessage` y retornaba normal. El handler HTTP respondía 200, engañando al cliente futuro. **Fix**: opción `{ rethrow: true }` en la ruta del bridge. La ruta del command sigue igual (usuario ve el error en VS Code, no hay caller externo al que informar).
2. **Race en `activate()`**: `startBridgeServer` es async y el dispose se pusheaba en el `.then()`. Si VS Code desactivaba la ext antes de que el server estuviera listening, el push caía en un subscriptions array ya disposado → server huérfano con puerto ocupado hasta fin del proceso. **Fix**: registrar disposable sincrónicamente con flag `disposed`; cuando el handle resuelve, si ya se desactivó, cerrar; si no, guardar el handle para que el dispose lo cierre.
3. **JSDoc de `activate()` obsoleto** — describía el flujo original (palette → file picker), no el actual (status bar + auto-detect + bridge). **Fix**: reescrito enumerando las 3 capas reales.
4. **UX flaco en `showPairingInfoCommand`** — mensaje genérico que no explicaba para qué sirve el token. **Fix**: mensaje ahora dice explícitamente "para emparejar la extensión de Chrome".

**Verificación**: `npm run ci` → 109/109 tests ✓. Los cambios son internos al flujo del bridge, no rompen tests existentes.

### Hito 10b — Chrome companion extension skeleton

**Alcance cerrado**: extensión MV3 *unpacked*-installable, sin funcionalidad de puente real todavía.

- `chrome/manifest.json` — MV3, `minimum_chrome_version: 116`, permisos mínimos (`storage`), host permission para `http://127.0.0.1/*`, icono reusado de `assets/icon.png`.
- `chrome/background.js` — service worker stub con listeners `install`/`activate` vacíos. Notas sobre la efimeridad de los service workers MV3 para que en 10c no caiga en el pozo común de guardar estado en variables de módulo.
- `chrome/options.html` + `chrome/options.js` — página de opciones con input de token + botón Guardar/Borrar + validación de regex `/^[0-9a-f]{64}$/`. Persiste en `chrome.storage.local` bajo la clave `exportal.pairingToken`.
- `chrome/icon-128.png` — copia de `assets/icon.png`.
- `eslint.config.js` — bloque nuevo para `chrome/**/*.js` con globals (`chrome`, `document`, `self`, `window`, `HTMLInputElement`).
- `.vscodeignore` — `chrome/**` excluido del `.vsix` (vive junto a la VS Code ext pero no se empaqueta con ella).

### Decisiones técnicas

- **JS plano, sin build**: el skeleton es trivial (manifest + storage.set + storage.get). Si en 10c-d crece, migrar a TS es mecánico. Evita agregar otro pipeline de esbuild.
- **`minimum_chrome_version: 116`** — cualquier Chrome moderno. Permite usar `chrome.storage.local` con Promises (sin callbacks).
- **`permissions: ["storage"]` solo**: `downloads` viene en 10c. Minimizar permisos al principio reduce la fricción del permission-dialog en Chrome Web Store si alguna vez publicamos.
- **`host_permissions` a `http://127.0.0.1/*`**: sin esto, `fetch()` desde el service worker a localhost se bloquea por mixed-content aunque sea mismo host. El path glob cubre los 10 puertos del rango.
- **Options page usa solo web platform APIs + `chrome.storage`**: zero deps. Dark-mode nativo vía `color-scheme: light dark` + `color-mix()`.
- **Código en el mismo repo** bajo `chrome/`: un DEVLOG, un CI, una PR por feature cross-cut. No monorepo-tooling — solo un directorio.

### Verificación manual pendiente

1. `chrome://extensions` → Developer mode ON → **Load unpacked** → elegir `d:\Dionisio\ClaudeTool\chrome`.
2. Debería aparecer "Exportal Companion" con el ícono de Exportal.
3. Click derecho en el icono → **Opciones** → pegar un token de 64 hex chars → Guardar → ve "Token guardado." en verde.
4. Cerrar la página de opciones, reabrir → el token sigue ahí (persistencia en `chrome.storage.local` OK).
5. Probar validación: token corto → "El token debe tener 64 caracteres hexadecimales." en rojo.

### Lo que NO entra en 10b

- `chrome.downloads.onCreated` listener (10c).
- `fetch` al servidor local (10c/d).
- Dialog de "VS Code no detectado" si el server no responde (10d).
- Packaging del `.crx` / distribución (10e).
- Tests automatizados del Chrome ext (seguimos difiriendo hasta que haya lógica no-trivial).

### Próximo paso (10c)

Listener a `chrome.downloads.onCreated` filtrando por nombre `data-*.zip` (o por contenido de claude.ai). Al matchear, probar POST a `http://127.0.0.1:PORT/import` con el token guardado, recorriendo el rango 9317-9326. Feedback visual vía `chrome.notifications` o al icono.

## Hito 10c — Auto-forward de exports de claude.ai a VS Code

**Fecha:** 2026-04-19

### Objetivo
Eliminar todo input manual del usuario después de disparar el export en claude.ai: Chrome detecta la descarga, valida que sea un export oficial y postea el path al servidor local. En VS Code aparece el QuickPick de conversaciones sin pasar por status bar ni palette.

### Alcance cerrado
- `chrome/manifest.json`: permiso `downloads` agregado.
- `chrome/background.js`: reescrito. Un único listener top-level en `chrome.downloads.onChanged` filtrando por `state === 'complete'` + filename regex `/(^|[\/])data-.+\.zip$/i` + URL/referrer conteniendo `claude.ai`. Probing del rango 9317-9326 con el token guardado en `chrome.storage.local`. Cache del último puerto exitoso en `chrome.storage.session` para atajo en uso recurrente.
- `eslint.config.js`: globals `console` y `fetch` agregados para `chrome/**/*.js`.

### Decisiones técnicas
- **Listener top-level en `onChanged`, no en `onCreated`**: MV3 evicts el service worker a los ~30s idle. Un listener dinámico registrado tras `onCreated` se pierde si el worker muere antes del fin de la descarga. Top-level `onChanged` se re-registra en cada wake-up y garantiza que capturamos el evento `complete` sin importar cuánto tardó la descarga.
- **Doble filtro (filename + URL/referrer)**: el patrón de filename `data-*.zip` es bastante específico pero tolerante a colisiones. Exigir que la URL tenga `claude.ai` evita que cualquier ZIP llamado `data-x.zip` bajado de otro lado dispare el flujo.
- **Port probing en orden con caché**: arranca por el último puerto exitoso. Si falla, recorre el rango. Cache vive en `storage.session` para que se resetee en cada reinicio de Chrome — si VS Code abre en otro puerto entre sesiones, re-descubrimos rápido.
- **Detección de auth error por short-circuit**: si un puerto responde 401, asumimos que es Exportal con token mal y paramos de probar. Un 401 desde otro servicio arbitrario sería un bug en ese servicio, no nuestro problema.
- **Badge en lugar de notificaciones**: evita agregar el permiso `notifications` (más fricción si publicamos al Web Store). Estados: `OK` verde, `AUTH` rojo (token rechazado), `OFF` rojo (no hay servidor), `SET` amarillo (token sin configurar).
- **`chrome.storage.session` vs `storage.local`**: token es persistente (`local`), último puerto es efímero (`session`). Ambas usan el mismo permiso `storage`.

### Verificación manual (flujo golden path)
1. `chrome://extensions` → refresh de Exportal Companion → aceptar prompt de permiso `downloads`.
2. Pin de la extensión al toolbar (Chrome no autopinea; sin pin el badge queda oculto detrás del puzzle icon).
3. Disparar export en claude.ai → abrir el link del email → descarga automática.
4. Badge "OK" verde aparece en el ícono cuando termina.
5. En VS Code: aparece el QuickPick de conversaciones sin intervención. Usuario confirmó: "aparece ok en exportal web y me tiro la de que hacer en vs code".

### Lo que NO entra en 10c
- UI de setup del token en primer uso (hoy: si no hay token, badge `SET` + log en consola. Usuario tiene que saber abrir Opciones).
- Icono de claude.ai diferenciado (el ZIP se detecta pero el badge es genérico).
- Retry con back-off si el server está respondiendo pero lento.
- Tests automatizados (Chrome ext testing sigue difiriéndose; el flujo es end-to-end humano).

### Próximos pasos posibles
- **10d** (opcional): packaging del `.crx` y distribución. Primera versión puede ir como zip en GitHub Releases (sideload con "Load unpacked"), esquivando Chrome Web Store mientras validamos el producto.
- **10e** (opcional): content script en claude.ai que pone un botón "Enviar a VS Code" al lado del botón de export, eliminando incluso el paso de disparar el export — mismo efecto pero más polish.

---

## Hito 10d — Packaging del companion para distribución
**Fecha:** 2026-04-19

### Objetivo
Poder publicar el companion en GitHub Releases como un `.zip` que cualquiera baje, extraiga y cargue con "Load unpacked". Evitar divergencia entre la versión de `package.json` y la del `manifest.json` del companion.

### Alcance cerrado
- `scripts/package-chrome.mjs`: nuevo. Lee `package.json` raíz, patchea `manifest.version` **en memoria** (el árbol de fuentes queda limpio), arma un zip flat (sin carpeta envolvente) con todos los archivos de `chrome/` vía JSZip con compresión DEFLATE. Output: `exportal-companion-<version>.zip` en la raíz.
- `package.json`: scripts `package:chrome` (standalone) y `package:all` (vsix + chrome en cascada).
- `.gitignore`: patrón `exportal-companion-*.zip` para no commitear artifacts.
- `.vscodeignore`: mismo patrón para que no se cuele en el `.vsix`.
- `README.md`: sección "Chrome companion (opcional)" con pasos de instalación desde zip de Releases y el comando de build desde fuente.

### Decisiones técnicas
- **Patch del manifest en memoria, no en disco**: el `manifest.json` del árbol queda con `version: "0.0.0"` para que no haya drift entre ramas ni commits ruidosos en cada bump. La versión de verdad vive en `package.json`, que es la fuente canónica para todo el repo (vsix, CLI, companion).
- **Zip flat, no carpeta envolvente**: Chrome "Load unpacked" acepta tanto flat como nested, pero flat es menos fricción para el usuario (extrae → elige la misma carpeta, sin tener que entrar a un subdirectorio).
- **JSZip en vez de `zip` del SO**: ya es dependencia para leer ZIPs de claude.ai. Reusarla evita agregar `archiver` o depender de un binario de sistema (Windows no trae `zip`).
- **`.zip` y no `.crx`**: Chrome bloquea sideload de `.crx` no firmados fuera del Web Store. Load unpacked desde zip extraído es el patrón estándar para distribución OSS pre-publicación.
- **Script guard `manifest_version !== 3`**: defensive, detecta regresiones si alguien baja el manifest a MV2 por error.

### Verificación
- `node scripts/package-chrome.mjs` → `Wrote exportal-companion-0.0.0.zip (5.4 KB)`.
- Inspección del zip: 5 archivos flat (`background.js`, `icon-128.png`, `manifest.json`, `options.html`, `options.js`); `manifest.version = "0.0.0"` matcheando `package.json`.
- Lint + typecheck limpios.

### Lo que NO entra en 10d
- Publicación en Chrome Web Store (requiere cuenta de developer de pago + review process).
- Firma del `.crx` (no aplica, usamos zip).
- GitHub Action que adjunte el zip automáticamente al crear un release tag (se puede hacer en un hito de CI dedicado).
- Auto-update del companion (no existe sin CWS; el usuario tiene que reinstalar manualmente).

### Próximos pasos posibles
- GitHub Action que corra `package:all` en `release: published` y suba los artifacts como assets.
- Publicar en Chrome Web Store una vez que el producto esté estable y haya users reales pidiéndolo.

---

## Hito 10e — One-click export desde claude.ai (API interna)
**Fecha:** 2026-04-19

### Objetivo
Eliminar el paso "disparar export oficial → esperar email → bajar ZIP". Desde claude.ai, un click exporta la conversación actual directamente a VS Code leyendo la misma API interna que usa la web, con las cookies de sesión del usuario.

### Alcance cerrado
- `chrome/manifest.json`: bloque `content_scripts` inyectando `content-script.js` en `https://claude.ai/*` (`run_at: document_idle`). Permiso `host_permissions` extendido a `https://claude.ai/*` para que el fetch no lo frene el CORS del content script.
- `chrome/content-script.js`: nuevo. Monta un panel flotante en claude.ai con dos botones:
  - **Exportar este chat**: lee `GET /api/organizations` → elige la primera org → `GET /api/organizations/<org>/chat_conversations/<id>?tree=True&rendering_mode=messages` (mismos headers que la web, `credentials: 'include'`). Manda el JSON al bridge local por POST a `/import/inline`. VS Code abre el Markdown.
  - **Preparar export oficial**: guarda el UUID del chat actual en `chrome.storage.session`; cuando el ZIP oficial llega, el flujo de 10c lo abre directo en esa conversación.
- `src/extension/http-server.ts`: ruta nueva `POST /import/inline` que acepta `{conversation: <JSON>}`, lo valida con Zod shape y lo escribe a un tmp para reusar el pipeline de import desde ZIP.
- `src/extension/extension.ts`: `handleBridgeImportInline` que envuelve el handler y abre el Markdown resultante.
- Toast de éxito en la ext de VS Code después del import (commit `ea94518`): antes solo se abría el tab, ahora también aparece un mensaje no-modal "Exportado: <título>".

### Decisiones técnicas
- **Content script en vez de extension-page popup**: el botón tiene que vivir *dentro* de claude.ai para no romper el flujo del usuario. Un popup exige click al icono del toolbar + tener el tab activo — UX peor.
- **Reusar cookies de sesión con `credentials: 'include'`**: el fetch desde el content script hereda las cookies de claude.ai automáticamente. No necesitamos OAuth ni manejar tokens — la sesión del browser *es* la credencial.
- **`chat_conversations/<id>?tree=True&rendering_mode=messages`**: es el endpoint exacto que usa la UI. Devuelve el árbol completo con tool_use, thinking, resultados, attachments — todo lo que nuestro parser ya sabe procesar.
- **Primera org de la lista**: el 99% de los usuarios tienen 1 org. Si alguien tiene múltiples, arreglamos cuando pase.
- **Ruta `/import/inline` separada de `/import`**: `/import` acepta un path a un ZIP local; `/import/inline` acepta el JSON de una conversación específica. Shapes distintas, validación distinta, respuestas distintas — mejor rutas separadas que un discriminated union.
- **Escribir el JSON a tmp y delegar en el pipeline existente**: evita reimplementar el parseo. El único costo es un write+read efímero; a cambio, todo el código de redacción/formatting sigue pasando por el mismo path probado.

### Verificación
- Flujo end-to-end: abrir claude.ai en un chat → panel aparece → "Exportar este chat" → Markdown abre en VS Code. Tiempos <2s en conversaciones de tamaño moderado.
- Sin cambios en tests del core (el shape parseado es el mismo que el del ZIP oficial).
- Lint + typecheck limpios.

### Lo que NO entra en 10e
- UI de selector de org si el usuario tiene más de una.
- Manejo de conversaciones muy largas con paginación (si existe en la API interna; hasta ahora el endpoint devuelve todo de una).
- Polish del panel (estilos, keyboard shortcuts, branding) — viene en la sesión siguiente.

### Próximos pasos
- Sesión de pulido: darle identidad visual al panel, atajos de teclado, onboarding claro, y hardening del error handling para release v0.1.0.

---

## v0.1.0 — Pulido, hardening y primera release
**Fecha:** 2026-04-20

### Objetivo
Dejar el producto en estado de "instalable por un tercero sin que explote". No feature work nuevo — todo lo que falta para que el camino feliz sea agradable, los errores sean informativos, y los artifacts sean reproducibles.

### Alcance cerrado

**UX del panel en claude.ai** (commit `86903d4`):
- Panel siempre-expandido reemplazado por **FAB circular + popover**. El FAB es un círculo navy pequeño en esquina inferior derecha con el ícono de download-arrow y un acento naranja; click lo expande al popover con los dos botones.
- **Atajos de teclado** `Alt+Shift+E` (exportar este chat) y `Alt+Shift+O` (preparar export oficial). Listeners en fase de captura, guardados a rutas `/chat/<uuid>` y a no-concurrent-action. Toast de feedback.
- **Paleta del logo**: navy `#1e1b4b`, naranja `#fb923c`, blanco. Primer intento fue botón primario naranja sobre popover navy — el usuario lo vetó inmediatamente ("se asimila a los colores de Boca Juniors"). Cambiado a botón primario **blanco con texto navy bold**, secundario navy con texto blanco. El naranja queda como acento chico en el FAB (línea de base) y en el ícono del companion.
- Onboarding: modal `showInformationMessage({ modal: true })` al primer activate de la ext VS Code, con el token + pasos numerados + "Copiar token". Re-abrible con comando `Exportal: Show bridge pairing token`.
- `chrome/options.html`: acento actualizado al naranja de marca, botón Guardar con peso 700 para contraste, CSS var `--brand-navy`.

**Hardening del error handling** (commit `f2ce90d`):
- Clase `BridgeError` exportada en `src/extension/http-server.ts` con código `invalid_shape`. El dispatcher `sendHandlerError` mapea BridgeError → 422 con `{error: 'invalid_shape', message}`; errores genéricos → 500 `import_failed`.
- `handleBridgeImportInline` ahora lanza `BridgeError('invalid_shape')` cuando el JSON no matchea el shape de Zod, en vez de un Error genérico. El content script lo distingue del 404/410 de "bridge desactualizado" y deja de probar puertos.
- `chrome/background.js`: `forwardInlineConversation` distingue 422/413 (definitivo, abortar probing) de 404 (sigue probando — puede ser otro puerto).
- Content script: AbortController con timeout de 15s en los fetch a claude.ai para no quedar colgados.
- Cross-realm error handling: `explainError` duck-typea `.message` en vez de `instanceof Error` (Errors cruzan mal entre realms: content-script ↔ page ↔ vm sandbox de tests).

**Código compartido pure.js** (commit `3653192`):
- Problema: `content-script.js`, `background.js` y tests necesitan la misma lógica (UUID pattern, filename matcher, port probing order, error code table). Duplicarla tres veces era la tentación; meter un bundler solo para eso era overkill.
- Solución: `chrome/pure.js` como IIFE clásica que expone `ExportalPure` global. Content scripts lo cargan vía `"js": ["pure.js", "content-script.js"]` en el manifest. Service worker lo carga vía `importScripts('./pure.js')` (requirió volver al SW clásico, sin `"type": "module"`). Tests lo cargan con `vm.runInContext` en sandbox aislado.
- 26 tests unitarios en `tests/chrome/pure.test.ts` cubriendo los 6 export: `extractConversationIdFromPath`, `isClaudeAiExport`, `buildPortOrder`, `extractOrgIds`, `parseBridgeErrorCode`, `explainError`.
- `eslint.config.js`: globals `AbortController`, `ExportalPure`, `importScripts`, `module`, `requestAnimationFrame`, `clearTimeout` para `chrome/**/*.js`.

**Release hygiene** (commits `f764f30`, `c3e80b0`):
- Ambas extensiones a versión `0.1.0` (primera release "usable").
- `CHANGELOG.md` en formato Keep-a-Changelog con entrada `[0.1.0] — 2026-04-20` listando features agregados + notas de seguridad.
- `README.md` reescrito: sección "Cómo se usa — camino feliz" lidera con FAB + atajos; tabla comparativa "Exportar este chat" vs "Preparar export oficial"; leyenda de estados del badge; 3 screenshots con URLs absolutas a `raw.githubusercontent.com` (funcionan en GitHub, en el Marketplace y en el `.vsix`).
- `docs/screenshots/`: `fab.png`, `onboarding.jpeg` (token blurreado a mano), `options.png` (con banner verde "Emparejado").

### Decisiones técnicas
- **FAB + popover en vez de panel permanente**: el panel siempre-visible ocupaba espacio e interrumpía. El FAB está ahí cuando se necesita, invisible cuando no.
- **`Alt+Shift+E/O` como atajos**: descartados `Ctrl+Shift+*` (colisiones con claude.ai y con DevTools del browser), `Ctrl+E` (find-in-page), `Alt+E` (menú Edit). `Alt+Shift+*` tiene cero colisiones conocidas en Chrome + claude.ai + extensiones populares.
- **Botón primario blanco, no naranja**: el par naranja-sobre-navy se leía como la camiseta de Boca Juniors. El blanco-sobre-navy es tipográficamente más legible además.
- **`pure.js` como classic script, no ESM**: los `content_scripts` del manifest MV3 no aceptan `"type": "module"`, y los service workers clásicos tampoco. Classic IIFE + `module.exports` a pie de página cubre los tres consumidores (content script, SW, Node/vitest) sin build step.
- **Duck-typing `.message` en `explainError`**: `instanceof Error` falla cuando el Error cruza realms (content script → page, vm sandbox → outer). Chequear `typeof err.message === 'string'` funciona igual y cubre el caso de tests.
- **`BridgeError` en vez de códigos mágicos en mensajes**: antes el content script parseaba el string del error para decidir si seguir probando puertos. Ahora hay un canal estructurado (`{error: <code>}`) y una clase tipada del lado del server. Fail-soft para errores no mapeados.
- **Screenshots con URLs absolutas a raw.githubusercontent.com**: vsce warneaba sobre relative image paths. Absolutas resuelven en GitHub web, Marketplace, y dentro del `.vsix` sin cambio.
- **Onboarding modal bloqueante**: `showInformationMessage({ modal: true })` fuerza al usuario a leer el token antes de seguir. Alternativa era un toast no-modal que se podía ignorar — descartada porque el usuario que ignora el token llega al companion sin nada para pegar y no entiende por qué no funciona.

### Verificación
- `npm run ci` → 135 tests (109 previos + 26 nuevos de pure.js), lint, typecheck, build ✓.
- Camino feliz end-to-end: instalar vsix → modal de onboarding aparece → copiar token → cargar companion unpacked → pegar token en Opciones → banner verde "Emparejado" → abrir claude.ai → click en FAB → Markdown abre en VS Code + toast de éxito. También validado por `Alt+Shift+E` sin tocar el panel.
- Artifacts: `exportal-0.1.0.vsix` (831 KB) y `exportal-companion-0.1.0.zip` (9.2 KB) reproducibles desde `npm run package:all`.

### Lo que NO entra en v0.1.0
- Publicación en Chrome Web Store (requiere cuenta de developer de pago + review).
- Publicación en VS Code Marketplace (pendiente de decisión del usuario — el `.vsix` ya está listo).
- GitHub Action de release automático (manual por ahora con `gh release create`).
- Soporte para usuarios con múltiples orgs de claude.ai.
- Telemetría o crash reporting (explicito: zero-network, nada sale de la máquina).

### Próximos pasos posibles
- `gh release create v0.1.0` con los dos artifacts adjuntos cuando haya tiempo de verificar el flujo de instalación en una máquina limpia.
- Feedback de primeros usuarios (amigos, colegas) antes de decidir si publicamos al Marketplace/Web Store o si hay que iterar más en UX.
- Selector de org si alguien lo pide.

---

## Hito 18 — Auto-attach del export al chat de Claude Code (v0.2.0)
**Fecha:** 2026-04-20

### Objetivo
Eliminar el último paso manual del camino feliz: después de importar
una conversación, el usuario tenía que decirle a Claude Code "usá este
`.md` como contexto" (pegando el contenido, drag&drop, o `@archivo`).
Objetivo: que el `@-mention` aparezca solo en el input de Claude Code,
listo para enviar.

### Research previo
Auditoría del `extension.js` de la extensión oficial Claude Code
(`anthropic.claude-code` v2.1.114 instalada localmente) para mapear los
comandos públicos. Hallazgos relevantes:
- `claude-vscode.sidebar.open` — abre el panel lateral.
- `claude-vscode.insertAtMention` — lee el **editor activo**, toma
  `workspace.asRelativePath(document.fileName)`, y dispara un evento
  interno que agrega `@<ruta>` al input del chat (con soporte para
  rangos de línea si hay selección).
- Conclusión: no hace falta pasar argumentos; basta con que el `.md`
  importado sea el editor activo al momento del executeCommand.

### Alcance cerrado

**[src/extension/extension.ts](src/extension/extension.ts)**:
- Nuevo helper `persistAndOpenMarkdown(conversation, markdown)`:
  escribe a `<workspace>/.exportal/<timestamp>-<slug>.md` via
  `vscode.workspace.fs.writeFile`. Si no hay workspace abierto, cae en
  el fallback de `openTextDocument({ content, language })` (untitled) y
  devuelve `undefined`.
- Nuevo helper `attachToClaudeCodeIfAvailable(savedUri)`:
  - Early-return si `savedUri` es undefined (sin archivo real → el
    `@-mention` no puede resolverse).
  - Early-return si el setting `exportal.autoAttachToClaudeCode` está
    en `false`.
  - `vscode.commands.getCommands(true)` para ver si Claude Code está
    instalado; si no, early-return.
  - `sidebar.open` + `insertAtMention` dentro de un `try/catch` que
    swallowea errores (fail-soft: el usuario todavía tiene el `.md`
    abierto y puede adjuntarlo a mano).
- Los dos call-sites de import (bridge inline y bridge ZIP) ahora
  llaman a ambos helpers en vez de hacer `openTextDocument` inline.

**[src/extension/export-paths.ts](src/extension/export-paths.ts)** (nuevo):
- `buildExportTimestamp(date)` — `YYYY-MM-DD-HHmm`, ordenable
  lexicográficamente.
- `slugify(raw)` — lowercase, NFD + strip diacríticos, colapsar no-
  alfanuméricos a `-`, trim, cap a 40 chars, placeholder
  `conversacion` si el input no tiene alfanuméricos.
- Módulo separado del `extension.ts` para que los tests lo importen
  sin arrastrar `vscode` (el harness de vitest no resuelve `vscode`).

**[tests/extension/export-paths.test.ts](tests/extension/export-paths.test.ts)** (nuevo):
- 10 tests: formato y zero-padding del timestamp, orden lexicográfico,
  slugify de español con diacríticos, colapso de símbolos, length cap,
  placeholder para strings vacíos/simbólicos.

**[package.json](package.json)**:
- `contributes.configuration` con `exportal.autoAttachToClaudeCode`
  (boolean, default `true`).

**[README.md](README.md)**:
- Paso 3 del "camino feliz" actualizado para reflejar el auto-attach.
- Hint explícito sobre gitignorear `.exportal/`.

**[CHANGELOG.md](CHANGELOG.md)**: entrada `[0.2.0]`.

### Decisiones técnicas

- **Persistir en lugar de untitled**: `claude-vscode.insertAtMention`
  llama a `asRelativePath(document.fileName)`. Para un documento
  untitled eso devuelve algo tipo `Untitled-1`, que no resuelve como
  archivo real. Persistir a disco es precondición del @-mention.
- **Path `<workspace>/.exportal/`** (oculto por convención Unix):
  confirmado con el usuario. Visible en el file explorer pero no
  intrusivo, fácil de gitignorear. El usuario puede explorar el
  historial de imports como archivos normales.
- **Filename `<timestamp>-<slug>.md`**: timestamp con precisión de
  minuto + slug corto del título. Colisiones solo si el mismo chat se
  exporta dos veces en el mismo minuto — en ese caso `writeFile`
  sobrescribe, lo cual es el comportamiento deseado (misma conversación).
- **Setting opt-out (default on)**: discutido con el usuario.
  Justificado porque es el camino feliz esperado; si molesta, un
  toggle en `settings.json` alcanza.
- **Try/catch en `attachToClaudeCodeIfAvailable`**: el contrato de
  compatibilidad con Claude Code es frágil — es una extensión de
  tercero cuyos comandos podrían renombrarse. El import no debería
  fallar si el auto-attach falla.
- **Slug con strip de diacríticos (NFD + regex de combining marks)**:
  nombres de conversación en español son comunes ("Código en
  producción") y dar nombres de archivo con acentos crea problemas en
  Windows y en git logs. Diacríticos fuera, alfanumérico solamente.
- **Módulo `export-paths.ts` separado**: el patrón de pure-logic
  separada ya existe en el proyecto (`chrome/pure.js`). Lo replico del
  lado del host para tener tests unitarios sin vscode-mock.

### Verificación

- `npm run ci` → 154 tests (144 previos + 10 nuevos), lint, typecheck,
  build 850 KB (+6 KB por los nuevos helpers).
- Verificación manual pendiente en una máquina con Claude Code
  instalado: exportar una conversación desde claude.ai → verificar que
  (a) se crea el archivo en `.exportal/`, (b) el sidebar de Claude
  Code se abre, (c) el `@-mention` aparece precargado en el input.
- Fallback sin Claude Code: debería funcionar igual que antes (archivo
  abierto + toast), sin errores ni sidebar fantasma.
- Fallback sin workspace: untitled + toast, sin auto-attach, sin
  errores.

### Lo que NO entra en 18
- Selector de conversación integrado al chat (el user pasa siempre por
  el archivo abierto).
- Limpieza automática de `.exportal/` viejos — el usuario administra
  su workspace.
- Auto-attach para el flujo de ZIP/QuickPick cuando hay múltiples
  conversaciones: funciona igual (ambos call-sites usan el helper),
  pero no se validó end-to-end todavía.

### Próximos pasos
- Verificación manual en escenario real.
- Cuando sea estable, evaluar Hito 19 (reconstruir `.jsonl` para que
  aparezca en `/resume`) — solo si el Hito 18 resulta insuficiente.

---

## Hito 11 — GitHub Action de release automático
**Fecha:** 2026-04-20

### Objetivo
Eliminar el paso manual de release: `npm run package:all` + crear el
release en la web + adjuntar los dos artifacts. Con tag-push alcanza.

### Alcance cerrado
[.github/workflows/release.yml](.github/workflows/release.yml) — corre
en `push` de tags `v*`:
1. `npm ci` + `npm run ci` (lint/typecheck/tests/build) como
   pre-requisito.
2. `npm run package:all` — genera `exportal-<ver>.vsix` y
   `exportal-companion-<ver>.zip`.
3. Sanity check: los nombres de archivo coinciden con el tag (detecta
   drift entre `package.json`/`manifest.json` y el tag pusheado).
4. Extrae la sección `## [X.Y.Z]` del `CHANGELOG.md` a
   `release-notes.md` con un `awk` mínimo.
5. `softprops/action-gh-release@v2` crea el release con el body del
   CHANGELOG y ambos artifacts adjuntos.

### Decisiones técnicas

- **Trigger solo en `v*` tag-push**: no PR, no branch-push. Releases
  son eventos deliberados; no tiene sentido que el branch principal
  los dispare por error.
- **`permissions: contents: write` explícito**: desde GitHub default
  tightening (abril 2023) los workflows corren con permisos read-only
  salvo que se pidan. Sin esto, `gh-release` falla al publicar.
- **`softprops/action-gh-release@v2`**: es la acción estándar del
  ecosistema — mantenida, versionada, con semver estable. Alternativa
  (`gh release create` en bash) requeriría authenticar el CLI y es más
  frágil ante cambios de gh.
- **Sanity check de versiones**: si alguien pushea `v0.3.0` pero
  `package.json` dice `0.2.0`, el build genera `exportal-0.2.0.vsix` y
  el check falla explícitamente. Protege contra taggear prematuro.
- **`awk` inline en vez de action de terceros para las release
  notes**: 4 líneas de awk ya hacen el trabajo. Cualquier acción
  externa es una superficie de supply-chain extra para reemplazar un
  one-liner.
- **`fail_on_unmatched_files: true`**: si un artifact no se generó,
  falla explícito en vez de publicar un release parcial.

### Verificación
- Workflow no se puede probar end-to-end localmente; la primera
  corrida real será con `git tag v0.2.0 && git push --tags`.
- Local: `npm run package:all` verificado, genera ambos artifacts con
  los nombres correctos. El `awk` del CHANGELOG extrae la entrada
  `[0.2.0]` sin ruido.
- Si la primera release falla, iteramos sobre el YAML — es un solo
  archivo, cambios rápidos.

### Lo que NO entra
- Firma de los artifacts (code-signing del `.vsix` o `.zip`). No hay
  publisher key configurada.
- Publicación automática al Marketplace/Web Store. Hitos 12 y 13
  respectivamente.
- Prerelease flag (`draft` o `prerelease`). El action publica directo;
  si querés preview, taggeás sobre un branch de prueba.

---

## 2026-04-20 — Hito 15 · Send Claude Code session to claude.ai (v0.3.0)

### Qué hicimos
- Nuevo comando `exportal.sendSessionToClaudeAi` en la extensión:
  lista las sesiones del cwd actual (`~/.claude/projects/<encoded>/`),
  QuickPick con el primer mensaje de usuario como label + fecha +
  turnos, renderiza con `formatAsMarkdown` (redact on, tools/thinking
  off), copia al portapapeles y abre `claude.ai/new` en el browser.
- Reuso total del core: `encodeProjectDir`, `listSessionFiles`,
  `describeSession`, `readJsonl`, `formatAsMarkdown`. Cero dependencias
  nuevas en el bundle.
- Guard de tamaño: si el Markdown supera 150 KB, modal que pide
  confirmación explícita antes de copiar. claude.ai acepta payloads
  grandes pero los renderiza mal y a veces los trunca.
- Toast post-acción: "Markdown copiado. Pegalo con Ctrl+V en el chat
  nuevo" — el usuario sabe que el paso siguiente es manual.

### Decisiones clave y por qué
- **Paste manual, no automation**: claude.ai no expone API pública de
  *write*. Cualquier intento de injectar el texto via DOM sería frágil
  (claude.ai cambia markup cada release) y huele a scraping. Preferimos
  un UX claro ("copiá + pegá") que una magia que se rompe en silencio.
- **Tools y thinking OFF por defecto**: una sesión de Claude Code con
  tool use completo puede ser 300+ KB. El caso común es "llevar el
  contexto a claude.ai para consultar otra cosa", donde lo importante
  son los mensajes, no los Bash outputs intermedios. Quien necesite
  todo usa el CLI con `--include-tools --include-thinking`.
- **Sólo paleta de comandos, sin botón en status bar**: ya hay un
  botón de "Importar claude.ai". Un segundo botón genera confusión
  ("¿este era el de ida o el de vuelta?"). La paleta es suficiente
  para un flujo ocasional.
- **`openExternal(claude.ai/new)`**: usa el browser default. No
  asumimos que el usuario tiene una tab abierta ni intentamos
  encontrarla — siempre abre un chat limpio.
- **Redacción on, sin flag en UI**: mismo principio fail-closed de
  toda la extensión. Si alguien necesita raw, el CLI está ahí.

### Verificación
- Typecheck, lint, 154/154 tests verdes.
- El comando queda registrado en `package.json` → `contributes.commands`.
- Manual: F5 → paleta → "Send Claude Code session..." → elegí sesión
  del proyecto actual → chequeo portapapeles → `claude.ai/new` abre.

### Lo que NO entra
- Hito 19 (reconstruir `.jsonl` para que aparezca en `/resume` de
  Claude Code) — ese era el camino *web → VS Code* alternativo al
  auto-attach, no el *VS Code → web* de esta entrada. Sigue en ROADMAP.
- Selector de modelo / sistema de plantillas ("iniciá el prompt con X
  instrucción"). YAGNI hasta ver el patrón de uso real.
- Pegado automático (via `SendKeys`, Puppeteer, extensión de Chrome
  escuchando clipboard). Todo eso es frágil o invasivo; el paso manual
  de Ctrl+V es aceptable.

---

## 2026-04-21 — Hito 12 · Publicación al VS Code Marketplace

### Qué hicimos
- Repo ClaudeTool pasó a visibilidad pública en GitHub. Habilitó
  imágenes absolutas y el link "Repository" del Marketplace.
- Publisher `dioniipereyraa` creado en
  `marketplace.visualstudio.com/manage` con nombre "Dionisio
  Pereyra", logo de Exportal (icon-128) y Support email
  dionipereyrab@gmail.com.
- Upload manual del `exportal-0.3.0.vsix` via la UI del Marketplace
  (sin PAT). Pasó el "Verifying" en minutos y quedó en
  `marketplace.visualstudio.com/items?itemName=dioniipereyraa.exportal`.
- README (los dos: repo + vsix) actualizado para poner la instalación
  desde Marketplace como opción primaria.

### Decisiones clave y por qué
- **Upload manual via web, no `vsce publish` + PAT**: la primera
  publicación tolera mejor la fricción de UI que la de CLI (el PAT
  exige pasar por Azure DevOps, que tiene un flujo separado). Una vez
  validado que todo funciona, la siguiente versión puede automatizarse
  via PAT + GitHub Action si la frecuencia de release lo amerita.
- **Sin verified domain**: el tilde azul del Marketplace requiere
  verificar un dominio propio. No tenemos dominio personal ni vale la
  pena sacarlo solo por esto. Se puede agregar después.
- **Repo público**: decisión aplazada desde sesiones anteriores. El
  driver real fue el Marketplace — un proyecto published con código
  cerrado pierde credibilidad. Además el README del Marketplace queda
  mejor con imágenes de `raw.githubusercontent.com`, que ahora sí
  funcionan.

### Verificación
- URL pública del Marketplace carga correctamente.
- `Ctrl+Shift+X` dentro de VS Code encuentra "Exportal" por búsqueda.
- Instalación desde Marketplace ejecuta el activation event y muestra
  el onboarding modal en primera corrida.

### Lo que NO entra
- Firma de los vsix (code-signing del publisher). Opcional, no es
  bloqueante.
- Automatización del publish en el workflow de release. Si la
  frecuencia de releases crece se agrega; hoy el release cada par de
  versiones se hace a mano.

---

## 2026-04-21 → 2026-04-23 — Hito 13 · Publicación al Chrome Web Store

### Qué hicimos
- Preparamos toda la documentación que Google exige para review de
  una extensión:
  - `docs/PRIVACY.md` — política de privacidad con detalle de cada
    permiso, explícito que no hay analytics, no servidores remotos,
    loopback-only.
  - `docs/CHROME_WEB_STORE_LISTING.md` — borrador listo-para-pegar
    con todos los campos del dashboard: single purpose, justificación
    por permiso, data usage disclosure, privacy policy URL.
- Pago de la cuenta de developer (US$5 one-time) en Chrome Web Store.
- Upload de `exportal-companion-0.3.0.zip`, primera review aprobada en
  ~1 día hábil sin cambios solicitados.
- Post-aprobación vino el arco de redesign (hitos 25 + 26) con varias
  iteraciones: 0.5.0 (redesign + auto-pair + ping loop), 0.5.1
  (options tres estados), 0.5.2 (`open_in_tab: true` + auto-open), 0.5.3
  (centrado), 0.5.5 (refresh READMEs), 0.5.6 (code-review sweep +
  refresh de one-liner description).
- Upload final de `exportal-companion-0.5.6.zip`. Segunda review aprobada.

### Decisiones clave y por qué
- **Privacy policy en el repo, no en un sitio externo**: cero
  infraestructura a mantener, URL estable, y al ser parte del repo
  público queda versionada con el código. Google acepta links de
  GitHub Pages o blob URLs.
- **Single purpose estrecho y claro**: "Export claude.ai
  conversations to a local VS Code extension". No promovemos
  features secundarios (atajos de teclado, badge) como propósito
  primario — eso complica el review.
- **Justificación de `host_permissions: 127.0.0.1`**: éste es el
  permiso que más suele disparar review manual. Lo justificamos
  explícito: "loopback only, bearer-token auth, traffic never leaves
  the device". La redacción pasó en la primera review sin objeciones.
- **Re-submit de 0.5.6 fue un patch release, no una descripción
  nueva**: ninguna permission ni surface change requirió re-justificar
  nada. El "What's new in this version" cubrió los cambios.

### Verificación
- Extensión pública en el Chrome Web Store, instalable con un click.
- Primera review: 0.3.0 aprobada.
- Segunda review: 0.5.6 aprobada con los redesigns 25 + 26 incluidos.

### Lo que NO entra
- Auto-publish vía CI (`chrome-webstore-upload-cli`). Requiere gestión
  de API credentials + OAuth refresh tokens; por la frecuencia de
  release actual (~1 por sprint) el upload manual desde el dashboard
  es más barato en mantenimiento.
- Update de screenshots del listing a las del diseño citrus. Las del
  navy+orange siguen arriba — pendiente en ROADMAP near-term.

---

## 2026-04-21 — Hito 24 · Internacionalización (es + en)

### Qué hicimos
- Ambas extensiones pasan a seguir el idioma de la UI del usuario.
  Default `en`, fallback traducido `es`. No hay toggle manual — lo que
  cada runtime expone (`vscode.env.language`, `chrome.i18n`) manda.
- **VS Code**
  - `package.nls.json` / `package.nls.es.json` para strings del
    manifiesto (description, títulos de comandos, configuration).
    `package.json` referencia `%key%` en los lugares correspondientes
    y declara `"l10n": "./l10n"`.
  - `l10n/bundle.l10n.es.json` (message-as-key) con ~40 strings de
    runtime.
  - `src/extension/extension.ts` pasa todos los strings por
    `vscode.l10n.t()`. Las constantes de labels de acción (copy
    token, content scan, browse) se movieron adentro de la función
    que las usa porque `vscode.l10n.t()` debe invocarse después de
    que cargue el bundle, no en tiempo de carga del módulo.
- **Chrome**
  - `_locales/en/messages.json` (default) + `_locales/es/messages.json`.
    `default_locale: "en"` en el manifest.
  - `manifest.json` usa `__MSG_extName__` / `__MSG_extDescription__`
    en los campos que Chrome localiza de forma nativa.
  - `options.html` marca cada nodo estático con `data-i18n="key"`
    (innerHTML) o `data-i18n-placeholder="key"` (atributo);
    `options.js` lo bootstrap-ea en load. Uso de `innerHTML` es
    seguro: las traducciones viajan con la extensión, sin input de
    usuario, y algunas llevan `<strong>/<code>/<kbd>` necesarios
    para las instrucciones.
  - `background.js` y `content-script.js` resuelven strings via
    `chrome.i18n.getMessage()`.
  - `pure.js` se queda sin tocar `chrome.*` a propósito: el vitest
    corre el archivo en un `vm` sandbox que no expone la API.
    `explainError()` ahora devuelve **IDs de mensaje** (`errSessionExpired`,
    `errBridgeOffline`, …). El content script los resuelve contra el
    locale activo. Tests actualizados a `toBe('errSessionExpired')`.
- Badges (`OK`/`SET`/`AUTH`/`OFF`/`OLD`/`ERR`) no se traducen —
  decidimos tratarlos como códigos tipo-HTTP, universales.
- Todos los mensajes de `console.warn` quedan en inglés sin pasar por
  i18n: son para desarrolladores y el idioma source es inglés.

### Verificación
- `npx vitest run` → 154/154 tests en verde (26 en pure.test.ts).
- `npx tsc --noEmit` → sin errores.
- Smoke test manual en Chrome con `--lang=en` y `--lang=es` sobre un
  `--user-data-dir` temporal: tooltips, options page, FAB y popover
  cambian de idioma correctamente.
- VS Code: `Configure Display Language` → `es` / `en` → los títulos
  de comandos y el modal de onboarding siguen el setting.

### Decisiones clave y por qué
- **Default `en`, no `es`**: el repo y el target del Marketplace/CWS
  es internacional. En el peor caso un usuario cae en inglés; en el
  mejor, Chrome/VS Code le dan español nativo.
- **Dejar `pure.js` devolviendo IDs**: alternativas eran inyectar un
  resolver por constructor (complica el shape) o tener un mapa duplicado
  adentro (dos lugares con strings). Devolver IDs preserva tests,
  mantiene el archivo reutilizable entre service worker, content
  script y Node, y el costo al caller es una línea
  (`chrome.i18n.getMessage(id)`).
- **Message-as-key en VS Code pero camelCase en Chrome**: seguimos
  la convención idiomática de cada plataforma. `vscode.l10n.t()`
  documenta message-as-key como el patrón default; `chrome.i18n`
  exige nombres cortos y usa camelCase en todos los ejemplos oficiales.

### Pendiente
- Release 0.4.0 (vsix + zip firmado del companion) cuando apruebe la
  review del CWS de 0.3.0 — subir ambas versiones juntas evita
  confundir a usuarios con "versión mínima para emparejar".

---

## 2026-04-22 → 2026-04-23 — Hito 25 · Emparejamiento en un click

### Qué hicimos
Reemplazamos el flujo "copiá este token de VS Code y pegalo en las
opciones del Companion" por un pipeline zero-paste entre VS Code y
Chrome. Shipped en v0.5.0 y ajustado a través de 0.5.1 → 0.5.6.

- **Fuente (VS Code)**: el comando `Exportal: Mostrar token de
  emparejamiento` abre un webview panel con un botón **"Copiar y abrir
  Chrome"**. El handler escribe el token al clipboard (fallback),
  construye un `vscode.Uri.from({scheme:'https', authority:'claude.ai',
  path:'/', fragment:'exportal-pair=<token>'})` y llama
  `vscode.env.openExternal`. El panel queda abierto — el usuario puede
  re-disparar si Chrome no detecta el token.
- **Consumo (content script claude.ai)**: `consumePairingFragment()`
  corre al cargar; usa `URLSearchParams` sobre el hash (tolera
  percent-encoding del `=`) y, si la regex `/^[0-9a-fA-F]{64}$/`
  matchea, manda `{type:'exportal:setPairingToken', token}` al service
  worker. Si `window.location.hash` viene vacío (claude.ai strippeó la
  URL antes del `document_idle`), cae a `performance.getEntriesByType
  ('navigation')[0].name` para recuperar la URL original.
- **Storage (service worker)**: valida de nuevo el shape 64-hex y
  persiste via `chrome.storage.local.set({[TOKEN_KEY]: token})`. El
  `storage.onChanged` listener que ya existía refresca el badge solo.
- **Confirmation loop**: el service worker, tras guardar el token,
  corre `pingBridge(token)` — probe de los puertos 9317-9326 con
  `POST /ping` + Bearer. El endpoint `/ping` nuevo en `http-server.ts`
  valida el Bearer y dispara `onPing` en la extensión. Ahí
  `handlePairConfirmed()` muestra una notification, y si el webview
  panel sigue abierto le manda `{type:'paired'}` — el webview swap-ea
  a un overlay con check lime y auto-disposes a 2.5s. El debounce de
  3s en `handlePairConfirmed` evita doble-notification si el mismo
  tab de claude.ai se recarga.
- **Abrir options page después del pair**: el content script también
  dispara `{type:'exportal:openOptionsPage'}`; el service worker llama
  `chrome.runtime.openOptionsPage()`. El usuario aterriza en el
  panel del Companion mostrando el estado "paired" completo, no
  solo el toast efímero en claude.ai.
- **Post-consumo**: `history.replaceState(null, '', pathname+search)`
  para que un reload no re-aplique el token.
- **Onboarding v2**: renombrado el flag `exportal.onboardingShown` a
  `exportal.onboardingShownV2` para que usuarios upgrading desde 0.4.x
  vean la nueva UI una vez.
- **Single-instance del webview**: referencia del panel en una var de
  módulo (`let pairingPanel`), no sobre `ExtensionContext` (que VS Code
  congela y rechaza nuevos properties — error `object is not extensible`
  en la primera iteración).

### Decisiones clave y por qué
- **URL fragment vs query string**: fragmentos no se envían al server,
  claude.ai nunca ve el token. Vale la complicación de leer
  `window.location.hash` en el content script.
- **`Uri.from` vs `Uri.parse`**: en algunas builds de VS Code,
  `parse("https://claude.ai/#a=b").toString()` re-encodea `=` a `%3D`
  en el fragment. Chrome entrega eso literal en `window.location.hash`,
  rompiendo la regex. `Uri.from` con components explícitos preserva
  el fragment verbatim. Encontrado el bug en 0.5.1, solucionado en
  0.5.2.
- **No pedimos `clipboardRead`**: Chrome permitiría auto-detectar el
  token con `navigator.clipboard.readText()` en el options page, pero
  agregar el permiso dispara re-review de CWS para todos los usuarios
  existentes. El fragment cubre el happy path; el paste manual sigue
  funcionando en options como fallback.
- **Threat model**: un link malicioso tipo
  `claude.ai/#exportal-pair=ATTACKER_TOKEN` puede sobreescribir el
  token del Companion. El peor caso es que el siguiente export falle
  con "Token inválido" (la VS Code bridge tiene otro token), y el
  usuario re-empareja. Cero filtración de datos, cero RCE. Documentado
  en el comentario de `consumePairingFragment`.
- **Panel del webview no se auto-cierra en "Copy and open Chrome"**:
  si Chrome no detecta el fragment (default browser distinto, Companion
  desactualizado), el usuario puede re-clickear sin tener que re-abrir
  el panel. Feedback visual inline (botón en verde + "Abriendo
  Chrome…" 1.8s) mata la ansiedad.
- **Logs `console.info` persistentes**: para que el usuario pueda
  diagnosticar sin attachearse un debugger. Noise mínimo (una línea
  por page load con hash).
- **`open_in_tab: true` en el manifest**: sin esto, `openOptionsPage`
  renderiza el panel como popup chiquito dentro de `chrome://extensions`,
  lo que rompe el layout de la card del design.

### Verificación
- End-to-end manual en Windows + Chrome 131 + VS Code 1.95: VS Code
  abre claude.ai, Chrome muestra toast lime "Emparejado con VS Code",
  options page abre mostrando "¡Listo! — Todo conectado", VS Code
  recibe ping y muestra notification + overlay lime en el webview.
- Logs `[Exportal] pair:` aparecen en la consola de claude.ai en
  cada paso.
- `Version History` del tab CWS lista la 0.5.6 con los cambios
  acumulados.

### Lo que NO entra
- **Native messaging** (VS Code habla con el Companion vía stdio
  de un native host): requiere instalar un JSON manifest en el
  filesystem del OS + un binario permanente. Demasiada fricción
  para una ganancia marginal.
- **Custom URL scheme** `exportal://`: requiere registrar un handler
  OS-level, varía por plataforma. El fragment flow hace el mismo
  trabajo sin instalación extra.
- **Auto-detect del clipboard en options**: requiere `clipboardRead`,
  ya discutido arriba.

---

## 2026-04-22 → 2026-04-23 — Hito 26 · Rediseño Graphite Citrus

### Qué hicimos
Reescritura completa de la identidad visual de ambas extensiones, de
la paleta navy+orange original a **Graphite Citrus** (dark, con acento
lime `#D4FF3A`). Shipped en v0.5.0 y pulido a través de 0.5.1 → 0.5.6.

- **Design source**: vendored `design-cds/` con los tokens, componentes
  (FabExpanded, OnboardingChrome, OnboardingVsCode, ExportalMark) y
  referencias de color/tipografía. Ignorado por vsce y eslint; no
  ship, solo referencia.
- **Sistema de tokens**: un objeto `TOKENS` en
  `chrome/content-script.js` (surface `#111315`, accent lime,
  textDim opacidad 60%, fsXs 11 / fsSm 13 / fsBase 14 / pad 16 / radius
  10, etc.) replicado como variables CSS `--exp-*` en las tres
  surfaces (content-script, options.html, webview de pairing). Single
  source of truth que mantiene consistencia.
- **FAB + popover en claude.ai**: el FAB pasa de círculo navy 44px a
  orb ambient 46px con ExportalMark (SVG inline) + pulse dot lime en
  la esquina. El popover adopta la layout de `FabExpanded`: header con
  ExportalMark + nombre + chip "VS Code" con dot verde, botón primary
  lime "Exportar este chat" con ArrowGlyph, secundario ghost
  "Preparar export oficial", y kbd chips `Alt+Shift+E` / `Alt+Shift+O`
  en JetBrains Mono (pasaron de los glyphs Mac-only `⌥⇧` a spelled-out
  en v0.5.0).
- **SuccessPulse** en el popover cuando el export termina: un overlay
  absoluto que cubre la card entera, check glyph lime que se dibuja
  con `stroke-dasharray` animation, y una línea mono con
  `{ms}ms · {count} mensajes` donde `ms` es `performance.now()` diff
  real y `count` viene de `conversation.chat_messages.length`.
- **Options page del Companion**: adopta OnboardingChrome con tres
  estados driven por `[data-state]` en la card:
  - `waiting`: chip "Esperando…", botón primary desactivado.
  - `detected`: chip "Token detectado", token field con border lime +
    shimmer animation, botón primary actionable.
  - `paired`: chip verde "Emparejado", headline "¡Listo!", botón
    mutado a "✓ Todo conectado", y aparece un link low-contrast
    "Desemparejar".
  `chrome.storage.onChanged` listener sincroniza el estado si el
  auto-pair via URL fragment completa en otra pestaña.
  `open_in_tab: true` en el manifest hace que la page se renderice como
  tab completa (no como popup embedded en `chrome://extensions`). El
  body es flex-centered en el viewport para que la card 420px quede
  en el medio.
- **Pairing webview de VS Code**: adopta OnboardingVsCode — titlebar
  fake con 3 dots estilo macOS, mark + headline "Conectá tu navegador",
  stepper VS Code → Chrome → Listo, token card con borde punteado y el
  token en mono, y botones "Luego" (ghost) + "Copiar y abrir Chrome"
  (primary con flecha). Reemplazó el `showInformationMessage` bloqueante
  que traíamos. CSP con nonce + `default-src 'none'`, single-instance
  via var de módulo (ver Hito 25 para el detalle del storage bug).
- **Status bar de VS Code**: codicon `$(export)` en lugar del genérico
  `$(cloud-download)`, para eco del motivo flecha-del-mark.
- **Icon refresh**: `assets/icon.svg` reescrito como ExportalMark
  — fondo `#0A0B0D`, trazos de la E en `#F2F3F0`, barra central +
  flecha en `#D4FF3A`. Regenerado a PNG 128×128 con `scripts/build-
  icon.mjs` y copiado a `chrome/icon-128.png`.
- **i18n completo**: keys nuevos para los tres estados de options
  (`chipWaiting`/`chipDetected`/`chipPaired`,
  `headlineWaiting`/`headlineDetected`/`headlinePaired`, etc.), para
  el SuccessPulse (`pulseHeadline`, `pulseMessagesSuffix`), para el
  pair success toast (`toastPairedWithVsCode`), para el local-first
  block (`localFirstLead`, `localFirstBody`), y para el webview
  (`Connect your browser`, `Paired with Chrome`, etc.).
- **Polish releases 0.5.1 → 0.5.6**: options tres estados (0.5.1),
  auto-open de options page + `open_in_tab` (0.5.2), centrado del
  viewport (0.5.3), version-bump-only para destrabar upload al
  Marketplace (0.5.4), refresh de READMEs sacando el `v0.3.0`
  hardcodeado + flujo de pairing 1-click (0.5.5), code-review sweep
  + refresh del one-liner del Marketplace + cleanup de 21 i18n keys
  muertos (0.5.6).

### Decisiones clave y por qué
- **Paleta Graphite Citrus sobre navy+orange**: la paleta original era
  solvente pero genérica. Citrus da una identidad visual distintiva
  (lime sobre near-black), el dark mode matchea el entorno natural de
  Claude Code / VS Code, y el contraste del accent sobre surface
  oscura lee mejor a tamaño chico (icon 128×128 de CWS/Marketplace).
- **FAB colapsado + popover expandido, no card permanente**: el design
  original mostraba `FabExpanded` como card siempre visible. Eso es
  ~280×240px tapando contenido de claude.ai. Compromiso: orb 46px
  ambient por defecto, click expande el popover con los contents del
  FabExpanded. Misma identidad visual, sin el cost de UI siempre
  presente.
- **CSS vars bajo `#exportal-panel` scope**: evita que reglas de
  claude.ai se filtren a nuestra UI y al revés. Las keyframes
  (expPop, expCheckIn, expShimmer, etc.) van globales porque Chrome
  las registra una sola vez y no vale encapsularlas.
- **Badges `OK`/`SET`/`AUTH`/`OFF`/`OLD`/`ERR` no se traducen**:
  decisión explícita, los tratamos como códigos tipo HTTP status
  universales.
- **SVG inline en vez de `<img src>` del icon**: evita el round-trip
  al filesystem del extension, fill-colors editables via tokens, y
  no depende de que `icon-128.png` esté rasterizado al tamaño exacto
  que necesitamos.
- **`.vscodeignore` actualizado**: `design-cds/**` bumpea el vsix a
  ~500KB si se incluye. Ignorado explícito.

### Verificación
- 154 tests pasan, typecheck limpio, lint limpio (post-cleanup en
  v0.5.6).
- Smoke test manual del flujo completo en Windows + Chrome 131 + VS
  Code 1.95.
- El icon citrus aparece correctamente en el card del Marketplace
  (después del cache invalidation) y en el CWS.
- Options page centrada en viewport con la tab de Chrome resized
  a varios anchos (sin cortar la card ni dejar espacio raro).

### Lo que NO entra
- **Modo light**: el design tiene una paleta light shipped en
  `tokens.jsx` pero no la implementamos. Dark matchea el uso
  mayoritario de claude.ai (forzado dark) y VS Code (mayoría usa dark).
  Si hay demanda, el CSS ya está scopeado via `--exp-*` — agregarlo
  después es viable.
- **Densidad compact**: misma lógica. `cozy` es el único shipped.
- **Refactor del renderizador para múltiples paletas**: el componente
  `tokens.jsx` del design soporta `ember`/`citrus`/`violet`. Bajamos
  citrus solamente; si iteramos branding a otro nombre/paleta en el
  futuro, la reescritura es mecánica.
- **Recapturar screenshots para los listings de CWS + Marketplace**:
  los shipped son del navy+orange viejo. Queda pendiente en ROADMAP
  near-term.


---

## 2026-04-23 — Hito 27 · Soporte para Claude Design (v0.6.0)

### Qué hicimos
Extendimos el FAB y el flujo de export inline para que también
funcionen en proyectos de Claude Design (`https://claude.ai/design/p/<UUID>`),
no sólo en chats clásicos (`/chat/<UUID>`). El usuario ahora puede
exportar un chat de Claude Design a VS Code con un click sin pasar
por el ZIP oficial.

- **Recon (4 rondas iterativas, todas documentadas en ROADMAP commits
  29f6647 / 5665985 / bd91345 / aef2eda)**: Claude Design es
  same-origin con claude.ai, transport Connect-RPC bajo
  `/design/anthropic.omelette.api.v1alpha.OmeletteService/...`,
  endpoint clave `GetProject`. Negociación JSON via `Content-Type`/
  `Accept: application/json` + `Connect-Protocol-Version: 1` anda;
  field name del request es `project_id` (snake_case). Response 200
  trae el blob real en `data: <base64-encoded JSON>`.
- **`chrome/pure.js`** (`+30 LOC`): nuevas
  `extractDesignProjectIdFromPath(pathname)` y `routeFromPath(pathname)`.
  La segunda devuelve `{kind: 'chat'|'design', id} | undefined` y es
  el único punto de entrada de routing para el content script.
  Tests en `tests/chrome/pure.test.ts` (+11 tests, 165 total).
- **`chrome/content-script.js`**: el viejo `currentConversationId()`
  → `currentRoute()`. El panel guarda `data-route-kind` y
  `data-route-id`. `syncPanel` rebuilda el panel cuando cambia la
  *kind* (chat ↔ design) porque el popover difiere (Design oculta
  el botón de "Preparar export oficial" — el ZIP oficial matchea
  por chat UUID, y en Design la URL solo expone el project UUID,
  no el chat UUID activo). Nuevo dispatcher `fetchByRoute(route)`
  consume el route y llama `fetchConversation(id)` para chat o
  `fetchDesignProject(id)` para design.
- **`fetchDesignProject(projectId)`**: POST al endpoint Connect-RPC
  con headers + body correctos, parsea JSON, llama
  `adaptDesignToConversation(outer)`.
- **`adaptDesignToConversation(outer)`**: `atob(outer.data)` →
  `JSON.parse` → toma el chat activo via `inner.viewState.activeChatId`
  (fallback al primero si está stale) → mapea cada message del
  shape Design (`{role, content: string, id, timestamp, ...}`) al
  shape claude.ai/chat que `parseSingleConversation` valida en el
  bridge (`{uuid, sender: 'human'|'assistant', text, content: [{type:
  'text', text}], created_at}`). Naming de la conversación:
  `[<projectName>] <chatTitle>` para que sea identificable en VS
  Code.
- **Kbd chips** en Design: solo `Alt+Shift+E`, sin `Alt+Shift+O`,
  porque el shortcut secundario es el "preparar export oficial" que
  no aplica.
- **Sin cambios en el bridge ni en el manifest del Chrome
  Companion**: la adaptación del shape pasa enteramente del lado
  cliente, así que `/import-inline` y los permisos no se enteran.
  Bonus: cero re-review en CWS por permisos (mismo `host_permissions`,
  mismo `content_scripts.matches`).

### Decisiones clave y por qué
- **Adaptación del shape del lado cliente, no del bridge**: hubiera
  sido tentador agregar `/import-design-inline` y un parser dedicado
  en VS Code. Pero la shape de Design es estrictamente más simple
  (content es string, no array de bloques), así que upgrade-a-claude.ai-shape
  es más barato que duplicar pipeline. Si en el futuro Design agrega
  features que no caben en la shape de chat (artifacts inline,
  branching, etc.), refactorizamos.
- **Solo el chat activo, no todos los chats del proyecto**: cada
  proyecto Design tiene un dict `chats: { uuid: {...}, ... }` y un
  `viewState.activeChatId` que apunta al que está en pantalla. El
  modelo mental del usuario es "estoy viendo este chat, lo exporto",
  no "exporto los 14 chats del proyecto a la vez". Mismo paradigma
  que en claude.ai/chat (un chat por export). Si alguien pide
  "exportar todos", hito separado.
- **Esconder el botón de "Preparar export oficial" en Design**: el
  flujo de official-export matchea conversaciones por UUID en el ZIP
  de Settings → Export data. La URL de Design solo expone el project
  UUID, no el chat UUID activo. Wirearlo daría un silent no-match
  cuando el ZIP arrive. Mejor esconder el botón que confundir.
- **Connect-Protocol-Version: 1 + JSON negotiation**: nos ahorra
  implementar protobuf wire-format. La alternativa (strippear los
  4 bytes de framing del proto wrapper antes de parsear el JSON
  embebido) era trivial pero implicaba más código defensivo. JSON
  nativo es la versión que ningún cambio futuro de framing nos rompe.
- **`buildPopover(route)` rebuilda en lugar de `display:none`**: una
  navegación chat→design dispara `syncPanel`, que detecta el cambio
  de kind y llama `existing.remove()` antes de construir el panel
  nuevo. Más limpio que mantener el popover con secondary oculto y
  preocuparnos del estado.

### Verificación
- 165 tests pasan (154 previos + 11 nuevos sobre
  `extractDesignProjectIdFromPath` y `routeFromPath`).
- Typecheck + lint limpios (post-add de `atob` al eslint globals
  de `chrome/**`).
- Build limpio. vsix empacado con `npm run package:vsix`. Companion
  zip empacado con `npm run package:chrome`.
- Smoke test manual sobre el proyecto del usuario
  `https://claude.ai/design/p/ab145d0a-56e9-443b-8a4d-b655ef8ac02d`
  pendiente — el código compila pero el end-to-end con el bridge
  hay que probarlo en el browser. Plan: smoke test antes del tag
  v0.6.0.

### Lo que NO entra
- **Atajos para todos los chats del proyecto Design**: el usuario
  ve un chat por vez; exportar el chat activo es la operación
  natural. Si alguien pide "exportar el proyecto completo",
  pensamos formato (varios `.md`? un `.md` con secciones?) en otro
  hito.
- **Inclusión de `claudeMd` del proyecto en el export**: cada
  proyecto Design tiene un campo `claudeMd` (presumiblemente el
  CLAUDE.md asociado al proyecto). Útil como contexto pero amplía
  el scope de "exportar el chat" a "exportar el chat + el system
  prompt". Lo dejo afuera — el usuario puede pegarlo a mano si lo
  necesita.
- **`assets` (los archivos generados por Claude Design)**: el
  proyecto tiene un dict `assets` con HTML/components/PNGs
  versionados. Nuestro export es del CHAT, no del output. Si el
  usuario quiere los archivos, los descarga con los botones nativos
  de Claude Design (`↓ Descargar todos` etc).
- **`todos` / `composer.text` (estado del UI)**: irrelevante para
  el contexto de Claude Code.

### Addendum 2026-04-23 (v0.6.1) — bug encoding UTF-8

Smoke test end-to-end del usuario sobre el proyecto Design pasó: el
chat se exportó completo a `.exportal/<...>.md` con todos los
mensajes, roles y timestamps correctos. Pero el texto vino corrupto:
`extensión` aparecía como `extensiÃ³n`, `diseño` como `diseÃ±o`,
`¡Hola!` como `Â¡Hola!`. Mojibake clásico de "UTF-8 leído como
Latin-1".

Causa: en `adaptDesignToConversation` hacíamos
`JSON.parse(atob(outer.data))`. `atob()` devuelve un binary string
donde cada char es un byte (0-255), así que las secuencias multibyte
de UTF-8 (ñ = 0xC3 0xB1, ó = 0xC3 0xB3) llegaban a `JSON.parse` como
pares de chars Latin-1. JSON.parse acepta cualquier char válido en
strings sin chistar, así que la corrupción rodaba hasta el
`.exportal/<...>.md` final.

Fix en v0.6.1: walk del binary string a `Uint8Array` y decode con
`TextDecoder('utf-8')` antes del `JSON.parse`:

```js
const bytes = Uint8Array.from(atob(outer.data), (c) => c.charCodeAt(0));
inner = JSON.parse(new TextDecoder('utf-8').decode(bytes));
```

Encontrado a la primera corrida real. Lección: el path Design tiene
el extra step de base64 que el path /chat no tiene (donde
`res.json()` decodifica UTF-8 nativo por content-type). No replicar
esto en futuros adapters de plataformas con base64 en el response.

---

## 2026-04-23 — Hito 28 · Export de assets de Claude Design (v0.7.0)

### Qué hicimos
Extendimos el export de Claude Design para que también baje los
**archivos generados** (HTML, JSX, JSON, etc.) además del chat. El
gap se descubrió post-0.6.1: con la conversación sola, el usuario
exportaba "qué hablamos" pero perdía "qué construyó Claude". Para
Claude Design eso es la mitad del valor.

- **Recon (4 rondas en una sesión)**: documentado en commits sucesivos
  del ROADMAP. Hallazgos clave:
  - `inner.assets[<name>].versions[i]` es metadata-only — `path`,
    `createdAt`, `chatId`, `status`, `subtitle`. Sin contenido.
  - `attachments` de los messages son skills del sistema, no archivos.
  - `ListFiles { project_id }` devuelve árbol top-level: 5 archivos +
    3 directorios en el proyecto del usuario.
  - `GetFile { project_id, path }` devuelve `{content (base64),
    contentType}` — el contenido real, en el mismo encoding que
    `GetProject.data`.
  - Las descargas que hace el UI ("↓ Descargar todos") son client-side
    renders a PNG via blob URLs — no van por la red.
- **`chrome/content-script.js`**:
  - Factor común `callDesignRpc(method, body)` que abstrae los headers
    Connect-RPC + el handling de errores. Las 3 llamadas (`GetProject`,
    `ListFiles`, `GetFile`) lo usan.
  - Nueva `fetchDesignFiles(projectId)`: `ListFiles` → filtra entries
    `type !== 'directory'` → `Promise.allSettled` de `GetFile` por
    cada uno. `allSettled` (no `Promise.all`) para que un archivo
    roto no tire toda la operación: silently se filtra del bundle.
  - `fetchDesignProject` ahora devuelve `{conversation, assets}`. La
    fetch de files va en su propio try/catch — falla aislada deja
    `assets: []` y el handler downstream omite la sección "Generated
    assets".
  - `fetchByRoute` simétrico: chats devuelven `{conversation, assets:
    []}`. `handlePrimaryClick`, `runPrimaryFromShortcut`, `sendInline`
    todos refactor para tomar la nueva shape.
- **`chrome/background.js`**:
  - Handler de `exportal:sendInline` valida shape de `assets[]` antes
    de forwardear al bridge: array de objetos con `{filename, content,
    contentType}` todos string. Otros valores se filtran silenciosamente.
  - `forwardInlineConversation(conversation, assets)` bundlea solo si
    `assets.length > 0` — chats quedan byte-idénticos a antes.
- **`src/extension/http-server.ts`**:
  - Nuevo `InlineAsset = z.object({filename, content, contentType})`
    exportado como type para el handler.
  - `ImportInlinePayload` ahora tiene `assets: z.array(InlineAsset).
    optional()`.
  - `MAX_BODY_BYTES_IMPORT_INLINE` 10 MB → 50 MB. Test
    correspondiente actualizado a "returns 413 for payloads larger
    than 50 MB".
- **`src/extension/extension.ts`**:
  - `handleBridgeImportInline` extrae `assets` del payload, computa
    `baseName = <ts>-<slug>` una sola vez para que .md y carpeta
    hermana coincidan.
  - Nueva `buildAssetsHeader(assets, baseName)` prependa una sección
    `## Generated assets` al markdown listando los archivos con su
    tamaño y MIME (computado sin decodear vía `decodedBase64ByteLength`).
  - `persistAndOpenMarkdown` toma opcionalmente `baseName` y
    `assets`. Si hay assets, crea `<workspace>/.exportal/<baseName>/`
    junto al `.md` y escribe cada archivo. Soporta subdirectorios:
    `components/foo.jsx` crea `components/` adentro.
  - Nueva `writeInlineAsset(dir, asset)`: `Buffer.from(content,
    'base64')` → `vscode.workspace.fs.writeFile`.
  - Nueva `sanitizeAssetFilename(filename)`: rechaza `..`, `.`,
    paths absolutos (POSIX y Windows), null bytes, segmentos vacíos.
    Normaliza backslashes a forward para que joinPath funcione.

### Decisiones clave y por qué
- **Top-level files only en MVP, sin recursión**: el primer caso
  de uso (proyecto del usuario) tiene 5 archivos top-level + 3
  directorios. Los archivos importantes (los HTML del design) están
  todos en root. Las carpetas son subcomponentes que rara vez se
  necesitan. Recursión es scope creep para un MVP — si alguien la
  pide, hito separado.
- **`Promise.allSettled` en lugar de `Promise.all`**: si un archivo
  específico tira 500 (raro pero posible), no debería tirar el
  export entero. Mejor exportar lo que se pudo + warning silencioso
  en consola.
- **Adapter del lado cliente, no schema nuevo en el bridge**: pude
  agregar `/import-design-inline` con su propia validación. En su
  lugar extiendo `/import-inline` con un campo opcional. Razón:
  el shape de la conversación es idéntico para chat/design (gracias
  al adapter de Hito 27), solo cambian los assets. Más simple
  manejarlo como augmentation que como endpoint nuevo.
- **Cap a 50 MB**: el cap original de 10 MB era razonable para chats
  puros. Con bundling de assets (HTMLs son texto pero pueden ser ~50
  KB cada uno × N + JSXs + JSON state), 10 MB se queda corto. 50 MB
  da ~1000× la cuota típica de un Design con varios HTMLs. Si pasa,
  ya es bug de schema en otro lado (el servidor no debería dejarte
  generar tanto).
- **No filtramos por `chatId`**: cada `versions[i]` tiene `chatId`
  que indica qué chat generó ese asset. Podría filtrar para exportar
  solo lo del chat activo. No lo hago en MVP porque (a) el usuario
  típicamente tiene 1 chat por proyecto Design (b) si tiene varios,
  probablemente quiere todos los outputs igual. Si esto sale mal en
  algún caso real, agregamos el filter como flag.
- **Sanitization a fondo**: el bridge es trust boundary. Los assets
  vienen del Companion (autenticado por Bearer), pero el Companion
  los recibe del content-script (que vive en claude.ai donde podría
  haber XSS u otra injection). Defense in depth: rechazar cualquier
  filename que pueda escapar la sibling folder.
- **`buildAssetsHeader` separado del formatter**: agregar un parámetro
  `assets` al formatter del .md hubiera modificado un módulo core
  para un caso edge. En su lugar la composición vive en
  `extension.ts` que ya tiene contexto.

### Verificación
- 165 tests pasan. El test de payload size se actualizó al nuevo cap
  pero la lógica del 413 sigue siendo correcta.
- Typecheck + lint limpios.
- Build limpio. vsix = 879.2 KB (subió ~3 KB respecto a 0.6.1, todo
  por el handler nuevo + sanitización).
- **Smoke test end-to-end ✅ pasado** sobre el proyecto Design del
  usuario (`claude.ai/design/p/ab145d0a-...`):
  - Header `## Generated assets` aparece prependado en
    `.exportal/2026-04-23-1331-exportal-exportal-chrome-extension.md`
    listando los 5 archivos (`.design-canvas.state.json`,
    `Exportal Rediseño.html`, `asset.html`, `design-canvas.jsx`,
    `store-assets.html`) con MIMEs correctos (incluido `text/jsx`
    que vino del server, sin hardcoding) y tamaños razonables.
  - Carpeta hermana `.exportal/2026-04-23-1331-exportal-exportal-chrome-extension/`
    se creó y contiene los 5 archivos con su contenido íntegro.
  - Filenames con espacio + acento (`Exportal Rediseño.html`) y dot
    inicial (`.design-canvas.state.json`) preservados verbatim — la
    sanitización los aceptó sin slugificar.
  - El chat sigue al final del .md con UTF-8 limpio (fix de v0.6.1).
  - Conversación de 14 mensajes completa, alternancia user/assistant
    correcta, contenido íntegro.

### Lo que NO entra
- **Recursión en `components/`, `ref/`, `store/`**: el árbol top-level
  cubre los archivos centrales del design. Si los componentes son
  load-bearing, hito futuro.
- **Filtro por `chatId`**: enumerar `inner.assets[name].versions[]`
  y matchear con activeChatId daría un bundle más chico cuando hay
  multi-chat. Mientras siga siendo 1-chat-por-proyecto, no vale.
- **Render server-side a PNG**: lo que el UI hace al "↓ PNG" es
  client-side render. Nuestro export trae los HTML fuente. Si alguien
  quiere los PNGs renderizados, tiene que abrir el HTML local y hacer
  el render — o pedir esto como feature (probablemente requeriría
  un headless browser corriendo del lado VS Code, scope grande).
- **Handling de file conflicts si el directory ya existe**: el case
  típico es que cada export crea una carpeta nueva (timestamp es
  parte del nombre). Si el usuario fuerza dos exports en el mismo
  segundo del mismo chat, sobrescribe. Aceptable.

---

## 2026-04-23 — Prep round pre-Hito 19 (v0.7.1)

### Qué hicimos
Sesión corta de cleanup + docs antes de arrancar Hito 19 (.jsonl).
Ningún feature nuevo — solo sweep de tech debt y refresh de
documentación ahora que Hitos 27 y 28 están cerrados y el
companion 0.7.0 está pendiente de review en CWS.

- **Sweep de tech debt** (post v0.5.6 fueron varias rondas chicas
  de redesign + features; vale re-mirar):
  - **i18n Chrome**: 47 keys declarados, 47 en uso. 0 dead. La
    disciplina de eliminar al cerrar features post-redesign
    sostuvo el invariante.
  - **l10n VS Code**: 50 keys declarados, 50 en uso. 0 dead.
    Mismo resultado.
  - **TODO/FIXME/console.log/debugger/eslint-disable**: cero
    debt. El único `eslint-disable-next-line no-console` que
    quedó en `http-server.ts:214` era unused (la regla `no-console`
    no está activa para ese path) — eslint mismo lo flageó.
    Removido.
  - **Imports muertos / dead exports**: ninguno encontrado.
- **Header del content-script.js**: estaba describiendo dos export
  actions sobre `/chat/<uuid>`, sin mencionar Claude Design ni
  el bundling de assets. Reescrito para reflejar las dos
  surfaces (`/chat/<UUID>` y `/design/p/<UUID>`) y el flujo
  unificado.
- **READMEs actualizados** (`README.md` y `README.vsix.md`,
  ambos en sync por la regla del dual-README):
  - "Cómo se usa" menciona explícitamente Claude Design.
  - Tabla "Formas de exportar" (era "Dos formas de exportar")
    actualizada con la columna "Dónde sirve" y nota sobre el
    bundling de assets en Design.
  - Atajos `Alt+Shift+E` aclarado que funciona en ambos paths;
    `Alt+Shift+O` aclarado que solo en `/chat`.
- **ROADMAP**:
  - Item de screenshots: confirma que el recapture está hecho
    (las 5 screenshots citrus ya existen, hechas en Claude Design
    incluida una nueva del bundling de assets de Hito 28); solo
    queda subirlas a CWS + Marketplace listings.
  - Hito 19 expandido con scope concreto: versión 0.8.0 base + .x
    para fixes, recon necesario antes de codear (estructura de
    eventos jsonl, encadenamiento uuid/parentUuid, campos
    load-bearing, manejo de tool calls), plan tentativo
    post-recon (reader-side flag, generator nuevo, smoke test
    manual con Claude Code).

### Verificación
- 165 tests pasan, typecheck + lint limpios (incluyendo el cleanup
  del eslint-disable).
- vsix y zip empaquetan sin problemas.
- Smoke test del flujo Design → VS Code seguía OK desde v0.7.0.

### Pendiente (no es código)
- **CWS approval**: el companion v0.7.0 está pending review.
  Cuando apruebe, subimos los nuevos screenshots al listing.
- **Marketplace upload**: vsix v0.7.0 listo, falta subirlo desde
  el dashboard.
- **Screenshots a docs/screenshots/**: las nuevas existen pero no
  están commiteadas al repo todavía. Pisarían los .png/jpeg
  navy+orange viejos para que README de GitHub muestre el citrus.
- **Vitest flake en Windows**: sigue intermitente en la primera
  corrida de `npm run ci`. La segunda siempre pasa. No bloquea
  CI en Linux. A investigar durante Hito 19 si molesta.

### Próximo paso
Hito 19 — recon del formato `.jsonl` con fixtures reales en
`~/.claude/projects/`. Spec final post-recon.

---

## 2026-04-23 — Hito 19 · Import como sesión de Claude Code (.jsonl, v0.8.0)

### Qué hicimos
Cerramos el último gap del flujo claude.ai → Claude Code: hasta hoy
el chat exportado vivía como `.md` que se adjuntaba como @-mention
(Hito 18). Eso es contexto en un chat NUEVO, no la continuación de
la conversación original. Hito 19 genera además un `.jsonl`
compatible con Claude Code que aparece en `/resume` como si fuera
una sesión local del proyecto, restituyendo el historial completo
para que el usuario continúe el chat literal.

- **Recon en una sola pasada**: la nota
  `reference_jsonl_format.md` en memory cubría lo básico (path,
  encoding, tipos de eventos). Inspección de fixtures reales en
  `~/.claude/projects/d--Dionisio-ClaudeTool/` agregó:
  - Campos comunes adicionales que la nota no listaba:
    `isSidechain`, `userType: "external"`, `entrypoint:
    "claude-vscode"`, `version: "2.1.114"`, `gitBranch`.
  - `user` específicos: `promptId`, `permissionMode: "acceptEdits"`.
  - `assistant` específicos: `requestId`, `message.id` (msg_*),
    `message.model`, `message.usage` (con tokens y cache),
    `stop_reason`, `stop_sequence`, `stop_details`.
  - `thinking` blocks llevan una `signature` en base64 (~3 KB) que
    Anthropic firma con su API. Sin acceso al API, no podemos
    forjarla.
  - `tool_result` events tienen una key top-level extra
    `toolUseResult` (con `file: {filePath, content}` para
    Read/Edit) que es el rich-view interno de Claude Code para su
    propia UI.
  - Nuevos tipos vistos: `attachment` (subtipos
    `deferred_tools_delta`, `skill_listing`).
- **Validación de decisiones con el user** antes de codear: 4
  preguntas (thinking → skip; tool_use/result → text marker;
  setting → opt-in default off; version → detect installed). Las
  4 respondidas, scope locked.
- **`src/formatters/claude-code-jsonl.ts`** (~200 LOC):
  `formatAsClaudeCodeJsonl(conversation, opts)` devuelve
  `{jsonl, sessionId}`. Iteración simple: un evento por message,
  encadenado via `parentUuid`, con todos los campos del envelope
  que vimos en fixtures reales. Helper `collapseToText` colapsa el
  array de content blocks de claude.ai en un solo string `text`,
  aplicando las conversiones lossy (skip thinking, marker para
  tool_use y tool_result).
- **Tests** (`tests/formatters/claude-code-jsonl.test.ts`): 9
  casos. El más importante es el round-trip: cada line del jsonl
  generado pasa por `parseEvent` (el mismo Zod schema que usamos
  para leer `.jsonl` reales) y todas las events validan. Esa es la
  garantía estructural más fuerte sin tener que probar contra el
  loader real de Claude Code.
- **Setting `exportal.alsoWriteJsonl`** (default `false`):
  declarado en `package.json` + descriptions en `package.nls.json`
  y `package.nls.es.json`. Opt-in porque el formato es ingeniería
  inversa y queremos shipping seguro.
- **Helper `maybeWriteClaudeCodeJsonl(conversation)`** en
  `extension.ts`:
  - Lee el setting; si está off, no hace nada.
  - Toma `cwd` del
    `vscode.workspace.workspaceFolders[0].uri.fsPath`.
  - Detecta git branch via `git symbolic-ref --short HEAD` con
    timeout 2s y child_process. Si falla (no es repo, no hay git),
    devuelve `''` — Claude Code real también deja branch vacío en
    proyectos sin git.
  - Detecta versión de Claude Code probando dos extension IDs
    candidatos (`anthropic.claude-code`, `Anthropic.claude-code`).
    Fallback hardcodeado a `"2.1.114"` si ninguno está instalado.
  - Genera el `.jsonl`, escribe a
    `~/.claude/projects/<encoded(cwd)>/<sessionId>.jsonl` usando
    `vscode.workspace.fs` (atomic-ish, funciona cross-platform).
  - Toast cuando termina OK. Fail-soft en cualquier paso: log
    warning + return, el `.md` ya está escrito.
- **Wireado en ambos paths**:
  - Inline (Companion → bridge `/import-inline`) en
    `handleBridgeImportInline`, después de
    `persistAndOpenMarkdown` y antes de
    `attachToClaudeCodeIfAvailable`.
  - ZIP (`Exportal: Importar ZIP de claude.ai`) en
    `openConversationFromZip`, mismo lugar relativo. Así el
    feature aplica para ambas formas de importar.

### Decisiones clave y por qué
- **Skip total de thinking blocks**: la `signature` criptográfica
  no la podemos generar. Las opciones eran (a) skip, (b) convertir
  a text plain, (c) emitir thinking sin signature y rezar. Skip
  total es la más segura: si Claude Code valida la firma al
  cargar, un thinking sin firma puede tirar el load entero. Quedó
  documentado en el header del formatter para que el próximo que
  mire entienda por qué.
- **Tool blocks → text markers**: el ecosistema de tools de
  claude.ai (web_search, drive, code interpreter) no existe en
  Claude Code. Replayear no es opción. Tres caminos: skip, marker
  visible, intentar mapear. Optamos por marker visible:
  `[Tool: <name>] <input>` y `[Tool result] <content>`. Mantiene
  contexto narrativo sin pretender ejecutar nada.
- **Setting opt-in (default off)**: el formato es ingeniería
  inversa. Activarlo sin saberlo y que falle sería peor UX que el
  default actual (solo `.md`). Opt-in da control al usuario que
  sabe lo que está haciendo + invita a iteración: si el feature se
  prueba estable durante varios meses, podemos cambiar el default
  a `true` en una versión futura.
- **Markers sintéticos en `requestId` / `message.id` /
  `message.model`**: cualquiera que mire el `.jsonl` con un editor
  puede identificar rápidamente que vino de Exportal y no de un
  API call real. Útil para debug y para que un future Claude Code
  que valide ownership pueda whitelistear estos prefijos si
  quisiera.
- **Round-trip a través de `parseEvent` como test principal**: el
  schema Zod es estricto sobre los campos requeridos del envelope.
  Si un evento generado pasa `parseEvent`, sabemos que la shape
  matchea lo que Claude Code reconoce — al menos en lo que nuestro
  reader chequea, que es a su vez la fuente de verdad de la nota
  de memoria. No reemplaza el smoke test contra Claude Code real,
  pero descarta toda una clase de bugs sin necesidad de un browser.
- **Detect Claude Code version, no hardcode**: si Anthropic cambia
  el formato en una version futura, queremos que el `.jsonl`
  generado declare la versión local del usuario, no una nuestra
  outdated. Si la detección falla (extension no instalada bajo los
  IDs probados), caemos al hardcoded `"2.1.114"` — la versión
  cosmética del envelope no es load-bearing en lo que vimos.

### Verificación
- `npx vitest run tests/formatters/claude-code-jsonl.test.ts` →
  9/9 tests verde, incluido el round-trip.
- Typecheck limpio.
- Build limpio.
- **Smoke test end-to-end pendiente** (lo hace el user post-tag):
  instalar `exportal-0.8.0.vsix`, activar
  `exportal.alsoWriteJsonl: true` en settings, exportar un chat
  de claude.ai, verificar:
  1. Aparece toast "también escribí ..." en VS Code.
  2. Existe el archivo
     `~/.claude/projects/<encoded>/<sessionId>.jsonl`.
  3. Reload window (o reabrir Claude Code) → `/resume` lista la
     conversación importada con su nombre.
  4. Click en la sesión importada → muestra los mensajes.
  5. Intentar continuar el chat → ver si el primer reply funciona.
     Ese paso 5 es el que más probable rompa por
     formato/expectativas del API. Si rompe, abrimos issue, vamos
     a 0.8.1 con el fix.

### Lo que NO entra en v0.8.0
- **Thinking blocks como text** (la opción B que no elegimos):
  posible feature flag futuro
  `exportal.jsonl.includeThinking = "skip" | "as-text"` si alguien
  lo pide.
- **Replay real de tools de claude.ai**: ni siquiera el equipo de
  Anthropic permite eso entre superficies — están desacopladas a
  propósito.
- **Modo "only-jsonl" (sin .md)**: el `.md` sigue siendo útil para
  leer el chat fuera de Claude Code, para git-trackear, para
  compartir. Generamos los dos siempre que el setting está on.
- **Auto-detect del workspace cwd vs el cwd original del chat**:
  el `.jsonl` se importa al workspace abierto, no al directory
  donde "originalmente" pasó la conversación claude.ai (que ni
  siquiera tiene cwd — pasa en el browser). Es una decisión
  deliberada: importar al contexto donde el usuario va a continuar
  el trabajo, no a uno ficticio.
- **Multi-folder workspace**: si el user tiene varios workspace
  folders abiertos, agarramos el primero. Caso edge.

---

## 2026-04-23 — v0.8.1 · Tab dedicada + strip del placeholder

### Qué hicimos
- **Smoke test de v0.8.0 pasó end-to-end**. La conversación
  importada apareció en `/resume` de Claude Code sin reload window,
  cargó sin error, y el user pudo continuar el chat. El único ruido
  visible fueron las líneas literales `This block is not supported
  on your current device yet.` donde claude.ai había usado tools.
- **Identificamos la causa real**: no son los thinking blocks
  (hipótesis inicial errónea) sino que el endpoint
  `chat_conversations?rendering_mode=messages` de claude.ai sustituye
  los tool blocks que el "device" llamante no puede renderizar por
  ese literal exacto, dentro de un text block normal (con o sin
  fences de triple backtick). El ruido se veía idéntico en el `.md`
  (11 ocurrencias en una conversación de prueba) y en el `.jsonl`.
- **Fix en la capa de datos**: nuevo
  `src/importers/claudeai/cleanup.ts` con
  `stripUnsupportedBlockPlaceholders(conversation)` que limpia la
  conversación antes de pasarla al formatter (markdown o jsonl).
  9 tests unitarios cubren las dos formas (fenced + bare line),
  collapse de blank lines extra, immutabilidad y near-misses.
- **Tab dedicada en la activity bar** (feature pedida por el user
  durante el smoke test, "que no sea tan complicado buscar
  Preferences UI"). Nuevo
  `src/extension/control-panel.ts`
  (`ExportalControlPanelProvider implements WebviewViewProvider`)
  con dos toggles (autoAttach + alsoWriteJsonl) y tres botones de
  acción (showPairingInfo, importFromZip, sendSessionToClaudeAi).
- Icono SVG monochrome (`assets/sidebar-icon.svg`) que VS Code
  colorea con `currentColor`.
- 10 strings i18n nuevas en `l10n/bundle.l10n.es.json`.
- Bump 0.8.0 → 0.8.1 en `package.json` y `chrome/manifest.json`.

### Decisiones clave y por qué
- **Strip en la capa de datos, no en el formatter**: si limpiáramos
  en el markdown formatter dejaría sucio al `.jsonl`, y viceversa.
  Una sola pasada antes de cualquier formato garantiza que toda
  superficie aguas abajo (md, jsonl, future formats) ve texto limpio
  por construcción.
- **Match exacto del literal, no regex amplio**: la familia de
  mensajes de "no soportado" es chica y cualquier flexibilidad en
  el match podría comerse texto legítimo del user. Si claude.ai
  cambia el wording, el test `does NOT strip near-misses` se va a
  romper y nos vamos a enterar.
- **Tab full WebviewView en vez de Tree o Quick Pick**: los
  toggles + botones leen mejor como un panel coherente que como un
  árbol de nodos clickeables. El costo de mantener HTML es bajo
  porque usamos `var(--vscode-*)` para todo y la UI es muy
  estática (re-render solo cuando cambia un setting).
- **El panel re-renderiza ante
  `onDidChangeConfiguration('exportal')`**: si el user (o otra
  ventana de VS Code) cambia el setting fuera del panel, queremos
  que el switch refleje el estado real sin necesidad de polling
  ni de cerrar/abrir el panel.
- **CSP estricta con nonce-gated script**: estándar de VS Code para
  webviews. El script inline está acotado y no carga nada externo.

### Verificación
- `npm run ci` (lint + typecheck + tests + build) → verde, 183/183
  tests passan, build limpio.
- 9 tests nuevos para `cleanup.ts`.
- Strip wireado en ambos paths de import (`handleBridgeImportInline`
  + `openConversationFromZip`).

### Lo que NO entra en v0.8.1
- **Status pill del bridge en el panel**: el header del panel
  originalmente iba a tener un indicador verde/rojo del estado del
  bridge local. Dejado para v0.8.2 — el footer note alcanza para
  comunicar que el bridge arranca solo en el activate.
- **Re-traducción del .md ya importado**: si alguien tiene `.md`
  exportados con la versión 0.8.0 sucia, se quedan así. El strip
  aplica en imports nuevos. Re-importar es trivial.

---

## 2026-04-23 — v0.8.2 · Discoverability + prep de Hito 21

### Qué hicimos
- **Tip de discoverability en la pairing panel.** Las features que
  agregamos en 0.8.0 (`.jsonl` para `/resume`) y 0.8.1 (tab dedicada
  en la activity bar) existían pero ningún usuario se enteraba de
  ellas sin leer el CHANGELOG. Agregamos un tip card al final del
  pairing webview con un botón "Abrir tab de Exportal" que ejecuta
  `workbench.view.extension.exportal` y revela la tab. Como el
  panel se abre automáticamente la primera vez
  (`showOnboardingIfNeeded`), todo usuario nuevo ve el tip al
  menos una vez sin hacer nada.
- **README.md y README.vsix.md**: secciones nuevas
  *"Aparecer en /resume de Claude Code (opt-in)"* y *"Tab dedicada
  en VS Code"*. Ambos READMEs estaban desactualizados respecto a las
  features de 0.8.0 y 0.8.1 — todo el texto de discovery estaba solo
  en CHANGELOG, que nadie lee salvo al investigar un bug.
- **Prep round del Hito 21** (import de ChatGPT): scaffold del
  importer en `src/importers/chatgpt/` siguiendo la estructura de
  `claudeai/`. Tres archivos (`schema.ts`, `reader.ts`, `walk.ts`)
  + 15 tests contra fixture sintético. Nada wireado en la extensión
  todavía — puro prep para arrancar rápido cuando llegue el ZIP real
  de export de ChatGPT.

### Decisiones clave y por qué
- **Tip en el pairing panel, no como notification toast ni comando
  separado**: las notifications son efímeras y el usuario en su
  primera instalación ya tiene un panel grande al frente. Poner el
  tip ahí garantiza 1 impresión garantizada sin estorbar. Efímero
  (dismissable) y descubrible.
- **Botón "Abrir tab de Exportal" ejecuta `workbench.view.extension.<id>`**:
  es el command built-in de VS Code para revelar una view container
  por su id. No hay que registrar nada propio. El id coincide con
  `viewsContainers.activitybar[].id` en `package.json` (`exportal`).
- **ChatGPT schemas SIN `.passthrough()`, al revés que claude.ai**:
  Zod 4 propaga el `{[x:string]: unknown}` del passthrough por todo
  el tipo inferido, lo que hace que `conversation.mapping[k]` termine
  siendo `any` (TS7022 bajo `--strict`) y rompa los lints no-unsafe-*.
  Pero además, en la práctica, los formatters consumen campos
  explícitos (`content_type`, `parts`, `author.role`) — los campos
  desconocidos que preservaría el passthrough nunca se leen. Usar
  strip (default) + campos explícitos opcionales da forward-compat
  sin pagar el costo de tipos. Si algún día necesitamos preservar
  datos desconocidos en ChatGPT, se evalúa en ese momento.
- **Walk del árbol siguiendo sólo la rama activa (`current_node`)**:
  ChatGPT soporta branching (regenerate, edit) y guarda todas las
  ramas en `mapping`, pero el usuario cuando exporta espera ver lo
  que estaba mirando — la rama activa. Cualquier otra estrategia
  (merge de ramas, incluir todas) introduce decisiones de UX sin
  beneficio claro.
- **Dos commits separados**: `feat:` para el tip + READMEs (user-
  visible, shippable) y `chore(hito-21):` para el scaffold (interno,
  no shippea). Así el diff del release es chico y revisable sin
  mezclar features con prep work.

### Verificación
- `npm run ci` → verde. 22 test files, 198 tests passan (183 previos
  + 9 de chatgpt/walk + 6 de chatgpt/schema).
- `npm run package:all` → `exportal-0.8.2.vsix` + `exportal-companion-0.8.2.zip`
  generados limpios. El SVG sigue shippeando (no repite el bug del 0.8.1).

### Lo que NO entra en v0.8.2
- **Import real de ChatGPT**: el scaffold está pero nada wireado en
  la extensión. Esperando el ZIP del user para tunear schemas contra
  data real antes de agregar comando + formatter + UI.
- **Status pill del bridge** (acumula desde 0.8.1): todavía pendiente
  porque el tip quedó ocupando ese real estate visual; volveremos a
  esto cuando pensemos un header más chico o un segundo slot.

---

## 2026-04-25 — Mejoras al send-to-claude-ai + planning de menú jerárquico

### Qué hicimos
- **`sendSessionToClaudeAi` mejorado en dos frentes** (commit `a77c103`):
  1. **QuickPick identificable**: el reader ahora reconoce los event
     types `ai-title`, `custom-title` y `last-prompt` que Claude Code
     escribe como sidecar metadata (antes los descartábamos como
     "unmodeled"). La QuickPick prioriza `customTitle ?? aiTitle ??
     firstUserText` para el label, suma git branch + cwd basename al
     detail line, y ordena por `lastActiveAt` (file mtime) en vez de
     `startedAt` para que la sesión más reciente quede arriba.
  2. **Drag-and-drop fallback**: claude.ai trunca silenciosamente
     pastes >100K chars; las sesiones largas nunca llegaban completas.
     Ahora siempre guardamos el `.md` a `.exportal/<timestamp>-<slug>-cc-export.md`
     (reusando `persistAndOpenMarkdown` del path de import) además de
     copiar al portapapeles. La notification ofrece botón "Reveal file"
     para que el usuario arrastre el `.md` a claude.ai. Eliminamos el
     modal warning bloqueante a 150KB — ahora es un mensaje inline en
     la notification post-acción.

### Decisiones clave y por qué
- **Reconocer los metadata events en el schema principal vs un parser
  separado**: agregar `AiTitleEventSchema` etc. al `EventSchema`
  discriminado significa que `readJsonl` ahora los devuelve junto al
  resto. Los consumidores existentes (formatters, compact detector)
  ya hacen `event.type === 'user' / 'assistant' / 'system'` así que
  ignoran los nuevos sin rompimiento. Hubiera sido más complicado
  agregar un parse path paralelo (lectura doble del archivo o
  refactor de `readJsonl`).
- **mtime como `lastActiveAt`** en lugar de scanear todos los eventos
  buscando el max timestamp: cualquier append al `.jsonl` actualiza
  mtime, incluyendo eventos que no modelamos. Es más barato (un
  `stat`) y más correcto (capta actividad de cualquier event type).
- **Eliminar el modal warning a 150KB**: el modal era un dead-end
  ("Copy anyway" igual fallaba en claude.ai). Reemplazarlo por un
  fallback real (el .md guardado para drag-drop) hace que la
  experiencia sea continua en lugar de cortarse con una decisión
  binaria que no resuelve nada.

### Verificación
- `npm run ci` → verde. 23 test files, 210 tests passan (208 previos
  + 2 nuevos sobre ai-title/custom-title/lastActiveAt en describeSession).
- Reader test count actualizado (4 → 6 events) por los dos eventos
  nuevos en `minimal.jsonl`.

### Planificación: menú jerárquico en sidebar tab (Hito 29 en ROADMAP)

El usuario pidió rediseñar la sidebar tab de flat list a menú jerárquico
con grupos lógicos (Settings, Importar de…, Exportar a…, Utilidades).
Esto habilita una feature simétrica nueva — **enviar sesión de Claude
Code a ChatGPT** — que es el mirror exacto del envío a claude.ai
(formatter común, distinto endpoint de browser).

Bloqueado por diseño visual: el usuario está consultando con Claude
Design el layout (accordion / dropdowns / botones agrupados con
headers — TBD). Implementación arranca cuando llegue el diseño.

Mientras tanto, el ROADMAP captura el scope detallado en Hito 29
(qué refactorear, qué decisiones quedan abiertas, qué queda fuera
de scope). Sin código nuevo hasta entonces.

### Lo que NO entra en este checkpoint
- **El comando `exportal.sendSessionToChatGpt`**: parte del Hito 29,
  espera diseño visual del menú porque la lista de comandos depende
  de cómo termine quedando la UI agrupada.
- **Refactor de `control-panel.ts` a estructura data-driven con
  PROVIDERS array**: parte del Hito 29.

---

## 2026-04-26 — Hito 29 implementado · v0.9.0

### Qué hicimos

Sesión larga, mezcla de muchas piezas convergiendo. Cuatro frentes
que terminaron en el release `0.9.0`:

**1. Send-to-claude.ai mejorado (Capa 0 del refactor):**
- Reader del `.jsonl` reconoce los event types `ai-title`,
  `custom-title`, `last-prompt` que Claude Code escribe como sidecar
  metadata (antes los descartábamos como "unmodeled"). La QuickPick
  prioriza `customTitle ?? aiTitle ?? firstUserText` para el label.
- Sort por `lastActiveAt` (file mtime) en vez de startedAt — la
  sesión más activa queda arriba.
- Detail line: turns + git branch + cwd basename + sessionId.
- `.md` siempre se guarda en `.exportal/` como fallback drag-drop
  para sesiones >100K (claude.ai trunca pastes grandes).
- Toast con botón "Reveal file".

**2. Hito 21 wireado (ChatGPT importer):**
- El scaffold ya estaba en main desde 0.8.2. En esta sesión wireamos
  el comando `exportal.importFromChatGptZip` + handler completo +
  botón en la sidebar tab + i18n + tests del formatter.
- El formatter `chatgpt-markdown.ts` espeja el visual del de claude.ai:
  `## User` / `## Assistant`, tool calls como `<details>`,
  `cloud-download`/`cloud-upload` codicons.

**3. Hito 29 Capa 1 (sidebar tab redesign):**
- Reemplazamos la lista plana de 6 items por la **Variante B
  "filas direccionales"** que diseñó Claude Design.
- Layout: Settings → ↓ Importar al workspace (3 filas: claude,
  chatgpt, gemini disabled) → ↑ Exportar la sesión actual (3 filas
  espejo) → Bridge expandable + Footer.
- Codicons shippeando dentro del vsix
  (`assets/codicons/{codicon.css,codicon.ttf}`, copiados al build via
  `esbuild.config.mjs`).
- Nuevo comando `exportal.sendSessionToChatGpt` (mirror del a
  claude.ai, abre `chatgpt.com`).
- Auto-pick de la sesión más reciente al exportar (el QuickPick era
  confuso cuando varias sesiones tenían el mismo título por
  compactación).

**4. Capa 2/3 lite (post-mortem y pivot):**
- **Intentamos drag-drop sobre filas de import. Falló.** VS Code
  tiene una limitación arquitectural: el workbench (parent window)
  intercepta los drops de archivos externos antes de que lleguen al
  webview iframe. Confirmado con DevTools del user — cero eventos en
  consola al arrastrar.
- **Pivot a auto-detect + live watch:** mejor UX que drag-drop para
  el caso de uso real (descargar zip de Chrome → importar). Cuando
  el panel está visible, escanea `~/Downloads` y `~/Desktop` por
  ZIPs de claude/chatgpt en las últimas 2h, detecta el proveedor
  por contenido (peek a `conversations.json` para distinguir shape),
  y muestra un sub-hint verde con filename + tiempo relativo en la
  fila. Click → import directo sin file picker.
- **Watch en tiempo real:** `fs.watch` sobre Downloads/Desktop con
  debounce de 1.5s y gated por visibility — el panel se entera
  apenas termina una descarga (Chrome cierra `.crdownload` y rename
  al `.zip`), sin necesidad de toggle del panel. Cero costo cuando
  el panel está cerrado.
- Sacamos el código muerto de drag-drop. Mantuvimos los estados
  visuales `working`/`done`/`error` — sirven para click-triggered
  imports (file picker o detected-zip).

### Decisiones clave y por qué

- **Parar drag-drop cuando se confirmó arquitecturalmente
  bloqueado**, en vez de seguir intentando workarounds (TreeView
  drop, `<input type=file>` invisible, dragging desde Explorer
  pane). Cada workaround tenía cost-benefit pésimo. Auto-detect es
  estructuralmente más sólido y resuelve el use case real mejor que
  drag-drop.
- **Ventana de detección de 2h**, no 7 días: el patrón "recién
  descargué algo y quiero importarlo" es de minutos. Zips viejos
  ensucian el panel y no son accionables.
- **Visibility-gated watcher**: `fs.watch` cuesta poco pero no
  cero — gatearlo por visibility evita gastar handles cuando el
  user no está mirando el panel.
- **Debounce de 1.5s** (no 500ms): Chrome escribe `.crdownload`
  primero y luego rename a `.zip`. Si reaccionamos al primer event
  de `.crdownload`, encontramos un archivo incompleto. 1.5s es
  margen seguro para que Chrome termine y suelte el lock.
- **Detección por contenido vs filename**: claude.ai tiene pattern
  `data-...zip` confiable, ChatGPT no tiene canonical pattern. Para
  uniformidad, ambos se detectan por contenido (peek a
  `conversations.json` y match de campos clave: `chat_messages`
  para claude, `mapping`+`current_node` para chatgpt). El cap de
  50MB por zip evita que un export gigante o un installer rotuleo
  como zip pause el panel.
- **No metimos tests para el sidebar webview**: testear webviews
  requiere harness de browser/jsdom no instalado, y el código del
  webview es presentational (HTML + event handlers). Los tests del
  zip-finder cubren la parte testeable (detección de proveedor
  contra fixtures).
- **Codicons via assets/ en lugar de exception en .vscodeignore**:
  intentamos primero `!node_modules/@vscode/codicons/...` pero vsce
  no honra esas exceptions confiablemente. Esbuild copia los
  archivos al build → llegan al vsix vía path estable
  (`assets/codicons/`).
- **Reemplazo de la URL `git+https://` → `https://`** en
  `package.json`: el linter de VS Code se quejaba de URLs relativas
  en README.md aunque nuestro packaging swappea README.md por
  README.vsix.md (sin imágenes) en el vsix. False positive del
  linter, fix trivial.

### Verificación
- `npm run ci` → verde. 23 test files, 210 tests passan.
- `npm run package:all` → vsix de ~230 KB con codicons incluidos.
- Smoke test del user end-to-end:
  - Sidebar nueva renderiza igual al diseño de Claude Design en
    Dark+ y Light+.
  - Click en filas dispara los comandos correctos.
  - Bridge expandible funciona, copy del token funciona.
  - Auto-pick de sesión activa funciona (toast incluye el título).
  - Send-to-ChatGPT abre `chatgpt.com` con el clipboard listo.
  - Auto-detect de descargas: panel abierto + descargar zip → fila
    correspondiente se actualiza sola con el sub-hint verde dentro
    de ~1.5s post-download.
  - Click en fila con detected zip → import directo, sin file
    picker. Estados `working` (shimmer) → `done` (border verde)
    → idle.
- **Flake de Windows** del backlog reapareció una vez durante el
  ciclo (después de muchas ediciones consecutivas de archivos).
  Reproduce ahora confirmadamente: aparece en sesiones con
  workflows de edición intensa concurrentes con CI. Sigue siendo
  intermitente y reintento siempre arregla. Item del backlog
  actualizado con estos datos frescos abajo.

### Lo que NO entra en v0.9.0
- **Validación de ChatGPT contra data real**: aún esperando el ZIP
  de export del user (queued hace muchas horas, OpenAI sigue sin
  enviarlo). El schema y formatter funcionan contra fixtures
  sintéticos + 1 export chico que el user logró exportar. Casos
  raros (browsing con many tabs, code interpreter con outputs
  binarios, custom GPTs) van a tener bugs que vamos a ir limpiando
  en `0.9.1+`.
- **Capa 3 completa con progress bar real**: solo Capa 3 lite
  (estados visuales en click). Progress bar real (% real durante
  import) requiere refactor de los handlers para reportar fases
  de progreso. Bajo, no urgente.
- **Capa 4 con SessionChip dinámico** en filas de Exportar:
  mostrar el título de la sesión que se va a enviar antes de
  clickear. Útil pero no shippeable hoy — requiere file watcher
  separado en `~/.claude/projects/`. Backlog.
- **Companion-installed warning** en el footer del panel: el
  diseño lo tiene, no lo implementamos porque requeriría un signal
  fiable de "companion instalado" (hoy solo sabemos cuando se
  emparejó alguna vez via globalState). Item de polish.
- **Notification automática "nuevo zip detectado"** sin abrir el
  panel: el watch en tiempo real solo afecta al panel cuando está
  visible. Si querés que VS Code te avise apenas detecta una
  descarga (incluso con el panel cerrado), eso es una feature
  separada. Más invasiva, evaluamos si llega feedback pidiéndola.

---

## 2026-04-26 — v0.9.1 · ChatGPT validado contra cuenta real

### Qué hicimos

Llegó el ZIP de export de la cuenta principal de ChatGPT (queued
~12h antes, OpenAI tomó su tiempo). Antes de pegar el archivo
al chat, escribí un script local
(`scripts/chatgpt-shape-report.mjs`) que escanea el ZIP y produce
un **shape report**: counts de `content_type`, roles, recipients,
keys observados — todo metadata, cero contenido. Eso reveló
dos problemas serios que 0.9.0 no manejaba:

**1. Format chunked no soportado.** Cuentas grandes (145+
conversaciones en este caso) no tienen `conversations.json`
singular sino `conversations-000.json`, `conversations-001.json`,
etc., más un `export_manifest.json` nuevo. Nuestro reader
buscaba solo el archivo singular y fallaba con
*"missing conversations.json — is this the right ZIP?"*. **Bug
bloqueante: cuentas grandes no podían importar nada.**

**2. Cinco `content_type` nuevos** que no estaban en docs públicas:
- `thoughts` (39 msgs en la cuenta del user) — reasoning intermedio
  de modelos tipo o1/o3
- `reasoning_recap` (32 msgs) — resumen del razonamiento
- `tether_quote` (10) y `tether_browsing_display` (10) — citations
  de browsing
- `system_error` (8) — errores de tools

Más:
- **161 mensajes con multimodal real** (`image_asset_pointer`
  objetos dentro de `parts[]`) que renderizábamos como JSON dump
  ilegible
- **149 mensajes con `attachments[]`** en metadata
- Recipients nuevos vistos: `bio` (memory), `web.run`/`web.search`
  (browsing), `dalle.text2im` (image gen), `canmore.create_textdoc`/
  `update_textdoc` (Canvas), un plugin de terceros
  (`t2uay3k.sj1i4kz`)

### Implementación

**Reader (Tier 1)**: `findConversationFiles()` busca primero
`conversations.json` (small accounts); si no, escanea por
`conversations-NNN.json`, los ordena alfabéticamente
(`localeCompare` — funciona porque OpenAI usa zero-padding) y los
concatena. Per-chunk JSON parse failures generan warnings y
continúan en lugar de abortar — un chunk corrupto no rompe el
import del resto. Throw solo si zero conversations parsean exitosamente.

**Schema (Tier 2)**: 12 campos opcionales nuevos en
`MessageContentSchema` — `url`, `title`, `domain`, `tether_id`,
`thoughts`, `summary`, `content`, `name`, `result`, `assets`,
`response_format_name`, `source_analysis_msg_id`. Todos optional,
backward compat preservado.

**Formatter (Tier 2)**: 5 nuevos handlers en `renderBody()`:
- `thoughts` → `<details><summary>Reasoning</summary>` con cada
  thought como `**summary**\n\ncontent`. Colapsado por default.
- `reasoning_recap` → `> *Reasoning recap.* <text>`. Italic
  blockquote, una línea.
- `tether_quote` / `tether_browsing_display` → blockquote con
  emoji 🔗, link al título, dominio si no hay URL, texto citado
  como blockquote continuation.
- `system_error` → warning callout con emoji ⚠️ y código del
  error name + texto.
- `multimodal_text` → `*[Image: file-XXX]*` para
  `image_asset_pointer` objects, `*[<content_type>]*` para otros
  attachments desconocidos. Strings se concatenan como párrafos.

Refactor menor: extraje `maybeRedact` como closure local en
`renderBody` para no repetir el ternary `shouldRedact ? redact(...)
: ...` en cada case.

**Tests (11 nuevos, 221 totales)**:
- `tests/importers/chatgpt/reader.test.ts` (nuevo): 6 tests cubren
  single-file, chunked-merge-en-orden, mixed (singular gana),
  empty, partial-parse-failure (warning + continúa),
  all-chunks-fail (throw).
- `tests/formatters/chatgpt-markdown.test.ts`: 5 tests nuevos para
  los content_types nuevos + multimodal real. Updated el viejo
  test que asumía `tether_browsing_display` como fallback (ahora
  tiene handler dedicado, ese test ahora prueba un type
  genuinamente desconocido `'something_brand_new'`).

### Decisiones clave y por qué

- **Sort de chunks por `localeCompare`** y no parseando el número:
  más simple, funciona porque OpenAI usa zero-padding consistente
  (`-000`, `-001`). Si en algún momento rompen la convención (ej.
  `-1`, `-2`, `-10`), el sort se confunde — defendible si pasa,
  pero por ahora es robusto.
- **Per-chunk parse fallback con warning** en vez de aborto:
  preferimos importar el 90% de las conversaciones y avisar del
  10% perdido que perder todo por un chunk corrupto. Los warnings
  hoy van a console (via toast), con espacio para mejor UX
  futura (mostrar lista detallada en el panel).
- **Ningún `passthrough()` en el schema** — sigo el principio de
  v0.8.2: campos optional explícitos, lo demás se descarta. Los
  campos descartados que vimos (`atlas_mode_enabled`,
  `is_starred`, `default_model_slug`, etc.) no los necesitamos
  para renderizar — si en algún momento sí, los agregamos al
  schema y aparecen automáticamente.
- **`renderTetherCitation` muestra el dominio solo cuando NO hay
  URL**: si la URL está, ya contiene el dominio implícitamente —
  redundancia visual. Solo cuando el citation viene sin URL
  explícita (raro pero observado) mostramos el dominio para que
  el reader sepa de dónde vino.
- **Rendering de imágenes como `*[Image: file-XXX]*`** sin
  linkear al archivo físico: el ZIP contiene los files
  (`file-XXX.jpeg`), pero exponerlos al workspace requiere copiar
  los binarios al `.exportal/<title>/` y reescribir las
  references en el `.md`. Ese trabajo es Tier 3 — el marker
  legible alcanza por ahora para que el usuario sepa que hubo una
  imagen.
- **`system` role sigue skippeado** (316 mensajes en la cuenta
  del user) — son model conditioning, no contenido user-visible.
  Si en algún momento descubrimos que algunos system messages SON
  contenido (ej. "Memory updated" notifications), podemos hacer
  el skip más selectivo.

### Verificación

- `npm run ci` → verde. 24 test files, 221 tests passan
  (210 → 221, +11 nuevos).
- `npm run package:all` → vsix de ~234 KB con todo incluido.
- **Smoke test pendiente del user**: usar el panel para importar
  el ZIP grande. Debería ya funcionar end-to-end y producir un
  `.md` con renderings sensatos para todos los content_types
  observados.

### Lo que NO entra en v0.9.1

- **Tier 3 — imágenes inline**: copiar los `file-XXX.jpeg` del
  ZIP al `<workspace>/.exportal/<title>/` y reescribir las
  references como `![](./file-XXX.jpeg)` para que el preview de
  markdown muestre las imágenes. Trabajo más grande, va a 0.10.0.
- **Auto-attribution de attachments[] en metadata** (149 msgs):
  los `metadata.attachments[]` también describen archivos
  uploadeados pero por un canal distinto al multimodal_text.
  Renderizarlos requiere mirar la shape exacta primero —
  pendiente para cuando aparezca un caso visible que se note como
  contenido perdido.
- **Detección/handling especial para tools tipo `bio`,
  `canmore.*`, `dalle.*`**: hoy todos caen como tool calls
  genéricos con el recipient como label. Suficiente para
  identificar qué pasó; mejor handling (ej. icono distinto para
  Memory vs Canvas) es polish futuro.
- **Refactor del shape report script** a un comando del CLI o
  webview command. Hoy queda como `scripts/` para casos como este
  (debug rápido contra exports reales).

---

## 2026-04-26 — v0.9.2 · Hot-fix: nullable fields + per-conversation parsing

### Qué hicimos

0.9.1 shippeó con el chunked reader funcionando (parseaba los dos
`conversations-NNN.json`) pero al rato del release el user reportó
*"could not read the ZIP. Could not parse any conversations from the
export. conversations-000.json did not match the expected ChatGPT
shape; skipped."*

Diagnostiqué con un script nuevo (`scripts/chatgpt-validate.mjs`) que
corre el schema contra cada conversación y reporta los errores sin
filtrar contenido. Output: **102/145 OK, 43/145 fallan** — todas por
la misma razón: tres fields que declaramos como `.optional()` pero
OpenAI manda como `null`. Zod hace diferencia entre missing
(satisfies optional) y null (rejects unless `.nullable()`).

Los fields culpables:
- `content.tether_id: null`
- `content.assets: null`
- `content.response_format_name: null`

Y por defensividad asumí que cualquier optional puede venir null en
futuro (es claramente el patrón de OpenAI: "no aplica" lo expresan
con explicit null).

### Implementación

**Schema**: cambié todos los `.optional()` en `MessageContentSchema`
a `.nullable().optional()`. Doce fields. Cero breaking changes
downstream porque los lectores ya usaban `??` (que coalesce null y
undefined igual).

**Reader**: cambié de `parseConversations(raw)` (que delega a
`z.array(...).safeParse` y aborta TODO si una conversación falla) a
parsear cada conversación individualmente con `parseConversationOrIssues`
(nuevo helper en schema.ts). Las que fallan se skipean con warning,
las buenas se importan. Robustez sobre strictness.

**Formatter**: dos lugares necesitaron coerce explícito porque ahora
los fields son `string | null | undefined` en vez de `string | undefined`:
- `renderTetherCitation`: los checks `!== undefined` trataban `null`
  como "definido", rompiendo la lógica. Convertí los reads a
  `??  undefined` upfront — el resto del código sigue chequeando
  contra undefined uniformemente.
- `case 'code'`: `fenceCode` espera `string | undefined` para el
  language tag. Pasamos `content.language ?? undefined` para coercer
  null.

**Diagnóstico**: nuevo `scripts/chatgpt-validate.mjs`. Carga el zip,
corre el schema contra cada conversación, reporta cuántas pasan y
agrupa los errores por path. La primera conversación que falla muestra
los keys que tiene + cada error con el tipo del valor problemático
(no el valor en sí). Diseñado para que futuros bugs del schema se
diagnostiquen sin pedir al user que comparta el zip.

**Tests**: dos nuevos en `tests/importers/chatgpt/reader.test.ts`:
- "accepts conversations whose message.content has nullable fields":
  fixture con `tether_id: null`, `assets: null`, etc. Antes del fix
  fallaba; ahora pasa.
- "skips one bad conversation but keeps the rest in the same chunk":
  array de [good, bad] — antes el array entero se descartaba; ahora
  el good se importa con warning sobre el bad.

### Decisiones clave y por qué

- **Loosen ALL optionals a nullable, no solo los tres confirmados**:
  el patrón de OpenAI es claro ("no aplica" = explicit null), y
  agregar `.nullable()` es zero-cost en runtime y mejora la
  resilencia futura. Cualquier field optional nuevo que aparezca
  con null no nos va a romper.
- **Per-conversation parsing en lugar de array-level**: cuando el
  array es grande (cientos de conversations), una sola con shape
  ligeramente distinta tiraba todas. Ahora la unidad de fallo es la
  conversación individual — losses pequeñas en vez de losses
  totales. Para shapes evolving este patrón es necesario.
- **Coerce `?? undefined` upfront** en vez de cambiar todos los
  checks a `!= null` (loose equality): mantiene los downstream
  uniformes con strict equality, sin sembrar `!= null` por todo el
  código que confunde a future-readers.
- **Script de diagnóstico como sidecar, no integrado al CLI**:
  para que sea trivial de actualizar cuando aparece el próximo
  bug. Si lo hago un comando del CLI, requiere bumpear el extension,
  recompilar, redistribuir. Como `.mjs` standalone se modifica y
  se corre en seconds.

### Verificación
- `npm run ci` → verde. 24 test files, 219 tests passan
  (217 → 219, +2 nuevos).
- `npm run package:vsix` → ~234 KB con todo incluido.
- **Smoke test del user pendiente**: reinstalar 0.9.2, importar el
  zip grande otra vez. Ahora deberían entrar 145/145 conversaciones
  (las 102 que ya pasaban + las 43 que fallaban por null fields).

### Lo que NO entra en v0.9.2
- **Shape inspector más profundo** que reporte fields no observados
  en el schema actual (sería útil para el próximo "OpenAI agregó X
  field"). Pendiente — el script actual solo reporta failures, no
  silently-stripped fields.
- **Refactor del schema a un esquema canónico para multi-IA** (Hito
  20 del ROADMAP): seguimos con dos importers paralelos por ahora,
  sin abstracción común. Vale revisar cuando entre el tercer
  proveedor (Gemini).

---

## 2026-04-26 — v0.10.0 · One-click ChatGPT (Hito 30)

### Qué hicimos

El user pidió que el FAB de Exportal aparezca también en chatgpt.com
para no tener que pasar por el ZIP de export por mail. Hito 30 del
ROADMAP completo, end-to-end, en una pasada.

**Archivos tocados (orden de las decisiones)**:

1. **`chrome/pure.js`**: nueva función
   `extractChatGptConversationIdFromPath` (regex idéntica a
   `/chat/<UUID>` de claude.ai pero para `/c/<UUID>` de chatgpt.com).
   Cambié `routeFromPath(pathname)` a `routeFromPath(pathname, host)`
   para dispatchar por host. Si host === 'chatgpt.com' busca solo el
   pattern de chatgpt; sino fallback a claude.ai (chat / design).
   El segundo argumento es opcional para mantener backward compat
   con call sites que solo pasen pathname.

2. **`chrome/manifest.json`**: agregué `"https://chatgpt.com/*"` al
   `content_scripts[].matches`. Sigue solo `claude.ai` y `chatgpt.com`
   — no `chat.openai.com` legacy porque ya redirige.

3. **`chrome/content-script.js`**:
   - `currentRoute()` pasa `window.location.host` además de pathname.
   - `fetchByRoute(route)` ahora retorna `{ conversation, assets, provider }`
     y tiene un branch nuevo para `route.kind === 'chatgpt'`.
   - Nueva función `fetchChatGptConversation(id)` con auth two-step:
     `/api/auth/session` → leer `accessToken` → pasar como Bearer al
     `/backend-api/conversation/<id>`. Retry una vez en 401 (token
     puede haber rotado mid-call). 404 → `not_found`,
     401/403 final → `session_expired`.
   - `sendInline()` acepta tercer argumento `provider` y lo
     incluye en el message al background.
   - `countMessages()` ahora maneja la shape de ChatGPT (mapping
     tree de nodes) además de las shapes de claude.ai
     (chat_messages array).
   - El secondary button ("Preparar export oficial") y el
     Alt+Shift+O shortcut siguen siendo no-op en ChatGPT (por la
     misma lógica que en Design — `route.kind !== 'chat'` early
     return).

4. **`chrome/background.js`**:
   - Origin guard ampliado: acepta tabs en
     `https://chatgpt.com/` además de `https://claude.ai/`.
   - `forwardInlineConversation()` acepta `provider` y lo incluye
     en el body al bridge solo cuando está set (absent es backward
     compatible con bridges pre-Hito-30).

5. **`src/extension/http-server.ts`**: `ImportInlinePayload` gana
   campo `provider: z.enum(['claude', 'chatgpt']).optional()`.
   Backward compat: undefined → caller asume claude.

6. **`src/extension/extension.ts`**:
   - `handleBridgeImportInline()` checkea `payload.provider`. Si es
     `chatgpt`, dispatcha a `handleChatGptInline`. Sino, mantiene
     el flow claude.ai original.
   - `handleChatGptInline()` (nuevo): valida con
     `parseSingleConversation` del schema chatgpt, formatea con
     `formatChatGptConversation`, persiste, attach a Claude Code.
     NO genera `.jsonl` (envelope de Anthropic asume claude shapes).

7. **Tests** (13 nuevos, 232 totales):
   - `tests/chrome/pure.test.ts`: 10 tests cubren la detección
     ChatGPT (extract function + routeFromPath multi-host
     dispatch). El test crítico: `routeFromPath('/c/<uuid>')` SIN
     host explícito devuelve undefined — para evitar que un path
     accidental cross-matchee. Solo cuando host === 'chatgpt.com'
     se reconoce el route.
   - `tests/extension/http-server.test.ts`: 3 tests cubren el
     nuevo provider field — un payload válido con provider:'chatgpt'
     llega al handler con el provider; un provider inválido
     (`'random_thing'`) tira 400.

### Decisiones clave y por qué

- **Auth strategy = `/api/auth/session` (option A)**: confirmada
  con el user antes de implementar. Patrón estándar de NextAuth,
  funciona con la session cookie del user. La alternativa B
  (webRequest interceptor) requiere `webRequestBlocking` que
  trae más escrutinio en Chrome Web Store review. A en v1, B
  como fallback futuro si rompe.
- **Provider en el payload, no en la URL**: pude hacer
  `/import-inline-chatgpt` como endpoint separado. Pero un solo
  endpoint con discriminator es más extensible (Gemini, Copilot,
  etc. en el futuro) y mantiene el código del background uniforme
  (un solo POST con un campo extra vs dos handlers paralelos).
- **`provider: undefined` = claude (no error)**: backward compat
  con Companion installs pre-Hito-30. Cuando vsce serve 0.10.0 a
  los users, sus Companions existentes (que no setean el campo)
  siguen funcionando como antes. El user upgradea Companion en su
  ritmo.
- **Retry de 401 en `fetchChatGptConversation`**: ChatGPT tokens
  son JWTs de vida corta. Si entre el `/session` fetch y el
  `/conversation` fetch el token expira, reintentamos con un
  refresh. Limit a UNA sola retry — más probable que sea bug
  (session realmente expired) que race transient.
- **Visual del FAB inalterado entre proveedores**: el FAB es
  Exportal-branded (no provider-branded). Eso lo deja consistente
  para el user que usa los dos sites. Si en algún momento queremos
  marcar el provider en el popover (chip pequeño tipo "ChatGPT"
  o "claude.ai"), es polish futuro.
- **No abstraje el shared "fetch + post bridge" pattern entre
  claude y chatgpt**: cada uno tiene su propio fetch (una con
  cookies, la otra con Bearer JWT) y sus propios códigos de error
  específicos. La duplicación es chica (~50 LOC c/u), abstraer
  sería over-engineering.

### Verificación
- `npm run ci` → verde. 24 test files, 232 tests passan.
- `npm run package:all` → vsix de ~234 KB + chrome zip de ~30 KB.
- **Smoke test del user pendiente**: instalar nuevo companion +
  ir a chatgpt.com/c/<id>, ver el FAB, click, ver el .md en VS Code.

### Lo que NO entra en v0.10.0
- **Multimodal real (imágenes inline)**: el `/conversation/<id>`
  devuelve `image_asset_pointer` references pero no los bytes.
  Para bundlear las imágenes al `.md` necesitaríamos scrapear
  también `/backend-api/files/<id>/download` y meter los archivos
  al workspace. Tier 3 del Hito 21 — propio release futuro.
- **`.jsonl` para `/resume` desde imports de ChatGPT**: el envelope
  Anthropic asume shapes claude. Para soportarlo necesitaríamos un
  generador chatgpt → claude-jsonl converter. No urgente.
- **Detection automática de "no logueado a chatgpt.com"**: si el
  user no está logueado, el `/api/auth/session` falla con 401 y
  el toast dice `session_expired` — clear next step (loguearse en
  chatgpt.com en otra tab). Un check upfront sería polish.
- **Indicador visual del provider en el popover**: hoy el FAB se ve
  igual en los dos sites. Sumar un chip "ChatGPT" o "claude.ai"
  ayudaría discoverability cuando el user tiene los dos abiertos.

---

## 2026-04-26 — v0.10.1 · Hot-fix Hito 30 + smoke test end-to-end OK

### Qué hicimos

Smoke test de v0.10.0 reveló un bug: el FAB renderizaba bien en
chatgpt.com, el click se registraba (con animación de hover-clicked),
pero **nada visible sucedía después**. Cero entradas en console, cero
requests en Network. Click silenciosamente perdido.

### Diagnóstico

Agregué un `console.warn` en el silent-return path de `handlePrimaryClick`
(`Exportal: ... ignoring click`). Reinstalación del companion + retry
mostró el log:

> `Exportal: handlePrimaryClick — panel has no route, ignoring click.`

Pero el eval `document.getElementById('exportal-panel')?.dataset.routeKind`
devolvía `'chatgpt'` correctamente. Contradicción aparente.

**Root cause**: `panelRoute()` en `chrome/content-script.js` tenía
una whitelist hardcoded `kind !== 'chat' && kind !== 'design'` que
**no incluía la kind nueva `'chatgpt'`**. Cuando agregué chatgpt al
`routeFromPath` de `pure.js`, me olvidé de actualizar la whitelist
del consumidor. El dataset estaba bien, mi check lo rechazaba.

### Fix

- `panelRoute()` ahora lee la whitelist desde un nuevo
  `ExportalPure.KNOWN_ROUTE_KINDS` (constante en `pure.js`). Single
  source of truth — agregar un proveedor nuevo es modificar una
  línea en pure.js y todos los consumidores se actualizan.
- 2 tests de regresión nuevos en `tests/chrome/pure.test.ts` que
  verifican que toda kind emitida por `routeFromPath` esté
  también en `KNOWN_ROUTE_KINDS`. Catch-all para el próximo
  "agregué un provider y me olvidé de la whitelist".
- `console.warn` diagnóstico mantenido en el silent-return path
  (no había antes, ahora cualquier silent fail es de un DevTools
  away).

### Validación end-to-end

Después del fix, el user importó una conversación real de ChatGPT
(meta: una conversación que trataba sobre el delay del export por
mail, que justo era el bug que vimos en sesiones anteriores). Flow
completo:

1. FAB renderiza en `chatgpt.com/c/<uuid>` ✓
2. Click → button "Exportar este chat" ✓
3. `fetchChatGptAccessToken()` (NextAuth `/api/auth/session`)
   devuelve un JWT con la key `accessToken` ✓ (mi assumption fue
   correcta, no necesitamos el fallback al webRequest interceptor)
4. `fetchChatGptConversation(id)` con Bearer header funciona, devuelve
   la conversation completa ✓
5. `sendInline()` postea al bridge, **el primer try falló con
   `no_token`** porque el Companion había perdido el pairing (al
   reload como unpacked, Chrome resetea `chrome.storage`).
6. User re-emparejó (palette → "Mostrar token" → copy → paste en
   options) → reintentó → toast verde + `.md` abierto en VS Code ✓

### Observación menor (no bloqueante, va a backlog)

El `.md` resultante tiene bloques `## Assistant` huecos seguidos de
markers `[model_editable_context]`. Eso es contenido interno de
ChatGPT (configuración del modelo) que se filtra como contenido
visible. El fallback de content_type desconocido lo trata como
"render con tag y JSON dump", pero estos no aportan nada al lector.
**Item nuevo en ROADMAP backlog**: skip messages cuyo content_type
está en una lista conocida de "internal" (`model_editable_context`,
similares).

### Decisiones clave y por qué

- **Whitelist data-driven en pure.js**: en lugar de fixear el
  hardcoded check con `|| kind === 'chatgpt'`, refactoreé al
  pattern de single-source. Costo igual, beneficio futuro. Cuando
  agreguemos Gemini/Copilot, agregar a `KNOWN_ROUTE_KINDS` y
  funciona — el check del consumidor no necesita touchearse.
- **Test de invariante en lugar de test del case específico**:
  testear "chatgpt está en la whitelist" sería test del fix del
  ticket. Test de invariante "toda kind emitida por routeFromPath
  está en la whitelist" cubre TODAS las futuras adiciones, no
  solo este caso.
- **Diagnostic logs en silent paths permanentes**: no son polish
  de debug, son producto. Cualquier silent failure en el panel
  ahora deja huella en la console del user. Costo trivial,
  catastrophic prevention.

### Verificación
- `npm run ci` → verde. 24 test files, 234 tests passan
  (232 → 234, +2 nuevos invariantes).
- Smoke test del user end-to-end OK contra una conversación real.
- Log diagnóstico activo — si reaparece un silent failure, se
  diagnostica en seconds.

### Lo que NO entra en v0.10.1
- **Skip de `model_editable_context` y similares**: queda como item
  en backlog (filtra esos noise blocks del .md).
- **Auto-recovery del pairing token cuando se pierde**: hoy si el
  storage se borra (caso del user con companion reinstalado), el
  FAB falla silenciosamente con `no_token`. Detectarlo y guiar al
  user al re-pairing flow sería UX polish.
