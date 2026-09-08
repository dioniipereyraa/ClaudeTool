import { readFile, stat } from 'node:fs/promises';

import JSZip from 'jszip';

// Hard cap for the ZIP loaded into memory. Big ChatGPT accounts can
// run hundreds of MB but anything past 100 MB is almost certainly
// not a real export and would crash the extension host. The
// auto-discover path already caps at 50 MB; this is the file-picker
// safety net.
const MAX_ZIP_BYTES = 100 * 1024 * 1024;

import {
  parseConversationOrIssues,
  type ChatGptConversation,
} from './schema.js';

/**
 * Shape of a ChatGPT export ZIP after parsing.
 *
 * Two ZIP layouts have been observed in the wild:
 *
 * **Small accounts** (single-file form):
 *   - `chat.html`              (rendered viewer, ignored)
 *   - `conversations.json`     (top-level array)
 *   - `message_feedback.json`, `model_comparisons.json`,
 *     `user.json`, `shared_conversations.json` (auxiliary, ignored)
 *
 * **Big accounts** (chunked form, observed at 145 conversations):
 *   - `chat.html`
 *   - `conversations-000.json`, `conversations-001.json`, ... (split
 *     by size; each chunk is itself an array of conversations)
 *   - `export_manifest.json`   (lists `export_files` + `logical_files`)
 *   - `file-<id>-<name>.{jpeg,png,...}` (multimodal uploads)
 *
 * We merge the chunked form transparently — callers see a single flat
 * `conversations` array regardless of how the export was split.
 *
 * `warnings` carries non-fatal issues (e.g. one chunk failed to parse
 * but others succeeded) so the UI can surface them without aborting.
 */
export interface ChatGptExport {
  readonly conversations: readonly ChatGptConversation[];
  readonly warnings: readonly string[];
  /**
   * Email of the account that owns the export, from `user.json`
   * (issue #2). Undefined when the file is missing, malformed, or has
   * no `email` — never fatal: the file is auxiliary.
   */
  readonly accountEmail?: string;
}

const USER_FILE = 'user.json';

const SINGLE_FILE = 'conversations.json';
const CHUNK_PATTERN = /^conversations-\d+\.json$/i;

/**
 * Open a ChatGPT export ZIP and return the parsed conversations.
 *
 * Strategy:
 *  1. Look for `conversations.json` (small-account form). If present,
 *     parse it and we're done.
 *  2. Otherwise, look for `conversations-NNN.json` chunks (big-account
 *     form). Sort by name and concatenate.
 *  3. If neither exists → throw with a clear message.
 *
 * Per-chunk parse failures are non-fatal: the bad chunk is recorded
 * as a warning and the rest of the export still loads. A malformed
 * export with zero parseable chunks throws.
 *
 * The ZIP is loaded fully in memory. Big exports can hit hundreds of
 * MB; defer streaming until we see real-world OOMs.
 */
export async function readChatGptExport(zipPath: string): Promise<ChatGptExport> {
  const stats = await stat(zipPath);
  if (stats.size > MAX_ZIP_BYTES) {
    const mb = (stats.size / 1024 / 1024).toFixed(1);
    const cap = (MAX_ZIP_BYTES / 1024 / 1024).toFixed(0);
    throw new Error(
      `ChatGPT export is ${mb} MB which exceeds the ${cap} MB cap. Refusing to load to avoid crashing the extension host.`,
    );
  }
  const buf = await readFile(zipPath);
  const zip = await JSZip.loadAsync(buf);

  const dataFiles = findConversationFiles(zip);
  if (dataFiles.length === 0) {
    throw new Error(
      `ChatGPT export is missing ${SINGLE_FILE} (or conversations-NNN.json chunks) — is this the right ZIP?`,
    );
  }

  const conversations: ChatGptConversation[] = [];
  const warnings: string[] = [];
  let skippedConversations = 0;
  for (const file of dataFiles) {
    let raw: unknown;
    try {
      const text = await file.async('string');
      raw = JSON.parse(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to parse ${file.name}: ${message}`);
      continue;
    }
    if (!Array.isArray(raw)) {
      warnings.push(`${file.name} top-level was ${typeof raw}, expected array; skipped.`);
      continue;
    }
    // Parse each conversation independently — one bad shape can't
    // tank the chunk. Schema is a moving target (OpenAI changes
    // fields silently), so partial wins beat all-or-nothing.
    for (const item of raw) {
      const result = parseConversationOrIssues(item);
      if (result.ok) {
        conversations.push(result.value);
      } else {
        skippedConversations++;
      }
    }
  }

  if (skippedConversations > 0) {
    warnings.push(
      `Skipped ${skippedConversations} conversation(s) that didn't match the expected shape — they may use a newer ChatGPT format. The rest imported OK.`,
    );
  }

  if (conversations.length === 0) {
    throw new Error(
      `Could not parse any conversations from the export.${warnings.length > 0 ? ' ' + warnings.join(' / ') : ''}`,
    );
  }

  const accountEmail = await readAccountEmail(zip);
  return { conversations, warnings, ...(accountEmail !== undefined && { accountEmail }) };
}

/**
 * `user.json` is `{ id, email, chatgpt_plus_user, ... }`. Anything that
 * is not an object with a non-blank string `email` yields undefined.
 */
async function readAccountEmail(zip: JSZip): Promise<string | undefined> {
  const entry = findEntry(zip, USER_FILE);
  if (entry === undefined) return undefined;
  try {
    const raw: unknown = JSON.parse(await entry.async('string'));
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const email = (raw as { email?: unknown }).email;
    if (typeof email !== 'string') return undefined;
    const trimmed = email.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve which JSON file(s) inside the zip carry the conversation
 * data. Returns `[]` when neither single-file nor chunked layouts
 * are present.
 */
function findConversationFiles(zip: JSZip): JSZip.JSZipObject[] {
  const single = findEntry(zip, SINGLE_FILE);
  if (single !== undefined) return [single];
  const chunks: JSZip.JSZipObject[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const last = path.split('/').pop();
    if (last !== undefined && CHUNK_PATTERN.test(last)) {
      chunks.push(entry);
    }
  }
  // Sort by full path so `conversations-000.json` comes before
  // `conversations-001.json`, preserving the original split order.
  chunks.sort((a, b) => a.name.localeCompare(b.name));
  return chunks;
}

/**
 * Case-insensitive lookup that also tolerates ZIPs whose entries are
 * nested under a single top-level folder (e.g. `chatgpt-export/...`),
 * which some browsers add when the user re-zips the original.
 */
function findEntry(zip: JSZip, basename: string): JSZip.JSZipObject | undefined {
  const target = basename.toLowerCase();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const last = path.split('/').pop();
    if (last?.toLowerCase() === target) {
      return entry;
    }
  }
  return undefined;
}
