import { describe, expect, it } from 'vitest';

import { parseEvent } from '../../src/core/schema.js';
import { formatAsClaudeCodeJsonl } from '../../src/formatters/claude-code-jsonl.js';
import { type ClaudeAiConversation } from '../../src/importers/claudeai/schema.js';

/**
 * Tests for the .jsonl generator (Hito 19).
 *
 * The strongest correctness check is a round-trip through this repo's
 * own Claude Code reader (`parseEvent`) — if our output is loadable by
 * the same Zod schema we use to parse real `.jsonl` files, we know the
 * shape matches what Claude Code's reader expects (modulo the
 * undocumented bits that the reader doesn't enforce).
 *
 * The deterministic UUID injector keeps assertions stable. In real
 * usage the formatter falls back to crypto.randomUUID().
 */

function deterministicUuid(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
  };
}

function buildConversation(
  partial: Partial<ClaudeAiConversation> = {},
): ClaudeAiConversation {
  return {
    uuid: 'conv-uuid-1',
    name: 'Test conversation',
    created_at: '2026-04-23T10:00:00.000Z',
    chat_messages: [],
    ...partial,
  };
}

const baseOpts = {
  cwd: 'd:\\Dionisio\\ClaudeTool',
  gitBranch: 'main',
  version: '2.1.114',
  sessionId: '11111111-1111-4111-8111-111111111111',
};

