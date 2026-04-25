import { describe, expect, it } from 'vitest';

import { formatChatGptConversation } from '../../src/formatters/chatgpt-markdown.js';
import {
  type ChatGptConversation,
  type ChatGptMappingNode,
} from '../../src/importers/chatgpt/schema.js';

/**
 * Tests run against synthetic fixtures shaped after public docs of
 * ChatGPT's `conversations.json`. Focus is on STRUCTURAL invariants
 * (heading order, role mapping, code-block fences, branch following)
 * — fields that are definitely correct from the documented format.
 *
 * Once a real export ZIP is available, add a fixture-driven test that
 * loads the actual JSON and asserts no `[unknown content_type]` markers
 * leak through. Edge-case content_types get unit tests as we discover
 * them in the wild.
 */

function node(
  id: string,
  parent: string | null,
  children: string[],
  message: ChatGptMappingNode['message'],
): ChatGptMappingNode {
  return { id, parent, children, message };
}

function textMessage(
  id: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  text: string,
  recipient?: string,
) {
  const msg: {
    id: string;
    author: { role: typeof role };
    content: { content_type: 'text'; parts: string[] };
    recipient?: string;
  } = {
    id,
    author: { role },
    content: { content_type: 'text', parts: [text] },
  };
  if (recipient !== undefined) msg.recipient = recipient;
  return msg;
}

function makeConversation(
  title: string,
  mapping: Record<string, ChatGptMappingNode>,
  currentNode: string,
): ChatGptConversation {
  return {
    title,
    create_time: 1_700_000_000,
    mapping,
    current_node: currentNode,
  };
}

