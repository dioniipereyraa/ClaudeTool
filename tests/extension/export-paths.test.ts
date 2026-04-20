import { describe, expect, it } from 'vitest';

import { buildExportTimestamp, slugify } from '../../src/extension/export-paths.js';

describe('buildExportTimestamp', () => {
  it('formats a Date as YYYY-MM-DD-HHmm with zero-padding', () => {
    const d = new Date(2026, 3, 5, 9, 7); // Apr 5 2026 09:07 (month is 0-indexed)
    expect(buildExportTimestamp(d)).toBe('2026-04-05-0907');
  });

  it('handles end-of-year boundary', () => {
    const d = new Date(2026, 11, 31, 23, 59); // Dec 31 2026 23:59
    expect(buildExportTimestamp(d)).toBe('2026-12-31-2359');
  });

  it('sorts lexically in chronological order', () => {
    const a = buildExportTimestamp(new Date(2026, 3, 5, 9, 7));
    const b = buildExportTimestamp(new Date(2026, 3, 5, 10, 0));
    const c = buildExportTimestamp(new Date(2026, 3, 6, 0, 0));
    expect([c, a, b].sort()).toEqual([a, b, c]);
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips diacritics from Spanish input', () => {
    expect(slugify('Código en producción')).toBe('codigo-en-produccion');
  });

  it('collapses runs of non-alphanumeric chars into a single hyphen', () => {
    expect(slugify('foo!!!  bar???baz')).toBe('foo-bar-baz');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('!!hola!!')).toBe('hola');
  });

  it('caps length at 40 chars and re-trims trailing hyphens from the cut', () => {
    const long = 'a'.repeat(30) + ' ' + 'b'.repeat(30);
    const s = slugify(long);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith('-')).toBe(false);
  });

  it('returns a placeholder for strings with no alphanumeric content', () => {
    expect(slugify('???')).toBe('conversacion');
    expect(slugify('')).toBe('conversacion');
    expect(slugify('   ')).toBe('conversacion');
  });

  it('preserves numeric content', () => {
    expect(slugify('Report 2026-Q1')).toBe('report-2026-q1');
  });
});
