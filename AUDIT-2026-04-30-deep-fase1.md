# Exportal Security Audit — 2026-04-30 (Deep, Fase 1: Reconnaissance)

Structured threat model audit following v0.11.6 release. Fase 1 deliverables: code inventory, input surfaces, data flow, dependencies, sensitive sinks, outbound calls. Cross-references AUDIT-2026-04-29.md and AUDIT-2026-04-30.md without duplicating findings.

## 1. Code Inventory by Component

### chrome/
- **background.js** (594 lines): MV3 service worker. Listens to `chrome.downloads.onChanged`, probes HTTP bridge, persists pairing token, manages toolbar badge state.
- **content-script.js** (1443 lines): Injects FAB+popover on claude.ai and chatgpt.com. Fetches conversations via host APIs (`/api/conversations/<uuid>`), forwards to local bridge.
- **options.js** (415 lines): Settings UI. Displays pairing token, copy-to-clipboard, rotate-token, pair-status board.
- **pure.js** (209 lines): Pure utilities: route detection, badge state machine, message validation, token generation (`crypto.getRandomValues`).

### src/extension/
- **extension.ts** (1455 lines): Entry point. Activates on `onUri` + `onStartupFinished`. Registers 5 commands. Manages HTTP bridge lifecycle, filesystem writes to `.exportal/`, auto-attach logic.
- **control-panel.ts** (1254 lines): Webview provider for sidebar. Renders settings toggles, import/export rows, bridge status card. Handles postMessage: run-template, config changes, link clicks.
- **http-server.ts** (469 lines): Local HTTP server (pure). Endpoints: `/import` (ZIP), `/import-inline` (full JSON), `/ping` (confirm). Bearer auth (256 bits, constant-time). Rate limits: 30/min `/ping`, 10/min `/import`, 30/min `/import-inline`. Binds 127.0.0.1:9317-9326.
- **export-paths.ts** (22 lines): Filename normalization (slugify, sanitize bidi override chars U+202A-E).
- **zip-finder.ts** (281 lines): Scans Downloads/Desktop for recent claude.ai ZIPs. Peeks at `conversations.json` to determine provider.

### src/cli/
- **index.ts** (32 lines): Commander entry point. Three subcommands: list, export, import.
- **io.ts** (117 lines): Prompt library, spinners, markdown preview renderer.
- **preview.ts** (61 lines): Terminal markdown renderer.
- **prompt.ts** (29 lines): Commander ask/confirm helpers.

### src/importers/
- **claudeai/reader.ts** (61 lines): Unzips `data-*-batch-0000.zip`, reads `conversations.json`.
- **claudeai/schema.ts** (165 lines): Zod schema for claude.ai export. Uses `.passthrough()` for forward-compat.
- **chatgpt/reader.ts** (61 lines): Unzips ChatGPT JSON export, parses.

### src/formatters/
- **markdown.ts** (167 lines): Renders Claude Code .jsonl events as markdown.
- **claudeai-markdown.ts** (201 lines): Renders claude.ai conversations. Text blocks + citations as footnotes, tool_use/tool_result as details.
- **chatgpt-markdown.ts** (290 lines): Renders ChatGPT conversations.
- **markdown-shared.ts** (181 lines): `fenceCode` (backtick fence generation), `renderToolUse`/`renderToolResult`, URL whitelist helpers (`isSafeUrl`, `safeMarkdownLink`, `safeAutoLink`, `safeUrlForFootnote`).
- **claude-code-jsonl.ts** (204 lines): Generates Claude Code .jsonl event format.

### src/core/
- **schema.ts** (165 lines): Zod for Claude Code .jsonl (User/Assistant/System events, metadata).
- **types.ts** (33 lines): TypeScript interfaces.
- **reader.ts** (61 lines): Reads .jsonl line-by-line, JSON.parse per line, Zod-validates, drops invalid types.
- **session.ts** (105 lines): Lists .jsonl files, extracts metadata (ai-title, custom-title, last-prompt).
- **paths.ts** (35 lines): Constructs `~/.exportal/projects/<encoded-id>/` paths.
- **compact.ts** (35 lines): `skipBeforeLatestCompact` logic.

