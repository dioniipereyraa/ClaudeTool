import { readFile, stat } from 'node:fs/promises';

import { parseEvent } from './schema.js';
import { type Event } from './types.js';

// Maximum .jsonl size we'll load into memory. Real Claude Code session
// files are at most a few MB; 200 MB is a defense-in-depth ceiling that
// catches bugs (e.g. another tool writing into ~/.claude/projects/) and
// pathological growth without rejecting any legitimate session.
const MAX_JSONL_BYTES = 200 * 1024 * 1024;

/**
 * Read a .jsonl file and return validated events.
 *
 * Fail-soft at two layers:
 *  1. JSON parse errors on a line → the line is skipped.
 *  2. Schema validation failures (unknown event types, missing fields) →
 *     `parseEvent` returns `null` and the event is skipped.
 *
 * Claude Code's .jsonl format is not officially documented, so being
 * defensive here keeps the tool useful across Claude Code versions and
 * across event types we don't yet model (e.g. `queue-operation`,
 * `attachment`, `ai-title`).
 *
 * Loads the whole file in memory — acceptable for typical session sizes.
 * A 200 MB ceiling enforced via `stat` keeps us from OOMing on a
 * pathological file. Swap for a stream-based implementation when
 * sessions legitimately grow past tens of MB.
 */
export async function readJsonl(path: string): Promise<Event[]> {
  let info;
  try {
    info = await stat(path);
  } catch {
    // Caller passed a path we can't stat — let readFile throw with the
    // canonical ENOENT/EACCES error, no need to invent a new one.
    info = undefined;
  }
  if (info !== undefined && info.size > MAX_JSONL_BYTES) {
    throw new Error(
      `JSONL file ${path} is ${(info.size / (1024 * 1024)).toFixed(1)} MB, ` +
        `over the ${(MAX_JSONL_BYTES / (1024 * 1024)).toFixed(0)} MB safety limit.`,
    );
  }

  const raw = await readFile(path, 'utf8');
  const events: Event[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const event = parseEvent(parsed);
    if (event !== null) events.push(event);
  }
  return events;
}
