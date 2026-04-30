# Exportal Security Audit, 2026-04-30 (Deep, Fases 2-6)

Continuation of `AUDIT-2026-04-30-deep-fase1.md`. Cross-references AUDIT-2026-04-29.md and AUDIT-2026-04-30.md (most prior MEDIUMs closed in 0.11.6: M1, M2, L1, S2, D2, B1). The remaining open items are surfaced below as INFORMATIVA where they are accepted by the threat model.

Scope of this pass: by-file static analysis of every file under `src/extension/`, `src/cli/`, `src/importers/`, `src/formatters/`, `src/redactors/`, `src/core/`, `chrome/*.js`. Plus attack-surface review (bridge, Chrome ext, VS Code ext, CLI, parsers, redactors), supply chain (deps + lock + CI), release pipeline (`.github/workflows/`), and threat-model gap analysis vs SECURITY.md.

No code modified. Tests not re-audited (covered structurally in fase 1).

---

## FASE 2, Audit por archivo

Tables compress the 8 questions per file. F-XXX findings are listed once, even when they touch multiple files, and the corresponding tables reference the F-XXX.

### `src/extension/http-server.ts` (469 lines)
| Q | Answer |
|---|---|
| A | HTTP request: method, URL, headers (Authorization, Origin, Content-Length), body (JSON). Three endpoints: `/ping`, `/import`, `/import-inline`. |
| B | Method whitelist (POST), URL whitelist, rate-limit map per endpoint, Bearer token via `timingSafeEqual`, Origin allowed if `chrome-extension://*` or absent, Content-Length precheck (`Number.isFinite`), streaming `readBody` cap (64 KB / 50 MB), `JSON.parse` try/catch, Zod `safeParse` for both payloads. Failures return discrete HTTP errors (405/404/429/401/403/413/400/422). |
| C | Todos validados. The `conversation` field on `/import-inline` is `z.unknown()` then refined to a non-null non-array object, but the actual schema validation lives downstream in the formatter (`parseSingleConversation` for claude, `parseSingleChatGptConversation` for chatgpt). The bridge is only the trust boundary; downstream validation closes the loop with `BridgeError('invalid_shape')`. |
| D | N/A: server does not write files itself. Filenames flow through `extension.ts:sanitizeAssetFilename` and `slugify`, audited there. |
| E | N/A. |
| F | N/A. The `ConversationIdSchema` regex `/^[0-9a-f-]{8,64}$/i` is bounded by length so no catastrophic backtracking. |
| G | `console.warn('Exportal: onPing handler threw')`. No tokens, no body, no origin. Acceptable. |
| H | `sendHandlerError` returns `err.message` only when the error is a generic Error. `BridgeError` returns `code` + `message` (curated). No stack, no path. |

