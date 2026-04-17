import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
