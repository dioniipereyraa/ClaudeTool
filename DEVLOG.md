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