describe('formatAsClaudeCodeJsonl', () => {
  it('returns empty string + supplied sessionId for a conversation with no messages', () => {
    const result = formatAsClaudeCodeJsonl(buildConversation(), baseOpts);
    expect(result.jsonl).toBe('');
    expect(result.sessionId).toBe(baseOpts.sessionId);
  });

  it('emits one event per message and chains parentUuid in order', () => {
    const conversation = buildConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'human',
          created_at: '2026-04-23T10:00:00.000Z',
          content: [{ type: 'text', text: 'Hola' }],
        },
        {
          uuid: 'm2',
          sender: 'assistant',
          created_at: '2026-04-23T10:00:01.000Z',
          content: [{ type: 'text', text: 'Hola, qué tal' }],
        },
        {
          uuid: 'm3',
          sender: 'human',
          created_at: '2026-04-23T10:00:02.000Z',
          content: [{ type: 'text', text: 'Bien gracias' }],
        },
      ],
    });
    const result = formatAsClaudeCodeJsonl(conversation, {
      ...baseOpts,
      uuid: deterministicUuid(),
    });
    const lines = result.jsonl.trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(events[0]?.parentUuid).toBeNull();
    // Each event's parentUuid points at the previous event's uuid.
    expect(events[1]?.parentUuid).toBe(events[0]?.uuid);
    expect(events[2]?.parentUuid).toBe(events[1]?.uuid);
    expect(events[0]?.type).toBe('user');
    expect(events[1]?.type).toBe('assistant');
    expect(events[2]?.type).toBe('user');
  });

  it('every event round-trips through the Claude Code event parser', () => {
    const conversation = buildConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'human',
          created_at: '2026-04-23T10:00:00.000Z',
          content: [{ type: 'text', text: 'Pregunta inicial' }],
        },
        {
          uuid: 'm2',
          sender: 'assistant',
          created_at: '2026-04-23T10:00:01.000Z',
          content: [{ type: 'text', text: 'Respuesta del modelo' }],
        },
      ],
    });
    const { jsonl } = formatAsClaudeCodeJsonl(conversation, baseOpts);
    const lines = jsonl.trimEnd().split('\n');
    const parsed = lines.map((l) => parseEvent(JSON.parse(l)));
    // parseEvent returns null on schema mismatch; if any event fails,
    // we know our output would be silently dropped by the real reader.
    expect(parsed.every((e) => e !== null)).toBe(true);
    // Sanity: the parsed events agree on type with the source order.
    expect(parsed.map((e) => e?.type)).toEqual(['user', 'assistant']);
  });

  it('skips thinking blocks (no signature available to forge)', () => {
    const conversation = buildConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'assistant',
          created_at: '2026-04-23T10:00:00.000Z',
          content: [
            // The schema lets thinking through .passthrough() — we still need to
            // assert it gets dropped from the generator output.
            { type: 'text', text: 'Real answer' },
          ],
        },
      ],
    });
    // Inject a thinking block bypassing the typed schema (real
    // claude.ai conversations sometimes have them depending on model
    // settings; the formatter must drop them either way).
    (conversation.chat_messages[0]!.content as unknown[]).unshift({
      type: 'thinking',
      thinking: 'Internal monologue that should NOT appear',
    });

    const { jsonl } = formatAsClaudeCodeJsonl(conversation, baseOpts);
    expect(jsonl).not.toContain('Internal monologue');
    expect(jsonl).toContain('Real answer');
  });

  it('flattens tool_use blocks into a labelled text marker', () => {
    const conversation = buildConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'assistant',
          created_at: '2026-04-23T10:00:00.000Z',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_x',
              name: 'web_search',
              input: { query: 'hello' },
            },
            { type: 'text', text: 'Found something.' },
          ],
        },
      ],
    });
    const { jsonl } = formatAsClaudeCodeJsonl(conversation, baseOpts);
    const event = JSON.parse(jsonl.trimEnd()) as {
      message: { content: { type: string; text: string }[] };
    };
    const text = event.message.content[0]!.text;
    expect(text).toContain('[Tool: web_search]');
    expect(text).toContain('"query":"hello"');
    expect(text).toContain('Found something.');
  });

  it('flattens tool_result blocks into a labelled text marker', () => {
    const conversation = buildConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'human',
          created_at: '2026-04-23T10:00:00.000Z',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_x',
              content: 'search response body',
            },
          ],
        },
      ],
    });
    const { jsonl } = formatAsClaudeCodeJsonl(conversation, baseOpts);
    const event = JSON.parse(jsonl.trimEnd()) as {
      message: { content: { type: string; text: string }[] };
    };
    expect(event.message.content[0]!.text).toBe(
      '[Tool result] search response body',
    );
  });

  it('falls back to message.text when content blocks yield nothing useful', () => {
    const conversation = buildConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'human',
          created_at: '2026-04-23T10:00:00.000Z',
          text: 'fallback text',
          // Empty content array → blockToText returns nothing → use fallback.
          content: [],
        },
      ],
    });
    const { jsonl } = formatAsClaudeCodeJsonl(conversation, baseOpts);
    const event = JSON.parse(jsonl.trimEnd()) as {
      message: { content: { text: string }[] };
    };
    expect(event.message.content[0]!.text).toBe('fallback text');
  });

  it('tags events as imported (synthetic markers in identifiers)', () => {
    const conversation = buildConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'assistant',
          created_at: '2026-04-23T10:00:00.000Z',
          content: [{ type: 'text', text: 'response' }],
        },
      ],
    });
    const { jsonl, sessionId } = formatAsClaudeCodeJsonl(conversation, baseOpts);
    const event = JSON.parse(jsonl.trimEnd()) as {
      requestId: string;
      message: { id: string; model: string };
      sessionId: string;
    };
    expect(event.requestId).toBe(`exportal-imported-${sessionId}`);
    expect(event.message.id).toMatch(/^msg_imported_/);
    expect(event.message.model).toBe('claude-imported-from-claude-ai');
    expect(event.sessionId).toBe(sessionId);
  });

  it('uses crypto.randomUUID by default for sessionId', () => {
    // Don't pass sessionId; trust the default. The shape is validated
    // (UUID v4 format), exact value is not.
    const conversation = buildConversation();
    const { sessionId } = formatAsClaudeCodeJsonl(conversation, {
      cwd: baseOpts.cwd,
      gitBranch: baseOpts.gitBranch,
      version: baseOpts.version,
    });
    expect(sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
