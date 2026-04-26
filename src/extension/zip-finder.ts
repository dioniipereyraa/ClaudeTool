import { readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import JSZip from 'jszip';

/**
 * Auto-detect recent claude.ai export ZIPs on the user's machine.
 *
 * claude.ai exports are named `data-YYYY-MM-DD-...zip` by default and
 * land in the OS download folder. Scanning Downloads + Desktop covers
 * the overwhelming majority of cases and removes the "where did I save
 * it?" friction from the import flow.
 *
 * Pure in terms of VS Code APIs (doesn't import `vscode`) so it can
 * be unit-tested against a synthetic home directory.
 */

export interface ClaudeAiZipCandidate {
  readonly path: string;
  readonly filename: string;
  readonly folder: string;
  readonly mtime: Date;
  readonly sizeBytes: number;
}

// claude.ai exports are named `data-<uuid>-<timestamp>-<hash>-batch-<n>.zip`.
// We match the `data-` prefix loosely: any dash-separated token after it is
// accepted, since claude.ai has shifted naming schemes over time (date-based,
// UUID-based, batch-split). False positives (other ZIPs starting with `data-`)
// are tolerable because the reader fails with a clear error on non-exports.
const CLAUDE_AI_ZIP_PATTERN = /^data-.+\.zip$/i;
const MAX_AGE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_CONTENT_SCAN_BYTES = 50 * 1024 * 1024;

export async function findRecentClaudeAiExports(
  options: { readonly home?: string; readonly now?: Date } = {},
): Promise<readonly ClaudeAiZipCandidate[]> {
  const home = options.home ?? homedir();
  const now = options.now ?? new Date();
  const cutoff = now.getTime() - MAX_AGE_DAYS * MS_PER_DAY;

  const folders = [
    { name: 'Downloads', path: join(home, 'Downloads') },
    { name: 'Desktop', path: join(home, 'Desktop') },
  ];

  const candidates: ClaudeAiZipCandidate[] = [];
  for (const folder of folders) {
    let entries: string[];
    try {
      entries = await readdir(folder.path);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!CLAUDE_AI_ZIP_PATTERN.test(entry)) continue;
      const fullPath = join(folder.path, entry);
      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;
      if (info.mtimeMs < cutoff) continue;
      candidates.push({
        path: fullPath,
        filename: entry,
        folder: folder.name,
        mtime: info.mtime,
        sizeBytes: info.size,
      });
    }
  }

  candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return candidates;
}

