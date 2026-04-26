import * as vscode from 'vscode';

import { encodeProjectDir, PROJECTS_DIR } from '../core/paths.js';
import { readJsonl } from '../core/reader.js';
import { describeSession, listSessionFiles } from '../core/session.js';
import { type SessionMetadata } from '../core/types.js';
import { formatChatGptConversation } from '../formatters/chatgpt-markdown.js';
import { formatAsClaudeCodeJsonl } from '../formatters/claude-code-jsonl.js';
import { formatConversation } from '../formatters/claudeai-markdown.js';
import { formatAsMarkdown } from '../formatters/markdown.js';
import { readChatGptExport } from '../importers/chatgpt/reader.js';
import {
  parseSingleConversation as parseSingleChatGptConversation,
  type ChatGptConversation,
} from '../importers/chatgpt/schema.js';
import { stripUnsupportedBlockPlaceholders } from '../importers/claudeai/cleanup.js';
import { readClaudeAiExport } from '../importers/claudeai/reader.js';
import {
  parseSingleConversation,
  type ClaudeAiConversation,
} from '../importers/claudeai/schema.js';

import { ExportalControlPanelProvider } from './control-panel.js';
import { buildExportTimestamp, slugify } from './export-paths.js';
import {
  BridgeError,
  generateToken,
  startServer,
  type ImportInlinePayload,
  type ImportPayload,
  type InlineAsset,
  type ServerHandle,
} from './http-server.js';
import {
  findRecentClaudeAiExports,
  formatRelativeTime,
  formatSize,
  scanZipsByContent,
  type ClaudeAiZipCandidate,
} from './zip-finder.js';

const PAIRING_TOKEN_KEY = 'exportal.pairingToken';
// Bump the key whenever we redesign the onboarding flow so existing
// users see the new experience once. v2 landed with the webview /
// auto-pair rewrite (previous version was the blocking modal dialog).
const ONBOARDING_SHOWN_KEY = 'exportal.onboardingShownV2';
// Remembers which provider the user chose the last time they hit the
// "Copy and open Chrome" button. The Companion's content script lives
// on both claude.ai and chatgpt.com, so either host can act as the
// trampoline for the `#exportal-pair=<hex>` fragment — we ask once
// and reuse the choice on subsequent pairings.
const LAST_PAIR_PROVIDER_KEY = 'exportal.lastPairProvider';

type PairProvider = 'claude' | 'chatgpt';

const PAIR_PROVIDER_HOSTS: Record<PairProvider, string> = {
  claude: 'claude.ai',
  chatgpt: 'chatgpt.com',
};

/**
 * Open the configured pairing provider in the user's default browser
 * with `#exportal-pair=<token>` so the Companion's content script
 * captures it without manual paste. Always copies the token to the
 * clipboard first as a fallback (default browser may not be Chrome,
 * or the Companion may not yet be installed).
 *
 * Returns silently if the user cancels the QuickPick on first run.
 */
export async function pairAndOpenChrome(
  context: vscode.ExtensionContext,
  token: string,
): Promise<void> {
  await vscode.env.clipboard.writeText(token);
  const provider = await pickPairingProvider(context);
  if (provider === undefined) return;
  const authority = PAIR_PROVIDER_HOSTS[provider];
  // URL construction uses Uri.from with explicit components, NOT
  // Uri.parse. Parsing "https://<host>/#x=y" works, but some VS Code
  // builds re-encode the "=" inside the fragment during .toString()
  // — Chrome then treats the whole fragment as a single literal, not
  // a key/value pair, and our content-script regex misses it.
  // Uri.from preserves the fragment verbatim.
  const pairingUri = vscode.Uri.from({
    scheme: 'https',
    authority,
    path: '/',
    fragment: `exportal-pair=${token}`,
  });
  await vscode.env.openExternal(pairingUri);
  void vscode.window.showInformationMessage(
    vscode.l10n.t(
      'Exportal: opened {0} in your browser — pairing completes automatically if the Companion is installed.',
      authority,
    ),
  );
}

/**
 * First call shows a QuickPick (claude.ai vs chatgpt.com). Subsequent
 * calls reuse the saved choice silently. Use the
 * `exportal.switchPairingProvider` command to clear the preference and
 * be asked again.
 */
async function pickPairingProvider(
  context: vscode.ExtensionContext,
): Promise<PairProvider | undefined> {
  const saved = context.globalState.get<unknown>(LAST_PAIR_PROVIDER_KEY);
  if (saved === 'claude' || saved === 'chatgpt') return saved;
  const items: readonly { label: string; value: PairProvider }[] = [
    { label: 'claude.ai', value: 'claude' },
    { label: 'chatgpt.com', value: 'chatgpt' },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('Where do you want to pair?'),
    placeHolder: vscode.l10n.t(
      'Pick the site the Companion should capture the token from. We remember your choice.',
    ),
  });
  if (picked === undefined) return undefined;
  await context.globalState.update(LAST_PAIR_PROVIDER_KEY, picked.value);
  return picked.value;
}

