import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  findVersionMismatches,
  formatMismatches,
  normalizeVersion,
  readVersionEntries,
  VERSION_SOURCES,
} from '../../scripts/check-version-sync.mjs';

/**
 * The version is written by hand in four places and read back from all of
 * them. `package-lock.json` once fell five releases behind, and the release
 * that shipped it was green: `scripts/package-chrome.mjs` overwrites the
 * manifest version while zipping, so the artifact is named correctly even
 * when the tree is stale. The artifact never lies; the repository does.
 *
 * These tests watch the tree itself, so drift is a red CI on the commit that
 * causes it rather than a surprise at release time.
 */

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

describe('the repository tree', () => {
  it('declares one and the same version everywhere', async () => {
    const entries = await readVersionEntries(repoRoot);
    const mismatches = findVersionMismatches(entries, undefined);

    expect(formatMismatches(mismatches)).toBe('');
    expect(mismatches).toEqual([]);
  });

  it('reads a real version out of every declared source', async () => {
    // A `read` that silently returns undefined would make the check above
    // pass by comparing nothing against nothing.
    const entries = await readVersionEntries(repoRoot);

    expect(entries).toHaveLength(VERSION_SOURCES.length);
    for (const entry of entries) {
      expect(entry.version, `${entry.file} (${entry.field})`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});

describe('findVersionMismatches', () => {
  const entries = [
    { file: 'package.json', field: 'version', version: '0.12.0' },
    { file: 'package-lock.json', field: 'version', version: '0.12.0' },
    { file: 'package-lock.json', field: 'packages[""].version', version: '0.11.10' },
    { file: 'chrome/manifest.json', field: 'version', version: '0.12.0' },
  ];

  it('catches the second lock field, which is the one a manual bump forgets', () => {
    expect(findVersionMismatches(entries, '0.12.0')).toEqual([
      {
        file: 'package-lock.json',
        field: 'packages[""].version',
        found: '0.11.10',
        expected: '0.12.0',
      },
    ]);
  });

  it('reports every mismatch, not just the first', () => {
    const stale = entries.map((entry) => ({ ...entry, version: '0.11.10' }));

    expect(findVersionMismatches(stale, '0.12.0')).toHaveLength(4);
  });

  it('accepts the tag with or without its v prefix', () => {
    const consistent = entries.map((entry) => ({ ...entry, version: '0.12.0' }));

    expect(findVersionMismatches(consistent, 'v0.12.0')).toEqual([]);
    expect(findVersionMismatches(consistent, '0.12.0')).toEqual([]);
    expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
    expect(normalizeVersion('1.2.3')).toBe('1.2.3');
  });

  it('falls back to the first source when no version is given', () => {
    // This is the mode the test above and the bare CLI call use: no tag,
    // just "do these four agree with each other".
    expect(findVersionMismatches(entries, undefined)).toEqual([
      {
        file: 'package-lock.json',
        field: 'packages[""].version',
        found: '0.11.10',
        expected: '0.12.0',
      },
    ]);
  });

  it('treats a missing field as a mismatch instead of passing it over', () => {
    const missing = [
      { file: 'package.json', field: 'version', version: '0.12.0' },
      { file: 'chrome/manifest.json', field: 'version', version: undefined },
    ];

    expect(findVersionMismatches(missing, '0.12.0')).toEqual([
      { file: 'chrome/manifest.json', field: 'version', found: undefined, expected: '0.12.0' },
    ]);
  });
});
