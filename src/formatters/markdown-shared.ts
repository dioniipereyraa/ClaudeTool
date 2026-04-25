/**
 * Rendering helpers shared between the Claude Code markdown formatter
 * (`markdown.ts`) and the claude.ai web importer formatter
 * (`claudeai-markdown.ts`). Both surfaces produce the same visual
 * style for tool_use / tool_result / fenced code so a user flipping
 * between exports sees a consistent look.
 *
 * These helpers are deliberately content-agnostic (no knowledge of
 * event shapes): they take the minimum data needed and return a
 * markdown string. Keeping them here lets each caller stay focused on
 * its own schema.
 */

/**
 * Collapsible `<details>` block for a tool call. `id` is optional so
 * this helper works for claude.ai's export (where `id` can be missing
 * on some older blocks) and Claude Code's .jsonl (where it's always
 * present).
 */
export function renderToolUse(name: string, id: string | undefined, input: unknown): string {
  const json = stringifyJson(input);
  const idSuffix = id !== undefined ? ` <sub>(id: ${id})</sub>` : '';
  return [
    `<details><summary><strong>tool_use</strong>: <code>${name}</code>${idSuffix}</summary>`,
    '',
    '```json',
    json,
    '```',
    '',
    '</details>',
  ].join('\n');
}

/**
 * Collapsible `<details>` block for a tool result. `toolUseId` is
 * optional — claude.ai occasionally omits it on very old exports.
 */
export function renderToolResult(toolUseId: string | undefined, content: unknown): string {
  const body = renderToolResultContent(content);
  const header =
    toolUseId !== undefined
      ? `<details><summary><strong>tool_result</strong> <sub>(for id: ${toolUseId})</sub></summary>`
      : '<details><summary><strong>tool_result</strong></summary>';
  return [header, '', body, '', '</details>'].join('\n');
}

function renderToolResultContent(content: unknown): string {
  if (typeof content === 'string') {
    return fenceCode(content);
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (item !== null && typeof item === 'object' && 'type' in item) {
        const typed = item as { type: string; text?: unknown };
        if (typed.type === 'text' && typeof typed.text === 'string') {
          parts.push(fenceCode(typed.text));
          continue;
        }
      }
      parts.push(fenceCode(stringifyJson(item)));
    }
    return parts.join('\n\n');
  }
  return fenceCode(stringifyJson(content));
}

/**
 * Wrap text in a markdown code fence. Uses a 4-backtick fence when the
 * content itself contains triple backticks, so embedded code blocks in
 * a tool_result don't escape the fence.
 *
 * Optional `lang` tag is appended to the opening fence (e.g. `python`).
 * Empty bodies always render as `(empty)` without a language tag — a
 * language hint on an empty block reads as a bug to a human reader.
 */
export function fenceCode(text: string, lang?: string): string {
  const trimmed = text.replace(/\s+$/u, '');
  if (trimmed.length === 0) return '```\n(empty)\n```';
  const needsLongFence = trimmed.includes('```');
  const fence = needsLongFence ? '````' : '```';
  const tag = lang !== undefined && lang.length > 0 ? lang : '';
  return `${fence}${tag}\n${trimmed}\n${fence}`;
}

export function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return String(value);
  }
}