/**
 * Exportal — VS Code extension entry point.
 *
 * Thin wrapper over the already-tested core: `readClaudeAiExport` and
 * `formatConversation`. Surfaces:
 *  - A status bar button + command that auto-detects the most recent
 *    claude.ai export ZIP in Downloads/Desktop and opens it as Markdown.
 *  - A local HTTP bridge (see `http-server.ts`) that accepts import
 *    requests from a future Chrome companion extension.
 *  - A command to reveal the pairing token used by the Chrome companion.
 *
 * Redaction is forced on — there is deliberately no UI toggle.
 * Users who need raw output know where to find the CLI.
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('exportal.importFromZip', importFromZipCommand),
    vscode.commands.registerCommand('exportal.showPairingInfo', () =>
      showPairingInfoCommand(context),
    ),
    vscode.commands.registerCommand(
      'exportal.sendSessionToClaudeAi',
      sendSessionToClaudeAiCommand,
    ),
    vscode.commands.registerCommand(
      'exportal.sendSessionToChatGpt',
      sendSessionToChatGptCommand,
    ),
    vscode.commands.registerCommand(
      'exportal.importFromChatGptZip',
      importFromChatGptZipCommand,
    ),
    vscode.commands.registerCommand('exportal.switchPairingProvider', async () => {
      // Clears the saved provider so the next pair-and-open call
      // shows the QuickPick again. Useful when the user switches
      // between claude.ai-heavy and chatgpt.com-heavy workflows.
      await context.globalState.update(LAST_PAIR_PROVIDER_KEY, undefined);
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          'Exportal: pairing provider preference cleared. Next pair-and-open will ask again.',
        ),
      );
    }),
  );

  // Activity-bar tab with the toggles + action buttons (hito 19
  // follow-up). Replaces "Preferences UI → search exportal" as the
  // discoverable place to flip settings.
  const controlPanel = new ExportalControlPanelProvider(context, {
    importClaudeZip: (filePath) => openConversationFromZip(filePath),
    importChatGptZip: (filePath) => openChatGptConversationFromZip(filePath),
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'exportal.controlPanel',
      controlPanel,
    ),
  );

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  // `$(export)` echoes the arrowhead/portal-bar motif of the Exportal
  // mark better than the generic cloud-download we shipped originally.
  statusBar.text = '$(export) Exportal';
  statusBar.tooltip = vscode.l10n.t('Import claude.ai conversation');
  statusBar.command = 'exportal.importFromZip';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Start the local bridge server. Failure is non-fatal — the ZIP import
  // flow still works from the status bar / palette.
  //
  // Server startup is async, so we register a disposable synchronously
  // that tracks the in-flight startup: if VS Code deactivates us before
  // the server finishes listening, the disposable closes the handle as
  // soon as it resolves. Without this, a fast deactivate would leak the
  // listening port (the handle would be pushed to a disposed subscription
  // array, which VS Code no longer watches).
  let disposed = false;
  let activeHandle: ServerHandle | undefined;
  context.subscriptions.push({
    dispose: () => {
      disposed = true;
      if (activeHandle !== undefined) void activeHandle.close();
    },
  });
  void startBridgeServer(context).then((handle) => {
    if (handle === undefined) return;
    if (disposed) void handle.close();
    else activeHandle = handle;
  });

  // First-run onboarding: open the pairing webview with the token and
  // the "Copy and open Chrome" one-click flow. Showing the panel is
  // non-blocking — the user can close the tab whenever — but the flag
  // we set in showOnboardingIfNeeded ensures we only do this once per
  // install, so repeat activations are silent.
  showOnboardingIfNeeded(context);
}

export function deactivate(): void {
  // Nothing to clean up — all resources are tied to the command's
  // lifetime and VS Code disposes them via `context.subscriptions`.
}

async function startBridgeServer(
  context: vscode.ExtensionContext,
): Promise<ServerHandle | undefined> {
  const token = getOrCreatePairingToken(context);
  try {
    return await startServer(token, {
      onImport: (payload) => handleBridgeImport(payload),
      onImportInline: (payload) => handleBridgeImportInline(payload),
      onPing: () => handlePairConfirmed(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showWarningMessage(
      vscode.l10n.t('Exportal: could not start the local bridge. {0}', message),
    );
    return undefined;
  }
}

// Fires when Chrome confirms pairing. Debounced via a short cool-down:
// Chrome may hit /ping twice in quick succession (e.g. on reload of
// a tab whose fragment was already consumed) and we don't want two
// notifications on top of each other.
let lastPairConfirmedAt = 0;
const PAIR_CONFIRM_COOLDOWN_MS = 3000;

function handlePairConfirmed(): void {
  const now = Date.now();
  if (now - lastPairConfirmedAt < PAIR_CONFIRM_COOLDOWN_MS) return;
  lastPairConfirmedAt = now;
  void vscode.window.showInformationMessage(
    vscode.l10n.t('Exportal: pairing complete. Chrome is ready to export chats.'),
  );
  // If the pairing panel is still open, swap it to the success state
  // and auto-dispose after a short beat so the user sees the confirmation
  // without having to click anything. If it's already closed (user went
  // with "Later" or the primary button + closed the tab), the notification
  // above is the only feedback, which is fine.
  if (pairingPanel !== undefined) {
    const panel = pairingPanel;
    void panel.webview.postMessage({ type: 'paired' });
    setTimeout(() => { panel.dispose(); }, 2500);
  }
}

function getOrCreatePairingToken(context: vscode.ExtensionContext): string {
  const existing = context.globalState.get<string>(PAIRING_TOKEN_KEY);
  if (existing !== undefined && existing.length > 0) return existing;
  const token = generateToken();
  void context.globalState.update(PAIRING_TOKEN_KEY, token);
  return token;
}

async function handleBridgeImport(payload: ImportPayload): Promise<void> {
  await openConversationFromZip(payload.zipPath, {
    rethrow: true,
    ...(payload.conversationId !== undefined && {
      preferConversationId: payload.conversationId,
    }),
  });
}

async function handleBridgeImportInline(payload: ImportInlinePayload): Promise<void> {
  // Provider tag drives which schema/formatter pipeline we use. Absent
  // = 'claude' (backward compat with pre-Hito-30 Companion installs).
  const provider = payload.provider ?? 'claude';
  if (provider === 'chatgpt') {
    await handleChatGptInline(payload);
    return;
  }
  // The Chrome companion scraped this directly from claude.ai's internal
  // conversation API, so the shape should match — but we re-validate here
  // because the bridge is a trust boundary. A specific BridgeError code
  // lets the companion show "Shape de claude.ai cambió" instead of a
  // generic "import failed", which is the likely cause when Anthropic
  // tweaks the internal API.
  const parsed = parseSingleConversation(payload.conversation);
  if (parsed === null) {
    throw new BridgeError('invalid_shape', 'conversation JSON did not match expected schema');
  }
  // Scrub claude.ai's "This block is not supported on your current
  // device yet." placeholders before any formatter sees them — they
  // come from the `?rendering_mode=messages` API path and would
  // otherwise ride through to both the .md and the .jsonl outputs.
  const conversation = stripUnsupportedBlockPlaceholders(parsed);
  const baseName = `${buildExportTimestamp()}-${slugify(conversation.name)}`;
  const assets = payload.assets ?? [];
  const { markdown: convMarkdown } = formatConversation(conversation, { redact: true });
  const markdown = assets.length > 0
    ? buildAssetsHeader(assets, baseName) + convMarkdown
    : convMarkdown;
  const savedUri = await persistAndOpenMarkdown(conversation.name, markdown, baseName, assets);
  announceImport(conversation);
  await maybeWriteClaudeCodeJsonl(conversation);
  await attachToClaudeCodeIfAvailable(savedUri);
}

/**
 * ChatGPT branch of the inline import (Hito 30). Companion fetched a
 * single conversation from `/backend-api/conversation/<id>` and we
 * validate + format with the chatgpt-side schema/formatter. Reuses
 * persist + auto-attach (provider-agnostic). No `.jsonl` for /resume:
 * the Anthropic envelope assumes claude shapes, would need a
 * dedicated converter.
 */
