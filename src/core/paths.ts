import { homedir } from 'node:os';
import { join } from 'node:path';

export const CLAUDE_HOME = join(homedir(), '.claude');
export const PROJECTS_DIR = join(CLAUDE_HOME, 'projects');

/**
 * Encode a project cwd into its Claude Code folder name.
 *
 * Observed behavior: colons, path separators, and dots are replaced with `-`.
 * Example: `d:\Dionisio\ClaudeTool` -> `d--Dionisio-ClaudeTool`.
 *
 * This inverse is best-effort — the encoding is not officially documented.
 * When it fails, callers should fall back to listing all project dirs.
 */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[:\\/.]/g, '-');
}
