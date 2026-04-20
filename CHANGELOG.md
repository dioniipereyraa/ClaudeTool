# Changelog

All notable changes to Exportal (VS Code extension) and Exportal
Companion (Chrome extension) are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/).

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
