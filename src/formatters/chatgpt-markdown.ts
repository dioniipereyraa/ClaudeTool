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
  switch (content.content_type) {
    case 'text':
    case 'multimodal_text': {
      const parts = content.parts ?? [];
      const rendered = parts
        .map((p) => (typeof p === 'string' ? p : `\`\`\`json\n${stringifyJson(p)}\n\`\`\``))
        .join('\n\n')
        .trim();
      return shouldRedact ? redact(rendered, report) : rendered;
    }
    case 'code': {
      const text = content.text ?? '';
      const safe = shouldRedact ? redact(text, report) : text;
      return fenceCode(safe, content.language);
    }
    case 'execution_output': {
      const text = content.text ?? '';
      const safe = shouldRedact ? redact(text, report) : text;
      return fenceCode(safe);
    }
    default: {
      // Unknown content_type — surface the type tag + JSON dump so
      // nothing is silently lost. Schema gets tightened against real
      // export data.
      const dump = stringifyJson(content.parts ?? content);
      return `\`[${content.content_type}]\`\n\n${fenceCode(dump)}`;
    }
  }
}
