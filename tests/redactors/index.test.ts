import { describe, expect, it } from 'vitest';

import { emptyReport, redact } from '../../src/redactors/index.js';

describe('redact', () => {
  it('accumulates path and secret counts into the report', () => {
    const report = emptyReport();
    const input =
      'config at C:\\Users\\x\\cred.env with key sk-ant-api03-abcdefghij1234567890xyz';
    const out = redact(input, report);
    expect(out).toContain('<PATH>');
    expect(out).toContain('<REDACTED:anthropic>');
    expect(report.paths).toBe(1);
    expect(report.secrets).toBe(1);
    expect(report.secretsByType.anthropic).toBe(1);
  });

  it('preserves clean text unchanged', () => {
    const report = emptyReport();
    const out = redact('nothing to see here', report);
    expect(out).toBe('nothing to see here');
    expect(report.paths).toBe(0);
    expect(report.secrets).toBe(0);
  });
});
