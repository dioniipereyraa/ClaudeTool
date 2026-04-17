import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Command } from 'commander';

import { encodeProjectDir, PROJECTS_DIR } from '../../core/paths.js';
import { readJsonl } from '../../core/reader.js';
import { describeSession } from '../../core/session.js';
import { formatAsMarkdown } from '../../formatters/markdown.js';
import { type RedactionReport } from '../../redactors/index.js';

const SESSION_ID = /^[a-f0-9-]{10,64}$/i;

interface ExportOptions {
  readonly project?: string;
  readonly out?: string;
  readonly redact: boolean;
}

export function registerExport(program: Command): void {
  program
    .command('export <sessionId>')
    .description('Export a Claude Code session to Markdown')
    .option('--project <dir>', 'Project folder name (defaults to current cwd)')
    .option('--out <file>', 'Write to file instead of stdout')
    .option('--no-redact', 'Disable redaction (not recommended)')
    .action(async (sessionId: string, opts: ExportOptions) => {
      if (!SESSION_ID.test(sessionId)) {
        throw new Error(`Invalid sessionId format: ${sessionId}`);
      }
      const projectDir = opts.project ?? encodeProjectDir(process.cwd());
      const filePath = join(PROJECTS_DIR, projectDir, `${sessionId}.jsonl`);

      const events = await readJsonl(filePath);
      const metadata = await describeSession(filePath);
      const { markdown, report } = formatAsMarkdown(events, metadata, { redact: opts.redact });

      if (opts.out !== undefined) {
        await writeFile(opts.out, markdown, { encoding: 'utf8' });
        process.stderr.write(`Wrote ${opts.out}\n`);
      } else {
        process.stdout.write(markdown);
      }
      writeSummary(report, !opts.redact);
    });
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
