import { describe, expect, it } from 'vitest';

import {
  parseConversations,
  parseSingleConversation,
} from '../../../src/importers/chatgpt/schema.js';

/**
 * Schema-level smoke tests against synthetic fixtures shaped after
 * public docs of ChatGPT's `conversations.json` format. Tighten these
 * once a real export ZIP is available.
 */

const minimalConversation = {
  conversation_id: 'c-1',
  title: 'Test conversation',
  create_time: 1_700_000_000,
  current_node: 'a1',
  mapping: {
    root: { id: 'root', parent: null, children: ['u1'], message: null },
    u1: {
      id: 'u1',
      parent: 'root',
      children: ['a1'],
      message: {
        id: 'u1',
        author: { role: 'user' },
        create_time: 1_700_000_001,
        content: { content_type: 'text', parts: ['hi'] },
      },
    },
    a1: {
      id: 'a1',
      parent: 'u1',
      children: [],
      message: {
        id: 'a1',
        author: { role: 'assistant' },
        create_time: 1_700_000_002,
        content: { content_type: 'text', parts: ['hello'] },
      },
    },
  },
};

describe('parseConversations', () => {
  it('accepts a minimal valid array', () => {
    const out = parseConversations([minimalConversation]);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(1);
    expect(out?.[0]?.title).toBe('Test conversation');
  });

  it('returns null when the top-level value is not an array', () => {
    expect(parseConversations({ not: 'an array' })).toBeNull();
  });

  it('silently drops unknown fields (strip behavior)', () => {
    // We intentionally do NOT use zod's `.passthrough()` on the
    // chatgpt schemas: unknown fields are dropped after parsing so
    // downstream types stay clean. Forward-compat lives in the
    // optional/unknown fields we DO declare, not in opaque passthrough.
    const withExtras = {
      ...minimalConversation,
      futureField: 'whatever',
    };
    const out = parseConversations([withExtras]);
    expect(out).not.toBeNull();
    expect((out?.[0] as Record<string, unknown>).futureField).toBeUndefined();
    // Sanity: a known field still survives.
    expect(out?.[0]?.title).toBe('Test conversation');
  });
});

describe('parseSingleConversation', () => {
  it('accepts a single conversation object', () => {
    expect(parseSingleConversation(minimalConversation)).not.toBeNull();
  });

  it('rejects a value missing the mapping field', () => {
    const { mapping: _mapping, ...broken } = minimalConversation;
    expect(parseSingleConversation(broken)).toBeNull();
  });

  it('rejects a value missing current_node', () => {
    const { current_node: _cn, ...broken } = minimalConversation;
    expect(parseSingleConversation(broken)).toBeNull();
  });
});
