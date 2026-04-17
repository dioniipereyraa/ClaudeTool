import { readFile } from 'node:fs/promises';

/**
 * Read a .jsonl file and return parsed events.
 *
 * Fail-soft: malformed lines are silently skipped rather than aborting the
 * read. Claude Code's .jsonl format is not officially documented, so being
 * defensive here keeps the tool useful across Claude Code versions.
 *
 * Loads the whole file in memory — acceptable for typical session sizes.
 * Swap for a stream-based implementation when sessions grow past tens of MB.
 */
export async function readJsonl(path: string): Promise<unknown[]> {
  const raw = await readFile(path, 'utf8');
  const events: unknown[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // skip malformed line
    }
  }
  return events;
}
