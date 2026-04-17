import { isCompactBoundary, isCompactSummaryUser, skipBeforeLatestCompact } from '../core/compact.js';
import {
  type CompactBoundary,
  type ContentBlock,
  type Event,
  type SessionMetadata,
} from '../core/types.js';
import { emptyReport, redact, type RedactionReport } from '../redactors/index.js';

import { renderToolResult, renderToolUse } from './markdown-shared.js';

export interface FormatOptions {
  readonly redact: boolean;
  readonly skipPrecompact?: boolean;
  readonly includeTools?: boolean;
  readonly includeThinking?: boolean;
}

export interface FormatResult {
  readonly markdown: string;
  readonly report: RedactionReport;
}

interface RenderOptions {
  readonly includeTools: boolean;
  readonly includeThinking: boolean;
}

/**
 * Render a session's events as Markdown.
 *
 * Consecutive events from the same role are merged into a single section, so
 * the output reads as a natural conversation. By default only `text` blocks
 * are rendered; `--include-thinking` adds `thinking` blocks as blockquotes,
 * `--include-tools` adds `tool_use` / `tool_result` blocks as collapsible
 * `<details>` sections. Order of blocks within a message is preserved.
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
  const render: RenderOptions = {
    includeTools: options.includeTools === true,
    includeThinking: options.includeThinking === true,
  };

  lines.push(renderHeader(metadata, options));

  let lastRole: 'user' | 'assistant' | 'summary' | 'boundary' | null = null;
  for (const event of visible) {
    if (isCompactBoundary(event)) {
      lines.push('', renderBoundary(event), '');
      lastRole = 'boundary';
      continue;
    }
    if (event.type === 'user' && isCompactSummaryUser(event)) {
      const body = renderBlocks(event.message.content, { includeTools: false, includeThinking: false });
      if (body.length === 0) continue;
      const redacted = options.redact ? redact(body, report) : body;
      lines.push('', '## Compact summary', '', redacted, '');
      lastRole = 'summary';
      continue;
    }
    if (event.type === 'user') {
      const body = renderBlocks(event.message.content, render);
      if (body.length === 0) continue;
      const redacted = options.redact ? redact(body, report) : body;
      if (lastRole !== 'user') {
        lines.push('', '## User', '');
        lastRole = 'user';
      }
      lines.push(redacted, '');
    } else if (event.type === 'assistant') {
      const body = renderBlocks(event.message.content, render);
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
  const included: string[] = [];
  if (options.includeThinking === true) included.push('thinking');
  if (options.includeTools === true) included.push('tools');
  if (included.length > 0) {
    rows.push(`- **Includes:** ${included.join(', ')}`);
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

function renderBlocks(
  content: string | ContentBlock[],
  options: RenderOptions,
): string {
  if (typeof content === 'string') return content.trim();
  const segments: string[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      const trimmed = block.text.trim();
      if (trimmed.length > 0) segments.push(trimmed);
      continue;
    }
    if (block.type === 'thinking' && options.includeThinking) {
      const trimmed = block.thinking.trim();
      if (trimmed.length > 0) segments.push(renderThinking(trimmed));
      continue;
    }
    if (block.type === 'tool_use' && options.includeTools) {
      segments.push(renderToolUse(block.name, block.id, block.input));
      continue;
    }
    if (block.type === 'tool_result' && options.includeTools) {
      segments.push(renderToolResult(block.tool_use_id, block.content));
      continue;
    }
  }
  return segments.join('\n\n');
}

function renderThinking(text: string): string {
  const quoted = text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `> *[thinking]*\n>\n${quoted}`;
}
