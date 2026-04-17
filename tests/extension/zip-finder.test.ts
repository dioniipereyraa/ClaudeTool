import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findRecentClaudeAiExports,
  formatRelativeTime,
  formatSize,
} from '../../src/extension/zip-finder.js';

async function touch(path: string, mtime: Date): Promise<void> {
  await writeFile(path, 'zip-bytes');
  await utimes(path, mtime, mtime);
}

describe('findRecentClaudeAiExports', () => {
  let home: string;
  const now = new Date('2026-04-17T12:00:00Z');

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'exportal-home-'));
    await mkdir(join(home, 'Downloads'));
    await mkdir(join(home, 'Desktop'));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('returns empty array when no matching ZIPs exist', async () => {
    const result = await findRecentClaudeAiExports({ home, now });
    expect(result).toEqual([]);
  });

  it('finds a claude.ai ZIP in Downloads', async () => {
    await touch(join(home, 'Downloads', 'data-2026-04-15-10-00-00.zip'), new Date('2026-04-15T10:00:00Z'));

    const result = await findRecentClaudeAiExports({ home, now });

    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe('data-2026-04-15-10-00-00.zip');
    expect(result[0]!.folder).toBe('Downloads');
  });

  it('ignores ZIPs that do not match the claude.ai naming pattern', async () => {
    await touch(join(home, 'Downloads', 'other.zip'), new Date('2026-04-16T10:00:00Z'));
    await touch(join(home, 'Downloads', 'backup-2026.zip'), new Date('2026-04-16T10:00:00Z'));

    const result = await findRecentClaudeAiExports({ home, now });
    expect(result).toEqual([]);
  });

  it('matches the UUID-batch naming scheme used by claude.ai today', async () => {
    const realName =
      'data-80717880-4ecd-4c84-9c2b-b7692b372888-1776429112-830b1c5f-batch-0000.zip';
    await touch(join(home, 'Downloads', realName), new Date('2026-04-16T10:00:00Z'));

    const result = await findRecentClaudeAiExports({ home, now });
    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe(realName);
  });

  it('filters out ZIPs older than 7 days', async () => {
    await touch(
      join(home, 'Downloads', 'data-2026-04-01-10-00-00.zip'),
      new Date('2026-04-01T10:00:00Z'),
    );
    await touch(
      join(home, 'Downloads', 'data-2026-04-16-10-00-00.zip'),
      new Date('2026-04-16T10:00:00Z'),
    );

    const result = await findRecentClaudeAiExports({ home, now });

    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe('data-2026-04-16-10-00-00.zip');
  });

  it('collects from both Downloads and Desktop, sorted newest first', async () => {
    await touch(
      join(home, 'Downloads', 'data-2026-04-12-10-00-00.zip'),
      new Date('2026-04-12T10:00:00Z'),
    );
    await touch(
      join(home, 'Desktop', 'data-2026-04-16-10-00-00.zip'),
      new Date('2026-04-16T10:00:00Z'),
    );

    const result = await findRecentClaudeAiExports({ home, now });

    expect(result.map((c) => c.filename)).toEqual([
      'data-2026-04-16-10-00-00.zip',
      'data-2026-04-12-10-00-00.zip',
    ]);
    expect(result[0]!.folder).toBe('Desktop');
    expect(result[1]!.folder).toBe('Downloads');
  });

  it('silently skips folders that do not exist', async () => {
    await rm(join(home, 'Desktop'), { recursive: true });
    await touch(
      join(home, 'Downloads', 'data-2026-04-16-10-00-00.zip'),
      new Date('2026-04-16T10:00:00Z'),
    );

    const result = await findRecentClaudeAiExports({ home, now });
    expect(result).toHaveLength(1);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-04-17T12:00:00Z');

  it('returns "hace unos minutos" for sub-hour differences', () => {
    expect(formatRelativeTime(new Date('2026-04-17T11:45:00Z'), now)).toBe('hace unos minutos');
  });

  it('returns hours for same-day differences', () => {
    expect(formatRelativeTime(new Date('2026-04-17T09:00:00Z'), now)).toBe('hace 3 h');
  });

  it('returns "hace 1 día" exactly at 24h', () => {
    expect(formatRelativeTime(new Date('2026-04-16T12:00:00Z'), now)).toBe('hace 1 día');
  });

  it('returns plural days for older files', () => {
    expect(formatRelativeTime(new Date('2026-04-14T12:00:00Z'), now)).toBe('hace 3 días');
  });
});

describe('formatSize', () => {
  it('returns KB for sub-megabyte files', () => {
    expect(formatSize(500)).toBe('1 KB');
    expect(formatSize(512 * 1024)).toBe('512 KB');
  });

  it('returns MB with one decimal for larger files', () => {
    expect(formatSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});
