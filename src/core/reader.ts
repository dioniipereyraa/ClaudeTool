import { readFile } from 'node:fs/promises';

import { parseEvent } from './schema.js';
import { type Event } from './types.js';

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
 * Swap for a stream-based implementation when sessions grow past tens of MB.
 */
export async function readJsonl(path: string): Promise<Event[]> {
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
