import { readFile } from 'node:fs/promises';

import JSZip from 'jszip';

import {
  parseConversations,
  parseMemories,
  parseProjects,
  parseUsers,
  type ClaudeAiConversation,
  type ClaudeAiMemory,
  type ClaudeAiProject,
  type ClaudeAiUserProfile,
} from './schema.js';

/**
 * Shape of a claude.ai "Export data" download after parsing.
 *
 * `conversations` is the only required field: the export is useless
 * without it, so a missing/malformed conversations.json aborts the read.
 * The rest are fail-soft — present when parseable, absent otherwise —
 * because an export may be trimmed or Anthropic may change those
 * auxiliary files independently.
 */
export interface ClaudeAiExport {
  readonly conversations: readonly ClaudeAiConversation[];
  readonly users?: readonly ClaudeAiUserProfile[];
  readonly memories?: readonly ClaudeAiMemory[];
  readonly projects?: readonly ClaudeAiProject[];
  readonly warnings: readonly string[];
}

const CONVERSATIONS_ENTRY = 'conversations.json';
const USERS_ENTRY = 'users.json';
const MEMORIES_ENTRY = 'memories.json';
const PROJECTS_ENTRY = 'projects.json';

/**
 * Open a claude.ai export ZIP and return the four parsed JSON payloads.
 *
 * Strategy:
 *  - `conversations.json` missing or invalid → throw. Nothing downstream
 *    works without it.
 *  - `users.json` / `memories.json` / `projects.json` missing or invalid
 *    → omitted from the result and reported via `warnings`. These files
 *    are auxiliary; a user might export only their conversations, and
 *    we want to stay useful in that case.
 *
 * The ZIP is loaded fully in memory. Typical exports are under a few MB
 * (most of the size is prose), so streaming buys little and complicates
 * the code. If that changes, swap for `jszip.loadAsync(stream)`.
 */
export async function readClaudeAiExport(zipPath: string): Promise<ClaudeAiExport> {
  const bytes = await readFile(zipPath);
  const zip = await JSZip.loadAsync(bytes);

  const warnings: string[] = [];

  const conversationsRaw = await readJsonEntry(zip, CONVERSATIONS_ENTRY);
  if (conversationsRaw === null) {
    throw new Error(
      `Invalid claude.ai export: ${CONVERSATIONS_ENTRY} is missing from ${zipPath}`,
    );
  }
  const conversations = parseConversations(conversationsRaw);
  if (conversations === null) {
    throw new Error(
      `Invalid claude.ai export: ${CONVERSATIONS_ENTRY} failed schema validation`,
    );
  }

  const users = await readOptional(zip, USERS_ENTRY, parseUsers, warnings);
  const memories = await readOptional(zip, MEMORIES_ENTRY, parseMemories, warnings);
  const projects = await readOptional(zip, PROJECTS_ENTRY, parseProjects, warnings);

  return {
    conversations,
    ...(users !== undefined && { users }),
    ...(memories !== undefined && { memories }),
    ...(projects !== undefined && { projects }),
    warnings,
  };
}

async function readJsonEntry(zip: JSZip, name: string): Promise<unknown> {
  const file = zip.file(name);
  if (file === null) return null;
  const text = await file.async('string');
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readOptional<T>(
  zip: JSZip,
  name: string,
  parser: (raw: unknown) => T[] | null,
  warnings: string[],
): Promise<readonly T[] | undefined> {
  const raw = await readJsonEntry(zip, name);
  if (raw === null) {
    warnings.push(`${name} missing or not valid JSON — skipped`);
    return undefined;
  }
  const parsed = parser(raw);
  if (parsed === null) {
    warnings.push(`${name} failed schema validation — skipped`);
    return undefined;
  }
  return parsed;
}
