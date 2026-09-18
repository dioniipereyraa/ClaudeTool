// Check that every file carrying the version agrees, and that they agree
// with the tag being released.
//
//     node scripts/check-version-sync.mjs           # internal coherence
//     node scripts/check-version-sync.mjs v0.12.0   # ...and against a tag
//
// The release checklist in CLAUDE.md lists four places to bump by hand, and
// `package-lock.json` once fell five releases behind because a manual bump
// skipped it. Worse, `scripts/package-chrome.mjs` overwrites the manifest
// version with `package.json`'s while zipping, so a stale
// `chrome/manifest.json` still produces a correctly named artifact: the
// package never lies, the repository does, and nothing was watching.
//
// `tests/release/version-sync.test.ts` runs this over the real tree, so the
// repository going out of sync is a red CI rather than something noticed
// five releases later.

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Every place the version is written by hand, and how to read it back.
 * `package-lock.json` carries it twice and npm updates both, so a manual
 * bump that edits only the top one is the exact failure this catches.
 */
export const VERSION_SOURCES = [
  { file: 'package.json', field: 'version', read: (json) => json.version },
  { file: 'package-lock.json', field: 'version', read: (json) => json.version },
  {
    file: 'package-lock.json',
    field: 'packages[""].version',
    read: (json) => json.packages?.['']?.version,
  },
  { file: 'chrome/manifest.json', field: 'version', read: (json) => json.version },
];

/** `v0.12.0` and `0.12.0` both mean the same release. */
export function normalizeVersion(value) {
  return typeof value === 'string' && value.startsWith('v') ? value.slice(1) : value;
}

/**
 * Compares what each source declares against `expected`, or against the
 * first source when no version is given. Returns every mismatch, not just
 * the first one: a bump that forgot two files should report two files.
 */
export function findVersionMismatches(entries, expected) {
  const target = normalizeVersion(expected) ?? entries[0]?.version;
  if (!target) {
    return [{ file: '(none)', field: '(none)', found: undefined, expected: undefined }];
  }
  return entries
    .filter((entry) => entry.version !== target)
    .map((entry) => ({
      file: entry.file,
      field: entry.field,
      found: entry.version,
      expected: target,
    }));
}

/** Reads the declared version out of every source. */
export async function readVersionEntries(root) {
  const cache = new Map();
  const entries = [];
  for (const source of VERSION_SOURCES) {
    if (!cache.has(source.file)) {
      cache.set(source.file, JSON.parse(await readFile(join(root, source.file), 'utf8')));
    }
    entries.push({
      file: source.file,
      field: source.field,
      version: source.read(cache.get(source.file)),
    });
  }
  return entries;
}

export function formatMismatches(mismatches) {
  return mismatches
    .map(
      (m) => `  ${m.file} (${m.field}) declares ${m.found ?? '(missing)'}, expected ${m.expected}`,
    )
    .join('\n');
}

// Only the CLI path runs the checks; importing the module from a test must
// not read the tree or call process.exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(import.meta.dirname, '..');
  const expected = process.argv[2];
  const entries = await readVersionEntries(root);
  const mismatches = findVersionMismatches(entries, expected);

  if (mismatches.length > 0) {
    const against = expected ? `tag ${expected}` : `${entries[0].file}`;
    console.error(`Version mismatch against ${against}:\n${formatMismatches(mismatches)}`);
    console.error(
      '\nThe release checklist in CLAUDE.md lists every file that carries the version.',
    );
    process.exit(1);
  }

  console.log(`Version ${entries[0].version} is consistent across ${entries.length} declarations.`);
}
