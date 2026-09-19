// Types for `check-version-sync.mjs`, which stays plain ESM because the
// release workflow runs it with bare node before anything is built.
// `tests/release/version-sync.test.ts` imports it, and without these
// declarations every call through it is an `any` the linter rejects.

/** One version declaration, as found in the tree. */
export interface VersionEntry {
  readonly file: string;
  readonly field: string;
  readonly version: string | undefined;
}

/** A declaration that disagrees with the version being released. */
export interface VersionMismatch {
  readonly file: string;
  readonly field: string;
  readonly found: string | undefined;
  readonly expected: string | undefined;
}

export interface VersionSource {
  readonly file: string;
  readonly field: string;
  readonly read: (json: unknown) => string | undefined;
}

export declare const VERSION_SOURCES: readonly VersionSource[];

export declare function normalizeVersion(value: unknown): string | undefined;

export declare function findVersionMismatches(
  entries: readonly VersionEntry[],
  expected: string | undefined,
): VersionMismatch[];

export declare function readVersionEntries(root: string): Promise<VersionEntry[]>;

export declare function formatMismatches(mismatches: readonly VersionMismatch[]): string;