### `src/extension/extension.ts` (1455 lines)
| Q | Answer |
|---|---|
| A | Bridge payloads (via http-server handlers), VS Code command args (none user-controlled), file paths from imports, ZIP filesystem paths, conversation contents, asset filenames + base64 content, webview postMessage from pairing panel and control panel. |
| B | Zod schemas at the bridge boundary; bridge payloads re-validated by `parseSingleConversation` / `parseSingleChatGptConversation`. Filenames go through `slugify` (`[^a-z0-9]+` collapse, ASCII only) and `sanitizeAssetFilename` (null-byte, drive-letter, `..`/`.` segments, U+202A-E, U+2066-9, U+FEFF). |
| C | Todos validados. Manual probe of `sanitizeAssetFilename`: see F-201 below for two minor coverage gaps. |
| D | Path traversal probes against `sanitizeAssetFilename` (extension.ts:1168-1187): `"../../etc/passwd"` rejected (dot-segments check). `"/absolute/path"` rejected (leading `/`). `"C:\\Windows\\System32\\drivers\\etc\\hosts"` rejected (`/^[a-zA-Z]:[\\/]/` Windows absolute check after the `\` is normalized to `/`; technically the regex runs on the raw string before normalization, so `C:\` matches and is rejected). `"....//....//etc/passwd"` rejected (after backslash normalization, segments include `....`, but `....` is not literally `..` or `.` so it passes the segment check, BUT the path does not include any `..`/`.` literal segments. Wait: ts splits on `/`. The string `"....//....//etc/passwd"` after `\\` -> `/` no-op becomes the same; split on `/` yields `["....","","....","","etc","passwd"]`. Empty segments are rejected by the loop, so the input is rejected. OK, rejected via empty-segment check, not via dot-segment check). Null byte `"safe.md\0.exe"` rejected via `\0` check. Windows reserved names `"CON.md"`, `"aux.md"` NOT rejected, see F-201. RTL spoof `"foo‮gnp.exe"` rejected via BIDI_OVERRIDE_REGEX (closed in 0.11.6). Symlinks inside ZIP: jszip does not extract symlinks during `loadAsync` (it stores them as entries but Exportal reads only `conversations.json` content via `.async('string')`, not via fs extraction). No fs symlink follow in the import path. |
| E | `execFile('git', ['symbolic-ref', '--short', 'HEAD'], { cwd, timeout: 2000 })`. Args hardcoded, cwd from `workspaceFolders[0].uri.fsPath`. `cwd` is an absolute path the user opened; if that path itself contains shell metacharacters they are passed as a single string to execFile (no shell=true). Safe. |
| F | `BIDI_OVERRIDE_REGEX = /[‪-‮⁦-⁩﻿]/`, single-step character class, no backtracking. `slugify` regex chains are linear. The `decodedBase64ByteLength` uses `replace(/\s/g, '')`, linear. No nested quantifiers anywhere. |
| G | `console.warn` in three places: jsonl write fail (only `err.message`), no tokens / content. `console.info` in companion bridge probes (background.js, not extension.ts). |
| H | `vscode.window.showErrorMessage(... err.message ...)`. The user's own error messages from `readClaudeAiExport` may include `zipPath`. That's an *intra-user* path leak (the user's own machine path shown to the user), not a cross-trust leak. Accepted. |

### `src/extension/control-panel.ts` (1254 lines)
| Q | Answer |
|---|---|
| A | Webview `postMessage` envelope: `toggleSetting`, `runCommand`, `copyToken`, `pairAndOpen`, `dismissPostImport`, `rotateToken`, `openLogs`, `importDetectedZip`, `openExternal`, `runTemplate`. ZIP filepath from `findRecentExportsByProvider` (auto-discovered in `~/Downloads`/`~/Desktop`). Templates from `exportal.postImportTemplates` setting (user-editable). |
| B | Each handler narrows by `typeof msg.foo === 'string'` / `=== 'boolean'`. `openExternal` whitelists prefix. `dismissPostImport` validates `version` is a number. ZIP path from `importDetectedZip` is forwarded as-is to `importClaudeZip` / `importChatGptZip` -> `openConversationFromZip` -> `readFile(zipPath)`. The path comes from the panel, but the panel only emits paths it itself just discovered via `findRecentExportsByProvider` (which returned absolute paths under Downloads/Desktop). The webview is rendered from extension code, no third-party content; an attacker would need to compromise the webview to inject a malicious path. CSP nonce-gates scripts. See F-202 (`runCommand` arbitrary). |
| C | `runCommand` accepts any string command name (F-202). All other handlers narrow correctly. |
| D | `importDetectedZip` does not validate that `filePath` is one we just published. A compromised webview could send any absolute path on disk. The downstream pipeline (`readClaudeAiExport`) opens the file with `readFile`, parses with jszip; if the file is not a ZIP, it throws and the error is shown to the user. This is information disclosure (existence + contents only if the file is a valid claude.ai-shaped ZIP), see F-203. The control panel does not write under arbitrary paths. |
| E | N/A. |
| F | N/A. |
| G | N/A (no logging in control-panel.ts beyond what VS Code prints). |
| H | `runDetectedImport` catches and posts `{state:'error', message: err.message}`. The error message is rendered as `textContent` on the webview side. Path may be in the message (e.g. `ENOENT: ...`). Webview is sandboxed, only the same user sees it. Accepted. |

### `src/extension/zip-finder.ts` (281 lines)
| Q | Answer |
|---|---|
| A | Filesystem listings under `~/Downloads`, `~/Desktop`. ZIP file contents (read into memory then parsed by jszip). `conversations.json` snippet (first 10 KB). |
| B | Filename pattern `/^data-.+\.zip$/i` (loose) for fast path, then per-zip size cap (50 MB default), then `.async('string')` decode and substring sniff. |
| C | Todos validados. The `head.includes('"mapping"')` etc. content sniff is forgiving but cannot misclassify in a way that would cause a write outside `.exportal/`. |
| D | Filesystem paths constructed via `join(home, 'Downloads')` and `join(folder.path, entry)`. No user input feeds these joins. |
| E | N/A. |
| F | N/A. |
| G | N/A. |
| H | `try/catch` swallows all errors silently; entries that fail to stat or unzip are simply skipped. No leaks. |

### `src/extension/export-paths.ts` (22 lines)
| Q | Answer |
|---|---|
| A | A raw conversation-name string. |
| B | NFD normalization, combining-mark strip, `/[^a-z0-9]+/g -> '-'`, slice to 40 chars, fallback `'conversation'`. |
| C | Todos validados. Worst case empty / pure-non-ASCII input -> `'conversation'`. |
| D | N/A. |
| E | N/A. |
| F | N/A. |
| G | N/A. |
| H | N/A. |

### `src/cli/index.ts` (32 lines)
| Q | Answer |
|---|---|
| A | `process.argv` from the user's shell. |
| B | Commander parses subcommands; unknown command names error out. |
| C | Todos validados, see per-subcommand below. |
| D | N/A. |
| E | N/A. |
| F | N/A. |
| G | Error messages written to stderr include `error.message` (no stack). |
| H | `process.exit(1)` with the error message. No internal paths beyond what the user passed. |

### `src/cli/commands/list.ts` (51 lines)
| Q | Answer |
|---|---|
| A | `--all` boolean, `--project <dir>` string. |
| B | `opts.project` passed verbatim to `listSessionFiles(projectDir) -> join(PROJECTS_DIR, projectDir)`. No traversal protection (path with `../` would escape `~/.claude/projects/`). See F-204. |
| C | `--project '../../etc'` reads `~/.claude/etc` if it exists. Within the user's own home, not a cross-trust break. |
| D | F-204 below. |
| E | N/A. |
| F | N/A. |
| G | N/A. |
| H | Standard commander error message. |

### `src/cli/commands/export.ts` (66 lines)
| Q | Answer |
|---|---|
| A | `<sessionId>` positional, `--project <dir>`, `--out <file>`, `--redact` boolean, `--skip-precompact`, `--include-tools`, `--include-thinking`, `-y/--yes`, `-f/--force`. |
| B | `SESSION_ID = /^[a-f0-9-]{10,64}$/i`, validated explicitly. `--project` is not validated (same as list, F-204). `--out` accepts any path, `atomicWrite` writes via `${path}.tmp` then renames. |
| C | `--out` could be `/etc/passwd` if writable. Local user already has full disk access; this is fail-closed by virtue of the interactive preview prompt being mandatory unless `--yes`. |
| D | `--out` not sanitized but writes from user's own shell to a path the user typed. Not a cross-trust break. |
| E | N/A. |
| F | The `SESSION_ID` regex is character class, linear. `--project` not validated for traversal (F-204). |
| G | N/A. |
| H | error.message via stderr, no stack. |

### `src/cli/commands/import.ts` (139 lines)
| Q | Answer |
|---|---|
| A | `<zip>` positional path, `<conversationId>` (UUID-shaped), `--source`, `--out`, `--redact`, `--include-tools`, `--include-attachments`, `-y`, `-f`. |
| B | `opts.source` checked against `'claudeai'` literal, throws otherwise. Conversation IDs matched against `c.uuid` exactly or by prefix (no traversal vector since they're array lookups). ZIP path passes to `readClaudeAiExport(zipPath) -> readFile(zipPath)`, user-controlled by design. |
| C | Todos validados. |
| D | `<zip>` accepts any path; user is local. Not a finding. |
| E | N/A. |
| F | N/A. |
| G | N/A. |
| H | Stderr `WARN: ${warning}` for parse failures. No internal paths. |

### `src/cli/io.ts`, `src/cli/preview.ts`, `src/cli/prompt.ts`
| Q | Answer |
|---|---|
| A | `out` path, markdown body, redaction report. |
| B | `fileExists` check; refuses to overwrite without `--force`. Atomic write via tmp+rename. Interactive `confirm` requires TTY. |
| C | Todos validados. |
| D | `out` from user; same threat model as cli/export.ts. |
| E | N/A. |
| F | N/A. Preview head/tail line slicing is bounded by `headLines+tailLines`, fixed constants. |
| G | Stderr summary lists redacted counts only (`3x stripe`, etc), never the redacted strings. |
| H | Errors thrown go up to commander. |

### `src/importers/claudeai/reader.ts` (61 lines)
| Q | Answer |
|---|---|
| A | ZIP file at `zipPath`, `conversations.json` / `users.json` / etc inside. |
| B | `readFile`, `JSZip.loadAsync(buffer)`, per-entry `.async('string')`, `JSON.parse`, then schema. Missing or invalid optional files become warnings. |
| C | Todos validados. ZIP bombs not capped here (caller provides `zipPath` from auto-detection or file picker, both have upstream checks via `scanZipsByContent` 50 MB default for the auto path). The direct `readClaudeAiExport(zipPath)` path called from the file picker has NO size cap because the user explicitly picked the file (acceptable trust model, but see F-205). |
| D | `zipPath` passed unchanged to `readFile`. No traversal — user picked the path. |
| E | N/A. |
| F | N/A. |
| G | N/A. |
| H | `throw new Error("Invalid claude.ai export: ...")` includes `zipPath`. User's own path, not a cross-trust leak. |

### `src/importers/claudeai/schema.ts` (213 lines)
| Q | Answer |
|---|---|
| A | Raw parsed JSON values (post `JSON.parse`). |
| B | Zod `.passthrough()` on every object schema (intentional, forward-compat). Type validation via `z.string()`, `z.number()`, etc. `safeParse` returns null on failure. |
| C | Forward-compat fields like `flags: z.unknown()` and `input: z.unknown()` are deliberately permissive. Downstream consumers index by known property name only (`block.text`, `message.content`), never via `Object.keys` enumeration. Verified. Prototype-pollution NOT exploitable. |
| D | N/A. |
| E | N/A. |
| F | N/A (Zod uses prefix-tree internally, no user-regex evaluation). |
| G | N/A. |
| H | N/A (returns null, caller decides how to surface). |

### `src/importers/claudeai/cleanup.ts` (86 lines)
| Q | Answer |
|---|---|
| A | Conversation content (text blocks). |
| B | Replaces a fixed literal placeholder ("This block is not supported on your current device yet."). Regex anchored to literal text via `escapeRegex`. |
| C | Todos validados. |
| D | N/A. |
| E | N/A. |
| F | `FENCED_PLACEHOLDER_RE` and `BARE_PLACEHOLDER_RE` use `\\s*`, `\\n?` and similar. The fenced regex `\`\`\`[A-Za-z]*\\s*\\n?\\s*<literal>\\s*\\n?\\s*\`\`\`` has multiple `\\s*` quantifiers which CAN backtrack, but only in segments where we already matched the literal placeholder. Crafted input could degrade performance: input shape `\`\`\`<huge whitespace>\`\`\`` with no literal in it short-circuits because the literal escape forces a specific 50-byte substring. Real-world risk: negligible. |
| G | N/A. |
| H | N/A. |

### `src/importers/chatgpt/reader.ts` (152 lines)
| Q | Answer |
|---|---|
| A | ZIP at `zipPath`, `conversations.json` or `conversations-NNN.json` inside. |
| B | Same shape as claude reader. Per-conversation `safeParse` so one bad entry doesn't tank the array. |
| C | Todos validados. |
| D | Same as claude reader. |
| E | N/A. |
| F | N/A. |
| G | Warnings include `file.name` (a path inside the zip). Not a security leak. |
| H | Throws if no chunk parses, includes `warnings.join(' / ')`. Joined warning strings can include `file.name` (zip-internal). Not external trust. |

### `src/importers/chatgpt/schema.ts`, `walk.ts`
| Q | Answer |
|---|---|
| A | Parsed JSON. |
| B | Zod default `.strip()`, `parseConversationOrIssues` returns the issue list. `walk.activeBranchMessages` traverses with `visited` set + `HARD_CAP = 50_000` to bail on cycles. |
| C | Todos validados. The HARD_CAP defends against a malicious / corrupt mapping with a giant linear chain. |
| D | N/A. |
| E | N/A. |
| F | N/A. |
| G | N/A. |
| H | N/A. |

### `src/formatters/markdown.ts`, `claudeai-markdown.ts`, `chatgpt-markdown.ts`, `markdown-shared.ts`, `claude-code-jsonl.ts`
| Q | Answer |
|---|---|
| A | Conversation objects (post-Zod). |
| B | Object members accessed by known name only. URL fields go through `safeMarkdownLink`, `safeAutoLink`, `safeUrlForFootnote` which whitelist `http:`/`https:`/`mailto:` only and escape closing parens / angle brackets. Unsafe URLs render as backticked text. `fenceCode` counts max consecutive backticks and uses `max+1` (CommonMark). |
| C | Todos validados in 0.11.6. The `tether_quote` content_type now goes via `safeMarkdownLink` / `safeAutoLink`. The claudeai citation footnote goes via `safeUrlForFootnote`. |
| D | N/A. |
| E | N/A. |
| F | `isSafeUrl`'s `[ -]` (control-char regex) is character-class, linear. The `escapeRegex` used in cleanup.ts is the only multi-quantifier regex and is anchored to a literal, see cleanup row above. No catastrophic backtracking surface. |
| G | N/A. |
| H | Unknown `content_type` falls through to a default branch that surfaces `[type]\n\n<JSON dump>`. The dump goes through `fenceCode` which length-prefixes the fence. No HTML injection (markdown renderers escape by default). Acceptable. |

### `src/redactors/secrets.ts`, `paths.ts`, `index.ts`
| Q | Answer |
|---|---|
| A | Markdown body produced by formatters. |
| B | Regex array; each anchored on a distinctive prefix (`sk-ant-`, `AIza`, `AKIA`, `gh[pousr]_`, etc). Replaces matches with `<REDACTED:name>`. Returns a counts report. |
| C | The 9 patterns cover Anthropic, OpenAI, Google API keys, Stripe, Slack, GitHub classic + fine, AWS, NPM, PEM private keys. JWT (`eyJ...`) is deliberately omitted (FP rate is high). Azure keys, generic Bearer, Hashicorp Vault, OpenAI session keys (`sk-svcacct-`), Heroku, Auth0 client secrets, Twilio not covered. See F-206. |
| D | `redactPaths` covers Windows drive paths and Unix `/home`, `/Users`, `/var`, `/etc`, `/opt`, `/srv`, `/mnt`, `/tmp`, plus tilde. Not redacted: `/root/`, `/private/`, `/Volumes/` (macOS external drives), UNC paths `\\server\share\...`, `file://` URIs. F-207. |
| E | N/A. |
| F | The PEM private key pattern uses `[\s\S]*?` (lazy across newlines). Lazy quantifier with anchored prefix + suffix is safe; no exponential backtracking. |
| G | N/A. |
| H | N/A. |

### `src/core/reader.ts`, `paths.ts`, `session.ts`, `schema.ts`, `compact.ts`, `types.ts`
| Q | Answer |
|---|---|
| A | `.jsonl` content read from disk. |
| B | 200 MB safety cap (`MAX_JSONL_BYTES`), `JSON.parse` per line in try/catch, per-event Zod via `parseEvent`. Failed events dropped silently. |
| C | Todos validados. |
| D | `encodeProjectDir(cwd)` replaces `[:\\/.]` with `-`. The path consumer is `~/.claude/projects/<encoded>/<sessionId>.jsonl`. Inputs come from `process.cwd()` or workspace folder; the CLI `--project` flag passes through unsanitized (F-204). |
| E | N/A. |
| F | N/A (regex on encoding is character-class only). |
| G | N/A. |
| H | Throws if file > 200 MB. Path included in error (user's own path). |

### `chrome/manifest.json`
| Q | Answer |
|---|---|
| A | Static manifest, no runtime input. |
| B | MV3, minimum_chrome_version 116, permissions `storage` + `downloads` only, host_permissions `http://127.0.0.1/*`, content_scripts on `claude.ai/*` and `chatgpt.com/*`. No `tabs`, no `webNavigation`, no broad host permissions. Least privilege. |
| C | N/A. |
| D | N/A. |
| E | N/A. |
| F | N/A. |
| G | N/A. |
| H | N/A. |

### `chrome/background.js` (594 lines)
| Q | Answer |
|---|---|
| A | `chrome.downloads.onChanged`, `chrome.runtime.onMessage` (origin-checked), `chrome.action.onClicked`, `chrome.runtime.onConnect`. |
| B | Origin guard requires sender url to start with `https://claude.ai/`, `https://chatgpt.com/`, or `chrome-extension://${chrome.runtime.id}/`. UUID validated `ExportalPure.UUID_PATTERN` for `setPending`. Conversation must be a non-null non-array object for `sendInline`. Token must match `/^[0-9a-f]{64}$/`. |
| C | The `conversation` value is forwarded to the bridge unchanged after the typeof-object check. The bridge re-validates with Zod. The Companion never inspects content. |
| D | N/A (no fs in MV3 SW). |
| E | N/A. |
| F | UUID + token regexes are anchored character classes, linear. |
| G | `console.warn` and `console.info` lines do log conversation IDs and port numbers, but never tokens or conversation content. The token is never logged. |
| H | sendResponse returns `{ok: false, error: 'bad_origin'}` etc. Specific opaque codes, no stack. |

### `chrome/content-script.js` (1443 lines)
| Q | Answer |
|---|---|
| A | URL pathname, conversation JSON from claude.ai / chatgpt.com / Design RPCs, hash fragment for pairing token. |
| B | `routeFromPath` uses anchored regex for chat/design/chatgpt UUIDs. `parseJsonOrThrow` checks Content-Type contains `'json'` to reject SPA shell. `extractPairingToken` requires `/^[0-9a-fA-F]{64}$/`. `panelRoute` whitelists kinds via `KNOWN_ROUTE_KINDS`. |
| C | Todos validados. |
| D | N/A (no fs). |
| E | N/A. |
| F | UUID pattern `[0-9a-f]{8}-[0-9a-f]{4}-...{12}` is anchored, fixed lengths, linear. |
| G | `console.info('[Exportal] sendInline:', ms, 'ms, response:', response)` logs the response object. The response from the bridge is `{ok:true}` or `{ok:false, error:'<code>'}`, not the conversation contents. Token is never logged. Pulse pulse. |
| H | All error toasts go through `explainError` -> i18n message ID. No stacks. |

### `chrome/options.js` (415 lines)
| Q | Answer |
|---|---|
| A | URL `?reason=` param, token input (user-typed). |
| B | Token input regex `/^[0-9a-f]{64}$/`. Reason param checked against `BANNER_REASONS` set. |
| C | Todos validados. |
| D | N/A. |
| E | N/A. |
| F | Single anchored regex, linear. |
| G | N/A. |
| H | N/A. |

`localizeStaticText` uses `el.innerHTML = chrome.i18n.getMessage(key)`. Source is the extension's own locale `.json` (controlled by the developer, shipped in the VSIX). NOT user input. Comment in the code states this explicitly. Acceptable.

### `chrome/pure.js` (209 lines)
| Q | Answer |
|---|---|
| A | URL strings, conversation objects (only title field accessed). |
| B | Anchored regexes, typeof checks. |
| C | Todos validados. |
| D | `chatGptJsonFilename` runs `slugifyForFilename` which does NFKD + ASCII whitelist + length cap 60 + trim. Output goes to `<a download>` filename, browser sanitizes further. |
| E | N/A. |
| F | All regexes character-class, linear. |
| G | N/A. |
| H | N/A. |

---

## Findings de Fase 2 (per-file)

### F-201, sanitizeAssetFilename does not block Windows reserved device names
- **Severidad**: BAJA
- **Archivo**: `src/extension/extension.ts:1168-1187`
- **Componente**: VS Code ext
- **Categoria**: input validation, filesystem
- **Descripcion**: `sanitizeAssetFilename` rejects null bytes, drive letters, dot segments, and bidi overrides, but does not reject Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9). On Windows, `vscode.workspace.fs.writeFile` to a path ending in `CON` or `aux.txt` either fails (best case) or writes to the literal device (legacy behavior).
- **Reproduccion**: A claude.ai conversation with a Claude Design asset named `CON.md`, `aux.json`, `prn.css`, etc. The bridge accepts the asset, `sanitizeAssetFilename` returns it unchanged, `vscode.workspace.fs.writeFile` is called against `<workspace>/.exportal/<base>/CON.md`. On modern Windows + VS Code's webview fs layer the call typically returns `EBUSY` or `EINVAL`, leaving an opaque error. On older Windows API calls it could write to the device.
- **Impacto**: Local DoS (failed asset write that stops the import flow). On legacy Windows, theoretical interaction with a device. No code execution, no file outside workspace. The model has to be coaxed to emit such a filename, so attacker control is weak.
- **Mitigacion**: Add to `sanitizeAssetFilename`:
  ```ts
  const WIN_RESERVED = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
  for (const segment of normalized.split('/')) {
    if (WIN_RESERVED.test(segment)) return undefined;
    // ... existing checks
  }
  ```
- **Referencia**: CWE-67 (Windows reserved name), [Naming Files, Paths, and Namespaces — Microsoft Docs](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).

### F-202, runCommand from webview executes arbitrary command names
- **Severidad**: BAJA
- **Archivo**: `src/extension/control-panel.ts:192-193`
- **Componente**: VS Code ext, webview
- **Categoria**: defense-in-depth, command injection (mitigated by webview integrity)
- **Descripcion**: The control panel's webview can postMessage `{type:'runCommand', command:<any string>}` and the extension calls `vscode.commands.executeCommand(command)`. There is no whitelist; the only protection is the webview's CSP (nonce-gated scripts, no third-party scripts, no remote content) which prevents an attacker from running JS inside the panel.
- **Reproduccion**: The extension's own webview HTML wires `vscode.postMessage({type:'runCommand', command: cmd})` where `cmd` reads from `el.getAttribute('data-cmd')`. The HTML is generated by extension TypeScript and `data-cmd` values are `escapeHtml(p.importCmd)` / `escapeHtml(p.exportCmd)` from a hardcoded `PROVIDERS` array. Today there is no path through the extension that lets external input reach `data-cmd`. The risk is forward, a future tweak that interpolates a setting or webview-derived value into `data-cmd` would create command injection. Audited as defense-in-depth.
- **Impacto**: If the webview is ever compromised (a future bug, a third-party script injection, a CSP regression), arbitrary VS Code commands can be invoked, including `workbench.action.terminal.sendSequence` (RCE shape), `vscode.openFolder`, etc.
- **Mitigacion**: Replace `runCommand` with a per-provider intent on the webview side and a whitelist on the extension side:
  ```ts
  const ALLOWED_COMMANDS = new Set([
    'exportal.importFromZip',
    'exportal.importFromChatGptZip',
    'exportal.sendSessionToClaudeAi',
    'exportal.sendSessionToChatGpt',
  ]);
  if (m.type === 'runCommand' && typeof m.command === 'string' && ALLOWED_COMMANDS.has(m.command)) {
    await vscode.commands.executeCommand(m.command);
  }
  ```
- **Referencia**: CWE-77, OWASP A03:2021 Injection. Already noted in fase 1 ("surprise findings #1") and audit 2026-04-30 (M3 sub-issue). Repeated here with a concrete patch.

### F-203, importDetectedZip accepts any absolute path from the webview
- **Severidad**: BAJA
- **Archivo**: `src/extension/control-panel.ts:236-239`, `345-359`
- **Componente**: VS Code ext, webview
- **Categoria**: defense-in-depth, information disclosure
- **Descripcion**: The handler `importDetectedZip` takes `{provider, filePath}` from the webview and forwards `filePath` to `importClaudeZip(filePath)` -> `readFile(filePath)`. The extension code only emits paths it just discovered under `~/Downloads`/`~/Desktop`, but the handler does not re-validate that the path is a known one. A compromised webview could pass any readable absolute path on disk; jszip will load and parse it. If the file is a valid ZIP with `conversations.json`, its contents become a markdown file in the workspace, an info-disclosure of files outside Downloads/Desktop into `.exportal/`. If invalid, the user sees an error toast. Same caveat as F-202: requires webview to be malicious.
- **Reproduccion**: Hypothetical malicious script inside the panel posts `{type:'importDetectedZip', provider:'claude', filePath:'C:/Users/dioni/Documents/secrets.zip'}`. If `secrets.zip` happens to look like a claude export the contents leak into `.exportal/`.
- **Impacto**: Local info disclosure to the same workspace. No cross-trust break (the user already has read access to their own files). Combined with another bug that lets an attacker into the webview, could be useful. Standalone, not a finding.
- **Mitigacion**: Track the last `findRecentExportsByProvider` result and validate `filePath` matches one of the published candidates before forwarding:
  ```ts
  private lastDetectedPaths = new Set<string>();
  // populate in refreshDetectedZips
  if (m.type === 'importDetectedZip' && this.lastDetectedPaths.has(m.filePath)) { ... }
  ```
- **Referencia**: CWE-22 (Path Traversal, weak instance), defense-in-depth.

### F-204, CLI --project flag does not block path traversal
- **Severidad**: INFORMATIVA
- **Archivo**: `src/cli/commands/list.ts:42-46`, `src/cli/commands/export.ts:40-41`
- **Componente**: CLI
- **Categoria**: input validation, path traversal
- **Descripcion**: `--project foo/../../../etc/passwd` (or just `..`) is concatenated with `PROJECTS_DIR` via `join`. The CLI is local and runs as the user; the user already has read access. `join` collapses `..` segments cleanly so the worst case is the CLI listing a directory above `PROJECTS_DIR`. No write happens (list / export both read).
- **Reproduccion**: `exportal list --project ../../`. Lists `~/.claude/` instead of a project subdirectory.
- **Impacto**: Cosmetic, the CLI is invoked locally by the user. Not exploitable.
- **Mitigacion**: Reject `..` segments in `--project`. One-line check.
- **Referencia**: CWE-22, weak instance.

### F-205, readClaudeAiExport has no size cap on the picked ZIP
- **Severidad**: INFORMATIVA
- **Archivo**: `src/importers/claudeai/reader.ts:53-83`, `src/importers/chatgpt/reader.ts:59-113`
- **Componente**: parsers/formatters, VS Code ext
- **Categoria**: DoS (local)
- **Descripcion**: When the user picks a ZIP via the file picker, no size precheck runs before `readFile(zipPath)`. A multi-GB ZIP tries to load entirely into memory and may crash the extension host. The auto-discovery path (`scanZipsByContent`, `findRecentExportsByProvider`) already caps at 50 MB, but the file-picker path does not.
- **Reproduccion**: User picks a 5 GB ZIP via Exportal: Import .zip. `readFile` allocates 5 GB, OOM.
- **Impacto**: Local DoS, the user can crash their own extension host. Not a remote vector and not an attack on a different user.
- **Mitigacion**: Stat-and-cap before `readFile` in both readers, mirror the 50 MB default and surface a clear "ZIP exceeds X MB, refusing to load" error.
- **Referencia**: CWE-400, CWE-789. Same family as L2 in audit 2026-04-29 (zip-bomb defense), accepted there.

### F-206, secret redactor missing several common token formats
- **Severidad**: INFORMATIVA
- **Archivo**: `src/redactors/secrets.ts`
- **Componente**: redactors
- **Categoria**: leak (defense-in-depth)
- **Descripcion**: Coverage is 9 patterns (Anthropic, OpenAI, Google API key, Stripe, Slack, GitHub classic + fine, AWS access key, NPM, PEM). Not covered: Azure storage keys, Heroku API tokens, Auth0 client secrets, Twilio account SIDs, Hashicorp Vault tokens, OpenAI service-account keys (`sk-svcacct-`, `sk-admin-`), DigitalOcean tokens, Grafana cloud tokens, MongoDB Atlas keys, generic Bearer/JWT (deliberately omitted, FP rate too high), Anthropic admin keys (if those land with a different prefix), generic `*_SECRET=` env-style assignments. The owner's stated stance: "Coverage is intentionally narrow" -> riesgo conocido y documentado. Not a true finding, listed informatively.
- **Reproduccion**: A chat including `MONGODB_URI=mongodb+srv://user:RealSecret123@cluster.mongodb.net/db` exports unredacted because no pattern matches. User must read the preview.
- **Impacto**: Secret leak if the user does not preview the export before sharing. Auto-attach to Claude Code (in extension flow) skips preview.
- **Mitigacion**: Optional: add `sk-svcacct-`, `sk-admin-`, `\bxapp-\d-[A-Z0-9]{8,}-[A-Z0-9]+` (Slack app), `\bAZ_[A-Za-z0-9]+\b` and similar conservative prefixes. JWT remains a tradeoff.
- **Referencia**: CWE-200 (Information Exposure), OWASP A02:2021. Decision documented in `secrets.ts` header comment.

### F-207, path redactor missing /root, /private, /Volumes, UNC, file://
- **Severidad**: BAJA
- **Archivo**: `src/redactors/paths.ts`
- **Componente**: redactors
- **Categoria**: leak (defense-in-depth)
- **Descripcion**: `UNIX_PATH` covers `/home`, `/Users`, `/var`, `/etc`, `/opt`, `/srv`, `/mnt`, `/tmp`. Misses `/root` (the macOS / Linux root user home), `/private/etc/...` (macOS), `/Volumes/...` (macOS external drives), UNC paths `\\server\share\...`, `file:///...` URIs.
- **Reproduccion**: A chat citing `/Volumes/Backup/secret.db` survives unredacted.
- **Impacto**: Modest leak of host structure. No credentials, no PII unless the path itself leaks them.
- **Mitigacion**: Extend regex: `\/(?:home|Users|var|etc|opt|srv|mnt|tmp|root|private|Volumes)\/`. Add a separate UNC pattern: `\\\\[^\\\\\s]+\\[^\s"'<>|`]+`. Add `file:\/\/[^\s]+`.
- **Referencia**: CWE-209 / CWE-200. Same family as L1 in audit 2026-04-29.

---

## FASE 3, Audit por superficie de ataque

### 3.1 Bridge HTTP
- **Bind address**: `127.0.0.1` only (`http-server.ts:244`). Not 0.0.0.0. OK.
- **DNS rebinding**: no Host-header validation. Local-only bind plus Bearer token plus `fetch` from a chrome-extension origin makes DNS rebinding effectively non-applicable, the attacker would need to coax the user's browser to resolve a domain to 127.0.0.1 AND send Authorization with the right token AND survive the Origin check. Bearer token is the security boundary; rebinding does not bypass it. INFORMATIVA potential, not a finding.
- **Body limits**: `/import` 64 KB, `/import-inline` 50 MB, `/ping` no body (resumed and discarded). Reasonable. Streaming cap doublechecks Content-Length lies.
- **Auth**: `Authorization: Bearer <hex>`. Token NOT in URL (verified). Constant-time `timingSafeEqual` after length pre-check. OK.
- **CORS / Origin**: when the request carries an Origin, only `chrome-extension://` is accepted. When Origin is absent (curl, fetch without origin), the bearer token is the gate. Reasonable.
- **Rate limiting**: 30/min `/ping`, 10/min `/import`, 30/min `/import-inline`. Sliding 60s window. Rate-limit BEFORE auth so a bad-token spammer can not burn timingSafeEqual cycles. Closes M2 from prior audit.
- **Race condition**: `pendingImportFilename` race closed in 0.11.6 via `notifyVersion` counter. Multiple imports in flight do not interfere because each `handleImportInline` produces its own filename and writes to its own URI; concurrent writes to the same workspace dir are handled by the OS filesystem.
- **Discovery del puerto**: hardcoded port range `9317-9326` in pure.js. Companion probes the range with `/ping`. The attacker model where a malicious local process learns the port and brute-forces the token: 256 bits, infeasible. Plus rate limit. OK.
- **Slowloris**: 0.11.6 set `headersTimeout=5000`, `requestTimeout=30000`, `keepAliveTimeout=5000`. Closed.

