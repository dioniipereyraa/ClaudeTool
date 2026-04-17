import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readJsonl } from '../../src/core/reader.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', 'fixtures', 'minimal.jsonl');

describe('readJsonl', () => {
  it('parses valid lines, skips malformed ones, and drops unmodeled event types', async () => {
    const events = await readJsonl(FIXTURE);
    const types = events.map((e) => e.type);
    expect(types).toContain('user');
    expect(types).toContain('assistant');
    // queue-operation is not part of our discriminated union → dropped.
    expect(types).not.toContain('queue-operation' as unknown as (typeof types)[number]);
    // 2 users + 2 assistants in the fixture, malformed line and queue-operation discarded.
    expect(events.length).toBe(4);
  });

  it('returns an empty array when the file is empty', async () => {
    const empty = join(here, '..', 'fixtures', 'empty.jsonl');
    await import('node:fs/promises').then((fs) => fs.writeFile(empty, ''));
    const events = await readJsonl(empty);
    expect(events).toEqual([]);
  });
});
