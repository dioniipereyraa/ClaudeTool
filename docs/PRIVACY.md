# Privacy Policy — Exportal Companion

**Last updated**: 2026-04-21

## Summary

Exportal Companion is a local-first browser extension. It does **not**
collect, transmit, or store any personal data on remote servers. All
data stays on your machine and is only sent to your own local VS Code
installation via a loopback address (`127.0.0.1`).

## What the extension does

Exportal Companion exports your claude.ai conversations to a local VS
Code extension (Exportal for VS Code) so you can use them as context
in Claude Code. The export flow is:

1. You click "Export this chat" on a claude.ai page (or use the
   keyboard shortcut).
2. The extension reads the conversation using your existing claude.ai
   session cookies — the same way the website renders it for you.
3. The conversation JSON is sent to `http://127.0.0.1:<port>/...`
   (your local VS Code bridge, never a remote server).
4. VS Code receives it and opens a Markdown file locally.

## What data we handle

The extension handles the following data, **only on your device**:

- **Conversation content from claude.ai**: messages, titles, and
  metadata of conversations you explicitly choose to export. Used only
  to generate the Markdown export. Not stored, logged, or transmitted
  anywhere except your local VS Code bridge.
- **Pairing token**: a random token you copy from VS Code into the
  extension's options page, used to authenticate requests to your
  local bridge. Stored in `chrome.storage.local` on your device only.
- **Pending conversation UUID** (temporary): when you trigger the
  "official export" flow, the UUID of the chat you were on is stored
  briefly in `chrome.storage.local` so the extension can open the
  correct conversation when the ZIP finishes downloading. Overwritten
  on each use.

## What data we do NOT collect

- No analytics, telemetry, or crash reporting.
- No advertising identifiers.
- No user accounts, profiles, or tracking of any kind.
- Your claude.ai credentials are **never** read, stored, or
  transmitted. The extension relies on the browser's existing session
  cookies — it does not see them.
- No data is sent to the extension author or any third party.

## Permissions explained

| Permission | Why we need it |
|---|---|
| `storage` | Store the pairing token and the pending conversation UUID on your device. |
| `downloads` | Detect when the official claude.ai export ZIP finishes downloading, so we can forward it to VS Code. |
| `host_permissions: http://127.0.0.1/*` | Communicate with the local VS Code bridge on your machine. `127.0.0.1` is loopback — traffic never leaves your device. |
| Content script on `https://claude.ai/*` | Inject the floating export button and read the active conversation's content when you click "Export". |

## Data retention

All data is stored locally on your device in `chrome.storage.local`.
Uninstalling the extension deletes everything. There is no remote
storage to clear.

## Third parties

The extension does not integrate with any third-party service.
Conversation content you export is sent only to your local VS Code
installation at `127.0.0.1`.

## Open source

The extension is open source under the MIT license. You can audit the
entire codebase at:

<https://github.com/dioniipereyraa/ClaudeTool>

## Contact

Questions about this policy: **dionipereyrab@gmail.com**
