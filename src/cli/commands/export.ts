import { join } from 'node:path';

import { type Command } from 'commander';

import { encodeProjectDir, PROJECTS_DIR } from '../../core/paths.js';
import { readJsonl } from '../../core/reader.js';
import { describeSession } from '../../core/session.js';
import { formatAsMarkdown } from '../../formatters/markdown.js';
import { stripTerminalControl, writeSummary, writeWithPreview } from '../io.js';

const SESSION_ID = /^[a-f0-9-]{10,64}$/i;

interface ExportOptions {
  readonly project?: string;
  readonly out?: string;
  readonly redact: boolean;
  readonly redactPii?: boolean;
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
    .option('--redact-pii', 'Also redact email addresses and IP addresses (opt-in)', false)
    .option('--skip-precompact', 'Drop events before the latest compact boundary')
    .option('--include-tools', 'Render tool_use and tool_result blocks as collapsibles')
    .option('--include-thinking', 'Render thinking blocks as blockquotes')
    .option('-y, --yes', 'Skip the interactive preview prompt (for CI / scripting)')
    .option('-f, --force', 'Overwrite the output file if it already exists')
    .action(async (sessionId: string, opts: ExportOptions) => {
      if (!SESSION_ID.test(sessionId)) {
        throw new Error(`Invalid sessionId format: ${sessionId}`);
      }
      if (opts.project !== undefined) assertSafeProjectName(opts.project);
      const projectDir = opts.project ?? encodeProjectDir(process.cwd());
      const filePath = join(PROJECTS_DIR, projectDir, `${sessionId}.jsonl`);

      const events = await readJsonl(filePath);
      const metadata = await describeSession(filePath);
      const { markdown, report } = formatAsMarkdown(events, metadata, {
        redact: opts.redact,
        ...(opts.redactPii === true && { redactPii: true }),
        ...(opts.skipPrecompact === true && { skipPrecompact: true }),
        ...(opts.includeTools === true && { includeTools: true }),
        ...(opts.includeThinking === true && { includeThinking: true }),
      });

      if (opts.out === undefined) {
        // Strip terminal control chars so a model-injected escape
        // sequence cannot retitle the user's terminal or pull off
        // OSC 52 clipboard tricks. The file path under `--out` keeps
        // the data verbatim for inspection.
        process.stdout.write(stripTerminalControl(markdown));
        writeSummary(report, !opts.redact);
        return;
      }

      await writeWithPreview(markdown, report, {
        out: opts.out,
        redact: opts.redact,
        ...(opts.yes === true && { yes: true }),
        ...(opts.force === true && { force: true }),
      });
    });
}

// `--project` is joined under `~/.claude/projects/`. Reject anything
// that would let the user reach a directory above the projects root.
function assertSafeProjectName(name: string): void {
  if (name.length === 0) throw new Error('--project must be a non-empty folder name');
  if (name.includes('..')) throw new Error('--project must not contain `..` segments');
  if (name.includes('/') || name.includes('\\')) {
    throw new Error('--project must be a single folder name, not a path');
  }
  if (name.includes('\0')) throw new Error('--project contains a null byte');
}
