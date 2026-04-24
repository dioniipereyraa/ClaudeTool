import { readFile } from 'node:fs/promises';

import JSZip from 'jszip';

import {
  parseConversations,
  type ChatGptConversation,
} from './schema.js';

/**
 * Shape of a ChatGPT export ZIP after parsing.
 *
 * The ZIP arrives by email after Settings → Data controls → Export.
 * Top-level layout (observed in mid-2024 exports — re-verify against
 * your real ZIP):
 *   - chat.html              (rendered viewer, ignored)
 *   - conversations.json     (the meat: array of conversations)
 *   - message_feedback.json  (likes/dislikes, ignored for now)
 *   - model_comparisons.json (A/B prompts, ignored)
 *   - user.json              (account email + id)
 *   - shared_conversations.json (links the user shared)
 *
 * We only need conversations.json for v1 of the importer.
 *
 * `conversations` is the only required field — the export is useless
 * without it. `warnings` carries non-fatal issues (unrecognised entries,
 * partial parse failures) so the UI can surface them without aborting.
 */
export interface ChatGptExport {
  readonly conversations: readonly ChatGptConversation[];
  readonly warnings: readonly string[];
}

const CONVERSATIONS_ENTRY = 'conversations.json';

/**
 * Open a ChatGPT export ZIP and return the parsed conversations.
 *
 * Strategy mirrors the claude.ai reader:
 *  - `conversations.json` missing or invalid → throw. Nothing
 *    downstream works without it.
 *  - Unrecognised entries → silently ignored (auxiliary files like
 *    `chat.html` are not interesting to us).
 *
 * The ZIP is loaded fully in memory. ChatGPT exports can be larger
 * than claude.ai's (years of history, no per-folder split), so this
 * may need streaming once we hit a real-world ceiling. Defer the
 * optimization until we see it.
 */
export async function readChatGptExport(zipPath: string): Promise<ChatGptExport> {
  const buf = await readFile(zipPath);
  const zip = await JSZip.loadAsync(buf);

  const conversationsFile = findEntry(zip, CONVERSATIONS_ENTRY);
  if (conversationsFile === undefined) {
    throw new Error(
      `ChatGPT export is missing ${CONVERSATIONS_ENTRY} — is this the right ZIP?`,
    );
  }

  const rawText = await conversationsFile.async('string');
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${CONVERSATIONS_ENTRY} is not valid JSON: ${message}`);
  }

  const conversations = parseConversations(raw);
  if (conversations === null) {
    throw new Error(
      `${CONVERSATIONS_ENTRY} did not match the expected ChatGPT export shape.`,
    );
  }

  return { conversations, warnings: [] };
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
