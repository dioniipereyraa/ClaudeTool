import { describe, expect, it } from 'vitest';

import { buildPreview, humanSize } from '../../src/cli/preview.js';
import { emptyReport, type RedactionReport } from '../../src/redactors/index.js';

function makeReport(partial: Partial<RedactionReport> = {}): RedactionReport {
  return { ...emptyReport(), ...partial };
}

function makeMarkdown(lineCount: number): string {
  return Array.from({ length: lineCount }, (_, i) => `line ${String(i + 1)}`).join('\n');
}

describe('buildPreview', () => {
  it('shows the whole document when it is short enough', () => {
    const md = makeMarkdown(20); // head + tail + 10 buffer = 40 threshold, 20 < 40.
    const preview = buildPreview(md, '/tmp/out.md', makeReport(), true, {
      headLines: 15,
      tailLines: 15,
    });
    expect(preview).toContain('line 1');
    expect(preview).toContain('line 20');
    expect(preview).not.toContain('lines omitted');
  });

  it('truncates long documents with a head/tail/gap marker', () => {
    const md = makeMarkdown(200);
    const preview = buildPreview(md, '/tmp/out.md', makeReport(), true, {
      headLines: 10,
      tailLines: 10,
    });
    expect(preview).toContain('line 1');
    expect(preview).toContain('line 10');
    expect(preview).toContain('line 200');
    expect(preview).toContain('line 191');
    expect(preview).toContain('[... 180 lines omitted ...]');
    // Lines well in the middle must be absent.
    expect(preview).not.toContain('line 100');
  });

  it('includes target path and human-readable size', () => {
    const md = makeMarkdown(50);
    const preview = buildPreview(md, 'C:\\exports\\session.md', makeReport(), true, {
      headLines: 15,
      tailLines: 15,
    });
    expect(preview).toContain('Target: C:\\exports\\session.md');
    expect(preview).toMatch(/\(\d+(?:\.\d+)?\s*(B|KB|MB), 50 lines\)/);
  });

  it('summarizes redaction stats when redaction is enabled', () => {
    const report = makeReport({
      paths: 3,
      secrets: 2,
      secretsByType: { anthropic: 1, 'github-classic': 1 },
    });
    const preview = buildPreview(makeMarkdown(5), '/tmp/out.md', report, true, {
      headLines: 15,
      tailLines: 15,
    });
    expect(preview).toContain('Redaction: 3 path(s), 2 secret(s)');
    expect(preview).toContain('1xanthropic');
    expect(preview).toContain('1xgithub-classic');
  });

  it('reports "no sensitive patterns found" when nothing was redacted', () => {
    const preview = buildPreview(makeMarkdown(5), '/tmp/out.md', makeReport(), true, {
      headLines: 15,
      tailLines: 15,
    });
    expect(preview).toContain('no sensitive patterns found');
  });

  it('warns loudly when redaction is disabled', () => {
    const preview = buildPreview(makeMarkdown(5), '/tmp/out.md', makeReport(), false, {
      headLines: 15,
      tailLines: 15,
    });
    expect(preview).toContain('Redaction: DISABLED');
    expect(preview).toContain('paths, tokens, or PII');
  });
});

describe('humanSize', () => {
  it('formats bytes', () => {
    expect(humanSize(0)).toBe('0 B');
    expect(humanSize(512)).toBe('512 B');
    expect(humanSize(1023)).toBe('1023 B');
  });

  it('formats kilobytes with one decimal', () => {
    expect(humanSize(1024)).toBe('1.0 KB');
    expect(humanSize(1536)).toBe('1.5 KB');
    expect(humanSize(12583)).toBe('12.3 KB');
  });

  it('formats megabytes with one decimal', () => {
    expect(humanSize(1024 * 1024)).toBe('1.0 MB');
    expect(humanSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });
});
