import { type RedactionReport } from '../redactors/index.js';

export interface PreviewOptions {
  readonly headLines: number;
  readonly tailLines: number;
}

/**
 * Build a human-readable preview of a markdown export for the confirmation
 * prompt. Short documents are shown in full; long ones are truncated with
 * a head/tail/gap pattern so the user can verify both the opening and
 * closing of the file without scrolling through the whole thing.
 */
export function buildPreview(
  markdown: string,
  outPath: string,
  report: RedactionReport,
  redactionEnabled: boolean,
  options: PreviewOptions,
): string {
  const lines = markdown.split('\n');
  const threshold = options.headLines + options.tailLines + 10;
  const byteSize = Buffer.byteLength(markdown, 'utf8');

  const body =
    lines.length <= threshold
      ? markdown
      : [
          ...lines.slice(0, options.headLines),
          '',
          `[... ${String(lines.length - options.headLines - options.tailLines)} lines omitted ...]`,
          '',
          ...lines.slice(-options.tailLines),
        ].join('\n');

  const sep = '─'.repeat(60);
  const target = `Target: ${outPath} (${humanSize(byteSize)}, ${String(lines.length)} lines)`;
  const redactionLine = redactionEnabled
    ? `Redaction: ${summarizeReport(report)}`
    : 'Redaction: DISABLED — output may contain paths, tokens, or PII.';

  return [sep, body, sep, target, redactionLine, sep].join('\n');
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeReport(report: RedactionReport): string {
  const parts: string[] = [];
  if (report.paths > 0) parts.push(`${String(report.paths)} path(s)`);
  if (report.secrets > 0) {
    const detail = Object.entries(report.secretsByType)
      .map(([type, count]) => `${String(count)}x${type}`)
      .join(', ');
    parts.push(`${String(report.secrets)} secret(s) [${detail}]`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no sensitive patterns found';
}
