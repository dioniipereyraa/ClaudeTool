import { access, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Command } from 'commander';

import { encodeProjectDir, PROJECTS_DIR } from '../../core/paths.js';
import { readJsonl } from '../../core/reader.js';
import { describeSession } from '../../core/session.js';
import { formatAsMarkdown } from '../../formatters/markdown.js';
import { type RedactionReport } from '../../redactors/index.js';
import { buildPreview } from '../preview.js';
import { confirm, stdinIsTTY } from '../prompt.js';

const SESSION_ID = /^[a-f0-9-]{10,64}$/i;
const PREVIEW_HEAD = 15;
const PREVIEW_TAIL = 15;

interface ExportOptions {
  readonly project?: string;
  readonly out?: string;
  readonly redact: boolean;
  readonly skipPrecompact?: boolean;
  readonly yes?: boolean;
  readonly force?: boolean;
  readonly includeTools?: boolean;
  readonly includeThinking?: boolean;
}

export function registerExport(program: Command): void {
  program
    .command('export <sessionId>')
    .description('Export a Claude Code session to Markdown')
    .option('--project <dir>', 'Project folder name (defaults to current cwd)')
    .option('--out <file>', 'Write to file instead of stdout')
    .option('--no-redact', 'Disable redaction (not recommended)')
    .option('--skip-precompact', 'Drop events before the latest compact boundary')
    .option('--include-tools', 'Render tool_use and tool_result blocks as collapsibles')
    .option('--include-thinking', 'Render thinking blocks as blockquotes')
    .option('-y, --yes', 'Skip the interactive preview prompt (for CI / scripting)')
    .option('-f, --force', 'Overwrite the output file if it already exists')
    .action(async (sessionId: string, opts: ExportOptions) => {
      if (!SESSION_ID.test(sessionId)) {
        throw new Error(`Invalid sessionId format: ${sessionId}`);
      }
      const projectDir = opts.project ?? encodeProjectDir(process.cwd());
      const filePath = join(PROJECTS_DIR, projectDir, `${sessionId}.jsonl`);

      const events = await readJsonl(filePath);
      const metadata = await describeSession(filePath);
      const { markdown, report } = formatAsMarkdown(events, metadata, {
        redact: opts.redact,
        ...(opts.skipPrecompact === true && { skipPrecompact: true }),
        ...(opts.includeTools === true && { includeTools: true }),
        ...(opts.includeThinking === true && { includeThinking: true }),
      });

      if (opts.out === undefined) {
        process.stdout.write(markdown);
        writeSummary(report, !opts.redact);
        return;
      }

      await writeWithPreview(markdown, report, opts);
    });
}

async function writeWithPreview(
  markdown: string,
  report: RedactionReport,
  opts: ExportOptions,
): Promise<void> {
  const out = opts.out!;

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
    // No preview was shown; print the summary post-write so the user
    // still learns what was redacted.
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

function writeSummary(report: RedactionReport, redactionDisabled: boolean): void {
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
