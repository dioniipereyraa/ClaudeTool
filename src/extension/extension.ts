import * as vscode from 'vscode';

import { formatConversation } from '../formatters/claudeai-markdown.js';
import { readClaudeAiExport } from '../importers/claudeai/reader.js';
import { type ClaudeAiConversation } from '../importers/claudeai/schema.js';

import {
  findRecentClaudeAiExports,
  formatRelativeTime,
  formatSize,
  scanZipsByContent,
  type ClaudeAiZipCandidate,
} from './zip-finder.js';

/**
 * Exportal — VS Code extension entry point.
 *
 * Thin wrapper over the already-tested core: `readClaudeAiExport` and
 * `formatConversation`. The extension exists to remove the five CLI
 * steps (find ZIP, remember command, type UUID, run, open editor) and
 * collapse them into: palette → file picker → quick pick → editor.
 *
 * Redaction is forced on here — there is deliberately no UI toggle.
 * Users who need raw output know where to find the CLI.
 */
export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    'exportal.importFromZip',
    importFromZipCommand,
  );
  context.subscriptions.push(disposable);

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.text = '$(cloud-download) Exportal';
  statusBar.tooltip = 'Importar conversación de claude.ai';
  statusBar.command = 'exportal.importFromZip';
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate(): void {
  // Nothing to clean up — all resources are tied to the command's
  // lifetime and VS Code disposes them via `context.subscriptions`.
}

async function importFromZipCommand(): Promise<void> {
  const zipUri = await pickZipFile();
  if (zipUri === undefined) return;

  let exported;
  try {
    exported = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Exportal: leyendo ZIP...',
        cancellable: false,
      },
      async () => readClaudeAiExport(zipUri.fsPath),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await vscode.window.showErrorMessage(`Exportal: no se pudo leer el ZIP. ${message}`);
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
