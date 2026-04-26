import {
  type ChatGptConversation,
  type ChatGptMessage,
} from '../importers/chatgpt/schema.js';
import { activeBranchMessages } from '../importers/chatgpt/walk.js';
import { emptyReport, redact, type RedactionReport } from '../redactors/index.js';

import { fenceCode, stringifyJson } from './markdown-shared.js';

export interface ChatGptFormatOptions {
  readonly redact: boolean;
  readonly includeTools?: boolean;
}

export interface ChatGptFormatResult {
  readonly markdown: string;
  readonly report: RedactionReport;
}

/**
 * Render a single ChatGPT conversation as Markdown.
 *
 * Walks only the *active* branch (the one shown when the user clicked
 * Export); sibling branches from regenerated replies are dropped.
 * Output mirrors the visual style of the claude.ai formatter so users
 * importing from both sources see one consistent shape.
 */
export function formatChatGptConversation(
  conversation: ChatGptConversation,
  options: ChatGptFormatOptions,
): ChatGptFormatResult {
  const includeTools = options.includeTools !== false;
  const report = emptyReport();

  const title = conversation.title ?? '(untitled)';
  const createdIso = new Date(conversation.create_time * 1000).toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`> Source: chatgpt.com — exported ${createdIso}`);
  lines.push('');

  for (const message of activeBranchMessages(conversation)) {
    const block = renderMessage(message, includeTools, options.redact, report);
    if (block === undefined) continue;
    lines.push(block);
    lines.push('');
  }

  return { markdown: lines.join('\n').trimEnd() + '\n', report };
}

function renderMessage(
  message: ChatGptMessage,
  includeTools: boolean,
  shouldRedact: boolean,
  report: RedactionReport,
): string | undefined {
  const role = message.author.role;
  const recipient = message.recipient ?? 'all';

  // System messages are model conditioning, not part of the visible
  // conversation — skipping them keeps the export readable.
  if (role === 'system') return undefined;

  if (role === 'tool') {
    if (!includeTools) return undefined;
    const body = renderBody(message, shouldRedact, report);
    if (body.trim().length === 0) return undefined;
    return [
      '<details><summary><strong>tool_result</strong></summary>',
      '',
      body,
      '',
      '</details>',
    ].join('\n');
  }

  // Assistant messages with `recipient !== 'all'` are tool calls
  // (assistant routing a payload to a tool like `browser` or `python`),
  // not user-facing replies.
  if (role === 'assistant' && recipient !== 'all') {
    if (!includeTools) return undefined;
    const body = renderBody(message, shouldRedact, report);
    if (body.trim().length === 0) return undefined;
    return [
      `<details><summary><strong>tool_use</strong>: <code>${recipient}</code></summary>`,
      '',
      body,
      '',
      '</details>',
    ].join('\n');
  }

  const body = renderBody(message, shouldRedact, report);
  if (body.trim().length === 0) return undefined;
  const heading = role === 'user' ? '## User' : '## Assistant';
  return `${heading}\n\n${body}`;
}

function renderBody(
  message: ChatGptMessage,
  shouldRedact: boolean,
  report: RedactionReport,
): string {
  const content = message.content;
  const maybeRedact = (s: string): string => shouldRedact ? redact(s, report) : s;

  switch (content.content_type) {
    case 'text':
      return maybeRedact(joinTextParts(content.parts ?? []));

    case 'multimodal_text':
      // ChatGPT's multimodal payload mixes plain string parts with
      // image_asset_pointer objects (and sometimes audio refs). String
      // parts render as paragraphs; non-strings get a [Image: file-...]
      // marker so the user knows an attachment was there without leaking
      // the raw JSON. The actual file lives in the export ZIP under
      // assets/ and isn't bundled into the .md (Tier 3).
      return maybeRedact(renderMultimodalParts(content.parts ?? []));

    case 'code': {
      const text = content.text ?? '';
      return fenceCode(maybeRedact(text), content.language ?? undefined);
    }

    case 'execution_output': {
      const text = content.text ?? '';
      return fenceCode(maybeRedact(text));
    }

    case 'thoughts':
      // Reasoning models (o1, o3, etc.) expose intermediate reasoning
      // as an array of `{summary, content}` items. Collapsed by default
      // — most users want to read the final reply, not the chain.
      return renderThoughts(content.thoughts ?? [], maybeRedact);

    case 'reasoning_recap':
      // Short summary that follows a `thoughts` block, written by the
      // model itself. Render compact, no collapsible — usually 1-3 lines.
      return renderReasoningRecap(content, maybeRedact);

    case 'tether_quote':
    case 'tether_browsing_display':
      // Browsing citations: the model quoted (or referenced) external
      // content during a search. Render as a blockquote with the source.
      return renderTetherCitation(content, maybeRedact);

    case 'system_error':
      // Tool/runtime error surface. Render as a warning callout so it's
      // visually distinct from regular content.
      return renderSystemError(content, maybeRedact);

    default: {
      // Unknown content_type — surface the type tag + JSON dump so
      // nothing is silently lost. Schema gets tightened against real
      // export data.
      const dump = stringifyJson(content.parts ?? content);
      return `\`[${content.content_type}]\`\n\n${fenceCode(dump)}`;
    }
  }
}