### src/redactors/
- **secrets.ts** (55 lines): 9 regex patterns (Anthropic/OpenAI/Google/Stripe/Slack/GitHub-classic/GitHub-fine/AWS/npm/PEM-private-keys). Narrow by design (reduce FP).
- **paths.ts** (18 lines): Home dir prefix redaction.

---

## 2. Inputs per Component

### HTTP Bridge Endpoints

**POST /import**: payload `{ filePath: string, provider?: 'claudeai'|'chatgpt', conversationId?: string }`, source = `chrome.downloads.onChanged` forwarded by background.js, max 64 KB, auth `Bearer <token>`.

**POST /import-inline**: payload = full conversation object, source = content-script.js after `fetch(/api/conversations/<uuid>)`, max 50 MB, auth `Bearer <token>`.

**POST /ping**: empty body, source = companion probing, auth `Bearer <token>`.

All require: method validation (POST), URL path validation, Bearer token constant-time comparison, rate limiting (endpoint-specific sliding 60s window), Content-Length precheck, body streaming with `maxBytes` limit, `JSON.parse()` with try-catch, Zod schema validation (claudeai schema uses `.passthrough()`, chatgpt uses `.strip()`).

### VS Code Commands

All command IDs hardcoded: `exportal.importFromZip`, `exportal.showPairingInfo`, `exportal.sendSessionToClaudeAi`, `exportal.sendSessionToChatGpt`, `exportal.importFromChatGptZip`, `workbench.action.output.toggleOutput`, `workbench.view.extension.exportal`, `claude-vscode.sidebar.open`, `claude-vscode.focus`, `claude-vscode.insertAtMention`, `revealFileInOS`. No user input controls command name.

### Chrome Runtime Messages

- **`exportal:export`** (content-script → background): `{type, conversation: {...}, provider?: string}`. Validated: `typeof conversation === 'object'`.
- **`exportal:sendInline`** (content-script → background): `{type, conversation: {...}, assets?: [...]}`. Validated: object shape check, conversation forwarded to bridge, Zod-validated there.
- **`exportal:pair`** (background → content-script): `{type}` confirmation.
- **`exportal:updateBadgeState`** (background → options.js): `{type, state: string}`.

### Webview postMessage Handlers (control-panel.ts)

- **`runTemplate`**: `{type, text: string}`. Copies text to clipboard, executes `claude-vscode.sidebar.open` + `claude-vscode.focus` (hardcoded). No validation of text length; text from `exportal.postImportTemplates` setting (user-controlled).
- **`runCommand`**: `{type, command: string}`. Command name attacker-controllable via webview. Mitigated by webview CSP (only trusted code can post).
- **`updateSettings`**: `{type, key: string, value: unknown}`. Updates `vscode.workspace.getConfiguration('exportal').update()`.
- **`copyToken`**: Copies stored pairing token to clipboard.
- **`openLink`**: `{type, url: string}`. Validated: must be `github.com/dioniipereyraa/ClaudeTool` or subpath only.
- **`dismissPostImport`**: `{type, version: number}`. Versioned dismiss to avoid race with concurrent `notifyPostImport`.

### Files Read

- `~/.claude/projects/<dir>/*.jsonl`: Claude Code .jsonl format, schema-validated line-by-line.
- `~/Downloads/**/data-*-batch-0000.zip` (claude.ai) or `conversations.json` (ChatGPT): unzipped with jszip, JSON inside schema-validated.

---

## 3. Data Flow Diagram

One complete export path from claude.ai chat to .md on disk:

