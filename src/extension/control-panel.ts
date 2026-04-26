import { watch, type FSWatcher } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import * as vscode from 'vscode';

import {
  findRecentExportsByProvider,
  formatRelativeTime,
  type ExportCandidate,
  type ExportProvider,
} from './zip-finder.js';

/**
 * Side-panel control surface for Exportal (`view: exportal.controlPanel`).
 *
 * Layout (Hito 29, Variante B — directional rows):
 *   1. Settings — two toggles (autoAttach, alsoJsonl).
 *   2. Importar al workspace — section with one provider row per
 *      supported AI (claude.ai, ChatGPT, Gemini placeholder).
 *   3. Exportar la sesión actual — same shape, opposite direction.
 *   4. Bridge status — clickable row that expands to show endpoint,
 *      pairing token, and rotate/logs actions.
 *   5. Footer — version + docs/changelog links.
 *
 * Provider rows are direction-aware: import rows show
 * `cloud-download`, export rows show `cloud-upload`. Disabled rows
 * (Gemini for now) render with a "soon" badge.
 *
 * This is Capa 1 of the redesign: layout + bridge expansion + new
 * sendSessionToChatGpt entry. The richer states (drag-drop, working
 * with progress, success metrics, error retry) and the dynamic
 * SessionChip on export rows arrive in subsequent capas.
 */

interface Provider {
  readonly id: string;
  readonly label: string;
  readonly glyph: string;
  readonly color: string;
  readonly importCmd?: string;
  readonly exportCmd?: string;
  readonly disabled?: boolean;
  readonly disabledHint?: string;
}

const PROVIDERS: readonly Provider[] = [
  {
    id: 'claude',
    label: 'claude.ai',
    glyph: 'C',
    color: '#C96442',
    importCmd: 'exportal.importFromZip',
    exportCmd: 'exportal.sendSessionToClaudeAi',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    glyph: 'G',
    color: '#10A37F',
    importCmd: 'exportal.importFromChatGptZip',
    exportCmd: 'exportal.sendSessionToChatGpt',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    glyph: 'g',
    color: '#4285F4',
    disabled: true,
    disabledHint: 'En camino · Q3 2026',
  },
];

/**
 * Callbacks the extension wires when constructing the panel.
 * Lets the panel kick off imports for dropped ZIPs without
 * importing extension.ts (would create a cycle).
 */
export interface PanelImportHandlers {
  readonly importClaudeZip: (filePath: string) => Promise<void>;
  readonly importChatGptZip: (filePath: string) => Promise<void>;
}

