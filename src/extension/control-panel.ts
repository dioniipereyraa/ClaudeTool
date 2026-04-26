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
  /** SVG `<path d="...">` for the brand mark, sized to a 24×24 viewBox. */
  readonly iconPath: string;
  readonly color: string;
  readonly importCmd?: string;
  readonly exportCmd?: string;
  readonly disabled?: boolean;
  readonly disabledHint?: string;
}

// Brand marks. Paths sourced from Simple Icons (CC0). Trademarks belong
// to their respective owners — used here as identifiers for the
// destination AI, no endorsement implied.
const CLAUDE_ICON =
  'M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.8l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.146-.103.018-.073-.164-.274-1.355-2.45-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 0 1-.104-.729L6.215.134 6.62 0l.978.134.41.357.607 1.388.984 2.19 1.525 2.974.446.881.237.815.09.25h.152V8.66l.123-1.566.228-1.924.222-2.476.078-.696.37-.898.732-.482.572.274.469.67-.066.434-.282 1.83-.555 2.882-.362 1.928h.21l.24-.24.97-1.287 1.628-2.035.717-.808.838-.892.539-.426h1.018l.749 1.116-.336 1.153-1.05 1.33-.872 1.128-1.25 1.68-.78 1.347.072.108.187-.018 2.835-.602 1.531-.278 1.827-.314.828.388.09.394-.327.806-1.964.484-2.305.464-3.435.811-.042.03.049.061 1.547.146.66.038h1.617l3.012.225.787.522.474.638-.078.484-1.214.62-1.638-.39-3.823-.91-1.31-.327h-.18v.108l1.092 1.067 2.001 1.807 2.504 2.328.127.578-.32.452-.34-.049-2.207-1.66-.851-.747-1.929-1.622h-.127v.169l.444.65 2.345 3.52.122 1.08-.17.353-.608.213-.667-.122-1.37-1.92-1.41-2.16-1.139-1.94-.139.08-.673 7.245-.316.37-.728.279-.605-.461-.32-.745.32-1.469.39-1.918.317-1.524.288-1.894.17-.628-.012-.042-.139.018-1.422 1.953-2.161 2.916-1.71 1.83-.41.163-.711-.367.066-.658.397-.586 2.359-3.001 1.421-1.857.918-1.074-.006-.157h-.054L4.502 18.62l-1.124.146-.483-.452.06-.741.228-.243z';
const CHATGPT_ICON =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.5093-2.6067-1.4997Z';
const GEMINI_ICON =
  'M11.04 19.32Q12 17.4 13.5 16.05t3.42-2.16q-1.92-.84-3.42-2.16T12 9.6q-.96 1.92-2.46 3.27t-3.42 2.16q1.92.84 3.42 2.16T11.04 19.32M12 24q-.96-3.36-2.46-5.94t-3.96-4.32q-2.46-1.74-5.58-2.7 3.12-.96 5.58-2.7t3.96-4.32T12 0q.96 3.36 2.46 5.94t3.96 4.32q2.46 1.74 5.58 2.7-3.12.96-5.58 2.7T14.46 18.06 12 24';

const PROVIDERS: readonly Provider[] = [
  {
    id: 'claude',
    label: 'claude.ai',
    iconPath: CLAUDE_ICON,
    color: '#C96442',
    importCmd: 'exportal.importFromZip',
    exportCmd: 'exportal.sendSessionToClaudeAi',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    iconPath: CHATGPT_ICON,
    color: '#10A37F',
    importCmd: 'exportal.importFromChatGptZip',
    exportCmd: 'exportal.sendSessionToChatGpt',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    iconPath: GEMINI_ICON,
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
      } else if (m.type === 'pairAndOpen') {
        // Mirrors the `pair-and-open` flow from showPairingPanel in
        // extension.ts: copy as fallback (default browser may not be
        // Chrome), then launch claude.ai with `#exportal-pair=<hex>`
        // so the Companion auto-pairs without a manual paste. See the
        // long comment in extension.ts for the URL construction
        // rationale (Uri.from over Uri.parse to keep the fragment
        // intact across VS Code builds).
        const token = this.readToken();
        if (token !== undefined) {
          await vscode.env.clipboard.writeText(token);
          const pairingUri = vscode.Uri.from({
            scheme: 'https',
            authority: 'claude.ai',
            path: '/',
            fragment: `exportal-pair=${token}`,
          });
          await vscode.env.openExternal(pairingUri);
          void vscode.window.showInformationMessage(
            vscode.l10n.t(
              'Exportal: opened claude.ai in your browser — pairing completes automatically if the Companion is installed.',
            ),
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
    flex-shrink: 0;
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
        <button id="pair-open-token" type="button" title="${t('Copy and open Chrome')}">
          <i class="codicon codicon-link-external"></i>
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
  const pairOpenBtn = document.getElementById('pair-open-token');
  pairOpenBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'pairAndOpen' });
    pairOpenBtn.classList.add('copied');
    const icon = pairOpenBtn.querySelector('.codicon');
    icon.classList.remove('codicon-link-external');
    icon.classList.add('codicon-check');
    setTimeout(() => {
      pairOpenBtn.classList.remove('copied');
      icon.classList.remove('codicon-check');
      icon.classList.add('codicon-link-external');
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
      <div class="mark" style="background:${p.color}">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="${p.iconPath}"/></svg>
      </div>
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