```
User clicks "Export this chat" (FAB or Alt+Shift+E) on claude.ai/chat/<uuid>
    |
    v
[content-script.js] fetchConversation()
    | fetch('/api/conversations/<uuid>', {credentials: 'same-origin'})
    | Response: {uuid, name, conversation_history: [...], ...}
    v
[content-script.js] sendInlineMessage()
    | chrome.runtime.sendMessage({type: 'exportal:sendInline', conversation, assets?})
    v
[background.js] onMessage handler
    | Validate: typeof message.conversation === 'object'
    | Filter: pass conversation through with token attached
    v
[background.js] POST http://127.0.0.1:<port>/import-inline + Bearer token
    v
[http-server.ts] handleRequest()
    | 1. Method check (POST) ✓
    | 2. URL whitelist (must be /ping, /import, /import-inline) ✓
    | 3. checkRateLimit('/import-inline', 30/min sliding window) ✓
    | 4. Auth: Bearer token constant-time compare ✓
    | 5. Origin header (if present): must be chrome-extension://* ✓
    | 6. Content-Length precheck (50 MB cap) ✓
    | 7. readBody(req, maxBytes) streaming ✓
    | 8. JSON.parse() with try-catch ✓
    | 9. Zod validate ImportInlinePayload ✓
    v
[extension.ts] handleImportInline(payload)
    | If provider === 'chatgpt': formatChatGptConversation
    | Else: formatConversation (claude.ai)
    v
[formatters/{claudeai,chatgpt}-markdown.ts]
    | Iterate conversation history, render text blocks, tool_use, tool_result, citations
    | URLs in citations now go through safeMarkdownLink/safeAutoLink/safeUrlForFootnote
    | (whitelist: http, https, mailto only; others rendered as inline code)
    | fenceCode adapts backtick run length to content
    v
[redactors/index.ts] redact(markdown)
    | redactSecrets: 9 regex patterns (Anthropic, OpenAI, Google, Stripe, Slack,
    |   GitHub-classic, GitHub-fine, AWS, npm, PEM private keys)
    | redactPaths: home dir prefix replaced
    | Returns {text: redacted, report: {redactedCount, byType}}
    v
[extension.ts] persistAndOpenMarkdown()
    | filename = slugify(conversation.name || conversation.uuid)
    | sanitizeAssetFilename: rejects null bytes, drive letters, ../, U+202A-E,
    |   U+2066-9, U+FEFF, dot segments
    | dir = workspace.workspaceFolders[0]/.exportal/<encoded-project>/
    | path = vscode.Uri.joinPath(dir, filename + '.md')   [SAFE: not concat]
    v
[extension.ts] vscode.workspace.fs.writeFile(uri, TextEncoder.encode(markdown))
    | Atomic write, UTF-8 encoded
    v
[extension.ts] If assets present: same path/filename sanitization, write each
    v
[extension.ts] notifyPostImportIfReady() + attachToClaudeCodeIfAvailable()
    | Posts message to control-panel webview with {type, filename, templates, version}
    | Calls claude-vscode.sidebar.open + claude-vscode.insertAtMention
    v
File written: <workspace>/.exportal/<project>/<slug>.md
STATUS: IMPORT COMPLETE
```

### Trust Boundaries

| Boundary | Mechanism | Notes |
|---|---|---|
| claude.ai → Content script | Same-origin browser policy | Browser CORS protects. Content script trusts host API as user-authenticated. |
| Content script → Background | `chrome.runtime.sendMessage` | Validated: `typeof conversation === 'object'`. Sender origin not strictly verified. |
| Background → Bridge | Bearer token (256-bit, constant-time) | Token transferred via Authorization header. Bridge validates per-request. |
| Bridge → Formatter | Zod schema | claudeai uses `.passthrough()` (forward-compat); chatgpt uses `.strip()`. |
| Formatter → Markdown | URL schema whitelist (NEW in 0.11.6) | Citation URLs validated; unsafe schemes rendered as code. |
| Markdown → Disk | `vscode.Uri.joinPath` + filename sanitization | No string concat. Bidi override + null + drive letter + dot segments rejected. |
| Markdown → Claude Code | File URI @-mention | No code eval; trusted file path inserted as @-mention. |

---

## 4. Dependencies Inventory

### Production (shipped in VSIX + npm CLI)

| Name | Version | Notes |
|---|---|---|
| commander | ^14.0.3 | CLI argument parser for `exportal list/export/import` |
| jszip | ^3.10.1 | ZIP extraction for claude.ai + ChatGPT export formats |
| zod | ^4.3.6 | Runtime schema validation for importers, bridge, .jsonl events |

`package-lock.json` present, all production deps locked to exact versions in lock file.

### Dev (build-time only, NOT shipped in VSIX)

All use `^` ranges except `@types/vscode` pinned to `~1.85.0`:

- **Linting**: `@eslint/js ^9.15.0`, `eslint ^9.15.0`, `typescript-eslint ^8.14.0`, `eslint-config-prettier ^9.1.0`, `eslint-plugin-import-x ^4.4.2`, `eslint-import-resolver-typescript ^3.6.3`
- **Type definitions**: `@types/node ^22.9.0`, `@types/vscode ~1.85.0`
- **Testing**: `vitest ^4.1.4`, `@vitest/coverage-v8 ^4.1.4`
- **Build**: `esbuild ^0.25.12`, `tsx ^4.19.2`, `typescript ^5.6.3`, `sharp ^0.34.5` (icon generation only)
- **Packaging**: `@vscode/vsce ^3.9.1`, `@vscode/codicons ^0.0.36`
- **Formatting**: `prettier ^3.3.3`

