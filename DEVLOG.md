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
