import { describe, expect, it } from 'vitest';

import {
  type ChatGptConversation,
  type ChatGptMappingNode,
} from '../../../src/importers/chatgpt/schema.js';
import {
  activeBranchMessages,
  messageBodyAsText,
} from '../../../src/importers/chatgpt/walk.js';

/**
 * These tests run against a synthetic fixture written from public docs
 * before we have a real ChatGPT export ZIP to validate against.
 * Adjust the fixture once a real export lands — the structural
 * invariants (root walk, branching, malformed shapes) should still
 * hold but field names may need tweaking.
 */

function node(
  id: string,
  parent: string | null,
  children: string[],
  message: ChatGptMappingNode['message'],
): ChatGptMappingNode {
  return { id, parent, children, message };
}

function textMessage(id: string, role: 'user' | 'assistant', text: string) {
  return {
    id,
    author: { role },
    create_time: 0,
    content: { content_type: 'text' as const, parts: [text] },
  };
}

describe('activeBranchMessages', () => {
  it('walks from current_node up to the synthetic root and reverses', () => {
    // root → user1 → assistant1 → user2 → assistant2 (current)
    const conv: ChatGptConversation = {
      create_time: 0,
      mapping: {
        root: node('root', null, ['u1'], null),
        u1: node('u1', 'root', ['a1'], textMessage('u1', 'user', 'Hi')),
        a1: node('a1', 'u1', ['u2'], textMessage('a1', 'assistant', 'Hello')),
        u2: node('u2', 'a1', ['a2'], textMessage('u2', 'user', 'How are you?')),
        a2: node('a2', 'u2', [], textMessage('a2', 'assistant', 'Good')),
      },
      current_node: 'a2',
    };
    const msgs = activeBranchMessages(conv);
    expect(msgs.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
  });

  it('follows only the active branch when there are siblings (regenerated reply)', () => {
    // root → u1 → [a1_old, a1_new] (current via a1_new)
    const conv: ChatGptConversation = {
      create_time: 0,
      mapping: {
        root: node('root', null, ['u1'], null),
        u1: node('u1', 'root', ['a1_old', 'a1_new'], textMessage('u1', 'user', 'Hi')),
        a1_old: node('a1_old', 'u1', [], textMessage('a1_old', 'assistant', 'Old reply')),
        a1_new: node('a1_new', 'u1', [], textMessage('a1_new', 'assistant', 'New reply')),
      },
      current_node: 'a1_new',
    };
    const msgs = activeBranchMessages(conv);
    expect(msgs.map((m) => m.id)).toEqual(['u1', 'a1_new']);
    expect(msgs.find((m) => m.id === 'a1_old')).toBeUndefined();
  });

  it('skips synthetic nodes whose message is null', () => {
    const conv: ChatGptConversation = {
      create_time: 0,
      mapping: {
        root: node('root', null, ['u1'], null),
        u1: node('u1', 'root', [], textMessage('u1', 'user', 'Solo')),
      },
      current_node: 'u1',
    };
    const msgs = activeBranchMessages(conv);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.id).toBe('u1');
  });

  it('returns [] on a dangling current_node ref', () => {
    const conv: ChatGptConversation = {
      create_time: 0,
      mapping: {
        root: node('root', null, [], null),
      },
      current_node: 'does-not-exist',
    };
    expect(activeBranchMessages(conv)).toEqual([]);
  });

  it('returns [] on a parent cycle (defensive)', () => {
    const conv: ChatGptConversation = {
      create_time: 0,
      mapping: {
        a: node('a', 'b', [], textMessage('a', 'user', 'a')),
        b: node('b', 'a', [], textMessage('b', 'assistant', 'b')),
      },
      current_node: 'a',
    };
    expect(activeBranchMessages(conv)).toEqual([]);
  });
});

describe('messageBodyAsText', () => {
  it('joins text parts with newlines', () => {
    const msg = textMessage('m', 'assistant', 'first');
    msg.content.parts = ['first', 'second'];
    expect(messageBodyAsText(msg)).toBe('first\nsecond');
  });

  it('renders a code block with language tag', () => {
    expect(
      messageBodyAsText({
        id: 'm',
        author: { role: 'assistant' },
        content: {
          content_type: 'code',
          language: 'python',
          text: 'print("hi")',
        },
      }),
    ).toBe('```python\nprint("hi")\n```');
  });

  it('falls back to a tagged JSON dump for unknown content_type', () => {
    const out = messageBodyAsText({
      id: 'm',
      author: { role: 'assistant' },
      content: { content_type: 'mystery_blob', parts: [{ x: 1 }] },
    });
    expect(out).toContain('[mystery_blob]');
    expect(out).toContain('"x":1');
  });

  it('JSON-stringifies non-string parts in multimodal_text', () => {
    const out = messageBodyAsText({
      id: 'm',
      author: { role: 'user' },
      content: {
        content_type: 'multimodal_text',
        parts: ['caption', { content_type: 'image_asset_pointer', asset_pointer: 'file-x' }],
      },
    });
    expect(out).toContain('caption');
    expect(out).toContain('image_asset_pointer');
  });
});
