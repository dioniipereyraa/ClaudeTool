import { type ClaudeAiConversation, type ClaudeAiMessage } from './schema.js';

/**
 * claude.ai's internal `chat_conversations` API, when fetched with
 * `?rendering_mode=messages`, replaces tool blocks the calling
 * "device" cannot render with the literal string:
 *
 *   ```
 *   This block is not supported on your current device yet.
 *   ```
 *
 * The placeholder lives inside a regular `text` block (typically
 * fenced in triple backticks). Both the markdown formatter and the
 * Claude Code .jsonl generator preserve text blocks verbatim, so the
 * noise rides through to whatever surface the user reads (the .md
 * file, Claude Code's `/resume` view).
 *
 * We strip it once, at the data layer, so every downstream formatter
 * sees clean conversation. Removed in:
 *   - The fenced form (most common): triple backticks around the line.
 *   - The bare line form (rare but observed in some content).
 *
 * Multiple consecutive blank lines left behind are collapsed to two,
 * so the output reads as a normal paragraph break instead of a gap.
 */

const PLACEHOLDER_LITERAL = 'This block is not supported on your current device yet.';

// Triple-backtick fenced placeholder (with optional language tag and surrounding
// whitespace).  Greedy on whitespace so we eat the trailing newlines too.
const FENCED_PLACEHOLDER_RE = new RegExp(
  '```[A-Za-z]*\\s*\\n?\\s*' +
    escapeRegex(PLACEHOLDER_LITERAL) +
    '\\s*\\n?\\s*```',
  'g',
);

// Bare line form (no fences). Multiline mode so `^` and `$` match line breaks.
const BARE_PLACEHOLDER_RE = new RegExp(
  '^\\s*' + escapeRegex(PLACEHOLDER_LITERAL) + '\\s*$',
  'gm',
);

// Three-or-more consecutive newlines → exactly two newlines (one blank line).
const EXTRA_BLANKS_RE = /\n{3,}/g;

/**
 * Returns a copy of the conversation with the placeholder strings
 * stripped from every text block. Non-text blocks pass through
 * untouched.
 */
export function stripUnsupportedBlockPlaceholders(
  conversation: ClaudeAiConversation,
): ClaudeAiConversation {
  return {
    ...conversation,
    chat_messages: conversation.chat_messages.map(cleanMessage),
  };
}

function cleanMessage(message: ClaudeAiMessage): ClaudeAiMessage {
  const cleaned = message.content.map((block) => {
    if (block.type !== 'text') return block;
    const cleanText = cleanTextBlockBody(block.text);
    return { ...block, text: cleanText };
  });
  return { ...message, content: cleaned };
}

/**
 * Public for tests — internal callers should go through
 * `stripUnsupportedBlockPlaceholders`. Exported so the strip rules
 * can be exercised directly without building a full conversation.
 */
export function cleanTextBlockBody(text: string): string {
  return text
    .replace(FENCED_PLACEHOLDER_RE, '')
    .replace(BARE_PLACEHOLDER_RE, '')
    .replace(EXTRA_BLANKS_RE, '\n\n')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
