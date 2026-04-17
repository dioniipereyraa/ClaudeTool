import { describe, expect, it } from 'vitest';

import {
  parseConversations,
  parseMemories,
  parseProjects,
  parseUsers,
} from '../../../src/importers/claudeai/schema.js';

const minimalConv = {
  uuid: 'conv-1',
  name: 'Test conversation',
  created_at: '2026-01-10T12:00:00Z',
  chat_messages: [
    {
      uuid: 'm1',
      sender: 'human',
      created_at: '2026-01-10T12:00:01Z',
      content: [{ type: 'text', text: 'Hola' }],
    },
    {
      uuid: 'm2',
      sender: 'assistant',
      created_at: '2026-01-10T12:00:02Z',
      content: [{ type: 'text', text: 'Hola, ¿en qué te ayudo?' }],
    },
  ],
};

describe('parseConversations', () => {
  it('accepts a minimal conversations file', () => {
    const parsed = parseConversations([minimalConv]);
    expect(parsed).not.toBeNull();
    expect(parsed?.length).toBe(1);
    expect(parsed?.[0]?.chat_messages.length).toBe(2);
  });

  it('accepts tool_use and tool_result content blocks with passthrough fields', () => {
    const conv = {
      ...minimalConv,
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'assistant',
          created_at: '2026-01-10T12:00:01Z',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'web_search',
              input: { query: 'anthropic' },
              integration_name: 'built_in',
              is_mcp_app: false,
              unknown_future_field: 'preserved',
            },
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: [{ type: 'text', text: 'results' }],
              is_error: false,
            },
          ],
        },
      ],
    };
    const parsed = parseConversations([conv]);
    expect(parsed).not.toBeNull();
    const block = parsed?.[0]?.chat_messages[0]?.content[0];
    expect(block?.type).toBe('tool_use');
    // passthrough preserves unknown fields
    expect((block as unknown as { unknown_future_field: string }).unknown_future_field).toBe(
      'preserved',
    );
  });

  it('accepts attachments with extracted_content and file references', () => {
    const conv = {
      ...minimalConv,
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'human',
          created_at: '2026-01-10T12:00:01Z',
          content: [{ type: 'text', text: 'ver archivo' }],
          attachments: [
            { file_name: 'notas.txt', extracted_content: 'contenido' },
          ],
          files: [{ file_uuid: 'f1', file_name: 'imagen.png' }],
        },
      ],
    };
    const parsed = parseConversations([conv]);
    expect(parsed).not.toBeNull();
    expect(parsed?.[0]?.chat_messages[0]?.attachments?.[0]?.file_name).toBe('notas.txt');
    expect(parsed?.[0]?.chat_messages[0]?.files?.[0]?.file_uuid).toBe('f1');
  });

  it('rejects a conversation missing required fields', () => {
    expect(parseConversations([{ uuid: 'x', name: 'y' }])).toBeNull();
  });

  it('rejects a non-array payload', () => {
    expect(parseConversations({ conversations: [] })).toBeNull();
  });
});

describe('parseUsers / parseMemories / parseProjects', () => {
  it('parseUsers accepts a minimal user profile', () => {
    const parsed = parseUsers([{ uuid: 'u1', full_name: 'Dio' }]);
    expect(parsed?.[0]?.uuid).toBe('u1');
  });

  it('parseMemories accepts a minimal memory object', () => {
    const parsed = parseMemories([{ conversations_memory: 'resumen' }]);
    expect(parsed?.[0]?.conversations_memory).toBe('resumen');
  });

  it('parseProjects accepts a project with nested docs', () => {
    const parsed = parseProjects([
      {
        uuid: 'p1',
        name: 'Proyecto',
        docs: [{ uuid: 'd1', filename: 'readme.md', content: 'hola' }],
      },
    ]);
    expect(parsed?.[0]?.docs?.[0]?.filename).toBe('readme.md');
  });

  it('all parsers return null on completely invalid input', () => {
    expect(parseUsers('not-an-array')).toBeNull();
    expect(parseMemories(42)).toBeNull();
    expect(parseProjects(null)).toBeNull();
  });
});
