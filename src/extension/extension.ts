import * as vscode from 'vscode';

import { formatConversation } from '../formatters/claudeai-markdown.js';
import { readClaudeAiExport } from '../importers/claudeai/reader.js';
import { type ClaudeAiConversation } from '../importers/claudeai/schema.js';

import {
  generateToken,
  startServer,
  type ImportPayload,
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
  );

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.text = '$(cloud-download) Exportal';
  statusBar.tooltip = 'Importar conversación de claude.ai';
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
    return await startServer(token, (payload) => handleBridgeImport(payload));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showWarningMessage(
      `Exportal: no se pudo iniciar el puente local. ${message}`,
    );
    return undefined;
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
  await openConversationFromZip(payload.zipPath, { rethrow: true });
}

async function showPairingInfoCommand(
  context: vscode.ExtensionContext,
): Promise<void> {
  const token = getOrCreatePairingToken(context);
  // The Chrome companion probes ports 9317-9326; we don't need to tell
  // the user which one we landed on — but we do need to give them the
  // token so they can paste it into the extension's options page.
  const action = await vscode.window.showInformationMessage(
    'Exportal: copiá el token para emparejar la extensión de Chrome.',
    { modal: false },
    'Copiar token',
  );
  if (action === 'Copiar token') {
    await vscode.env.clipboard.writeText(token);
    void vscode.window.showInformationMessage('Exportal: token copiado al portapapeles.');
  }
}

async function importFromZipCommand(): Promise<void> {
  const zipUri = await pickZipFile();
  if (zipUri === undefined) return;
  await openConversationFromZip(zipUri.fsPath);
}

interface OpenOptions {
  /**
   * If true, re-throw after surfacing errors as notifications. Used by
   * the HTTP bridge path so the Chrome companion gets a proper 5xx
   * status instead of a silent 200. The command path leaves this false
   * — user already sees the error in VS Code, no caller to inform.
   */
  readonly rethrow?: boolean;
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
        title: 'Exportal: leyendo ZIP...',
        cancellable: false,
      },
      async () => readClaudeAiExport(zipPath),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(`Exportal: no se pudo leer el ZIP. ${message}`);
    if (options.rethrow) throw err;
    return;
  }

  for (const warning of exported.warnings) {
    // Non-blocking — warnings are soft errors (e.g. users.json missing).
    // We surface them so the user knows the export isn't 100% complete,
    // but we don't stop the flow.
    void vscode.window.showWarningMessage(`Exportal: ${warning}`);
  }

  if (exported.conversations.length === 0) {
    await vscode.window.showInformationMessage(
      'Exportal: el ZIP no contiene conversaciones.',
    );
    return;
  }

  const conversation = await pickConversation(exported.conversations);
  if (conversation === undefined) return;

  const { markdown } = formatConversation(conversation, { redact: true });

  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function pickZipFile(): Promise<vscode.Uri | undefined> {
  const candidates = await findRecentClaudeAiExports();
  if (candidates.length === 0) return handleNoNameMatches();
  if (candidates.length === 1) {
    const only = candidates[0]!;
    void vscode.window.showInformationMessage(
      `Exportal: importando ${only.filename} (${formatRelativeTime(only.mtime)} · ${only.folder})`,
    );
    return vscode.Uri.file(only.path);
  }
  return pickFromCandidates(candidates);
}

const CONTENT_SCAN_ACTION = 'Revisar .zip por contenido';
const BROWSE_ACTION = 'Elegir archivo…';

async function handleNoNameMatches(): Promise<vscode.Uri | undefined> {
  const action = await vscode.window.showInformationMessage(
    'Exportal: no encontré exports de claude.ai en Downloads/Desktop. ¿Revisar todos los .zip por contenido?',
    CONTENT_SCAN_ACTION,
    BROWSE_ACTION,
  );
  if (action === BROWSE_ACTION) return showOpenDialog();
  if (action !== CONTENT_SCAN_ACTION) return undefined;

  const found = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Exportal: revisando .zip por contenido...',
      cancellable: false,
    },
    async () => scanZipsByContent(),
  );

  if (found.length === 0) {
    const next = await vscode.window.showInformationMessage(
      'Exportal: ningún .zip reciente contiene datos de claude.ai.',
      BROWSE_ACTION,
    );
    if (next === BROWSE_ACTION) return showOpenDialog();
    return undefined;
  }
  if (found.length === 1) {
    const only = found[0]!;
    void vscode.window.showInformationMessage(
      `Exportal: ${only.filename} detectado por contenido. Importando...`,
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
    openLabel: 'Importar',
    title: 'Seleccioná el ZIP exportado desde claude.ai',
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
    label: 'Elegir otro archivo…',
    description: 'Abrir el selector de archivos',
  });

  const selected = await vscode.window.showQuickPick(items, {
    title: `Exportal — ${String(candidates.length)} exports recientes`,
    placeHolder: 'Elegí un ZIP de claude.ai',
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
    label: conv.name.length > 0 ? conv.name : '(untitled)',
    description: conv.created_at.slice(0, 10),
    detail: `${String(conv.chat_messages.length)} mensajes · ${conv.uuid.slice(0, 8)}`,
    conversation: conv,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    title: `Exportal — ${String(conversations.length)} conversaciones`,
    placeHolder: 'Elegí una conversación para abrir como Markdown',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return selected?.conversation;
}

function compareByCreatedDesc(a: ClaudeAiConversation, b: ClaudeAiConversation): number {
  if (a.created_at === b.created_at) return 0;
  return a.created_at < b.created_at ? 1 : -1;
}
