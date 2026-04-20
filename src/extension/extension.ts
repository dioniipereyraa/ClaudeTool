import * as vscode from 'vscode';

import { formatConversation } from '../formatters/claudeai-markdown.js';
import { readClaudeAiExport } from '../importers/claudeai/reader.js';
import {
  parseSingleConversation,
  type ClaudeAiConversation,
} from '../importers/claudeai/schema.js';

import {
  BridgeError,
  generateToken,
  startServer,
  type ImportInlinePayload,
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
const ONBOARDING_SHOWN_KEY = 'exportal.onboardingShown';

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

  // First-run onboarding: show a modal with the pairing token and
  // step-by-step instructions. Modal dialogs in VS Code stay on screen
  // until the user interacts with them — deliberate, so if the user is
  // distracted during install they still see it when they come back.
  void showOnboardingIfNeeded(context);
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
    });
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
  await openConversationFromZip(payload.zipPath, {
    rethrow: true,
    ...(payload.conversationId !== undefined && {
      preferConversationId: payload.conversationId,
    }),
  });
}

async function handleBridgeImportInline(payload: ImportInlinePayload): Promise<void> {
  // The Chrome companion scraped this directly from claude.ai's internal
  // conversation API, so the shape should match — but we re-validate here
  // because the bridge is a trust boundary. A specific BridgeError code
  // lets the companion show "Shape de claude.ai cambió" instead of a
  // generic "import failed", which is the likely cause when Anthropic
  // tweaks the internal API.
  const conversation = parseSingleConversation(payload.conversation);
  if (conversation === null) {
    throw new BridgeError('invalid_shape', 'conversation JSON did not match expected schema');
  }
  const { markdown } = formatConversation(conversation, { redact: true });
  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { preview: false });
  announceImport(conversation);
}

function announceImport(conversation: ClaudeAiConversation): void {
  // Toast after a successful import. The user often triggers the export
  // from Chrome with VS Code in the background; without this toast the
  // only confirmation is the new editor tab, which they may not see
  // until they switch windows. Includes the title so a user who fires
  // two exports back-to-back can tell them apart.
  const title = conversation.name.length > 0 ? conversation.name : '(sin título)';
  const count = conversation.chat_messages.length;
  void vscode.window.showInformationMessage(
    `Exportal: "${title}" — ${String(count)} mensajes importados`,
  );
}

async function showPairingInfoCommand(
  context: vscode.ExtensionContext,
): Promise<void> {
  const token = getOrCreatePairingToken(context);
  await showPairingModal(token, { firstRun: false });
  // After the user manually invokes this command, consider onboarding
  // done — they obviously know how to find the token now.
  void context.globalState.update(ONBOARDING_SHOWN_KEY, true);
}

async function showOnboardingIfNeeded(
  context: vscode.ExtensionContext,
): Promise<void> {
  const shown = context.globalState.get<boolean>(ONBOARDING_SHOWN_KEY);
  if (shown === true) return;
  const token = getOrCreatePairingToken(context);
  await showPairingModal(token, { firstRun: true });
  void context.globalState.update(ONBOARDING_SHOWN_KEY, true);
}

async function showPairingModal(
  token: string,
  { firstRun }: { firstRun: boolean },
): Promise<void> {
  // Modal dialogs in VS Code block the editor workspace until dismissed,
  // which is exactly what onboarding needs — the user cannot miss this
  // even if they tabbed away during install. The `detail` field renders
  // as multi-line prose, perfect for the step list + the token itself.
  const headline = firstRun
    ? 'Exportal está activo. Para exportar chats de claude.ai con un click, emparejá la extensión de Chrome con este token.'
    : 'Exportal — token de emparejamiento para la extensión de Chrome.';
  const detail =
    `TOKEN:\n${token}\n\n` +
    `PASOS:\n` +
    `1. Instalá la extensión "Exportal Companion" en Chrome.\n` +
    `2. Abrí chrome://extensions → "Detalles" de Exportal Companion → "Opciones de la extensión".\n` +
    `3. Pegá el token y guardá.\n\n` +
    `Podés volver a ver el token con Ctrl+Shift+P → "Exportal: Show bridge pairing token".`;

  const action = await vscode.window.showInformationMessage(
    headline,
    { modal: true, detail },
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

  const preselected =
    options.preferConversationId === undefined
      ? undefined
      : exported.conversations.find((c) => c.uuid === options.preferConversationId);

  const conversation = preselected ?? (await pickConversation(exported.conversations));
  if (conversation === undefined) return;

  const { markdown } = formatConversation(conversation, { redact: true });

  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { preview: false });
  announceImport(conversation);
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
