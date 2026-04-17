import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readJsonl } from '../../src/core/reader.js';
import { describeSession } from '../../src/core/session.js';
import { formatAsMarkdown } from '../../src/formatters/markdown.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', 'fixtures', 'minimal.jsonl');

describe('formatAsMarkdown', () => {
  it('produces a header and alternating User / Assistant sections with redaction on', async () => {
    const events = await readJsonl(FIXTURE);
    const metadata = await describeSession(FIXTURE);
    const { markdown, report } = formatAsMarkdown(events, metadata, { redact: true });

    expect(markdown).toContain('# Exportal session');
    expect(markdown).toContain('**Model:** `claude-opus-4-7`');
    expect(markdown).toContain('**Redaction:** enabled');
    expect(markdown).toContain('## User');
    expect(markdown).toContain('## Assistant');

    // Secrets and paths from the fixture should be redacted.
    expect(markdown).not.toContain('sk-ant-api03-abcdefghij');
    expect(markdown).not.toContain('/home/user/archivo.txt');
    expect(markdown).not.toContain('C:\\secret\\config.env');
    expect(markdown).toContain('<REDACTED:anthropic>');
    expect(markdown).toContain('<PATH>');

    expect(report.secrets).toBeGreaterThan(0);
    expect(report.paths).toBeGreaterThan(0);
  });

  it('leaves sensitive content in place when redaction is disabled', async () => {
    const events = await readJsonl(FIXTURE);
    const metadata = await describeSession(FIXTURE);
    const { markdown, report } = formatAsMarkdown(events, metadata, { redact: false });

    expect(markdown).toContain('**Redaction:** DISABLED');
    expect(markdown).toContain('sk-ant-api03-');
    expect(report.secrets).toBe(0);
    expect(report.paths).toBe(0);
  });

  it('skips events that only contain tool_use or thinking blocks (no text)', () => {
    const events = [
      {
        type: 'assistant',
        uuid: 'a',
        parentUuid: null,
        timestamp: '2026-01-01T00:00:00Z',
        sessionId: 's',
        message: {
          role: 'assistant',
          model: 'x',
          content: [{ type: 'tool_use', id: 't', name: 'Read', input: {} }],
        },
      },
    ];
    const metadata = {
      sessionId: 's',
      filePath: '/tmp/s.jsonl',
      turnCount: 0,
    };
    const { markdown } = formatAsMarkdown(events, metadata, { redact: true });
    expect(markdown).not.toContain('## Assistant');
  });
});
