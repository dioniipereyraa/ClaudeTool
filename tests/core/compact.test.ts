import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  findLatestCompactBoundaryIndex,
  isCompactBoundary,
  isCompactSummaryUser,
  skipBeforeLatestCompact,
} from '../../src/core/compact.js';
import { readJsonl } from '../../src/core/reader.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', 'fixtures', 'with-compact.jsonl');
const MINIMAL = join(here, '..', 'fixtures', 'minimal.jsonl');

describe('compact helpers', () => {
  it('identifies compact_boundary and compact summary user events', async () => {
    const events = await readJsonl(FIXTURE);
    const boundaries = events.filter(isCompactBoundary);
    const summaries = events.filter(isCompactSummaryUser);
    expect(boundaries).toHaveLength(1);
    expect(summaries).toHaveLength(1);
    expect(boundaries[0]?.compactMetadata?.trigger).toBe('manual');
  });

  it('finds the latest compact boundary index', async () => {
    const events = await readJsonl(FIXTURE);
    const index = findLatestCompactBoundaryIndex(events);
    // fixture: user, assistant, boundary, summary, user, assistant → boundary is at index 2.
    expect(index).toBe(2);
  });

  it('returns -1 when there is no compact boundary', async () => {
    const events = await readJsonl(MINIMAL);
    expect(findLatestCompactBoundaryIndex(events)).toBe(-1);
  });

  it('skipBeforeLatestCompact keeps boundary onward', async () => {
    const events = await readJsonl(FIXTURE);
    const sliced = skipBeforeLatestCompact(events);
    expect(sliced).toHaveLength(4);
    expect(isCompactBoundary(sliced[0]!)).toBe(true);
  });

  it('skipBeforeLatestCompact returns a copy when no boundary present', async () => {
    const events = await readJsonl(MINIMAL);
    const sliced = skipBeforeLatestCompact(events);
    expect(sliced).toHaveLength(events.length);
    expect(sliced).not.toBe(events);
  });
});
