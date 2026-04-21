import * as vscode from 'vscode';

import { encodeProjectDir } from '../core/paths.js';
import { readJsonl } from '../core/reader.js';
import { describeSession, listSessionFiles } from '../core/session.js';
import { type SessionMetadata } from '../core/types.js';
import { formatConversation } from '../formatters/claudeai-markdown.js';
import { formatAsMarkdown } from '../formatters/markdown.js';
import { readClaudeAiExport } from '../importers/claudeai/reader.js';
import {
  parseSingleConversation,
  type ClaudeAiConversation,
} from '../importers/claudeai/schema.js';

import { buildExportTimestamp, slugify } from './export-paths.js';
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
    vscode.commands.registerCommand(
      'exportal.sendSessionToClaudeAi',
      sendSessionToClaudeAiCommand,
    ),
  );

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.text = '$(cloud-download) Exportal';
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
      vscode.l10n.t('Exportal: could not start the local bridge. {0}', message),
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
  const savedUri = await persistAndOpenMarkdown(conversation, markdown);
  announceImport(conversation);
  await attachToClaudeCodeIfAvailable(savedUri);
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
    ? vscode.l10n.t(
        'Exportal is active. To export claude.ai chats with one click, pair the Chrome extension with this token.',
      )
    : vscode.l10n.t('Exportal — pairing token for the Chrome extension.');
  const detail = [
    vscode.l10n.t('TOKEN:'),
    token,
    '',
    vscode.l10n.t('STEPS:'),
    vscode.l10n.t('1. Install the "Exportal Companion" extension in Chrome.'),
    vscode.l10n.t(
      '2. Open chrome://extensions → "Details" of Exportal Companion → "Extension options".',
    ),
    vscode.l10n.t('3. Paste the token and save.'),
    '',
    vscode.l10n.t(
      'Reopen this dialog with Ctrl+Shift+P → "Exportal: Show bridge pairing token".',
    ),
  ].join('\n');

  const copyTokenLabel = vscode.l10n.t('Copy token');
  const action = await vscode.window.showInformationMessage(
    headline,
    { modal: true, detail },
    copyTokenLabel,
  );
  if (action === copyTokenLabel) {
    await vscode.env.clipboard.writeText(token);
    void vscode.window.showInformationMessage(
      vscode.l10n.t('Exportal: token copied to clipboard.'),
    );
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

  const conversation = preselected ?? (await pickConversation(exported.conversations));
  if (conversation === undefined) return;

  const { markdown } = formatConversation(conversation, { redact: true });

  const savedUri = await persistAndOpenMarkdown(conversation, markdown);
  announceImport(conversation);
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
  conversation: ClaudeAiConversation,
  markdown: string,
): Promise<vscode.Uri | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    const doc = await vscode.workspace.openTextDocument({
      content: markdown,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: false });
    return undefined;
  }

  const dir = vscode.Uri.joinPath(folder.uri, '.exportal');
  const filename = `${buildExportTimestamp()}-${slugify(conversation.name)}.md`;
  const fileUri = vscode.Uri.joinPath(dir, filename);

  await vscode.workspace.fs.createDirectory(dir);
  await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(markdown));

  const doc = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(doc, { preview: false });
  return fileUri;
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
// that ceiling; above it, we warn the user before copying.
const CLAUDE_AI_SIZE_WARN_BYTES = 150_000;

/**
 * Hito 15 — send a Claude Code session to claude.ai.
 *
 * Lists sessions of the open workspace's cwd, lets the user pick one,
 * renders it as Markdown (redaction on, tool/thinking blocks off for
 * a pasteable payload), copies it to the clipboard and opens
 * claude.ai/new. The paste itself is manual because claude.ai has no
 * public write API — anything else would be lying to the user.
 */
async function sendSessionToClaudeAiCommand(): Promise<void> {
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
  const metadata = await pickSession(metas);
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

  const sizeBytes = Buffer.byteLength(markdown, 'utf8');
  if (sizeBytes > CLAUDE_AI_SIZE_WARN_BYTES) {
    const kb = (sizeBytes / 1024).toFixed(0);
    const copyAnywayLabel = vscode.l10n.t('Copy anyway');
    const proceed = await vscode.window.showWarningMessage(
      vscode.l10n.t(
        'Exportal: session size is {0} KB. Very long messages may be rejected or only partially rendered in claude.ai.',
        kb,
      ),
      { modal: true },
      copyAnywayLabel,
    );
    if (proceed !== copyAnywayLabel) return;
  }

  await vscode.env.clipboard.writeText(markdown);
  await vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/new'));
  void vscode.window.showInformationMessage(
    vscode.l10n.t(
      'Exportal: Markdown copied. Paste it with Ctrl+V into the new chat on claude.ai.',
    ),
  );
}

interface SessionQuickPickItem extends vscode.QuickPickItem {
  readonly metadata: SessionMetadata;
}

async function pickSession(
  metas: readonly SessionMetadata[],
): Promise<SessionMetadata | undefined> {
  const sorted = [...metas].sort(compareSessionsByStartedDesc);
  const items: SessionQuickPickItem[] = sorted.map((m) => ({
    label: m.firstUserText ?? vscode.l10n.t('(session with no user messages)'),
    description: m.startedAt?.slice(0, 10) ?? '????-??-??',
    detail: vscode.l10n.t('{0} turns · {1}', String(m.turnCount), m.sessionId.slice(0, 8)),
    metadata: m,
  }));
  const selected = await vscode.window.showQuickPick(items, {
    title: vscode.l10n.t('Exportal — {0} Claude Code sessions', String(metas.length)),
    placeHolder: vscode.l10n.t('Pick a session to send to claude.ai'),
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return selected?.metadata;
}

function compareSessionsByStartedDesc(a: SessionMetadata, b: SessionMetadata): number {
  const ax = a.startedAt ?? '';
  const bx = b.startedAt ?? '';
  if (ax === bx) return 0;
  return ax < bx ? 1 : -1;
}