function joinTextParts(parts: readonly unknown[]): string {
  return parts
    .filter((p): p is string => typeof p === 'string')
    .join('\n\n')
    .trim();
}

/**
 * Mixed-mode multimodal: strings as paragraphs, images as compact
 * `[Image: file-XXX]` markers. Non-string non-image objects fall back
 * to `[Attachment]` so we never silently drop them.
 */
function renderMultimodalParts(parts: readonly unknown[]): string {
  const lines: string[] = [];
  for (const p of parts) {
    if (typeof p === 'string') {
      const trimmed = p.trim();
      if (trimmed.length > 0) lines.push(trimmed);
      continue;
    }
    if (p === null || typeof p !== 'object') continue;
    const obj = p as Record<string, unknown>;
    if (obj.content_type === 'image_asset_pointer'
        && typeof obj.asset_pointer === 'string') {
      lines.push(`*[Image: ${obj.asset_pointer}]*`);
      continue;
    }
    const ct = typeof obj.content_type === 'string' ? obj.content_type : 'attachment';
    lines.push(`*[${ct}]*`);
  }
  return lines.join('\n\n').trim();
}

function renderThoughts(
  thoughts: readonly unknown[],
  maybeRedact: (s: string) => string,
): string {
  const items: string[] = [];
  for (const t of thoughts) {
    if (t === null || typeof t !== 'object') continue;
    const obj = t as Record<string, unknown>;
    const summary = typeof obj.summary === 'string' ? obj.summary : undefined;
    const body = typeof obj.content === 'string' ? obj.content : undefined;
    if (summary === undefined && body === undefined) continue;
    const heading = summary !== undefined ? `**${maybeRedact(summary)}**` : '';
    const text = body !== undefined ? maybeRedact(body) : '';
    items.push([heading, text].filter((s) => s.length > 0).join('\n\n'));
  }
  if (items.length === 0) return '';
  return [
    '<details><summary><em>Reasoning</em></summary>',
    '',
    items.join('\n\n'),
    '',
    '</details>',
  ].join('\n');
}

function renderReasoningRecap(
  content: ChatGptMessage['content'],
  maybeRedact: (s: string) => string,
): string {
  const body = content.content ?? content.text ?? content.summary ?? '';
  if (body.length === 0) return '';
  const safe = maybeRedact(body);
  return `> *Reasoning recap.* ${safe}`;
}

function renderTetherCitation(
  content: ChatGptMessage['content'],
  maybeRedact: (s: string) => string,
): string {
  // Fields here are `string | null | undefined` — coerce null to
  // undefined upfront so the downstream checks read uniformly.
  const title = content.title ?? undefined;
  const url = content.url ?? undefined;
  const domain = content.domain ?? undefined;
  const text = content.text ?? undefined;

  const lines: string[] = [];
  if (title !== undefined && url !== undefined) {
    lines.push(`> 🔗 [${maybeRedact(title)}](${url})`);
  } else if (url !== undefined) {
    lines.push(`> 🔗 <${url}>`);
  } else if (title !== undefined) {
    lines.push(`> 🔗 ${maybeRedact(title)}`);
  } else {
    lines.push(`> 🔗 *(browsing)*`);
  }
  if (domain !== undefined && url === undefined) {
    lines.push(`> *${domain}*`);
  }
  if (text !== undefined && text.trim().length > 0) {
    lines.push('>');
    for (const line of maybeRedact(text).split('\n')) {
      lines.push(`> ${line}`);
    }
  }
  return lines.join('\n');
}

function renderSystemError(
  content: ChatGptMessage['content'],
  maybeRedact: (s: string) => string,
): string {
  const name = content.name ?? 'system_error';
  const body = content.text ?? content.content ?? '';
  const safe = body.length > 0 ? maybeRedact(body) : '';
  if (safe.length === 0) return `> ⚠️ \`${name}\``;
  return `> ⚠️ \`${name}\`\n>\n> ${safe.split('\n').join('\n> ')}`;
}
