import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readJsonl } from '../../src/core/reader.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', 'fixtures', 'minimal.jsonl');

describe('readJsonl', () => {
  it('parses valid lines and skips malformed ones', async () => {
    const events = await readJsonl(FIXTURE);
    expect(events.length).toBeGreaterThan(0);
    const types = events.map((e) => (e as { type?: string }).type);
    expect(types).toContain('user');
    expect(types).toContain('assistant');
    expect(types).toContain('queue-operation');
    expect(types).not.toContain(undefined);
  });

  it('returns an empty array when the file is empty', async () => {
    const empty = join(here, '..', 'fixtures', 'empty.jsonl');
    await import('node:fs/promises').then((fs) => fs.writeFile(empty, ''));
    const events = await readJsonl(empty);
    expect(events).toEqual([]);
  });
});
