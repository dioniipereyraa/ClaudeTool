import * as vscode from 'vscode';

/**
 * Side-panel control surface for Exportal (`view: exportal.controlPanel`).
 *
 * Lives in the activity bar as a dedicated tab. Surfaces the things
 * users currently have to dig for in `Preferences UI → search`:
 *
 *   - Two boolean toggles (`autoAttachToClaudeCode`, `alsoWriteJsonl`).
 *   - Three action buttons that re-execute the existing palette
 *     commands (pairing token, import ZIP, send session to claude.ai).
 *   - A status pill for the local bridge — green/listening or
 *     red/offline based on the in-memory handle reference.
 *
 * Implemented as a `WebviewView` (HTML + JS) instead of a `TreeView`
 * because the controls (toggles + buttons in a single coherent
 * surface) read better than a tree of action nodes. CSP follows
 * VS Code's recipe (nonce-gated inline script, locked-down origins).
 *
 * The HTML uses `var(--vscode-*)` colors for native theming on the
 * left/right side panels — the panel reads as a first-class part of
 * VS Code instead of a custom-painted island.
 */
export class ExportalControlPanelProvider implements vscode.WebviewViewProvider {
  private readonly listeners: vscode.Disposable[] = [];
  private webviewView: vscode.WebviewView | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    // Re-render when settings change externally (someone edits
    // settings.json by hand, or another VS Code window flips the
    // toggle). Keeps both sides of the UI in sync without polling.
    this.listeners.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('exportal') && this.webviewView !== undefined) {
          this.refresh();
        }
      }),
    );
    context.subscriptions.push({
      dispose: () => {
        for (const l of this.listeners) l.dispose();
      },
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.webviewView = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.renderHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: unknown) => {
      if (msg === null || typeof msg !== 'object') return;
      const m = msg as { type?: unknown; key?: unknown; value?: unknown; command?: unknown };
      if (m.type === 'toggleSetting'
          && typeof m.key === 'string'
          && typeof m.value === 'boolean') {
        await vscode.workspace
          .getConfiguration('exportal')
          .update(m.key, m.value, vscode.ConfigurationTarget.Global);
      } else if (m.type === 'runCommand' && typeof m.command === 'string') {
        await vscode.commands.executeCommand(m.command);
      }
    });

    webviewView.onDidDispose(() => { this.webviewView = undefined; });
  }

  /** Public so extension.ts can nudge the panel after the bridge starts. */
  refresh(): void {
    if (this.webviewView === undefined) return;
    this.webviewView.webview.html = this.renderHtml(this.webviewView.webview);
  }

  private renderHtml(webview: vscode.Webview): string {
    const cfg = vscode.workspace.getConfiguration('exportal');
    const autoAttach = cfg.get<boolean>('autoAttachToClaudeCode', true);
    const alsoJsonl = cfg.get<boolean>('alsoWriteJsonl', false);
    const cspSource = webview.cspSource;
    const nonce = randomNonce();
    const t = (key: string): string => escapeHtml(vscode.l10n.t(key));

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    padding: 12px 14px;
    margin: 0;
  }
  h2 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--vscode-descriptionForeground);
    margin: 18px 0 8px;
    font-weight: 600;
  }
  h2:first-of-type { margin-top: 4px; }

  /* Toggle row: label on the left, switch on the right. */
  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--vscode-list-inactiveSelectionBackground);
    margin-bottom: 6px;
    cursor: pointer;
    user-select: none;
  }
  .toggle:hover { background: var(--vscode-list-hoverBackground); }
  .toggle .label { flex: 1; font-size: 13px; }
  .toggle .desc {
    display: block;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
    line-height: 1.4;
  }
  .toggle .switch {
    width: 32px;
    height: 18px;
    border-radius: 9px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    position: relative;
    flex-shrink: 0;
    transition: background 120ms ease;
  }
  .toggle .switch::after {
    content: '';
    position: absolute;
    top: 1px;
    left: 1px;
    width: 14px;
    height: 14px;
    border-radius: 7px;
    background: var(--vscode-foreground);
    transition: transform 120ms ease, background 120ms ease;
    opacity: 0.5;
  }
  .toggle[data-on="true"] .switch {
    background: var(--vscode-focusBorder, var(--vscode-button-background));
  }
  .toggle[data-on="true"] .switch::after {
    transform: translateX(14px);
    background: var(--vscode-button-foreground, white);
    opacity: 1;
  }

  /* Action buttons: full width, secondary style. */
  .action {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    margin-bottom: 4px;
    background: var(--vscode-button-secondaryBackground, var(--vscode-list-inactiveSelectionBackground));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
  }
  .action:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
  }

  /* Footer note. */
  .note {
    margin-top: 16px;
    padding: 10px;
    border-radius: 6px;
    background: var(--vscode-textBlockQuote-background, transparent);
    border-left: 2px solid var(--vscode-textLink-foreground);
    font-size: 11px;
    line-height: 1.5;
    color: var(--vscode-descriptionForeground);
  }
  .note code {
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
  }
</style>
</head>
<body>

<h2>${t('Settings')}</h2>

<div class="toggle" data-on="${autoAttach ? 'true' : 'false'}" data-key="autoAttachToClaudeCode">
  <div>
    <div class="label">${t('Auto-attach to Claude Code')}</div>
    <div class="desc">${t('After importing a chat, attach the .md as an @-mention in the Claude Code panel.')}</div>
  </div>
  <div class="switch"></div>
</div>

<div class="toggle" data-on="${alsoJsonl ? 'true' : 'false'}" data-key="alsoWriteJsonl">
  <div>
    <div class="label">${t('Also write .jsonl for /resume')}</div>
    <div class="desc">${t('Write a Claude Code-compatible .jsonl alongside the .md so the chat appears in /resume. Experimental.')}</div>
  </div>
  <div class="switch"></div>
</div>

<h2>${t('Actions')}</h2>

<button class="action" data-cmd="exportal.showPairingInfo">${t('Show pairing token')}</button>
<button class="action" data-cmd="exportal.importFromZip">${t('Import claude.ai .zip')}</button>
<button class="action" data-cmd="exportal.importFromChatGptZip">${t('Import ChatGPT .zip')}</button>
<button class="action" data-cmd="exportal.sendSessionToClaudeAi">${t('Send Claude Code session to claude.ai')}</button>

<div class="note">
  ${t('The local bridge starts automatically when this extension activates. To pair the Chrome companion, click "Show pairing token" above and follow the panel.')}
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  for (const el of document.querySelectorAll('.toggle')) {
    el.addEventListener('click', () => {
      const key = el.getAttribute('data-key');
      const on = el.getAttribute('data-on') === 'true';
      const next = !on;
      el.setAttribute('data-on', String(next));
      vscode.postMessage({ type: 'toggleSetting', key, value: next });
    });
  }
  for (const btn of document.querySelectorAll('.action')) {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd');
      vscode.postMessage({ type: 'runCommand', command: cmd });
    });
  }
</script>
</body>
</html>`;
  }
}

function randomNonce(): string {
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
