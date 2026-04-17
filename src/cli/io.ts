import { access, rename, unlink, writeFile } from 'node:fs/promises';

import { type RedactionReport } from '../redactors/index.js';

import { buildPreview } from './preview.js';
import { confirm, stdinIsTTY } from './prompt.js';

const PREVIEW_HEAD = 15;
const PREVIEW_TAIL = 15;

export interface WriteWithPreviewOptions {
  readonly out: string;
  readonly redact: boolean;
  readonly yes?: boolean;
  readonly force?: boolean;
}

/**
 * Shared implementation of "write markdown to --out with an interactive
 * preview". Reused by `exportal export` and `exportal import show`
 * because the safety behavior is identical on both sides: same
 * fail-closed preview, same atomic write, same refusal to clobber.
 *
 * If `yes` is true the preview is skipped and a post-write redaction
 * summary is printed to stderr instead. If stdin isn't a TTY we throw
 * rather than silently accepting — this makes accidental pipes into
 * non-interactive shells safe.
 */
export async function writeWithPreview(
  markdown: string,
  report: RedactionReport,
  opts: WriteWithPreviewOptions,
): Promise<void> {
  const { out } = opts;

  if (opts.force !== true && (await fileExists(out))) {
    throw new Error(
      `Output file already exists: ${out}. Pass --force to overwrite, or pick a different --out.`,
    );
  }

  if (opts.yes !== true) {
    if (!stdinIsTTY()) {
      throw new Error(
        'Interactive confirmation required for --out but stdin is not a TTY. Re-run with --yes to skip the prompt, or from an interactive terminal.',
      );
    }
    const preview = buildPreview(markdown, out, report, opts.redact, {
      headLines: PREVIEW_HEAD,
      tailLines: PREVIEW_TAIL,
    });
    process.stderr.write(`\n${preview}\n\n`);
    if (opts.redact === false) {
      process.stderr.write(
        'WARNING: Redaction is DISABLED. The file above may contain secrets or PII.\n',
      );
    }
    const go = await confirm('Proceed with write?');
    if (!go) {
      process.stderr.write('Cancelled. No file was written.\n');
      return;
    }
  }

  await atomicWrite(out, markdown);
  process.stderr.write(`Wrote ${out}\n`);
  if (opts.yes === true) {
    writeSummary(report, !opts.redact);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write to `${path}.tmp` then rename into place. A Ctrl+C, power loss,
 * or full-disk mid-write leaves either the original file intact (if it
 * existed) or no file at all — never a truncated half-written export.
 * If the rename fails we try to unlink the tmp so it doesn't linger.
 */
async function atomicWrite(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, { encoding: 'utf8' });
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {
      /* best-effort cleanup; surface the original error */
    });
    throw err;
  }
}

export function writeSummary(report: RedactionReport, redactionDisabled: boolean): void {
  if (redactionDisabled) {
    process.stderr.write(
      '\nWARNING: Redaction DISABLED. Output may contain paths, tokens, or PII.\n',
    );
    return;
  }
  const parts: string[] = [];
  if (report.paths > 0) parts.push(`${String(report.paths)} path(s)`);
  if (report.secrets > 0) {
    const detail = Object.entries(report.secretsByType)
      .map(([type, count]) => `${String(count)}x${type}`)
      .join(', ');
    parts.push(`${String(report.secrets)} secret(s) [${detail}]`);
  }
  const summary = parts.length > 0 ? `Redacted: ${parts.join(', ')}.` : 'No sensitive patterns found.';
  process.stderr.write(`\n${summary}\n`);
}
