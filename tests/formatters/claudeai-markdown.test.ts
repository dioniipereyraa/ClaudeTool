import { describe, expect, it } from 'vitest';

import { formatConversation } from '../../src/formatters/claudeai-markdown.js';
import {
  parseConversations,
  type ClaudeAiConversation,
} from '../../src/importers/claudeai/schema.js';

function makeConversation(partial: Partial<ClaudeAiConversation> & { chat_messages: unknown }): ClaudeAiConversation {
  const parsed = parseConversations([
    {
      uuid: partial.uuid ?? 'conv-1',
      name: partial.name ?? 'Test',
      created_at: partial.created_at ?? '2026-01-10T12:00:00Z',
      chat_messages: partial.chat_messages,
    },
  ]);
  if (parsed?.[0] === undefined) {
    throw new Error('fixture failed to parse');
  }
  return parsed[0];
}

describe('formatConversation', () => {
  it('renders a basic human ↔ assistant conversation with header + sections', () => {
    const conv = makeConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'human',
          created_at: '2026-01-10T12:00:01Z',
          content: [{ type: 'text', text: 'Hola, ¿qué tal?' }],
        },
        {
          uuid: 'm2',
          sender: 'assistant',
          created_at: '2026-01-10T12:00:02Z',
          content: [{ type: 'text', text: 'Hola, ¡bien! ¿En qué te ayudo?' }],
        },
      ],
    });

    const { markdown } = formatConversation(conv, { redact: true });

    expect(markdown).toContain('# Exportal — claude.ai conversation');
    expect(markdown).toContain('**Messages:** 2');
    expect(markdown).toContain('**Redaction:** enabled');
    expect(markdown).toContain('## User');
    expect(markdown).toContain('## Assistant');
    expect(markdown).toContain('Hola, ¿qué tal?');
    expect(markdown).toContain('Hola, ¡bien!');
  });

  it('merges consecutive same-role messages into a single section', () => {
    const conv = makeConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'human',
          created_at: '2026-01-10T12:00:01Z',
          content: [{ type: 'text', text: 'primera' }],
        },
        {
          uuid: 'm2',
          sender: 'human',
          created_at: '2026-01-10T12:00:02Z',
          content: [{ type: 'text', text: 'segunda' }],
        },
      ],
    });
    const { markdown } = formatConversation(conv, { redact: true });
    // Only one "## User" header, even though there are two human messages.
    const userHeaders = markdown.match(/^## User$/gm) ?? [];
    expect(userHeaders.length).toBe(1);
    expect(markdown).toContain('primera');
    expect(markdown).toContain('segunda');
  });

  it('redacts paths and tokens by default; --no-redact leaves them', () => {
    const conv = makeConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'human',
          created_at: '2026-01-10T12:00:01Z',
          content: [
            {
              type: 'text',
              text: 'mirá esto: /home/user/.env y sk-ant-api03-abcdefghijklmnopqrstuvwxyz01.',
            },
          ],
        },
      ],
    });

    const redacted = formatConversation(conv, { redact: true });
    expect(redacted.markdown).not.toContain('/home/user/.env');
    expect(redacted.markdown).not.toContain('sk-ant-api03-abcdef');
    expect(redacted.markdown).toContain('<PATH>');
    expect(redacted.markdown).toContain('<REDACTED:anthropic>');
    expect(redacted.report.paths).toBeGreaterThan(0);
    expect(redacted.report.secrets).toBeGreaterThan(0);

    const unredacted = formatConversation(conv, { redact: false });
    expect(unredacted.markdown).toContain('/home/user/.env');
    expect(unredacted.markdown).toContain('**Redaction:** DISABLED');
    expect(unredacted.report.paths).toBe(0);
  });

  it('renders citations as footnote markers with a Referencias section', () => {
    const conv = makeConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'assistant',
          created_at: '2026-01-10T12:00:01Z',
          content: [
            {
              type: 'text',
              text: 'Según Anthropic, Claude sabe hacer cosas.',
              citations: [
                {
                  uuid: 'c1',
                  start_index: 0,
                  end_index: 10,
                  details: { type: 'web_search_result', url: 'https://anthropic.com/news' },
                },
                {
                  uuid: 'c2',
                  start_index: 11,
                  end_index: 20,
                  details: { type: 'web_search_result', url: 'https://example.com' },
                },
              ],
            },
          ],
        },
      ],
    });

    const { markdown } = formatConversation(conv, { redact: true });
    expect(markdown).toMatch(/Claude sabe hacer cosas\.\[\^1\]\[\^2\]/);
    expect(markdown).toContain('## Referencias');
    expect(markdown).toContain('[^1]: https://anthropic.com/news');
    expect(markdown).toContain('[^2]: https://example.com');
  });

  it('default behavior hides tool_use and tool_result (regression guard)', () => {
    const conv = makeConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'assistant',
          created_at: '2026-01-10T12:00:01Z',
          content: [
            { type: 'text', text: 'Voy a buscar en la web.' },
            { type: 'tool_use', id: 'toolu_1', name: 'web_search', input: { query: 'anthropic' } },
          ],
        },
        {
          uuid: 'm2',
          sender: 'human',
          created_at: '2026-01-10T12:00:02Z',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'resultados de búsqueda' },
          ],
        },
      ],
    });

    const { markdown } = formatConversation(conv, { redact: true });
    expect(markdown).toContain('Voy a buscar en la web.');
    expect(markdown).not.toContain('<details>');
    expect(markdown).not.toContain('tool_use');
    expect(markdown).not.toContain('resultados de búsqueda');
    // User turn only had a tool_result with no visible text → section skipped.
    expect(markdown).not.toContain('## User');
  });

  it('--include-tools renders tool_use and tool_result as collapsibles', () => {
    const conv = makeConversation({
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
              input: { query: 'anthropic news' },
            },
          ],
        },
        {
          uuid: 'm2',
          sender: 'human',
          created_at: '2026-01-10T12:00:02Z',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'some results' },
          ],
        },
      ],
    });

    const { markdown } = formatConversation(conv, { redact: true, includeTools: true });
    expect(markdown).toContain('**Includes:** tools');
    expect(markdown).toContain('<details>');
    expect(markdown).toContain('<strong>tool_use</strong>');
    expect(markdown).toContain('<code>web_search</code>');
    expect(markdown).toContain('<strong>tool_result</strong>');
    expect(markdown).toContain('some results');
  });

  it('--include-attachments renders extracted_content as a collapsible', () => {
    const conv = makeConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'human',
          created_at: '2026-01-10T12:00:01Z',
          content: [{ type: 'text', text: 'mirá este archivo' }],
          attachments: [
            {
              file_name: 'notas.txt',
              extracted_content: 'este es el contenido del archivo\ncon varias líneas',
            },
          ],
        },
      ],
    });

    const defaultRun = formatConversation(conv, { redact: true });
    expect(defaultRun.markdown).not.toContain('adjunto');
    expect(defaultRun.markdown).not.toContain('contenido del archivo');

    const withFlag = formatConversation(conv, { redact: true, includeAttachments: true });
    expect(withFlag.markdown).toContain('**Includes:** attachments');
    expect(withFlag.markdown).toContain('📎');
    expect(withFlag.markdown).toContain('notas.txt');
    expect(withFlag.markdown).toContain('contenido del archivo');
  });

  it('renders file references as short notes even without flags', () => {
    const conv = makeConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'human',
          created_at: '2026-01-10T12:00:01Z',
          content: [{ type: 'text', text: 'adjunto una imagen' }],
          files: [{ file_uuid: 'f1', file_name: 'diagrama.png' }],
        },
      ],
    });

    const { markdown } = formatConversation(conv, { redact: true });
    expect(markdown).toContain('diagrama.png');
    expect(markdown).toContain('binario no incluido');
  });

  it('skips empty messages entirely', () => {
    const conv = makeConversation({
      chat_messages: [
        {
          uuid: 'm1',
          sender: 'assistant',
          created_at: '2026-01-10T12:00:01Z',
          content: [{ type: 'text', text: '   ' }],
        },
      ],
    });
    const { markdown } = formatConversation(conv, { redact: true });
    expect(markdown).not.toContain('## Assistant');
  });
});
