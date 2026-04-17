import { isCompactBoundary, isCompactSummaryUser, skipBeforeLatestCompact } from '../core/compact.js';
import {
  type CompactBoundary,
  type ContentBlock,
  type Event,
  type SessionMetadata,
} from '../core/types.js';
import { emptyReport, redact, type RedactionReport } from '../redactors/index.js';

export interface FormatOptions {
  readonly redact: boolean;
  readonly skipPrecompact?: boolean;
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
 * are intentionally dropped in this version — they will opt in through a
 * later `includeTools` / `includeThinking` flag.
 *
 * Compact events get special treatment:
 *  - `compact_boundary` (system) renders as an inline note with metadata.
 *  - A user event with `isCompactSummary: true` is the auto-generated bridge
 *    summary; it is rendered under its own `## Compact summary` header
 *    rather than mislabeled as a regular user turn.
 *  - With `skipPrecompact: true`, everything before the latest boundary is
 *    dropped, mirroring how Claude Code itself only sees post-compact state.
 */
export function formatAsMarkdown(
  events: readonly Event[],
  metadata: SessionMetadata,
  options: FormatOptions,
): FormatResult {
  const report = emptyReport();
  const lines: string[] = [];
  const visible = options.skipPrecompact === true ? skipBeforeLatestCompact(events) : events;

  lines.push(renderHeader(metadata, options));

  let lastRole: 'user' | 'assistant' | 'summary' | 'boundary' | null = null;
  for (const event of visible) {
    if (isCompactBoundary(event)) {
      lines.push('', renderBoundary(event), '');
      lastRole = 'boundary';
      continue;
    }
    if (event.type === 'user' && isCompactSummaryUser(event)) {
      const body = extractText(event.message.content);
      if (body.length === 0) continue;
      const redacted = options.redact ? redact(body, report) : body;
      lines.push('', '## Compact summary', '', redacted, '');
      lastRole = 'summary';
      continue;
    }
    if (event.type === 'user') {
      const body = extractText(event.message.content);
      if (body.length === 0) continue;
      const redacted = options.redact ? redact(body, report) : body;
      if (lastRole !== 'user') {
        lines.push('', '## User', '');
        lastRole = 'user';
      }
      lines.push(redacted, '');
    } else if (event.type === 'assistant') {
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
  if (metadata.compactCount > 0) {
    rows.push(`- **Compactions:** ${String(metadata.compactCount)}`);
  }
  rows.push(`- **Redaction:** ${options.redact ? 'enabled' : 'DISABLED'}`);
  if (options.skipPrecompact === true) {
    rows.push('- **Pre-compact events:** omitted');
  }
  return rows.join('\n');
}

function renderBoundary(event: CompactBoundary): string {
  const meta = event.compactMetadata;
  const parts: string[] = ['— compact boundary'];
  if (meta?.trigger !== undefined) parts.push(`trigger: ${meta.trigger}`);
  if (meta?.preTokens !== undefined) parts.push(`pre-compact tokens: ${String(meta.preTokens)}`);
  return `> ${parts.join(' · ')}`;
}

function extractText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content.trim();
  return content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text.trim())
    .filter((segment) => segment.length > 0)
    .join('\n\n');
}
