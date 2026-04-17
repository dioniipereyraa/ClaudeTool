import {
  isAssistantEvent,
  isUserEvent,
  type ContentBlock,
  type SessionMetadata,
} from '../core/types.js';
import { emptyReport, redact, type RedactionReport } from '../redactors/index.js';

export interface FormatOptions {
  readonly redact: boolean;
}

export interface FormatResult {
  readonly markdown: string;
  readonly report: RedactionReport;
}

/**
 * Render a session's events as Markdown.
 *
 * Consecutive events from the same role are merged into a single section, so
 * the output reads as a natural conversation. Tool calls and thinking blocks
 * are intentionally dropped in this MVP — they will opt in through a later
 * `includeTools` / `includeThinking` flag.
 */
export function formatAsMarkdown(
  events: readonly unknown[],
  metadata: SessionMetadata,
  options: FormatOptions,
): FormatResult {
  const report = emptyReport();
  const lines: string[] = [];

  lines.push(renderHeader(metadata, options));

  let lastRole: 'user' | 'assistant' | null = null;
  for (const event of events) {
    if (isUserEvent(event)) {
      const body = extractText(event.message.content);
      if (body.length === 0) continue;
      const redacted = options.redact ? redact(body, report) : body;
      if (lastRole !== 'user') {
        lines.push('', '## User', '');
        lastRole = 'user';
      }
      lines.push(redacted, '');
    } else if (isAssistantEvent(event)) {
      const body = extractText(event.message.content);
      if (body.length === 0) continue;
      const redacted = options.redact ? redact(body, report) : body;
      if (lastRole !== 'assistant') {
        lines.push('', '## Assistant', '');
        lastRole = 'assistant';
      }
      lines.push(redacted, '');
    }
  }

  const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return { markdown, report };
}

function renderHeader(metadata: SessionMetadata, options: FormatOptions): string {
  const rows: string[] = ['# Exportal session', ''];
  rows.push(`- **Session ID:** \`${metadata.sessionId}\``);
  if (metadata.startedAt !== undefined) rows.push(`- **Started:** ${metadata.startedAt}`);
  if (metadata.model !== undefined) rows.push(`- **Model:** \`${metadata.model}\``);
  if (metadata.gitBranch !== undefined) rows.push(`- **Git branch:** \`${metadata.gitBranch}\``);
  rows.push(`- **Turns:** ${String(metadata.turnCount)}`);
  rows.push(`- **Redaction:** ${options.redact ? 'enabled' : 'DISABLED'}`);
  return rows.join('\n');
}

function extractText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content.trim();
  return content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text.trim())
    .filter((segment) => segment.length > 0)
    .join('\n\n');
}