export function formatRelativeTime(mtime: Date, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - mtime.getTime());
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return 'hace unos minutos';
  if (hours < 24) return `hace ${String(hours)} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'hace 1 día';
  return `hace ${String(days)} días`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Fallback discovery for ZIPs that the user renamed. Scans all `*.zip`
 * under Downloads/Desktop (not just `data-*`) and peeks at each one's
 * central directory to see if `conversations.json` is present.
 *
 * Size-capped to `maxSizeBytes` (default 50 MB) so we don't eat an
 * unrelated 200 MB model/backup ZIP just to confirm it isn't claude.
 * ZIPs that fail to parse (corrupt, password-protected, not actually
 * a ZIP) are silently skipped.
 */
export async function scanZipsByContent(
  options: {
    readonly home?: string;
    readonly now?: Date;
    readonly maxSizeBytes?: number;
  } = {},
): Promise<readonly ClaudeAiZipCandidate[]> {
  const home = options.home ?? homedir();
  const now = options.now ?? new Date();
  const maxSize = options.maxSizeBytes ?? DEFAULT_MAX_CONTENT_SCAN_BYTES;
  const cutoff = now.getTime() - MAX_AGE_DAYS * MS_PER_DAY;

  const folders = [
    { name: 'Downloads', path: join(home, 'Downloads') },
    { name: 'Desktop', path: join(home, 'Desktop') },
  ];

  const candidates: ClaudeAiZipCandidate[] = [];
  for (const folder of folders) {
    let entries: string[];
    try {
      entries = await readdir(folder.path);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.zip')) continue;
      const fullPath = join(folder.path, entry);
      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;
      if (info.mtimeMs < cutoff) continue;
      if (info.size > maxSize) continue;

      const isClaudeExport = await zipContainsConversationsJson(fullPath);
      if (!isClaudeExport) continue;

      candidates.push({
        path: fullPath,
        filename: entry,
        folder: folder.name,
        mtime: info.mtime,
        sizeBytes: info.size,
      });
    }
  }

  candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return candidates;
}

async function zipContainsConversationsJson(zipPath: string): Promise<boolean> {
  try {
    const buffer = await readFile(zipPath);
    const zip = await JSZip.loadAsync(buffer);
    return zip.file('conversations.json') !== null;
  } catch {
    return false;
  }
}

// ─── Per-provider detection ─────────────────────────────────────────────────

export type ExportProvider = 'claude' | 'chatgpt';

export interface ExportCandidate extends ClaudeAiZipCandidate {
  readonly provider: ExportProvider;
}

/**
 * Pick the most recent export ZIP per provider out of Downloads/Desktop,
 * within the last `maxAgeMinutes` window. Used by the sidebar tab to
 * surface "we noticed a fresh download — click to import" hints next
 * to each provider row.
 *
 * Detection peeks inside each .zip's `conversations.json` to tell
 * claude.ai (top-level array of objects with `chat_messages`) from
 * ChatGPT (objects with `mapping` + `current_node`). Filename-based
 * detection is unreliable for ChatGPT (no canonical pattern) so we
 * always read content; the per-zip cap (`maxSizeBytes`) keeps us from
 * paying that cost on accidental huge ZIPs.
 *
 * Returns at most one candidate per provider (the most recent by
 * mtime). Missing providers are simply absent from the result.
 */
export async function findRecentExportsByProvider(
  options: {
    readonly home?: string;
    readonly now?: Date;
    readonly maxAgeMinutes?: number;
    readonly maxSizeBytes?: number;
  } = {},
): Promise<Partial<Record<ExportProvider, ExportCandidate>>> {
  const home = options.home ?? homedir();
  const now = options.now ?? new Date();
  const maxAge = options.maxAgeMinutes ?? 120;
  const maxSize = options.maxSizeBytes ?? DEFAULT_MAX_CONTENT_SCAN_BYTES;
  const cutoff = now.getTime() - maxAge * 60 * 1000;

  const folders = [
    { name: 'Downloads', path: join(home, 'Downloads') },
    { name: 'Desktop', path: join(home, 'Desktop') },
  ];

  const all: ExportCandidate[] = [];
  for (const folder of folders) {
    let entries: string[];
    try {
      entries = await readdir(folder.path);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.zip')) continue;
      const fullPath = join(folder.path, entry);
      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;
      if (info.mtimeMs < cutoff) continue;
      if (info.size > maxSize) continue;

      const provider = await detectProviderFromZip(fullPath);
      if (provider === undefined) continue;

      all.push({
        path: fullPath,
        filename: entry,
        folder: folder.name,
        mtime: info.mtime,
        sizeBytes: info.size,
        provider,
      });
    }
  }

  all.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  const result: Partial<Record<ExportProvider, ExportCandidate>> = {};
  for (const c of all) {
    result[c.provider] ??= c;
  }
  return result;
}

async function detectProviderFromZip(zipPath: string): Promise<ExportProvider | undefined> {
  try {
    const buffer = await readFile(zipPath);
    const zip = await JSZip.loadAsync(buffer);
    const file = zip.file('conversations.json');
    if (file === null) return undefined;
    // Read the whole file — JSZip doesn't support partial reads, and
    // the in-memory hit is bounded by the per-zip size cap upstream.
    // Sniff the first ~10KB for the distinguishing field name; that's
    // enough to land within the first conversation object on any real
    // export, and avoids parsing huge JSON just to identify the shape.
    const content = await file.async('string');
    const head = content.slice(0, 10_000);
    // ChatGPT check first — `mapping` is a strong-enough signal on its
    // own (claude.ai's schema doesn't carry that field).
    if (head.includes('"mapping"') && head.includes('"current_node"')) return 'chatgpt';
    if (head.includes('"chat_messages"')) return 'claude';
    return undefined;
  } catch {
    return undefined;
  }
}
