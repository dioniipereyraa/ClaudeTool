import { describe, expect, it } from 'vitest';

import {
  cleanTextBlockBody,
  stripUnsupportedBlockPlaceholders,
} from '../../../src/importers/claudeai/cleanup.js';
import { type ClaudeAiConversation } from '../../../src/importers/claudeai/schema.js';

/**
 * Focuses on the exact noise pattern claude.ai's
 * `?rendering_mode=messages` endpoint inserts when it can't render a
 * tool block for the calling client. The string is constant — only
 * the surrounding whitespace and code-fence presence vary.
 */

describe('cleanTextBlockBody', () => {
  it('strips the standard fenced placeholder and collapses gaps', () => {
    const input = [
      'Busco info actualizada sobre ambas.',
      '',
      '',
      '```',
      'This block is not supported on your current device yet.',
      '```',
      '',
      '',
      '',
      '```',
      'This block is not supported on your current device yet.',
      '```',
      '',
      '',
      '',
      '**Transporte público:** Sí, hay varias opciones.',
    ].join('\n');
    const out = cleanTextBlockBody(input);
    expect(out).not.toContain('This block is not supported');
    expect(out).not.toContain('```');
    // Only single blank lines remain between the surviving paragraphs.
    expect(out).not.toMatch(/\n\n\n/);
    expect(out).toContain('Busco info actualizada sobre ambas.');
    expect(out).toContain('**Transporte público:**');
  });

  it('handles a fence with a language tag right before the placeholder', () => {
    const input = '```text\nThis block is not supported on your current device yet.\n```';
    expect(cleanTextBlockBody(input)).toBe('');
  });

  it('strips the bare-line variant (no fences)', () => {
    const input = [
      'Some intro.',
      'This block is not supported on your current device yet.',
      'Some outro.',
    ].join('\n');
    expect(cleanTextBlockBody(input)).toBe('Some intro.\n\nSome outro.');
  });

  it('leaves unrelated text untouched', () => {
    const input = 'Just regular text without the placeholder anywhere.';
    expect(cleanTextBlockBody(input)).toBe(input);
  });

  it('returns an empty string when the entire body is the placeholder', () => {
    const input = '```\nThis block is not supported on your current device yet.\n```';
    expect(cleanTextBlockBody(input)).toBe('');
  });

  it('does NOT strip near-misses (different wording)', () => {
    // Defensive: a future Anthropic change could rephrase the message.
    // Until we see a new variant in the wild, we only catch the exact
    // string. The test pins this behaviour so a sloppy regex broadening
    // (e.g. "matches any sentence with `not supported`") is caught.
    const input = 'Some block is not supported anywhere.';
    expect(cleanTextBlockBody(input)).toBe(input);
  });
});

describe('stripUnsupportedBlockPlaceholders', () => {
  it('cleans every text block across every message', () => {
    const conversation: ClaudeAiConversation = {
      uuid: 'c',
      name: 't',
      created_at: '2026-04-23T20:00:00.000Z',
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'human',
          created_at: '2026-04-23T20:00:00.000Z',
          content: [
            { type: 'text', text: 'Pregunta limpia.' },
          ],
        },
        {
          uuid: 'm2',
          sender: 'assistant',
          created_at: '2026-04-23T20:00:01.000Z',
          content: [
            {
              type: 'text',
              text: 'Respuesta:\n```\nThis block is not supported on your current device yet.\n```\nseguimos.',
            },
          ],
        },
      ],
    };
    const cleaned = stripUnsupportedBlockPlaceholders(conversation);
    expect(cleaned.chat_messages[0]?.content[0]).toEqual({
      type: 'text',
      text: 'Pregunta limpia.',
    });
    const second = cleaned.chat_messages[1]?.content[0];
    expect(second?.type).toBe('text');
    if (second?.type === 'text') {
      expect(second.text).not.toContain('not supported');
      expect(second.text).toContain('Respuesta:');
      expect(second.text).toContain('seguimos.');
    }
  });

  it('does not mutate the input conversation', () => {
    const messageText = '```\nThis block is not supported on your current device yet.\n```';
    const conversation: ClaudeAiConversation = {
      uuid: 'c',
      name: 't',
      created_at: '2026-04-23T20:00:00.000Z',
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'assistant',
          created_at: '2026-04-23T20:00:01.000Z',
          content: [{ type: 'text', text: messageText }],
        },
      ],
    };
    stripUnsupportedBlockPlaceholders(conversation);
    // Original still has the noise — strip returned a new object.
    const original = conversation.chat_messages[0]?.content[0];
    if (original?.type === 'text') {
      expect(original.text).toBe(messageText);
    }
  });

  it('passes non-text blocks through untouched', () => {
    const conversation: ClaudeAiConversation = {
      uuid: 'c',
      name: 't',
      created_at: '2026-04-23T20:00:00.000Z',
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'assistant',
          created_at: '2026-04-23T20:00:01.000Z',
          content: [
            { type: 'tool_use', id: 't1', name: 'web_search', input: { q: 'x' } },
            { type: 'text', text: 'after the tool call' },
          ],
        },
      ],
    };
    const cleaned = stripUnsupportedBlockPlaceholders(conversation);
    const blocks = cleaned.chat_messages[0]?.content ?? [];
    expect(blocks[0]?.type).toBe('tool_use');
    expect(blocks[1]?.type).toBe('text');
  });
});