async function handleChatGptInline(payload: ImportInlinePayload): Promise<void> {
  const parsed = parseSingleChatGptConversation(payload.conversation);
  if (parsed === null) {
    throw new BridgeError(
      'invalid_shape',
      'ChatGPT conversation JSON did not match the expected schema',
    );
  }
  const title = parsed.title ?? `chatgpt-${(parsed.conversation_id ?? parsed.id ?? 'untitled').slice(0, 8)}`;
  const baseName = `${buildExportTimestamp()}-${slugify(title)}`;
  const { markdown } = formatChatGptConversation(parsed, { redact: true });
  const savedUri = await persistAndOpenMarkdown(title, markdown, baseName);
  void vscode.window.showInformationMessage(
    vscode.l10n.t('Exportal: "{0}" imported from ChatGPT.', title),
  );
  await attachToClaudeCodeIfAvailable(savedUri);
}

// Pre-pended block when the inline payload carries Claude Design assets.
// Lists each file with size + MIME so that downstream tools (and the
// human reading the .md) know what's in the sibling folder. Kept
// markdown-only so it composes with the formatter output.
function buildAssetsHeader(assets: InlineAsset[], baseName: string): string {
  const lines = [
    '## Generated assets',
    '',
    `Saved next to this file under \`./${baseName}/\`:`,
    '',
  ];
  for (const a of assets) {
    const sizeKb = (decodedBase64ByteLength(a.content) / 1024).toFixed(1);
    lines.push(`- \`${a.filename}\` — ${a.contentType} · ${sizeKb} KB`);
  }
  lines.push('', '---', '', '');
  return lines.join('\n');
}

// Quick byte count from a base64 string without actually decoding —
// avoids materializing the full buffer just to label sizes.
function decodedBase64ByteLength(b64: string): number {
  const trimmed = b64.replace(/\s/g, '');
  if (trimmed.length === 0) return 0;
  const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
  return Math.floor((trimmed.length * 3) / 4) - padding;
}

function announceImport(conversation: ClaudeAiConversation): void {
  // Toast after a successful import. The user often triggers the export
  // from Chrome with VS Code in the background; without this toast the
  // only confirmation is the new editor tab, which they may not see
  // until they switch windows. Includes the title so a user who fires
  // two exports back-to-back can tell them apart.
  const title = conversation.name.length > 0 ? conversation.name : vscode.l10n.t('(untitled)');
  const count = conversation.chat_messages.length;
  void vscode.window.showInformationMessage(
    vscode.l10n.t('Exportal: "{0}" — {1} messages imported', title, String(count)),
  );
}

function showPairingInfoCommand(context: vscode.ExtensionContext): void {
  const token = getOrCreatePairingToken(context);
  showPairingPanel(context, token);
  // Showing the panel counts as "onboarding seen" — the user now knows
  // where the token lives and how to reopen it from the command palette.
  void context.globalState.update(ONBOARDING_SHOWN_KEY, true);
}

function showOnboardingIfNeeded(context: vscode.ExtensionContext): void {
  const shown = context.globalState.get<boolean>(ONBOARDING_SHOWN_KEY);
  if (shown === true) return;
  const token = getOrCreatePairingToken(context);
  showPairingPanel(context, token);
  void context.globalState.update(ONBOARDING_SHOWN_KEY, true);
}

// Single shared webview used by both the first-run onboarding and the
// "Exportal: Show bridge pairing token" command. We keep a reference in
// a module-level variable (NOT on the ExtensionContext, which VS Code
// freezes and rejects new property assignments on). Re-invoking the
// command reveals the existing panel instead of stacking a second one.
let pairingPanel: vscode.WebviewPanel | undefined = undefined;

function showPairingPanel(context: vscode.ExtensionContext, token: string): void {
  if (pairingPanel !== undefined) {
    pairingPanel.reveal(vscode.ViewColumn.Active);
    return;
  }
  const panel = vscode.window.createWebviewPanel(
    'exportal.pairing',
    vscode.l10n.t('Exportal — pairing'),
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: false },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'icon.png');
  panel.webview.html = renderPairingHtml(panel.webview, token);
  panel.onDidDispose(() => { pairingPanel = undefined; });
  panel.webview.onDidReceiveMessage(async (msg: unknown) => {
    if (msg === null || typeof msg !== 'object') return;
    const type = (msg as { type?: unknown }).type;
    if (type === 'copy') {
      await vscode.env.clipboard.writeText(token);
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Exportal: token copied to clipboard.'),
      );
    } else if (type === 'pair-and-open') {
      // pairAndOpenChrome handles the QuickPick (claude.ai vs
      // chatgpt.com), the clipboard fallback, and the URL launch.
      // Deliberately NOT disposing the panel here — the user asked
      // that the pairing view stay open so they can retry if Chrome
      // didn't pick up the fragment, or copy the token manually. The
      // only explicit dismiss paths are the "Later" button and tab X.
      //
      // Threat note (kept local since it's policy-not-code): a
      // malicious link carrying someone else's token could overwrite
      // the user's pairing. Worst outcome is the next export failing
      // with "Invalid token" (our VS Code bridge has a different
      // token stored); no data leaks, no RCE. Users re-pair from
      // this panel.
      await pairAndOpenChrome(context, token);
    } else if (type === 'dismiss') {
      panel.dispose();
    } else if (type === 'open-sidebar') {
      // Reveals the Exportal activity-bar tab so the user can flip
      // the .jsonl toggle without hunting through Preferences UI.
      // The view-container id matches the `viewsContainers.activitybar[].id`
      // declared in package.json.
      await vscode.commands.executeCommand('workbench.view.extension.exportal');
    }
  });
  pairingPanel = panel;
}