`overrides.esbuild: $esbuild` in package.json forces all transitive copies of esbuild to the same version (defense against transitive CVEs).

### Bundling

`esbuild.config.mjs` bundles extension code into `dist/extension/extension.cjs`. CLI code outputs to `dist/cli/index.js`. Only production deps included; devDependencies excluded from VSIX.

---

## 5. Sensitive Sinks Inventory

### File Writes

| Location | Sink | Input Source | Validation |
|---|---|---|---|
| extension.ts:1077 | `vscode.workspace.fs.createDirectory` | dir from `workspaceFolders[0]/.exportal` | hardcoded subdir |
| extension.ts:1077 | `vscode.workspace.fs.writeFile` | markdown from formatter | filename via `slugify` + `sanitizeAssetFilename`, path via `Uri.joinPath` |
| extension.ts:1081 | `createDirectory` (asset dir) | derived from filename sanitization | safe |
| extension.ts:1083 | `writeInlineAsset` (per asset) | filename + base64 bytes | filename via `sanitizeAssetFilename` (incl. bidi/null/drive/dots) |
| extension.ts:1188 | `createDirectory` (`.jsonl` projects dir) | `~/.claude/projects/<encodedProjectDir>` | encoded by `encodeProjectDir` |
| extension.ts:1189 | `writeFile` (`.jsonl`) | sessionId-derived filename | hex-only sessionId |

### Process Execution

| Location | Sink | Input | Control |
|---|---|---|---|
| extension.ts:1206 | `import('node:child_process')` (dynamic) | hardcoded module name | only for git branch detection |
| extension.ts:1209 | `execFile('git', ['rev-parse', ...], { cwd })` | hardcoded args, cwd from workspace | safe (no shell, fixed args) |

### Code Execution

None. No `eval`, no `Function` constructor, no `vm` module.

### Command Execution (`vscode.commands.executeCommand`)

| Location | Command | Input | Status |
|---|---|---|---|
| extension.ts:317, 343, 805, 906 | `claude-vscode.insertAtMention` | hardcoded | safe |
| extension.ts:1278-1281 | `claude-vscode.sidebar.open`, `claude-vscode.insertAtMention` | hardcoded | safe |
| control-panel.ts:165 | `m.command` from webview | webview-controlled string | dependent on webview integrity (CSP gates) |
| control-panel.ts:212-213 | `claude-vscode.sidebar.open`, `claude-vscode.focus` | hardcoded | safe |
| control-panel.ts:189 | `workbench.action.output.toggleOutput` | hardcoded | safe |

The one webview-controllable command-name passthrough is `runCommand` from the panel. Mitigated by webview CSP and the trusted source of the panel's HTML, but could be tightened to a whitelist.

### `vscode.env.openExternal` and `vscode.Uri.parse`

| Location | URL | Source | Status |
|---|---|---|---|
| extension.ts:88 | `https://claude.ai/#exportal-pair=<token>` | hardcoded host | safe |
| extension.ts:494 | `CHROME_COMPANION_STORE_URL` | hardcoded | safe |
| extension.ts:1400 | `target.newChatUrl` | hardcoded per provider (`https://claude.ai/new`, `https://chatgpt.com/`) | safe |
| control-panel.ts:200 | `m.url` from webview | whitelist: `https://github.com/dioniipereyraa/ClaudeTool` | safe |

### DOM Manipulation

`innerHTML = ''` (clear list) appears twice in `control-panel.ts` (1076, 1149). Both clear, never set with attacker content. All dynamic content uses `textContent` and `appendChild`. No `outerHTML`, `document.write`, or `setHTML`.

### `JSON.parse` on Attacker Input

| Location | Input | Validation After |
|---|---|---|
| http-server.ts:280 | request body | Zod schema (`ImportPayload` or `ImportInlinePayload`) |
| core/reader.ts | line from `.jsonl` | Zod `parseEvent`, drops invalid |
| importers/chatgpt/reader.ts | text from ZIP | Zod schema |
| importers/claudeai/reader.ts | text from ZIP | Zod schema |