describe('formatChatGptConversation', () => {
  it('renders a basic user/assistant exchange with the expected headings', () => {
    const conv = makeConversation(
      'Hello world',
      {
        root: node('root', null, ['u1'], null),
        u1: node('u1', 'root', ['a1'], textMessage('u1', 'user', 'Hi there')),
        a1: node('a1', 'u1', [], textMessage('a1', 'assistant', 'Hello!')),
      },
      'a1',
    );
    const { markdown } = formatChatGptConversation(conv, { redact: false });
    expect(markdown).toContain('# Hello world');
    expect(markdown).toContain('> Source: chatgpt.com');
    expect(markdown).toContain('## User');
    expect(markdown).toContain('Hi there');
    expect(markdown).toContain('## Assistant');
    expect(markdown).toContain('Hello!');
    // User comes before Assistant
    expect(markdown.indexOf('## User')).toBeLessThan(markdown.indexOf('## Assistant'));
  });

  it('uses (untitled) when title is null', () => {
    const conv = makeConversation('', { root: node('root', null, [], null) }, 'root');
    conv.title = null;
    const { markdown } = formatChatGptConversation(conv, { redact: false });
    expect(markdown).toContain('# (untitled)');
  });

  it('skips system messages from the rendered output', () => {
    const conv = makeConversation(
      'With system',
      {
        root: node('root', null, ['s1'], null),
        s1: node('s1', 'root', ['u1'], textMessage('s1', 'system', 'Be helpful.')),
        u1: node('u1', 's1', [], textMessage('u1', 'user', 'Real prompt')),
      },
      'u1',
    );
    const { markdown } = formatChatGptConversation(conv, { redact: false });
    expect(markdown).not.toContain('Be helpful.');
    expect(markdown).toContain('Real prompt');
  });

  it('renders a code message as a fenced block with language tag', () => {
    const conv = makeConversation(
      'Code chat',
      {
        root: node('root', null, ['a1'], null),
        a1: node('a1', 'root', [], {
          id: 'a1',
          author: { role: 'assistant' },
          content: { content_type: 'code', language: 'python', text: 'print("hi")' },
        }),
      },
      'a1',
    );
    const { markdown } = formatChatGptConversation(conv, { redact: false });
    expect(markdown).toContain('```python\nprint("hi")\n```');
  });

  it('drops tool plumbing when includeTools=false', () => {
    const conv = makeConversation(
      'Tool chat',
      {
        root: node('root', null, ['a1'], null),
        a1: node(
          'a1',
          'root',
          ['t1'],
          textMessage('a1', 'assistant', 'search the web', 'browser'),
        ),
        t1: node('t1', 'a1', [], textMessage('t1', 'tool', 'search results here')),
      },
      't1',
    );
    const { markdown } = formatChatGptConversation(conv, {
      redact: false,
      includeTools: false,
    });
    expect(markdown).not.toContain('tool_use');
    expect(markdown).not.toContain('tool_result');
    expect(markdown).not.toContain('search the web');
    expect(markdown).not.toContain('search results here');
  });

  it('renders tool calls as collapsible details when includeTools=true', () => {
    const conv = makeConversation(
      'Tool chat',
      {
        root: node('root', null, ['a1'], null),
        a1: node(
          'a1',
          'root',
          ['t1'],
          textMessage('a1', 'assistant', 'search query: cats', 'browser'),
        ),
        t1: node('t1', 'a1', [], textMessage('t1', 'tool', 'cat results...')),
      },
      't1',
    );
    const { markdown } = formatChatGptConversation(conv, { redact: false });
    expect(markdown).toContain('<details><summary><strong>tool_use</strong>: <code>browser</code></summary>');
    expect(markdown).toContain('search query: cats');
    expect(markdown).toContain('<details><summary><strong>tool_result</strong></summary>');
    expect(markdown).toContain('cat results...');
  });

  it('treats assistant messages with recipient="all" as visible replies, not tool calls', () => {
    const conv = makeConversation(
      'Recipient test',
      {
        root: node('root', null, ['a1'], null),
        a1: node('a1', 'root', [], textMessage('a1', 'assistant', 'Visible reply', 'all')),
      },
      'a1',
    );
    const { markdown } = formatChatGptConversation(conv, { redact: false });
    expect(markdown).toContain('## Assistant');
    expect(markdown).toContain('Visible reply');
    expect(markdown).not.toContain('tool_use');
  });

  it('falls back to a [type] marker for unknown content_type, never silently drops', () => {
    const conv = makeConversation(
      'Unknown content',
      {
        root: node('root', null, ['a1'], null),
        a1: node('a1', 'root', [], {
          id: 'a1',
          author: { role: 'assistant' },
          content: { content_type: 'tether_browsing_display', parts: [{ url: 'x.com' }] },
        }),
      },
      'a1',
    );
    const { markdown } = formatChatGptConversation(conv, { redact: false });
    expect(markdown).toContain('[tether_browsing_display]');
    expect(markdown).toContain('"url":');
    expect(markdown).toContain('x.com');
  });

  it('follows only the active branch (regenerated reply scenario)', () => {
    const conv = makeConversation(
      'Regen',
      {
        root: node('root', null, ['u1'], null),
        u1: node('u1', 'root', ['a_old', 'a_new'], textMessage('u1', 'user', 'Question')),
        a_old: node('a_old', 'u1', [], textMessage('a_old', 'assistant', 'Old answer')),
        a_new: node('a_new', 'u1', [], textMessage('a_new', 'assistant', 'New answer')),
      },
      'a_new',
    );
    const { markdown } = formatChatGptConversation(conv, { redact: false });
    expect(markdown).toContain('New answer');
    expect(markdown).not.toContain('Old answer');
  });

  it('emits a single trailing newline regardless of message count', () => {
    const conv = makeConversation(
      'Trailing',
      {
        root: node('root', null, ['u1'], null),
        u1: node('u1', 'root', [], textMessage('u1', 'user', 'just one')),
      },
      'u1',
    );
    const { markdown } = formatChatGptConversation(conv, { redact: false });
    expect(markdown.endsWith('\n')).toBe(true);
    expect(markdown.endsWith('\n\n')).toBe(false);
  });
});