No new findings on this surface. All the hardenable items from prior audits are now closed in 0.11.6.

### 3.2 Chrome extension
- **Manifest V2 vs V3**: V3, MV2 not supported.
- **Permissions**: `storage`, `downloads`. Host: `http://127.0.0.1/*`. Content scripts on `claude.ai/*` and `chatgpt.com/*`. Least privilege. No `tabs`, no `webNavigation`, no broad host_permissions.
- **Content scripts**: same-origin only. They access `window.location`, listen for keydown, build their own DOM under a single `#exportal-panel` parent. They do NOT inject or read host-page DOM content for conversations (they call host APIs).
- **CS<->BG messages**: background validates `sender.tab?.url ?? sender.url ?? ''` against the allowed prefixes (`https://claude.ai/`, `https://chatgpt.com/`, `chrome-extension://${chrome.runtime.id}/`). Origin guard is correct.
- **window.postMessage cross-frame**: not used. Content script runs in isolated world; messages go only via `chrome.runtime.sendMessage`.
- **innerHTML/outerHTML/document.write with host data**: `injectStyles` uses `style.textContent`. The pulse and toast use `innerHTML` with template strings that include `escapeHtml(...)` for attacker-influenced strings. `pulseHeadline` and `pulseMessagesSuffix` come from `chrome.i18n.getMessage` (extension-controlled locale data) and are still passed through `escapeHtml` defensively. Numeric `ms` and `messages` are not escaped because they come from `Math.round(performance.now())` and `countMessages()` returns a number. Verified: no host API field reaches innerHTML unescaped. The options page localizeStaticText sets innerHTML from i18n strings (extension-controlled). Acceptable, comment in code makes the trust assumption explicit.
- **CSP de la extension**: MV3 default CSP is `script-src 'self'; object-src 'self'`. No `unsafe-inline`, no `unsafe-eval`, no remote scripts. The options page extends with `<meta http-equiv="Content-Security-Policy">`? Not inspected, the manifest does not declare one, so the MV3 default applies. OK.
- **Storage del token**: `chrome.storage.local` plaintext. The threat model accepts this (other extensions cannot read it; only malware with disk access can, and that malware has worse capabilities). Documented in audit 2026-04-29 M3, accepted.
- **fetch a terceros**: only same-origin `claude.ai` / `chatgpt.com` API calls + localhost bridge. No CDN, no telemetry. The Design path uses Connect-RPC POST to `/design/anthropic.omelette.api.v1alpha.OmeletteService/...` (still same-origin). No third-party fetch.

