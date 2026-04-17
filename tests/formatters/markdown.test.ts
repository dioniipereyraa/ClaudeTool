import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readJsonl } from '../../src/core/reader.js';
import { parseEvent } from '../../src/core/schema.js';
import { describeSession } from '../../src/core/session.js';
import { formatAsMarkdown } from '../../src/formatters/markdown.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', 'fixtures', 'minimal.jsonl');
const COMPACT_FIXTURE = join(here, '..', 'fixtures', 'with-compact.jsonl');

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
    const event = parseEvent({
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
    });
    expect(event).not.toBeNull();
    const metadata = {
      sessionId: 's',
      filePath: '/tmp/s.jsonl',
      turnCount: 0,
      compactCount: 0,
    };
    const { markdown } = formatAsMarkdown([event!], metadata, { redact: true });
    expect(markdown).not.toContain('## Assistant');
  });
});

describe('formatAsMarkdown — compact rendering', () => {
  it('renders the boundary as a quote and labels the summary distinctly', async () => {
    const events = await readJsonl(COMPACT_FIXTURE);
    const metadata = await describeSession(COMPACT_FIXTURE);
    const { markdown } = formatAsMarkdown(events, metadata, { redact: true });

    expect(metadata.compactCount).toBe(1);
    expect(metadata.turnCount).toBe(2); // summary user event doesn't count.
    expect(markdown).toContain('**Compactions:** 1');
    expect(markdown).toContain('> — compact boundary');
    expect(markdown).toContain('trigger: manual');
    expect(markdown).toContain('pre-compact tokens: 12345');
    expect(markdown).toContain('## Compact summary');
    expect(markdown).toContain('Summary: hablamos de X y Y');
    // Pre-compact text must be present when skipPrecompact is off.
    expect(markdown).toContain('Primera pregunta antes del compact');
    expect(markdown).toContain('Pregunta posterior al compact');
  });

  it('drops pre-compact events when skipPrecompact is enabled', async () => {
    const events = await readJsonl(COMPACT_FIXTURE);
    const metadata = await describeSession(COMPACT_FIXTURE);
    const { markdown } = formatAsMarkdown(events, metadata, {
      redact: true,
      skipPrecompact: true,
    });

    expect(markdown).toContain('Pre-compact events:** omitted');
    expect(markdown).toContain('> — compact boundary');
    expect(markdown).toContain('## Compact summary');
    expect(markdown).toContain('Pregunta posterior al compact');
    // Pre-compact conversation must be gone.
    expect(markdown).not.toContain('Primera pregunta antes del compact');
    expect(markdown).not.toContain('Respuesta anterior al compact');
  });
});
