# Changelog

All notable changes to Exportal (VS Code extension) and Exportal
Companion (Chrome extension) are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/).

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