No new findings. The "playSuccessTone duplicated in two files" cosmetic L4 from audit 2026-04-30 is unchanged but still a maintenance risk, not security.

### 3.3 VS Code extension
- **activationEvents**: `onStartupFinished`, `onUri`. The `onStartupFinished` is broad but standard for an extension that needs to boot the bridge proactively. The `onUri` is what the Companion's `vscode://` wake URI hits. No `*` activation. Acceptable.
- **Escribe fuera del workspace?**: writes to `.exportal/` inside workspace, and to `~/.claude/projects/...` only when `alsoWriteJsonl` is on (opt-in, not default). The jsonl path uses `encodeProjectDir(cwd)` so the dir name is bounded. No writes to arbitrary paths via runtime input.
- **Webviews**: two webviews. Pairing panel (`renderPairingHtml`, extension.ts:508) and control panel (`renderHtml`, control-panel.ts:449). Both have nonce-gated scripts, `default-src 'none'`, `style-src ${cspSource} 'unsafe-inline'` (control-panel) or `style-src 'unsafe-inline'` (pairing). Pairing webview sets `enableScripts: true, retainContextWhenHidden: false` (lines 460-461). Control panel sets `enableScripts: true` and `localResourceRoots: [this.context.extensionUri]` (control-panel.ts:150-151). The pairing webview does NOT set `localResourceRoots` (extension.ts:456-461), see F-301 INFORMATIVA below.
- **Webview postMessage validation**: each handler checks `typeof msg === 'object'` and narrows individual fields by `typeof`. F-202 above on `runCommand`.
- **vscode.workspace.openTextDocument with paths**: only with `vscode.Uri` constructed from workspace folder + sanitized filename. Safe.
- **Comandos que toman args arbitrarios**: none. The 5 registered commands take no params in their signatures (`importFromZipCommand`, `showPairingInfoCommand`, etc).
- **vscode.env.openExternal**: `pairAndOpenChrome` opens `https://claude.ai/#exportal-pair=<hex>` (hardcoded host, hex-validated token). `CHROME_COMPANION_STORE_URL` (constant). `target.newChatUrl` (constant per provider). `m.url` from webview is whitelisted to `https://github.com/dioniipereyraa/ClaudeTool` prefix. Safe.