export class ExportalControlPanelProvider implements vscode.WebviewViewProvider {
  private readonly listeners: vscode.Disposable[] = [];
  private webviewView: vscode.WebviewView | undefined;
  private downloadWatchers: FSWatcher[] = [];
  private debounceTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly handlers: PanelImportHandlers,
  ) {
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
        this.stopDownloadWatching();
      },
    });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);
    void this.refreshDetectedZips();
    this.startDownloadWatching();
    this.listeners.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          this.startDownloadWatching();
          void this.refreshDetectedZips();
        } else {
          this.stopDownloadWatching();
        }
      }),
    );

    webviewView.webview.onDidReceiveMessage(async (msg: unknown) => {
      if (msg === null || typeof msg !== 'object') return;
      const m = msg as {
        type?: unknown;
        key?: unknown;
        value?: unknown;
        command?: unknown;
        provider?: unknown;
        filePath?: unknown;
      };
      if (m.type === 'toggleSetting'
          && typeof m.key === 'string'
          && typeof m.value === 'boolean') {
        await vscode.workspace
          .getConfiguration('exportal')
          .update(m.key, m.value, vscode.ConfigurationTarget.Global);
      } else if (m.type === 'runCommand' && typeof m.command === 'string') {
        await vscode.commands.executeCommand(m.command);
      } else if (m.type === 'copyToken') {
        const token = this.readToken();
        if (token !== undefined) {
          await vscode.env.clipboard.writeText(token);
          void vscode.window.showInformationMessage(
            vscode.l10n.t('Exportal: token copied to clipboard.'),
          );
        }
      } else if (m.type === 'rotateToken') {
        await this.context.globalState.update('exportal.pairingToken', undefined);
        this.refresh();
        void vscode.window.showInformationMessage(
          vscode.l10n.t(
            'Exportal: token rotated. Reload window for the bridge to accept the new token.',
          ),
        );
      } else if (m.type === 'openLogs') {
        await vscode.commands.executeCommand('workbench.action.output.toggleOutput');
      } else if (m.type === 'importDetectedZip'
          && typeof m.provider === 'string'
          && typeof m.filePath === 'string') {
        await this.runDetectedImport(m.provider, m.filePath);
      }
    });

    webviewView.onDidDispose(() => {
      this.webviewView = undefined;
      this.stopDownloadWatching();
    });
  }

  /**
   * Start fs.watch on Downloads/Desktop so the panel reflects new ZIPs
   * the moment they finish downloading. Only runs while the panel is
   * visible — otherwise we'd burn syscalls watching nothing useful.
   *
   * The 1.5s debounce handles two realities: (1) Chrome writes to
   * `Filename.crdownload` then renames to `.zip` on completion, so
   * we want to react to the rename, not in-flight writes; (2) fs.watch
   * on Windows fires multiple events per single write via
   * ReadDirectoryChangesW. The debounce coalesces both.
   */
  private startDownloadWatching(): void {
    if (this.downloadWatchers.length > 0) return; // already watching
    const folders = [
      join(homedir(), 'Downloads'),
      join(homedir(), 'Desktop'),
    ];
    for (const folder of folders) {
      try {
        const watcher = watch(folder, (_eventType, filename) => {
          if (!filename?.toLowerCase().endsWith('.zip')) return;
          this.scheduleRefresh();
        });
        watcher.on('error', () => { /* ignore — folder may be unmounted */ });
        this.downloadWatchers.push(watcher);
      } catch {
        // Folder doesn't exist or no permission — silently skip.
      }
    }
  }

  private stopDownloadWatching(): void {
    for (const w of this.downloadWatchers) {
      try { w.close(); } catch { /* already closed */ }
    }
    this.downloadWatchers = [];
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  private scheduleRefresh(): void {
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.refreshDetectedZips();
    }, 1500);
  }

  /**
   * Dispatches a detected ZIP (auto-found in Downloads/Desktop) to
   * the right importer and posts row state updates back to the
   * webview so the row visualises the working/done/error transitions.
   * Skips the file picker — the path is already known.
   */
  private async runDetectedImport(provider: string, filePath: string): Promise<void> {
    const handler =
      provider === 'claude' ? this.handlers.importClaudeZip
      : provider === 'chatgpt' ? this.handlers.importChatGptZip
      : undefined;
    if (handler === undefined) return;
    this.postRowState(provider, 'working');
    try {
      await handler(filePath);
      this.postRowState(provider, 'done');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.postRowState(provider, 'error', message);
    }
  }

  private postRowState(provider: string, state: 'idle' | 'working' | 'done' | 'error', message?: string): void {
    if (this.webviewView === undefined) return;
    void this.webviewView.webview.postMessage({ type: 'rowState', provider, state, message });
  }

  /**
   * Scan Downloads/Desktop for fresh export ZIPs (per provider) and
   * push the result into the webview. Cheap to call repeatedly: skips
   * ZIPs above the size cap and only opens those under it.
   *
   * Throttled by the caller via onDidChangeVisibility — re-runs only
   * when the panel becomes visible, so the user sees a fresh list
   * right when they switch to the tab.
   */
  private async refreshDetectedZips(): Promise<void> {
    if (this.webviewView === undefined) return;
    let zips: Partial<Record<ExportProvider, ExportCandidate>>;
    try {
      zips = await findRecentExportsByProvider();
    } catch {
      return;
    }
    if (this.webviewView === undefined) return; // disposed mid-scan
    const payload: Partial<Record<ExportProvider, { filename: string; folder: string; ageLabel: string; path: string }>> = {};
    for (const provider of Object.keys(zips) as ExportProvider[]) {
      const c = zips[provider];
      if (c === undefined) continue;
      payload[provider] = {
        filename: c.filename,
        folder: c.folder,
        ageLabel: formatRelativeTime(c.mtime),
        path: c.path,
      };
    }
    void this.webviewView.webview.postMessage({ type: 'detectedZips', zips: payload });
  }

  /** Public so extension.ts can nudge the panel after the bridge starts. */
  refresh(): void {
    if (this.webviewView === undefined) return;
    this.webviewView.webview.html = this.renderHtml(this.webviewView.webview);
  }

  private readToken(): string | undefined {
    return this.context.globalState.get<string>('exportal.pairingToken');
  }

  private renderHtml(webview: vscode.Webview): string {
    const cfg = vscode.workspace.getConfiguration('exportal');
    const autoAttach = cfg.get<boolean>('autoAttachToClaudeCode', true);
    const alsoJsonl = cfg.get<boolean>('alsoWriteJsonl', false);
    const cspSource = webview.cspSource;
    const nonce = randomNonce();
    const t = (key: string): string => escapeHtml(vscode.l10n.t(key));

    // Codicons are mirrored into assets/codicons/ at build time
    // (esbuild.config.mjs). The CSS file references codicon.ttf via a
    // relative URL that Resolves to assets/codicons/codicon.ttf — both
    // ship in the vsix.
    const codiconCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'assets', 'codicons', 'codicon.css',
      ),
    );

    const token = this.readToken() ?? '';
    const tokenDisplay = token.length > 0 ? token : '—';
    const pkg = this.context.extension.packageJSON as unknown;
    const version =
      pkg !== null && typeof pkg === 'object' && 'version' in pkg && typeof pkg.version === 'string'
        ? pkg.version
        : undefined;

    const importHint = vscode.l10n.t('Pick a .zip or drop one');
    const exportHint = vscode.l10n.t('Opens a new chat in your browser');
    const importRows = PROVIDERS
      .map((p) => providerRowHtml(p, 'in', importHint))
      .join('\n');
    const exportRows = PROVIDERS
      .map((p) => providerRowHtml(p, 'out', exportHint))
      .join('\n');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${codiconCssUri.toString()}"/>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    padding: 0;
    margin: 0;
  }
  .panel { display: flex; flex-direction: column; min-height: 100vh; }
  .scroll { flex: 1; overflow-y: auto; }

  /* Section header — small caps tag, low-key color */
  .section-h {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 14px 14px 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
    user-select: none;
  }
  .section-h .label { flex: 1; }

  /* Direction badge — colored chip with arrow icon */
  .dir-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px; height: 18px;
    border-radius: 4px;
  }
  .dir-badge.in {
    background: color-mix(in srgb, var(--vscode-testing-iconPassed) 20%, transparent);
    color: var(--vscode-testing-iconPassed);
  }
  .dir-badge.out {
    background: color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent);
    color: var(--vscode-focusBorder);
  }
  .dir-badge .codicon { font-size: 11px; }

  /* Toggle row */
  .toggle {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 14px;
    cursor: pointer;
    user-select: none;
  }
  .toggle:hover { background: var(--vscode-list-hoverBackground); }
  .toggle .body { flex: 1; min-width: 0; }
  .toggle .label { font-size: 13px; line-height: 1.3; }
  .toggle .desc {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 3px;
    line-height: 1.45;
  }
  .toggle .switch {
    width: 32px; height: 18px;
    border-radius: 9px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    position: relative;
    flex-shrink: 0;
    margin-top: 1px;
    transition: background 120ms ease;
  }
  .toggle .switch::after {
    content: '';
    position: absolute;
    top: 1px; left: 1px;
    width: 14px; height: 14px;
    border-radius: 7px;
    background: var(--vscode-foreground);
    opacity: 0.5;
    transition: transform 120ms ease, opacity 120ms ease;
  }
  .toggle[data-on="true"] .switch {
    background: var(--vscode-focusBorder);
    border-color: var(--vscode-focusBorder);
  }
  .toggle[data-on="true"] .switch::after {
    transform: translateX(14px);
    background: var(--vscode-button-foreground, white);
    opacity: 1;
  }

  /* Provider row — main building block of import/export sections */
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 8px 4px;
    padding: 8px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    cursor: pointer;
    transition: background 100ms ease, border-color 100ms ease;
    position: relative;
  }
  .row:not([data-disabled="true"]):hover {
    background: var(--vscode-list-hoverBackground);
  }
  .row:not([data-disabled="true"]):focus-visible {
    outline: none;
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-inactiveSelectionBackground);
  }
  .row[data-disabled="true"] {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* Async state visuals — set by extension after click triggers an
   * import. Drag-drop from outside VS Code is structurally blocked by
   * the workbench eating the events before they reach the webview, so
   * the import path is always click → file-picker (or detected ZIP). */
  .row[data-state="working"] {
    background: color-mix(in srgb, var(--vscode-foreground) 4%, transparent);
    cursor: wait;
  }
  .row[data-state="working"] .shimmer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(90deg,
      transparent,
      color-mix(in srgb, var(--vscode-focusBorder) 18%, transparent) 50%,
      transparent);
    background-size: 200% 100%;
    animation: panelShimmer 1.4s linear infinite;
    border-radius: inherit;
  }
  .row[data-state="done"] {
    border: 1px solid color-mix(in srgb, var(--vscode-testing-iconPassed) 50%, transparent);
    background: color-mix(in srgb, var(--vscode-testing-iconPassed) 10%, transparent);
  }
  .row[data-state="error"] {
    border: 1px solid color-mix(in srgb, var(--vscode-errorForeground) 50%, transparent);
    background: color-mix(in srgb, var(--vscode-errorForeground) 10%, transparent);
  }
  .row .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 1.5px solid color-mix(in srgb, var(--vscode-foreground) 25%, transparent);
    border-top-color: var(--vscode-focusBorder);
    border-radius: 50%;
    animation: panelSpin 0.9s linear infinite;
  }
  @keyframes panelShimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @keyframes panelSpin {
    to { transform: rotate(360deg); }
  }
  .row .mark {
    width: 20px; height: 20px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #FFFFFF;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: -0.04em;
    flex-shrink: 0;
    font-family: 'Inter Tight', system-ui, sans-serif;
  }
  .row .body { flex: 1; min-width: 0; }
  .row .name {
    font-size: 13px;
    color: var(--vscode-foreground);
    line-height: 1.2;
  }
  .row .hint {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
    line-height: 1.3;
  }
  .row .trail {
    color: var(--vscode-descriptionForeground);
    transition: color 100ms ease;
  }
  .row:not([data-disabled="true"]):hover .trail,
  .row:not([data-disabled="true"]):focus-visible .trail {
    color: var(--vscode-foreground);
  }
  .row .trail .codicon { font-size: 16px; }
  /* Detected ZIP sub-hint — appears under the provider label when
   * we found a fresh export in Downloads/Desktop. Click on the row
   * imports it directly without opening a file picker. */
  .row .detected {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-top: 3px;
    font-size: 10px;
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-testing-iconPassed);
  }
  .row .detected-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex-shrink: 1;
  }
  .row .detected-age {
    opacity: 0.7;
    flex-shrink: 0;
  }
  .row[data-detected-path] {
    background: color-mix(in srgb, var(--vscode-testing-iconPassed) 5%, transparent);
  }
  .row[data-detected-path]:hover {
    background: color-mix(in srgb, var(--vscode-testing-iconPassed) 12%, transparent);
  }

  .row .soon-badge {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family);
    padding: 2px 6px;
    border: 1px solid var(--vscode-input-border, var(--vscode-foreground));
    border-radius: 3px;
    opacity: 0.7;
  }

  /* Bridge status — clickable, expandable */
  .footer {
    margin-top: auto;
    border-top: 1px solid color-mix(in srgb, var(--vscode-foreground) 6%, transparent);
  }
  .bridge {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 14px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: none;
    cursor: pointer;
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    text-align: left;
  }
  .bridge:hover { background: var(--vscode-list-hoverBackground); }
  .bridge .dot {
    position: relative;
    width: 8px; height: 8px;
  }
  .bridge .dot::before {
    content: '';
    position: absolute; inset: 0;
    border-radius: 4px;
    background: var(--vscode-testing-iconPassed);
  }
  .bridge .dot::after {
    content: '';
    position: absolute; inset: -2px;
    border-radius: 6px;
    background: var(--vscode-testing-iconPassed);
    opacity: 0.4;
    animation: panelPulse 2s ease-in-out infinite;
  }
  .bridge .text { flex: 1; }
  .bridge .codicon { font-size: 12px; }

  .bridge-detail {
    padding: 4px 14px 12px;
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    background: color-mix(in srgb, var(--vscode-foreground) 4%, transparent);
    border-top: 1px solid color-mix(in srgb, var(--vscode-foreground) 4%, transparent);
    display: none;
  }
  .panel[data-bridge-open="true"] .bridge-detail { display: block; }
  .panel[data-bridge-open="true"] .bridge .codicon-chevron-up::before { content: "\\eab4"; }
  .detail-row { display: flex; gap: 8px; margin-top: 3px; }
  .detail-row .k { width: 60px; opacity: 0.6; }
  .detail-row .v {
    color: var(--vscode-foreground);
    opacity: 0.85;
    font-family: var(--vscode-editor-font-family);
    word-break: break-all;
  }
  .token-block {
    margin-top: 8px;
    padding: 6px 8px;
    background: var(--vscode-textCodeBlock-background);
    border-radius: 3px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .token-block code {
    flex: 1;
    color: var(--vscode-foreground);
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    letter-spacing: 0.05em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .token-block button,
  .small-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    border-radius: 3px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: none;
    cursor: pointer;
    font-size: 11px;
    font-family: var(--vscode-editor-font-family);
  }
  .token-block button:hover,
  .small-link:hover {
    background: var(--vscode-list-hoverBackground);
    color: var(--vscode-textLink-foreground);
  }
  .token-block button.copied { color: var(--vscode-testing-iconPassed); }
  .actions { display: flex; gap: 6px; margin-top: 8px; }
  .actions .codicon { font-size: 11px; }

  /* Footer extras — version line at the bottom */
  .extras {
    padding: 8px 14px 10px;
    font-family: var(--vscode-editor-font-family);
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    border-top: 1px solid color-mix(in srgb, var(--vscode-foreground) 4%, transparent);
  }
  .extras .meta { display: flex; gap: 10px; opacity: 0.6; }
  .extras .meta a {
    color: inherit;
    text-decoration: none;
    cursor: pointer;
  }
  .extras .meta a:hover { text-decoration: underline; }

  @keyframes panelPulse {
    0%, 100% { transform: scale(1); opacity: 0.4; }
    50% { transform: scale(1.6); opacity: 0; }
  }
</style>
</head>
<body>
<div class="panel" id="panel">

  <div class="scroll">

    <h2 class="section-h"><span class="label">${t('Settings')}</span></h2>

    <div class="toggle" data-on="${autoAttach ? 'true' : 'false'}" data-key="autoAttachToClaudeCode" tabindex="0">
      <div class="body">
        <div class="label">${t('Auto-attach to Claude Code')}</div>
        <div class="desc">${t('After importing a chat, attach the .md as an @-mention in the Claude Code panel.')}</div>
      </div>
      <div class="switch"></div>
    </div>

    <div class="toggle" data-on="${alsoJsonl ? 'true' : 'false'}" data-key="alsoWriteJsonl" tabindex="0">
      <div class="body">
        <div class="label">${t('Also write .jsonl for /resume')}</div>
        <div class="desc">${t('Write a Claude Code-compatible .jsonl alongside the .md so the chat appears in /resume. Experimental.')}</div>
      </div>
      <div class="switch"></div>
    </div>

    <h2 class="section-h">
      <span class="dir-badge in"><i class="codicon codicon-arrow-down"></i></span>
      <span class="label">${t('Import to workspace')}</span>
    </h2>
    ${importRows}

    <h2 class="section-h">
      <span class="dir-badge out"><i class="codicon codicon-arrow-up"></i></span>
      <span class="label">${t('Export current session')}</span>
    </h2>
    ${exportRows}

  </div>

  <div class="footer">
    <button class="bridge" id="bridge-toggle" type="button">
      <span class="dot"></span>
      <span class="text">bridge · listening</span>
      <i class="codicon codicon-chevron-up"></i>
    </button>
    <div class="bridge-detail">
      <div class="detail-row"><span class="k">status</span><span class="v">listening</span></div>
      <div class="detail-row"><span class="k">paired</span><span class="v">${tokenDisplay === '—' ? t('waiting for companion') : 'companion ready'}</span></div>
      <div class="token-block">
        <code id="token-display">${escapeHtml(tokenDisplay)}</code>
        <button id="copy-token" type="button" title="${t('Copy token')}">
          <i class="codicon codicon-copy"></i>
        </button>
      </div>
      <div class="actions">
        <button class="small-link" id="rotate-token" type="button">
          <i class="codicon codicon-key"></i><span>${t('Rotate token')}</span>
        </button>
        <button class="small-link" id="open-logs" type="button">
          <i class="codicon codicon-output"></i><span>${t('Logs')}</span>
        </button>
      </div>
    </div>
    <div class="extras">
      <div class="meta">
        <span>v${escapeHtml(version ?? '?')}</span>
        <span>·</span>
        <a id="docs-link">docs</a>
        <span>·</span>
        <a id="changelog-link">changelog</a>
      </div>
    </div>
  </div>

</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const panel = document.getElementById('panel');

  // Toggles
  for (const el of document.querySelectorAll('.toggle')) {
    const flip = () => {
      const key = el.getAttribute('data-key');
      const on = el.getAttribute('data-on') === 'true';
      const next = !on;
      el.setAttribute('data-on', String(next));
      vscode.postMessage({ type: 'toggleSetting', key, value: next });
    };
    el.addEventListener('click', flip);
    el.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    });
  }

  // Provider rows — both import and export. Click/Enter/Space:
  //   - on an import row WITH a detected zip → import that zip directly
  //     (no file picker), else fall back to the picker command.
  //   - on an export row → run the matching send command (always pick
  //     the most recent session, no UI in the way).
  for (const el of document.querySelectorAll('.row')) {
    if (el.getAttribute('data-disabled') === 'true') continue;
    const cmd = el.getAttribute('data-cmd');
    if (!cmd) continue;
    const fire = () => {
      const detectedPath = el.getAttribute('data-detected-path');
      const provider = el.getAttribute('data-provider');
      const direction = el.getAttribute('data-direction');
      if (direction === 'in' && detectedPath && provider) {
        vscode.postMessage({ type: 'importDetectedZip', provider, filePath: detectedPath });
      } else {
        vscode.postMessage({ type: 'runCommand', command: cmd });
      }
    };
    el.addEventListener('click', fire);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
    });
  }

  // Receive row state updates from the extension (working/done/error)
  // and detected ZIPs (auto-found in Downloads/Desktop).
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg) return;
    if (msg.type === 'rowState') {
      const row = document.querySelector('.row[data-direction="in"][data-provider="' + msg.provider + '"]');
      if (!row) return;
      if (msg.state === 'idle') {
        row.removeAttribute('data-state');
      } else {
        row.setAttribute('data-state', msg.state);
        if (msg.state === 'done' || msg.state === 'error') {
          const delay = msg.state === 'done' ? 2000 : 4500;
          setTimeout(() => {
            if (row.getAttribute('data-state') === msg.state) {
              row.removeAttribute('data-state');
            }
          }, delay);
        }
      }
    } else if (msg.type === 'detectedZips') {
      // Reset all import rows first so removed providers clear their hints.
      for (const r of document.querySelectorAll('.row[data-direction="in"]')) {
        r.removeAttribute('data-detected-path');
        const det = r.querySelector('.detected');
        if (det) det.remove();
      }
      const zips = msg.zips || {};
      for (const provider of Object.keys(zips)) {
        const z = zips[provider];
        if (!z) continue;
        const row = document.querySelector('.row[data-direction="in"][data-provider="' + provider + '"]');
        if (!row || row.getAttribute('data-disabled') === 'true') continue;
        row.setAttribute('data-detected-path', z.path);
        const body = row.querySelector('.body');
        if (!body) continue;
        const div = document.createElement('div');
        div.className = 'detected';
        const filename = document.createElement('span');
        filename.className = 'detected-name';
        filename.textContent = z.filename;
        const age = document.createElement('span');
        age.className = 'detected-age';
        age.textContent = '· ' + z.ageLabel;
        div.appendChild(filename);
        div.appendChild(age);
        body.appendChild(div);
      }
    }
  });

  // Bridge expand toggle (client-side state)
  document.getElementById('bridge-toggle').addEventListener('click', () => {
    const open = panel.getAttribute('data-bridge-open') === 'true';
    panel.setAttribute('data-bridge-open', String(!open));
  });

  // Token actions
  const copyBtn = document.getElementById('copy-token');
  copyBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'copyToken' });
    copyBtn.classList.add('copied');
    const icon = copyBtn.querySelector('.codicon');
    icon.classList.remove('codicon-copy');
    icon.classList.add('codicon-check');
    setTimeout(() => {
      copyBtn.classList.remove('copied');
      icon.classList.remove('codicon-check');
      icon.classList.add('codicon-copy');
    }, 1400);
  });
  document.getElementById('rotate-token').addEventListener('click', () => {
    vscode.postMessage({ type: 'rotateToken' });
  });
  document.getElementById('open-logs').addEventListener('click', () => {
    vscode.postMessage({ type: 'openLogs' });
  });