function renderPairingHtml(webview: vscode.Webview, token: string): string {
  // Everything inline — no external fonts or scripts — so the webview
  // works offline and doesn't need a separate asset pipeline. CSP
  // follows the VS Code webview recipe: nonce-gated inline <script>
  // and locked-down resource origins.
  const nonce = randomNonce();
  const cspSource = webview.cspSource;
  const t = (key: string): string => escapeHtml(vscode.l10n.t(key));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>${t('Exportal — pairing')}</title>
<style>
  :root {
    color-scheme: dark;
    --exp-bg: #0a0b0d;
    --exp-surface: #111315;
    --exp-surface2: #181a1d;
    --exp-line: rgba(255,255,255,0.07);
    --exp-line-strong: rgba(255,255,255,0.13);
    --exp-text: #f2f3f0;
    --exp-text-dim: rgba(242,243,240,0.60);
    --exp-text-mute: rgba(242,243,240,0.36);
    --exp-accent: #d4ff3a;
    --exp-accent-hover: #e4ff5c;
    --exp-accent-ink: #0a0b0d;
    --exp-ok: #86efac;
    --exp-radius: 10px;
    --exp-radius-lg: 14px;
  }
  html, body { height: 100%; margin: 0; padding: 0; background: var(--exp-bg); color: var(--exp-text); font-family: 'Inter Tight', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased; }
  .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px 20px; box-sizing: border-box; }
  .card { position: relative; width: 100%; max-width: 520px; border-radius: var(--exp-radius-lg); overflow: hidden; background: var(--exp-surface); border: 1px solid var(--exp-line); box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
  .titlebar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--exp-surface2); border-bottom: 1px solid var(--exp-line); }
  .dots { display: flex; gap: 6px; }
  .dots span { width: 10px; height: 10px; border-radius: 5px; }
  .dots .r { background: #ed6a5e; } .dots .y { background: #f5bf4f; } .dots .g { background: #61c554; }
  .titlebar-text { margin-left: 8px; font-size: 11px; color: var(--exp-text-mute); }

  main { padding: 22px 24px; }
  .head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .mark { width: 32px; height: 32px; display: inline-flex; flex-shrink: 0; }
  .headline { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
  .subtitle { font-size: 11px; color: var(--exp-text-dim); margin: 2px 0 0; }

  .stepper { display: flex; align-items: center; gap: 6px; margin-bottom: 18px; font-size: 11px; color: var(--exp-text-dim); font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .stepper .line { flex: 1; height: 1px; background: var(--exp-line); margin: 0 4px; }
  .dot { width: 8px; height: 8px; border-radius: 4px; background: var(--exp-line-strong); display: inline-block; margin-right: 4px; }
  .dot.active { background: var(--exp-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--exp-accent) 20%, transparent); }

  .token-card { padding: 16px; border-radius: var(--exp-radius); background: var(--exp-surface2); border: 1px dashed var(--exp-line-strong); }
  .token-label { font-size: 11px; color: var(--exp-text-dim); margin-bottom: 8px; letter-spacing: 0.08em; text-transform: uppercase; }
  .token-row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--exp-surface); border-radius: 8px; border: 1px solid var(--exp-line); font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; color: var(--exp-text); letter-spacing: 0.02em; }
  .token-row .value { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .copy-btn { padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; background: var(--exp-accent); color: var(--exp-accent-ink); font-size: 10px; font-weight: 700; letter-spacing: 0.06em; font-family: inherit; text-transform: uppercase; transition: background 120ms ease; }
  .copy-btn:hover { background: var(--exp-accent-hover); }
  .copy-btn.copied { background: var(--exp-ok); color: var(--exp-accent-ink); }
  .token-hint { font-size: 11px; color: var(--exp-text-mute); margin-top: 10px; line-height: 1.5; }

  .actions { display: flex; gap: 8px; margin-top: 18px; justify-content: flex-end; }
  .actions button { padding: 9px 16px; border-radius: var(--exp-radius); font-size: 13px; font-weight: 600; cursor: pointer; letter-spacing: -0.01em; font-family: inherit; transition: background 120ms ease, color 120ms ease; }
  .actions .ghost { background: transparent; color: var(--exp-text-dim); border: 1px solid var(--exp-line); }
  .actions .ghost:hover { background: var(--exp-surface2); color: var(--exp-text); }
  .actions .primary { background: var(--exp-accent); color: var(--exp-accent-ink); border: none; display: inline-flex; align-items: center; gap: 8px; }
  .actions .primary:hover { background: var(--exp-accent-hover); }
  .actions .primary.flashed { background: var(--exp-ok); }
  .actions .primary:disabled { cursor: default; opacity: 0.85; }
  /* Success overlay — shown when the bridge receives Chrome's /ping.
   * Covers the token card + actions so the user sees the state change
   * even if they scrolled away from the buttons. */
  .success-overlay { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 12px; background: var(--exp-surface); border-radius: var(--exp-radius-lg); animation: expPop 320ms cubic-bezier(.2,1.2,.4,1) both; }
  .success-overlay.shown { display: flex; }
  .success-check { width: 52px; height: 52px; border-radius: 26px; background: var(--exp-accent); color: var(--exp-accent-ink); display: flex; align-items: center; justify-content: center; animation: expCheckIn 360ms cubic-bezier(.2,1.5,.3,1) both; }
  .success-headline { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: var(--exp-text); }
  .success-subtitle { font-size: 12px; color: var(--exp-text-dim); }
  @keyframes expPop { 0% { transform: scale(.96); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
  @keyframes expCheckIn { 0% { transform: scale(.4); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
  @keyframes expDraw { to { stroke-dashoffset: 0 } }

  /* Tip card: surfaces the new sidebar tab + .jsonl toggle so users
   * who close this panel without exploring still see the feature once. */
  .tip { display: flex; gap: 12px; align-items: flex-start; margin-top: 18px; padding: 12px 14px; border-radius: var(--exp-radius); background: var(--exp-surface2); border: 1px solid var(--exp-line); }
  .tip-icon { flex-shrink: 0; width: 22px; height: 22px; border-radius: 11px; background: color-mix(in srgb, var(--exp-accent) 18%, transparent); color: var(--exp-accent); display: flex; align-items: center; justify-content: center; }
  .tip-body { flex: 1; min-width: 0; }
  .tip-headline { font-size: 12px; font-weight: 600; color: var(--exp-text); margin-bottom: 3px; letter-spacing: -0.01em; }
  .tip-text { font-size: 11px; color: var(--exp-text-dim); line-height: 1.5; }
  .tip-link { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; padding: 0; background: transparent; border: none; color: var(--exp-accent); font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit; letter-spacing: 0.02em; }
  .tip-link:hover { color: var(--exp-accent-hover); text-decoration: underline; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="titlebar">
      <div class="dots"><span class="r"></span><span class="y"></span><span class="g"></span></div>
      <div class="titlebar-text">Visual Studio Code</div>
    </div>
    <main>
      <div class="head">
        <span class="mark" aria-hidden="true">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="100" height="100" rx="28" fill="var(--exp-surface2)"/>
            <rect x="22" y="20" width="56" height="14" rx="2" fill="var(--exp-text)"/>
            <rect x="22" y="20" width="14" height="60" rx="2" fill="var(--exp-text)"/>
            <rect x="22" y="66" width="56" height="14" rx="2" fill="var(--exp-text)"/>
            <rect x="36" y="43" width="36" height="14" rx="2" fill="var(--exp-accent)"/>
            <path d="M 72 50 L 82 50" stroke="var(--exp-accent)" stroke-width="14" stroke-linecap="round"/>
          </svg>
        </span>
        <div>
          <h1 class="headline">${t('Connect your browser')}</h1>
          <div class="subtitle">${t('One step and you are exporting chats with a single click.')}</div>
        </div>
      </div>

      <div class="stepper">
        <span class="dot active"></span> VS Code
        <span class="line"></span>
        <span class="dot"></span> Chrome
        <span class="line"></span>
        <span class="dot"></span> ${t('Done')}
      </div>

      <div class="token-card">
        <div class="token-label">${t('Pairing token')}</div>
        <div class="token-row">
          <span class="value" id="token">${escapeHtml(token)}</span>
          <button class="copy-btn" id="copy">${t('COPY')}</button>
        </div>
        <div class="token-hint">${t('Copy it and paste it into the Exportal Companion options in Chrome. It stays on your machine — nothing is sent over the network.')}</div>
      </div>

      <div class="actions">
        <button class="ghost" id="dismiss">${t('Later')}</button>
        <button class="primary" id="pair-open"><span id="pair-open-label">${t('Copy and open Chrome')}</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6"/></svg></button>
      </div>

      <div class="tip">
        <div class="tip-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="4"/></svg>
        </div>
        <div class="tip-body">
          <div class="tip-headline">${t('New: also write .jsonl for /resume')}</div>
          <div class="tip-text">${t('Imported chats can appear in Claude Code’s /resume list. Toggle it from the Exportal tab in the activity bar.')}</div>
          <button class="tip-link" id="open-sidebar">${t('Open Exportal tab')} <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
        </div>
      </div>
    </main>
    <div class="success-overlay" id="success-overlay" aria-hidden="true">
      <div class="success-check">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5" style="stroke-dasharray:24;stroke-dashoffset:24;animation:expDraw 280ms 120ms cubic-bezier(.2,1,.4,1) forwards"/>
        </svg>
      </div>
      <div class="success-headline">${t('Paired with Chrome')}</div>
      <div class="success-subtitle">${t('You can export chats with a single click now.')}</div>
    </div>
  </div>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  function flashCopied(btn, label) {
    const original = btn.textContent;
    btn.textContent = label;
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1400);
  }
  const copiedLabel = ${JSON.stringify(vscode.l10n.t('COPIED'))};
  const openedLabel = ${JSON.stringify(vscode.l10n.t('Opening Chrome…'))};
  document.getElementById('copy').addEventListener('click', (e) => {
    vscode.postMessage({ type: 'copy' });
    flashCopied(e.currentTarget, copiedLabel);
  });
  document.getElementById('pair-open').addEventListener('click', (e) => {
    // Host copies + opens claude.ai with the pairing fragment. It
    // does NOT dispose the panel — if Chrome doesn't pick up the
    // fragment (e.g. default browser isn't Chrome, or the Companion
    // is out of date), the user can retry without reopening this view.
    const btn = e.currentTarget;
    if (btn.disabled) return;
    const label = document.getElementById('pair-open-label');
    const original = label.textContent;
    vscode.postMessage({ type: 'pair-and-open' });
    label.textContent = openedLabel;
    btn.classList.add('flashed');
    btn.disabled = true;
    setTimeout(() => {
      label.textContent = original;
      btn.classList.remove('flashed');
      btn.disabled = false;
    }, 1800);
  });
  document.getElementById('dismiss').addEventListener('click', () => {
    vscode.postMessage({ type: 'dismiss' });
  });
  document.getElementById('open-sidebar').addEventListener('click', () => {
    vscode.postMessage({ type: 'open-sidebar' });
  });
  // Host posts { type: 'paired' } when Chrome's /ping hits the bridge.
  // We swap to the success overlay; the host will dispose the panel
  // shortly after, so no extra click is required from the user.
  window.addEventListener('message', (ev) => {
    if (ev.data?.type !== 'paired') return;
    const overlay = document.getElementById('success-overlay');
    if (overlay !== null) overlay.classList.add('shown');
  });
</script>
</body>
</html>`;
}

function randomNonce(): string {
  // 128 bits of entropy is plenty for a CSP nonce.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function importFromZipCommand(): Promise<void> {
  const zipUri = await pickZipFile();
  if (zipUri === undefined) return;
  await openConversationFromZip(zipUri.fsPath);
}

/**
 * Command: Importar .zip de ChatGPT (hito 21).
 *
 * Auto-attach to Claude Code is wired (the .md is universal). v1 does
 * not produce a .jsonl for `/resume` — the Anthropic envelope assumes
 * message/tool shapes ChatGPT doesn't natively map to.
 */
async function importFromChatGptZipCommand(): Promise<void> {
  const picks = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { 'ChatGPT export': ['zip'] },
    openLabel: vscode.l10n.t('Import'),
    title: vscode.l10n.t('Select the ZIP exported from ChatGPT'),
  });
  const zipUri = picks?.[0];
  if (zipUri === undefined) return;
  await openChatGptConversationFromZip(zipUri.fsPath);
}

/**
 * Inner half of the ChatGPT import flow. Reads the ZIP, picks a
 * conversation, formats it, and writes the .md. Used by the
 * file-picker command and by the panel's drag-drop handler.
 */
async function openChatGptConversationFromZip(zipPath: string): Promise<void> {
  let exported: Awaited<ReturnType<typeof readChatGptExport>>;
  try {
    exported = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('Exportal: reading ZIP...'),
        cancellable: false,
      },
      async () => readChatGptExport(zipPath),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(
      vscode.l10n.t('Exportal: could not read the ZIP. {0}', message),
    );
    throw err;
  }

  if (exported.conversations.length === 0) {
    await vscode.window.showInformationMessage(
      vscode.l10n.t('Exportal: the ZIP has no conversations.'),
    );
    return;
  }

  const picked = await pickChatGptConversation(exported.conversations);
  if (picked === undefined) return;

  const { markdown } = formatChatGptConversation(picked, { redact: true });

  const title = picked.title ?? vscode.l10n.t('(untitled)');
  const savedUri = await persistAndOpenMarkdown(title, markdown);
  void vscode.window.showInformationMessage(
    vscode.l10n.t('Exportal: "{0}" imported from ChatGPT.', title),
  );
  await attachToClaudeCodeIfAvailable(savedUri);
}

interface ChatGptConversationQuickPickItem extends vscode.QuickPickItem {
  readonly conversation: ChatGptConversation;
}

async function pickChatGptConversation(
  conversations: readonly ChatGptConversation[],
): Promise<ChatGptConversation | undefined> {
  const sorted = [...conversations].sort((a, b) => b.create_time - a.create_time);
  const items: ChatGptConversationQuickPickItem[] = sorted.map((conv) => {
    const id = conv.conversation_id ?? conv.id;
    return {
      label: conv.title ?? vscode.l10n.t('(untitled)'),
      description: new Date(conv.create_time * 1000).toISOString().slice(0, 10),
      ...(id !== undefined && { detail: id.slice(0, 8) }),
      conversation: conv,
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('Exportal — {0} conversations', String(conversations.length)),
    placeHolder: vscode.l10n.t('Pick a conversation to open as Markdown'),
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return selected?.conversation;
}

interface OpenOptions {
  /**
   * If true, re-throw after surfacing errors as notifications. Used by
   * the HTTP bridge path so the Chrome companion gets a proper 5xx
   * status instead of a silent 200. The command path leaves this false
   * — user already sees the error in VS Code, no caller to inform.
   */
  readonly rethrow?: boolean;
  /**
   * Conversation UUID extracted from the claude.ai URL at the moment
   * the user clicked "Enviar a VS Code". If set and a conversation with
   * that UUID is present in the export, we open it directly and skip
   * the QuickPick. A mismatch falls back to the normal picker — the
   * export is a point-in-time snapshot and may not include the latest
   * conversations.
   */
  readonly preferConversationId?: string;
}

async function openConversationFromZip(
  zipPath: string,
  options: OpenOptions = {},
): Promise<void> {
  let exported;
  try {
    exported = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('Exportal: reading ZIP...'),
        cancellable: false,
      },
      async () => readClaudeAiExport(zipPath),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(
      vscode.l10n.t('Exportal: could not read the ZIP. {0}', message),
    );
    if (options.rethrow) throw err;
    return;
  }

  for (const warning of exported.warnings) {
    // Non-blocking — warnings are soft errors (e.g. users.json missing).
    // We surface them so the user knows the export isn't 100% complete,
    // but we don't stop the flow.
    void vscode.window.showWarningMessage(vscode.l10n.t('Exportal: {0}', warning));
  }

  if (exported.conversations.length === 0) {
    await vscode.window.showInformationMessage(
      vscode.l10n.t('Exportal: the ZIP has no conversations.'),
    );
    return;
  }

  const preselected =
    options.preferConversationId === undefined
      ? undefined
      : exported.conversations.find((c) => c.uuid === options.preferConversationId);

  const picked = preselected ?? (await pickConversation(exported.conversations));
  if (picked === undefined) return;
  // Same scrub as the inline path — keeps both flows consistent.
  const conversation = stripUnsupportedBlockPlaceholders(picked);

  const { markdown } = formatConversation(conversation, { redact: true });

  const savedUri = await persistAndOpenMarkdown(conversation.name, markdown);
  announceImport(conversation);
  await maybeWriteClaudeCodeJsonl(conversation);
  await attachToClaudeCodeIfAvailable(savedUri);
}

async function pickZipFile(): Promise<vscode.Uri | undefined> {
  const candidates = await findRecentClaudeAiExports();
  if (candidates.length === 0) return handleNoNameMatches();
  if (candidates.length === 1) {
    const only = candidates[0]!;
    void vscode.window.showInformationMessage(
      vscode.l10n.t(
        'Exportal: importing {0} ({1} · {2})',
        only.filename,
        formatRelativeTime(only.mtime),
        only.folder,
      ),
    );
    return vscode.Uri.file(only.path);
  }
  return pickFromCandidates(candidates);
}

async function handleNoNameMatches(): Promise<vscode.Uri | undefined> {
  const contentScanAction = vscode.l10n.t('Scan .zip files by content');
  const browseAction = vscode.l10n.t('Choose file…');
  const action = await vscode.window.showInformationMessage(
    vscode.l10n.t(
      'Exportal: no claude.ai exports found in Downloads/Desktop. Scan all .zip files by content?',
    ),
    contentScanAction,
    browseAction,
  );
  if (action === browseAction) return showOpenDialog();
  if (action !== contentScanAction) return undefined;

  const found = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('Exportal: scanning .zip files by content...'),
      cancellable: false,
    },
    async () => scanZipsByContent(),
  );

  if (found.length === 0) {
    const next = await vscode.window.showInformationMessage(
      vscode.l10n.t('Exportal: no recent .zip contains claude.ai data.'),
      browseAction,
    );
    if (next === browseAction) return showOpenDialog();
    return undefined;
  }
  if (found.length === 1) {
    const only = found[0]!;
    void vscode.window.showInformationMessage(
      vscode.l10n.t('Exportal: {0} detected by content. Importing...', only.filename),
    );
    return vscode.Uri.file(only.path);
  }
  return pickFromCandidates(found);
}

async function showOpenDialog(): Promise<vscode.Uri | undefined> {
  const picks = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { 'claude.ai export': ['zip'] },
    openLabel: vscode.l10n.t('Import'),
    title: vscode.l10n.t('Select the ZIP exported from claude.ai'),
  });
  return picks?.[0];
}

const BROWSE_ITEM_ID = '__browse__';

interface ZipQuickPickItem extends vscode.QuickPickItem {
  readonly id: string;
}

async function pickFromCandidates(
  candidates: readonly ClaudeAiZipCandidate[],
): Promise<vscode.Uri | undefined> {
  const items: ZipQuickPickItem[] = candidates.map((c) => ({
    id: c.path,
    label: c.filename,
    description: `${formatRelativeTime(c.mtime)} · ${c.folder}`,
    detail: formatSize(c.sizeBytes),
  }));
  items.push({
    id: BROWSE_ITEM_ID,
    label: vscode.l10n.t('Choose a different file…'),
    description: vscode.l10n.t('Open the file picker'),
  });

  const selected = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('Exportal — {0} recent exports', String(candidates.length)),
    placeHolder: vscode.l10n.t('Pick a claude.ai ZIP'),
  });
  if (selected === undefined) return undefined;
  if (selected.id === BROWSE_ITEM_ID) return showOpenDialog();
  return vscode.Uri.file(selected.id);
}

interface ConversationQuickPickItem extends vscode.QuickPickItem {
  readonly conversation: ClaudeAiConversation;
}

async function pickConversation(
  conversations: readonly ClaudeAiConversation[],
): Promise<ClaudeAiConversation | undefined> {
  const sorted = [...conversations].sort(compareByCreatedDesc);
  const items: ConversationQuickPickItem[] = sorted.map((conv) => ({
    label: conv.name.length > 0 ? conv.name : vscode.l10n.t('(untitled)'),
    description: conv.created_at.slice(0, 10),
    detail: vscode.l10n.t(
      '{0} messages · {1}',
      String(conv.chat_messages.length),
      conv.uuid.slice(0, 8),
    ),
    conversation: conv,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('Exportal — {0} conversations', String(conversations.length)),
    placeHolder: vscode.l10n.t('Pick a conversation to open as Markdown'),
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return selected?.conversation;
}

function compareByCreatedDesc(a: ClaudeAiConversation, b: ClaudeAiConversation): number {
  if (a.created_at === b.created_at) return 0;
  return a.created_at < b.created_at ? 1 : -1;
}

/**
 * Writes the export to `<workspace>/.exportal/<timestamp>-<slug>.md` and
 * opens it. Falls back to an untitled document if there's no workspace
 * folder open — in that case Claude Code's @-mention won't resolve (it
 * needs a real file path), so the caller gets `undefined` back.
 *
 * Returns the URI of the saved file, or `undefined` if we fell back to
 * untitled. `attachToClaudeCodeIfAvailable` uses that to decide whether
 * to attempt the auto-attach.
 */
async function persistAndOpenMarkdown(
  conversationName: string,
  markdown: string,
  baseName?: string,
  assets: InlineAsset[] = [],
): Promise<vscode.Uri | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    // No workspace open: drop the .md to an untitled buffer and skip
    // assets entirely (they would have nowhere to live without a
    // workspace root). The header in the markdown still mentions
    // them for visibility — the user just won't get the files.
    const doc = await vscode.workspace.openTextDocument({
      content: markdown,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: false });
    return undefined;
  }

  const dir = vscode.Uri.joinPath(folder.uri, '.exportal');
  const finalBase = baseName ?? `${buildExportTimestamp()}-${slugify(conversationName)}`;
  const fileUri = vscode.Uri.joinPath(dir, `${finalBase}.md`);

  await vscode.workspace.fs.createDirectory(dir);
  await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(markdown));

  if (assets.length > 0) {
    const assetsDir = vscode.Uri.joinPath(dir, finalBase);
    await vscode.workspace.fs.createDirectory(assetsDir);
    for (const asset of assets) {
      await writeInlineAsset(assetsDir, asset);
    }
  }

  const doc = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(doc, { preview: false });
  return fileUri;
}

async function writeInlineAsset(dir: vscode.Uri, asset: InlineAsset): Promise<void> {
  const safe = sanitizeAssetFilename(asset.filename);
  if (safe === undefined) return; // defensive: drop instead of throwing
  let bytes: Buffer;
  try {
    bytes = Buffer.from(asset.content, 'base64');
  } catch {
    return;
  }
  // Re-create intermediate directories if the filename includes them
  // (e.g. "components/foo.jsx"). joinPath handles the encoding.
  const parts = safe.split('/');
  if (parts.length > 1) {
    const parentDir = vscode.Uri.joinPath(dir, ...parts.slice(0, -1));
    await vscode.workspace.fs.createDirectory(parentDir);
  }
  const fileUri = vscode.Uri.joinPath(dir, ...parts);
  await vscode.workspace.fs.writeFile(fileUri, new Uint8Array(bytes));
}

// Defense-in-depth: assets come from a Chrome companion that we
// authenticate via Bearer, but the bridge is still a trust boundary
// and `vscode.workspace.fs` will happily write to any path the URI
// resolves to. Reject any filename that could escape the sibling
// directory.
function sanitizeAssetFilename(filename: string): string | undefined {
  if (filename.length === 0) return undefined;
  if (filename.includes('\0')) return undefined;
  if (filename.startsWith('/')) return undefined;
  if (/^[a-zA-Z]:[\\/]/.test(filename)) return undefined; // Windows absolute
  // Normalize to forward slashes; reject `..` and `.` segments.
  const normalized = filename.replace(/\\/g, '/');
  for (const segment of normalized.split('/')) {
    if (segment === '..' || segment === '.' || segment.length === 0) return undefined;
  }
  return normalized;
}

/**
 * Optionally write a Claude Code-compatible `.jsonl` next to the .md
 * (Hito 19). Gated by `exportal.alsoWriteJsonl` (default off because
 * the .jsonl format is reverse-engineered and may break across
 * Claude Code versions).
 *
 * Fails soft: any error here logs a warning and returns. The .md
 * write already succeeded by the time this runs, so the user keeps
 * the working export even if the .jsonl path explodes.
 */
async function maybeWriteClaudeCodeJsonl(
  conversation: ClaudeAiConversation,
): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration('exportal')
    .get<boolean>('alsoWriteJsonl', false);
  if (!enabled) return;

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) return; // no workspace, no project dir to target

  const cwd = folder.uri.fsPath;
  const gitBranch = await detectGitBranch(cwd);
  const version = detectClaudeCodeVersion();

  const { jsonl, sessionId } = formatAsClaudeCodeJsonl(conversation, {
    cwd,
    gitBranch,
    version,
  });
  if (jsonl.length === 0) return; // empty conversation, nothing to write

  // ~/.claude/projects/<encoded>/<sessionId>.jsonl — the encoded
  // segment matches Claude Code's own naming so /resume picks it up.
  const projectsRoot = vscode.Uri.file(PROJECTS_DIR);
  const projectDir = vscode.Uri.joinPath(projectsRoot, encodeProjectDir(cwd));
  const fileUri = vscode.Uri.joinPath(projectDir, `${sessionId}.jsonl`);

  try {
    await vscode.workspace.fs.createDirectory(projectDir);
    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(jsonl));
    void vscode.window.showInformationMessage(
      vscode.l10n.t(
        'Exportal: also wrote {0} for /resume in Claude Code.',
        `${sessionId.slice(0, 8)}.jsonl`,
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Exportal: could not write .jsonl: ${message}`);
  }
}

// Best-effort git branch detection. Returns '' if git is missing,
// the directory isn't a repo, or any other failure — the .jsonl
// generator accepts an empty branch (real Claude Code sessions use
// the empty string when there's no branch context).
async function detectGitBranch(cwd: string): Promise<string> {
  try {
    const { execFile } = await import('node:child_process');
    return await new Promise<string>((resolve) => {
      execFile(
        'git',
        ['symbolic-ref', '--short', 'HEAD'],
        { cwd, timeout: 2000 },
        (err, stdout) => {
          if (err !== null) {
            resolve('');
            return;
          }
          resolve(stdout.trim());
        },
      );
    });
  } catch {
    return '';
  }
}

// Best-effort: probe a couple of likely Claude Code extension IDs and
// return its declared version. Falls back to a known-good baseline
// if the extension isn't installed or under a different ID — the
// version is mostly cosmetic in the .jsonl envelope, not load-bearing.
function detectClaudeCodeVersion(): string {
  const candidates = ['anthropic.claude-code', 'Anthropic.claude-code'];
  for (const id of candidates) {
    const ext = vscode.extensions.getExtension(id);
    if (ext === undefined) continue;
    // packageJSON is typed as `any` by VS Code; narrow defensively.
    const pkg: unknown = ext.packageJSON;
    if (pkg === null || typeof pkg !== 'object') continue;
    const v = (pkg as { version?: unknown }).version;
    if (typeof v === 'string' && v.length > 0) return v;
  }
  // Last seen on the test machine while reverse-engineering the
  // format. Anthropic doesn't publish a version-compat matrix; this
  // is a stable-looking fallback.
  return '2.1.114';
}

/**
 * If Claude Code for VS Code is installed and the user hasn't opted out,
 * open its sidebar and invoke its insert-@-mention command. Claude
 * Code's command reads from the active editor, so the caller must have
 * just `showTextDocument`'d the exported file.
 *
 * Fails soft for every path: Claude Code missing, command renamed in a
 * future version, setting disabled, no saved file. In each case the
 * user still has the Markdown open and can drag it into the chat
 * manually — same UX as before this auto-attach existed.
 */
async function attachToClaudeCodeIfAvailable(
  savedUri: vscode.Uri | undefined,
): Promise<void> {
  if (savedUri === undefined) return;
  const enabled = vscode.workspace
    .getConfiguration('exportal')
    .get<boolean>('autoAttachToClaudeCode', true);
  if (!enabled) return;

  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes('claude-vscode.insertAtMention')) return;

  try {
    if (commands.includes('claude-vscode.sidebar.open')) {
      await vscode.commands.executeCommand('claude-vscode.sidebar.open');
    }
    await vscode.commands.executeCommand('claude-vscode.insertAtMention');
  } catch {
    // Intentional swallow — see JSDoc. The user still has the .md open.
  }
}

// claude.ai quietly accepts very large messages but renders them poorly
// and occasionally rejects them silently. 150 KB is comfortably below
interface SendSessionTarget {
  readonly providerLabel: string;
  readonly newChatUrl: string;
  readonly fileSuffix: string;
}

const CLAUDE_AI_TARGET: SendSessionTarget = {
  providerLabel: 'claude.ai',
  newChatUrl: 'https://claude.ai/new',
  fileSuffix: 'cc-export',
};

const CHATGPT_TARGET: SendSessionTarget = {
  providerLabel: 'ChatGPT',
  newChatUrl: 'https://chatgpt.com/',
  fileSuffix: 'cc-export-chatgpt',
};

async function sendSessionToClaudeAiCommand(): Promise<void> {
  await sendSessionTo(CLAUDE_AI_TARGET);
}

async function sendSessionToChatGptCommand(): Promise<void> {
  await sendSessionTo(CHATGPT_TARGET);
}

/**
 * Shared flow for "send Claude Code session to <web AI>". Lists
 * sessions in the workspace's project dir, picks one, renders to
 * Markdown, saves to `.exportal/` (drag-and-drop fallback for the
 * web AI's textarea paste cap), copies to clipboard, and opens
 * the target's new-chat URL.
 *
 * Both surfaces (paste and drag-drop) are manual: neither claude.ai
 * nor chatgpt.com have a public write API.
 */
async function sendSessionTo(target: SendSessionTarget): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    await vscode.window.showInformationMessage(
      vscode.l10n.t(
        'Exportal: open a project folder first. Sessions are searched in the current cwd.',
      ),
    );
    return;
  }

  const projectDir = encodeProjectDir(folder.uri.fsPath);
  const files = await listSessionFiles(projectDir);
  if (files.length === 0) {
    await vscode.window.showInformationMessage(
      vscode.l10n.t(
        'Exportal: no Claude Code sessions found for this project. Open Claude Code and make sure at least one chat is saved.',
      ),
    );
    return;
  }

  const metas = await Promise.all(files.map(async (f) => describeSession(f)));
  // Auto-pick the most recently active session (file mtime). When the
  // user has Claude Code open and clicks "Send to claude.ai/ChatGPT",
  // they almost always mean "this conversation I'm in right now". The
  // QuickPick was confusing when several sessions shared a title (a
  // common artifact of compaction). Power users can still hit
  // Ctrl+Shift+P → palette and pick a specific session via the future
  // "Send specific session…" command if we add one.
  const metadata = pickMostRecentSession(metas);
  if (metadata === undefined) return;

  let markdown: string;
  try {
    const events = await readJsonl(metadata.filePath);
    const formatted = formatAsMarkdown(events, metadata, { redact: true });
    markdown = formatted.markdown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(
      vscode.l10n.t('Exportal: could not read the session. {0}', message),
    );
    return;
  }

  const sessionTitle =
    metadata.customTitle ??
    metadata.aiTitle ??
    metadata.firstUserText ??
    `cc-session-${metadata.sessionId.slice(0, 8)}`;
  const baseName = `${buildExportTimestamp()}-${slugify(sessionTitle)}-${target.fileSuffix}`;
  const savedUri = await persistAndOpenMarkdown(sessionTitle, markdown, baseName);

  await vscode.env.clipboard.writeText(markdown);
  await vscode.env.openExternal(vscode.Uri.parse(target.newChatUrl));

  const sizeBytes = Buffer.byteLength(markdown, 'utf8');
  const looksLarge = sizeBytes > 100_000;
  const revealLabel = vscode.l10n.t('Reveal file');
  const message = looksLarge
    ? vscode.l10n.t(
        'Exportal: "{0}" is {1} KB — paste may truncate. Drag the saved .md into {2} instead.',
        sessionTitle,
        (sizeBytes / 1024).toFixed(0),
        target.providerLabel,
      )
    : vscode.l10n.t(
        'Exportal: "{0}" copied and saved. Paste with Ctrl+V into {1}, or drag the .md if the paste fails.',
        sessionTitle,
        target.providerLabel,
      );
  const action = savedUri !== undefined
    ? await vscode.window.showInformationMessage(message, revealLabel)
    : await vscode.window.showInformationMessage(message);
  if (action === revealLabel && savedUri !== undefined) {
    await vscode.commands.executeCommand('revealFileInOS', savedUri);
  }
}

function pickMostRecentSession(
  metas: readonly SessionMetadata[],
): SessionMetadata | undefined {
  if (metas.length === 0) return undefined;
  return [...metas].sort(compareSessionsByLastActiveDesc)[0];
}

function compareSessionsByLastActiveDesc(a: SessionMetadata, b: SessionMetadata): number {
  // Fall back to startedAt when lastActiveAt is missing (very fresh
  // sessions just created may not have a stat result yet).
  const ax = a.lastActiveAt?.getTime() ?? new Date(a.startedAt ?? 0).getTime();
  const bx = b.lastActiveAt?.getTime() ?? new Date(b.startedAt ?? 0).getTime();
  if (ax === bx) return 0;
  return ax < bx ? 1 : -1;
}