All parses are followed by validation. Zod rejects `__proto__`, `constructor`, `prototype` keys at the schema level for `.strip()` schemas (chatgpt). For claudeai, `.passthrough()` preserves them but no consumer enumerates keys, so prototype-poisoning is not exploitable downstream.

---

## 6. Outbound Network Calls

### Localhost (Bridge, Expected)

- `background.js`: POSTs to `http://127.0.0.1:<port>/import`, `/import-inline`, `/ping`. Token in Authorization header.

### Same-Origin Host APIs (Expected, Inside Content Script)

- `content-script.js` (claude.ai context): `fetch('/api/auth/session', ...)`, `fetch('/api/organizations/<org>/chat_conversations/<id>', ...)`, Design API RPC.
- `content-script.js` (chatgpt.com context): `fetch('/backend-api/conversation/<id>', ...)`.

All calls are same-origin (`credentials: 'same-origin'`), inside the browser tab where the user is already authenticated. No cross-origin fetch.

### Third-Party

**None.** No `fetch`, `http.request`, `https.request`, or `XMLHttpRequest` in `src/extension/**` or `src/cli/**` targeting non-localhost. The "local-first, zero-network" promise is upheld at the extension and CLI layer.

The companion's content scripts communicate with the host pages they run on (claude.ai, chatgpt.com), which is by design and same-origin. No telemetry, analytics, CDN beacons, or third-party SDKs.

### docs/ landing

- `index.html` references `https://img.shields.io/...` for GitHub stars badge (one image, no JS, GET request).
- `support/index.html` posts a contact form to `https://api.web3forms.com/submit`. CSP `form-action` whitelists this single host.

The shields.io CDN does see visitor IPs of landing visitors. Documented as a partial caveat to the "no analytics" claim (D1 in AUDIT-2026-04-30.md).

---

## 7. Surprise Findings

### Anomalies worth flagging up front

1. **`runCommand` from webview accepts arbitrary command names** (control-panel.ts:165). Mitigated by the webview being extension-controlled HTML rendered with CSP, but a stricter whitelist would harden defense in depth. This is the only sink where webview-controlled input reaches `executeCommand` without a string whitelist.

2. **`shields.io` external image on landing** contradicts the "no analytics, no telemetry" claim (D1 in prior audit). Not a security finding per se, but a credibility issue for marketing copy.

3. **`claudeai/schema.ts` uses `.passthrough()`**: forward-compat decision, documented intentionally. Verified safe because no consumer dynamically enumerates schema keys (`Object.assign(target, parsed)` etc. not present in formatters).

4. **`runTemplate` does not cap the length of `text`**. A 10 MB string in `exportal.postImportTemplates` (user-controlled setting) would land 10 MB on the clipboard. UX bug, not exploitable. Recommended cap at ~4 KB per template.

5. **`background.js` and bridge auth**: token is sent in Authorization header (correct, not in URL), so it does not leak to browser history or server logs. Verified.

No surprise external network calls, no eval, no hardcoded credentials, no sensitive data in console.log paths reviewed.

---

## Summary

- **Total lines audited**: ~5300 TypeScript + JavaScript (excluding tests, docs, configs, dev tooling).
- **High-severity findings**: 0.
- **Open from prior audits**: M1 (markdown link injection, fixed in 0.11.6), M2 (rate limiting, fixed in 0.11.6), M3 (template length uncap, open), M4 (passthrough schema, accepted).
- **Architecture**: Local-first promise is **genuinely upheld** at code level. All third-party network calls are constrained to same-origin in content scripts (claude.ai/chatgpt.com host APIs) or to localhost (the bridge itself). No analytics, no telemetry, no CDN beacons in the extension or CLI.
- **Code quality**: Solid. Schema validation is comprehensive, path handling is safe, HTTP auth is constant-time, no eval / dynamic code.
- **Redaction**: Narrow by design (9 patterns, reduce FP). Auto-enabled in extension.

**Fase 1 complete. Awaiting confirmation before continuing to Fases 2-6.**

---

*Auditor: Claude Code (sesión 2026-04-30 tarde, post-0.11.6 release)*
*Scope: reconnaissance only. No code modifications.*