</script>
</body>
</html>`;
  }
}

/**
 * One row inside the Importar/Exportar section. Direction-aware: `in`
 * uses cloud-download + the provider's importCmd, `out` uses
 * cloud-upload + the provider's exportCmd. Disabled providers
 * render with a "soon" badge instead of an action icon and the
 * row swallows clicks.
 */
function providerRowHtml(p: Provider, direction: 'in' | 'out', defaultHint: string): string {
  const cmd = direction === 'in' ? p.importCmd : p.exportCmd;
  const disabled = p.disabled === true || cmd === undefined;
  const hint = p.disabledHint ?? defaultHint;
  const trail = disabled
    ? `<span class="soon-badge">soon</span>`
    : `<i class="codicon codicon-cloud-${direction === 'in' ? 'download' : 'upload'} trail-icon"></i>`;
  const cmdAttr = cmd !== undefined ? ` data-cmd="${escapeHtml(cmd)}"` : '';
  const tabindex = disabled ? '' : ' tabindex="0"';
  // data-direction lets the drag-drop JS quickly filter which rows
  // accept drops (only `in`). data-provider lets the dispatcher post
  // back row state to the right element when the import settles.
  const directionAttr = ` data-direction="${direction}"`;
  const providerAttr = ` data-provider="${escapeHtml(p.id)}"`;
  return `
    <div class="row" data-disabled="${disabled ? 'true' : 'false'}"${cmdAttr}${directionAttr}${providerAttr}${tabindex} role="button">
      <span class="shimmer"></span>
      <div class="mark" style="background:${p.color}">${escapeHtml(p.glyph)}</div>
      <div class="body">
        <div class="name">${escapeHtml(p.label)}</div>
        <div class="hint">${escapeHtml(hint)}</div>
      </div>
      <div class="trail">${trail}</div>
    </div>`;
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
