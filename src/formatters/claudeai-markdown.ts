import {
  type ClaudeAiAttachment,
  type ClaudeAiCitation,
  type ClaudeAiContentBlock,
  type ClaudeAiConversation,
  type ClaudeAiFileRef,
  type ClaudeAiMessage,
} from '../importers/claudeai/schema.js';
import { emptyReport, redact, type RedactionReport } from '../redactors/index.js';

import { fenceCode, renderToolResult, renderToolUse } from './markdown-shared.js';

export interface ClaudeAiFormatOptions {
  readonly redact: boolean;
  readonly includeTools?: boolean;
  readonly includeAttachments?: boolean;
}

export interface ClaudeAiFormatResult {
  readonly markdown: string;
  readonly report: RedactionReport;
}

interface RenderContext {
  readonly includeTools: boolean;
  readonly includeAttachments: boolean;
  readonly footnotes: string[];
}

/**
 * Render a single claude.ai conversation as Markdown.
 *
 * The output is intentionally shaped like the Claude Code formatter so
 * that a user bridging both sides sees one consistent style: `## User`
 * / `## Assistant` sections, `<details>` for tool calls, redaction-on
 * by default.
 *
 * Web-specific differences vs Claude Code:
 *  - senders are `human` / `assistant` → mapped to `## User` / `## Assistant`.
 *  - there's no `thinking` block (the web does not expose it).
 *  - text blocks can carry `citations`; we render them as markdown
 *    footnotes `[^n]` with the URL in a `## Referencias` section at the
 *    bottom. Closest thing to GitHub's native footnote rendering.
 *  - `attachments[]` carry `extracted_content` inline (text extracted by
 *    claude.ai from the user's uploaded file). Opt-in via
 *    `--include-attachments` because it can double the output size.
 *  - `files[]` are pure references (UUID + name, no bytes). We render a
 *    short note — the bytes are not in the ZIP so we can't do better.
 */
export function formatConversation(
  conversation: ClaudeAiConversation,
  options: ClaudeAiFormatOptions,
): ClaudeAiFormatResult {
  const report = emptyReport();
  const ctx: RenderContext = {
    includeTools: options.includeTools === true,
    includeAttachments: options.includeAttachments === true,
    footnotes: [],
  };

  const lines: string[] = [];
  lines.push(renderHeader(conversation, options));

  let lastRole: 'user' | 'assistant' | null = null;
  for (const message of conversation.chat_messages) {
    const body = renderMessage(message, ctx);
    if (body.length === 0) continue;
    const redacted = options.redact ? redact(body, report) : body;
    const role: 'user' | 'assistant' = message.sender === 'human' ? 'user' : 'assistant';
    if (lastRole !== role) {
      lines.push('', role === 'user' ? '## User' : '## Assistant', '');
      lastRole = role;
    }
    lines.push(redacted, '');
  }

  if (ctx.footnotes.length > 0) {
    lines.push('', '## Referencias', '');
    // Footnotes after redaction: URLs tend not to match the redactor's
    // patterns (no file paths, no secrets), but just in case we redact
    // them through the same pipeline.
    const footnoteBlock = ctx.footnotes.join('\n');
    lines.push(options.redact ? redact(footnoteBlock, report) : footnoteBlock, '');
  }

  const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return { markdown, report };
}

function renderHeader(
  conversation: ClaudeAiConversation,
  options: ClaudeAiFormatOptions,
): string {
  const rows: string[] = ['# Exportal — claude.ai conversation', ''];
  rows.push(`- **Title:** ${conversation.name.length > 0 ? conversation.name : '(untitled)'}`);
  rows.push(`- **UUID:** \`${conversation.uuid}\``);
  rows.push(`- **Created:** ${conversation.created_at}`);
  if (conversation.updated_at !== undefined) {
    rows.push(`- **Updated:** ${conversation.updated_at}`);
  }
  rows.push(`- **Messages:** ${String(conversation.chat_messages.length)}`);
  rows.push(`- **Redaction:** ${options.redact ? 'enabled' : 'DISABLED'}`);
  const included: string[] = [];
  if (options.includeTools === true) included.push('tools');
  if (options.includeAttachments === true) included.push('attachments');
  if (included.length > 0) {
    rows.push(`- **Includes:** ${included.join(', ')}`);
  }
  return rows.join('\n');
}

function renderMessage(message: ClaudeAiMessage, ctx: RenderContext): string {
  const segments: string[] = [];

  for (const block of message.content) {
    const rendered = renderBlock(block, ctx);
    if (rendered.length > 0) segments.push(rendered);
  }

  if (ctx.includeAttachments && message.attachments !== undefined) {
    for (const att of message.attachments) {
      segments.push(renderAttachment(att));
    }
  }

  if (message.files !== undefined && message.files.length > 0) {
    for (const file of message.files) {
      segments.push(renderFileRef(file));
    }
  }

  return segments.join('\n\n');
}

function renderBlock(block: ClaudeAiContentBlock, ctx: RenderContext): string {
  if (block.type === 'text') {
    const text = block.text.trim();
    if (text.length === 0) return '';
    if (block.citations !== undefined && block.citations.length > 0) {
      return appendFootnoteMarkers(text, block.citations, ctx);
    }
    return text;
  }
  if (block.type === 'tool_use' && ctx.includeTools) {
    return renderToolUse(block.name, block.id, block.input);
  }
  if (block.type === 'tool_result' && ctx.includeTools) {
    return renderToolResult(block.tool_use_id, block.content);
  }
  return '';
}

/**
 * Append markdown footnote markers `[^N]` to the text. We do NOT try to
 * anchor them at each citation's exact byte offset — claude.ai's
 * `start_index` / `end_index` refer to the original (pre-render) text
 * which may have been tool-modified, and one wrong offset mangles the
 * whole paragraph. Instead we cluster all markers at the end of the
 * block, which is how most AI UIs render citations anyway.
 */
function appendFootnoteMarkers(
  text: string,
  citations: readonly ClaudeAiCitation[],
  ctx: RenderContext,
): string {
  const markers: string[] = [];
  for (const citation of citations) {
    const index = ctx.footnotes.length + 1;
    markers.push(`[^${String(index)}]`);
    const url = citation.details.url ?? '(no url)';
    ctx.footnotes.push(`[^${String(index)}]: ${url}`);
  }
  return `${text}${markers.join('')}`;
}

function renderAttachment(att: ClaudeAiAttachment): string {
  const content = att.extracted_content;
  if (content === undefined || content.length === 0) {
    return `*[adjunto: ${att.file_name} — sin texto extraído]*`;
  }
  return [
    `<details><summary>📎 <strong>adjunto</strong>: <code>${att.file_name}</code></summary>`,
    '',
    fenceCode(content),
    '',
    '</details>',
  ].join('\n');
}

function renderFileRef(file: ClaudeAiFileRef): string {
  // These are pure references: the raw bytes are NOT in the export ZIP,
  // only the file name and UUID. We surface them as a short note so the
  // reader knows something was attached that we could not render.
  return `*[archivo adjunto: ${file.file_name} — binario no incluido en el export]*`;
}