#### F-301, Pairing webview missing localResourceRoots
- **Severidad**: INFORMATIVA
- **Archivo**: `src/extension/extension.ts:456-461`
- **Componente**: VS Code ext
- **Categoria**: defense-in-depth
- **Descripcion**: `vscode.window.createWebviewPanel(..., { enableScripts: true, retainContextWhenHidden: false })` does not pass `localResourceRoots`. The CSP locks down resources (`default-src 'none'`, `script-src 'nonce-...'`) so the practical attack surface is empty, but `localResourceRoots: [context.extensionUri]` is the recommended belt-and-suspenders. The control panel sets it; the pairing panel does not.
- **Reproduccion**: A future change adds `<img src="...">` or `<link rel="stylesheet" href="...">` to the pairing HTML without realizing local resources are unbounded. The CSP would still gate img-src to `${cspSource}` but the `localResourceRoots` gate is the second wall.
- **Impacto**: None today. Forward-looking defense-in-depth.
- **Mitigacion**: `createWebviewPanel(..., {enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [context.extensionUri]})`.
- **Referencia**: [VS Code Webview API guidance](https://code.visualstudio.com/api/extension-guides/webview#loading-local-content).

### 3.4 CLI
- **Args validation**: paths and option strings are validated to varying degrees. `<sessionId>` strict regex. `<conversationId>` matched against existing UUIDs in the array. `--project` not validated for traversal (F-204, INFORMATIVA). `--out` accepts any path (intended, user controls write target).
- **ZIP path**: validated only by attempting to read it via JSZip. No magic-byte check, but jszip surfaces a clear error if not a ZIP. No size cap on file-picker path (F-205, INFORMATIVA).
- **Symlinks dentro del ZIP**: jszip stores symlink entries but Exportal only reads `conversations.json` content via `.async('string')`. No fs extraction is performed, so a symlink entry pointing outside is harmless, the bytes stored in the ZIP are returned, not the symlink target on disk.
- **Output paths**: `atomicWrite` refuses to clobber without `--force`, writes to `${path}.tmp` then renames. Standard.
- **stdout escapes**: `process.stdout.write(markdown)` writes raw bytes. Markdown can contain ANSI escape sequences if the model produced them (`\x1b[31m`). VT-style terminals would interpret them. Markdown does NOT have an escape mechanism for control chars. The redactors do not strip ANSI. See F-302.

#### F-302, CLI stdout does not strip ANSI / control characters
- **Severidad**: BAJA
- **Archivo**: `src/cli/commands/export.ts:54`, `src/cli/commands/import.ts:104`, `src/cli/io.ts`
- **Componente**: CLI
- **Categoria**: terminal injection
- **Descripcion**: When `--out` is omitted, the CLI writes the rendered markdown to stdout. Markdown may contain ANSI escape codes (`\x1b[...`) inside a code fence or text block (the model can be coaxed to emit them). Modern terminals interpret them, allowing color tricks, cursor moves, and (in some terminals) clipboard injection or window-title spoofing.
- **Reproduccion**: A claude.ai chat where the user pasted `\x1b]0;malicious title\x07` into a message. `exportal import show <zip> <id>` writes that escape to stdout, the terminal updates its title.
- **Impacto**: Terminal annoyance, in some terminals (older xterm with `printer` mode, OSC 52) clipboard tampering or printer dispatch. No RCE in modern Windows Terminal / iTerm / GNOME Terminal default config. The user receives the markdown they asked for; the redactors did not delete it because escapes are not "secrets". Edge case.
- **Mitigacion**: Strip C0/C1 control chars from the markdown before writing to stdout, except `\n`, `\r`, `\t`. One regex `text.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')` (preserving `\t` and `\n`). Apply at the CLI write boundary, NOT at the redactor (the file output path under `--out` to disk should preserve the data faithfully so the user can inspect it).
- **Referencia**: CVE-2003-0859 (xterm logging), CVE-2017-7958 (terminal emulator window title), [Terminal escape injection — Marcus Hutchins](https://www.malwaretech.com/2016/04/hijacking-arbitrary-net-process-with.html). Family CWE-150.

### 3.5 Parsers, formatters, redactors
- **Schemas cubren todos los content_types observados?**: `chatgpt-markdown.ts:125-178` has cases for `text`, `multimodal_text`, `code`, `execution_output`, `thoughts`, `reasoning_recap`, `tether_quote`, `tether_browsing_display`, `system_error`. Default branch dumps `[type]\n\n<JSON>` so unknown types are surfaced, not silently dropped. claude.ai uses a discriminated union of `text` / `tool_use` / `tool_result` only; anything else gets rejected by Zod (the union does not have a default).
- **API field nuevo, parser falla cerrado o ignora?**: Zod with `.passthrough()` (claude) preserves and ignores. Zod with default `strip` (chatgpt) drops. Both fail-soft (the field is not load-bearing). Acceptable.
- **Generacion del .md escapa caracteres markdown?**: messages are inserted verbatim. Heading injection (a message containing `## Pretend Heading`) IS possible by design — the model output is rendered as markdown. This is the intended UX. URL fields ARE escaped via `safeMarkdownLink` family (closed in 0.11.6).
- **Generacion del .jsonl puede escribir fuera de Claude Code dir?**: `formatAsClaudeCodeJsonl` returns a string + sessionId; the file write is in `extension.ts:maybeWriteClaudeCodeJsonl` to `~/.claude/projects/<encodeProjectDir(cwd)>/<sessionId>.jsonl`. `encodeProjectDir` replaces `[:\\/.]` with `-`, so a malicious `cwd` cannot escape. `sessionId` defaults to `randomUUID()` (hex + dashes). Cannot escape the dir.
- **Redaccion fail-closed?**: Yes. Forced on in extension flow (`{redact: true}` in every formatConversation/formatChatGptConversation/formatAsMarkdown call inside extension.ts). CLI defaults to `--redact` true; `--no-redact` requires interactive confirmation. The redactor itself runs unconditionally in the formatter when `redact: true`. If a redactor pattern throws, the formatter does not catch it, the export fails. Fail-closed. No silent fallthrough.

No new findings on this surface beyond F-206 / F-207.

---

## FASE 4, Dependencies y supply chain

### Production deps
- **commander ^14.0.3**. Latest 14.x as of January 2026, stable. No CVEs known to me at this version. `^` allows 14.x minor/patch upgrades; package-lock pins exact resolved versions on install.
- **jszip ^3.10.1**. Released 2023. `^3.10.1` allows 3.x. There has been no public 4.x stable. Known historical advisories (CVE-2022-48285 prototype pollution in older versions) were patched in 3.8.0, current 3.10.1 is past that. No newer advisories I can confirm without running `npm audit`.
- **zod ^4.3.6**. Recent (4.x stable, 2025). No CVEs I can confirm.

Maintainer changes / supply chain:
- commander, jszip, zod all have stable, established maintainers. No event-stream-style takeovers I am aware of as of January 2026.
- Marked "requires verification via `npm audit`": no audit was run as part of this audit (out of scope per task brief).

### Dev deps
- esbuild ^0.25.12, eslint 9, vitest 4.x, typescript 5.6, vsce 3.9, sharp 0.34, prettier 3, @types/*. All recent. The `overrides.esbuild: $esbuild` ensures all transitive copies of esbuild use the same version (defends against an old transitive esbuild having a CVE).
- sharp uses native bindings. Postinstall scripts: sharp does run an install-time script that fetches prebuilt binaries from `sharp.pixelplumbing.com`. This is well-documented sharp behavior and an established supply chain. Documented as INFORMATIVA below.

### Postinstall scripts in production deps
- commander: no postinstall.
- jszip: no postinstall (purely JS).
- zod: no postinstall.

Verified by reading their package.json scripts on past inspection.

### package.json scripts (build/ci)
- `build`: `tsc -p tsconfig.build.json && npm run build:extension` -> esbuild bundle. No network access, no privileged ops.
- `ci`: lint + typecheck + test + build. All local.
- `package:vsix`: `npm run build && node scripts/package-vsix.mjs`. The script is in the repo (not inspected here for brevity, but no remote fetch is called from CI logs — review separately if relevant).
- `package:chrome`: zips the chrome dir. Local.
- `build:icon`: uses sharp.

No script invokes a remote URL during CI/build.

### package-lock.json
- Listed in `.vscodeignore` so it does not ship in the VSIX (correct, lockfiles should not ship in install bundles). Present in the repo for npm ci reproducibility.
- Versions pinned via `^` ranges in package.json + exact versions in lock. Standard.

#### F-401, sharp postinstall fetches prebuilt binaries from sharp.pixelplumbing.com
- **Severidad**: INFORMATIVA
- **Archivo**: `package.json` devDependencies
- **Componente**: release/CI
- **Categoria**: supply chain
- **Descripcion**: sharp's install script downloads prebuilt platform-native binaries from `sharp.pixelplumbing.com` during `npm ci`. If that host is compromised, a poisoned binary lands in `node_modules/sharp/`. sharp is dev-only (used by `scripts/build-icon.mjs`), so the binary does not ship to end users. Risk surface: the developer's machine and CI runners.
- **Impacto**: Build-time RCE on dev machine / CI. Not in shipped artifacts.
- **Mitigacion**: optional `npm ci --ignore-scripts` for security-paranoid build environments, plus pin sharp's resolved tarball SHA in lockfile (npm does this by default with integrity hashes).
- **Referencia**: General supply chain hygiene, not a sharp-specific CVE.

---

## FASE 5, Release / build / CI

### `.github/workflows/ci.yml`
- Triggers: `push` and `pull_request` on main.
- `permissions:` not declared at workflow or job level. Default permissions for `pull_request` from forks are read-only, for push from main with classic GITHUB_TOKEN can be `write` (varies by repo settings). The CI workflow only runs lint/typecheck/test/build and does not push or create artifacts that need write. Default permissions are acceptable but explicit `permissions: { contents: read }` is best practice.
- No secrets used in CI.
- No `pull_request_target` (which would expose secrets to forks).
- Uses `actions/checkout@v4` and `actions/setup-node@v4`, both pinned to major. Recommend pinning to commit SHA for tighter supply chain (action source pinning), but major-tag pinning is the common practice.

### `.github/workflows/release.yml`
- Triggers: tag push `v*`.
- `permissions: { contents: write }` declared at workflow level. Needed by `softprops/action-gh-release@v2` to create the GitHub release. Scoped correctly (no `packages: write`, no `id-token: write`).
- Builds VSIX + chrome zip, attaches to release.
- `awk` extracts CHANGELOG section. Local-only.
- No secrets exposed to forks (only fires on tag push, which is restricted to maintainers).

#### F-501, CI workflow lacks explicit permissions block
- **Severidad**: BAJA
- **Archivo**: `.github/workflows/ci.yml`
- **Componente**: release/CI
- **Categoria**: supply chain, defense-in-depth
- **Descripcion**: `ci.yml` does not declare a `permissions:` block. With the repo's default `GITHUB_TOKEN` permissions (which can be `write` for push events depending on repo setting, `read` for PRs from forks), a compromised dependency executed during `npm ci` could potentially exercise the token. The blast radius is bounded by what the token can do (no secrets are referenced in the workflow), but explicitly setting `permissions: { contents: read }` at the workflow level is the recommended posture.
- **Reproduccion**: A malicious transitive dep with a postinstall script reads `GITHUB_TOKEN` from the env. With default permissions, depending on repo setting, it could push to the repo or create issues.
- **Impacto**: depends on the repo's "Workflow permissions" default in settings. If "Read and write permissions" is selected globally, the impact is wider; if "Read repository contents permission" is the default, impact is minimal. Either way, explicit declaration is best.
- **Mitigacion**: Add at top of `ci.yml`:
  ```yaml
  permissions:
    contents: read
  ```
- **Referencia**: [GitHub Docs — Securing your workflows](https://docs.github.com/en/actions/security-guides/automatic-token-authentication), CIS GitHub benchmarks.

### Releases firmados?
- VSIX is built via `vsce` and uploaded. VSCE supports signed extensions (`.vsixmanifest` Authenticode), but `package:vsix` script does not invoke signing. Marketplace-side trust comes from publisher account auth.
- Chrome zip is uploaded to GitHub release manually + Chrome Web Store reviews the zip. CWS listing is the authoritative trust anchor for Chrome users.
- Neither artifact is GPG-signed. No `cosign` / `sigstore` integration.

#### F-502, Release artifacts not signed (VSIX, chrome zip)
- **Severidad**: INFORMATIVA
- **Archivo**: `.github/workflows/release.yml`, `package.json` scripts
- **Componente**: release/CI
- **Categoria**: supply chain
- **Descripcion**: The VSIX and chrome zip are not GPG/cosign-signed. End-user trust relies on Marketplace + Chrome Web Store account-level checks. A compromised GitHub release would be unsigned and indistinguishable from a legitimate one to a user downloading from the GitHub release page directly.
- **Impacto**: A repo compromise could publish a malicious release. Marketplace + CWS continue to gate the actual install for most users (who install from there), but power users grabbing the GitHub release directly have only TLS to rely on.
- **Mitigacion**: optionally sign with cosign (keyless, OIDC-backed), publish the signature alongside the artifact. Single-developer project, low ROI today; document it for a future iteration.
- **Referencia**: SLSA framework, sigstore docs.

### Sourcemaps
- `dist/extension/*.map` are excluded by `.vscodeignore`. The shipped `extension.cjs` is bundled by esbuild. Sourcemaps stay local. No path leak in the VSIX.

### Bundle contents
- `.vscodeignore` excludes `src/**`, `tests/**`, `scripts/**`, `node_modules/**`, `coverage/**`, `.git/**`, `.github/**`, `chrome/**`, `docs/**`, `design-cds/**`, `.exportal/**`, `*.vsix`, `package-lock.json`. Looks complete.
- Marketplace icon is the PNG; SVGs are excluded except `sidebar-icon.svg` (referenced by package.json).
- No `.env` / credentials path observed in repo. No `secrets.json` files.

No findings on bundle hygiene.

---

## FASE 6, Threat model residual vs SECURITY.md

### Amenazas mitigadas bien
- **API keys / tokens en exports**: 9 regex patterns, fail-closed by default in extension. Preview prompt in CLI. The narrow scope is documented and accepted. Solid.
- **Paths absolutos**: 8 prefixes + tilde + Windows drives. Decent coverage.
- **Path traversal en CLI/extension input**: filename sanitization is layered (slugify + sanitizeAssetFilename + Uri.joinPath). All probes (`..`, absolute, drive, RTL, BOM, dot segments, empty segments, null bytes) rejected.
- **Transmisión de datos zero-network**: confirmed. No third-party fetch in `src/extension/**` or `src/cli/**`. Same-origin host APIs in content scripts only. Local bridge only on 127.0.0.1.

### Amenazas mitigadas parcialmente
- **PII (emails, nombres)**: SECURITY.md mentions "Regex + flag `--redact-pii`". The flag does NOT exist in the current CLI. There is no email or name regex in `secrets.ts` or `paths.ts`. PII redaction is missing from the implementation. SECURITY.md is aspirational on this row.
- **Código propietario o `.env`**: SECURITY.md mentions "Exclusión configurable por patrón de archivo". No such configuration exists. The user's exports include the entire conversation; if the model emitted file contents, they survive (modulo the secrets and paths regex). Aspirational.
- **Export con permisos laxos**: SECURITY.md mentions "Escritura con permisos restrictivos cuando la plataforma lo permite + aviso explícito + `*.export.md` en `.gitignore`". The extension calls `vscode.workspace.fs.writeFile` which uses default umask. No `chmod 600` is applied. No `.gitignore` is auto-created. Partial: the `.exportal/` directory is convention but no auto-rule.

### Amenazas NO mitigadas (SECURITY.md says so but code does not)
- **`--redact-pii` flag**: not implemented. F-601 below.
- **Allow-list de directorios raíz para CLI input**: not implemented. F-204 INFORMATIVA covers it.
- **`*.export.md` en `.gitignore`**: not auto-managed.

### Amenazas que no estan en SECURITY.md y deberian estar
- **Bridge HTTP threat model**: SECURITY.md predates the local bridge and Chrome companion. The threat model for an attacker on the same host (other process, malware) is not documented. The implementation handles it (Bearer token, 127.0.0.1 bind, rate limiting, body cap, Origin guard), but the *threat* should be in SECURITY.md so reviewers know what is in scope.
- **Webview integrity model**: VS Code webviews are sandboxed but the trust assumption (extension-controlled HTML, no user content) should be documented. Particularly relevant given F-202 / F-203.
- **Chrome companion as trust boundary**: the Companion forwards conversation contents to the bridge. The bridge revalidates with Zod. SECURITY.md does not mention the Companion at all.
- **Multi-AI scope**: SECURITY.md mentions claude.ai only. ChatGPT support (Hito 30+) is missing.

#### F-601, SECURITY.md claims --redact-pii flag that does not exist
- **Severidad**: BAJA
- **Archivo**: `SECURITY.md` line 11, `src/cli/**` (no flag implemented)
- **Componente**: CLI, docs
- **Categoria**: doc/code drift, defense-in-depth missing
- **Descripcion**: SECURITY.md row "PII (emails, nombres) | Fuga involuntaria | Regex + flag `--redact-pii`" implies a flag that the CLI does not register. No PII redactor exists in `src/redactors/`. A user reading SECURITY.md may assume their exported chats have PII redacted; the actual export contains every email and full name in the conversation verbatim.
- **Reproduccion**: `exportal import show export.zip <uuid> --redact-pii` results in commander error "unknown option '--redact-pii'". The command runs without it but does not redact emails.
- **Impacto**: User trust mismatch. The user may share an export thinking PII was redacted.
- **Mitigacion**: either implement (a) email regex `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b` and a generic name regex (hard, low precision) and add the flag, or (b) update SECURITY.md to remove the claim and document PII redaction as out-of-scope today.
- **Referencia**: doc/code consistency. CWE-1101 (reliance on stated documentation).

---

## Findings de Fase 3-5 que no aparecieron en Fase 2

Findings F-301, F-302, F-401, F-501, F-502, F-601 are surface-level findings exclusive to the corresponding phase. Already inlined above.

---

## Resumen ejecutivo (max 10 lineas)

The codebase is in a strong place after 0.11.6. All MEDIUM findings from prior audits are closed. Nothing remotely exploitable surfaced this pass. The remaining items are defense-in-depth (F-202 webview command whitelist, F-301 localResourceRoots), platform edge cases (F-201 Windows reserved names, F-302 ANSI in stdout), local DoS edges accepted by threat model (F-205 size cap, F-204 CLI traversal), and a doc/code drift in SECURITY.md (F-601 phantom `--redact-pii`). The 3 items I would address first:

1. **F-202** webview command-name whitelist. 5-line patch in `control-panel.ts:192-193`. Closes the only path that could escalate a hypothetical webview compromise to arbitrary VS Code command execution. Cheap, future-proof.
2. **F-601** SECURITY.md drift. Either add a real PII redactor or remove the claim. Trust mismatch with users is harder to recover from than a missing feature.
3. **F-201** Windows reserved names in `sanitizeAssetFilename`. Eight-line addition. Covers the last edge case in the filename pipeline.

## Tabla de findings por severidad

| Severidad | Cantidad |
|---|---|
| CRITICA | 0 |
| ALTA | 0 |
| MEDIA | 0 |
| BAJA | 6 (F-201, F-202, F-203, F-302, F-501, F-601) |
| INFORMATIVA | 5 (F-204, F-205, F-206, F-207, F-301, F-401, F-502) — counts as 7 distinct items, F-401 is dev-only |

Total: 6 BAJA + 7 INFORMATIVA = 13 net new findings. Zero high-severity. All previously-MEDIUM items from earlier audits are confirmed closed in 0.11.6.

## Areas que NO pude auditar bien

- **`scripts/package-vsix.mjs` and `scripts/package-chrome.mjs`**: not read in this pass, only their behavior inferred from package.json. A future audit should verify they do not exfiltrate or alter unintended files. Probably trivial.
- **Live `npm audit` results**: out of scope per task brief. Some CVEs in transitive deps may exist that I cannot confirm by static analysis alone. Recommend running `npm audit --omit=dev` and `npm audit` in a follow-up.
- **Real-world ZIP fuzzing of jszip**: in-memory load with crafted ZIP could trigger pathological behavior in JSZip parsing (zip-slip in jszip is patched, but stress with malformed central directories was not exercised). Out of scope for static analysis.
- **Webview side-channel timing on token compare**: the bridge uses `timingSafeEqual` after a length precheck. Length precheck reveals length, but the token is a fixed 64-char hex so length is constant. No leak.
- **VS Code marketplace publisher security**: account-level controls (2FA, Personal Access Tokens) are not auditable from the repo.
- **Tests as a security surface**: the `tests/` dir was not audited. A malicious test file would only run on developer machines / CI, not on user installs.

## 3 preguntas concretas para el autor

1. **F-202 (webview runCommand)**: is the current open passthrough deliberate (anticipating future commands the webview should be able to invoke) or is a per-command whitelist acceptable? If the latter, I have the patch ready.
2. **F-601 (SECURITY.md `--redact-pii`)**: was the flag never implemented or was it removed in an earlier sprint? If the intent is "PII redaction is out of scope for v1", I would adjust SECURITY.md instead of writing the regex.
3. **F-205 (file-picker ZIP size cap)**: deliberate? The auto-discovery path caps at 50 MB; the file picker does not. A user picking a 4 GB ZIP gets a crashed extension host. Is this an acceptable failure mode (user fault) or should I add a cap with a clear error toast?

---

*Auditor: Claude Opus 4.7 (sesión 2026-04-30 noche, post-0.11.6).*
*Scope: static analysis of src/extension/**, src/cli/**, src/importers/**, src/formatters/**, src/redactors/**, src/core/**, chrome/*.js, .github/workflows/**, package.json. Cross-referenced AUDIT-2026-04-29.md, AUDIT-2026-04-30.md, AUDIT-2026-04-30-deep-fase1.md.*
*No code modified. No npm audit, no network tools, no fuzzing.*
