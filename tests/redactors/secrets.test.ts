import { describe, expect, it } from 'vitest';

import { redactSecrets } from '../../src/redactors/secrets.js';

describe('redactSecrets', () => {
  it('redacts Anthropic API keys', () => {
    const out = redactSecrets('my key is sk-ant-api03-abcdefghij1234567890xyz done.');
    expect(out.text).toContain('<REDACTED:anthropic>');
    expect(out.byType.anthropic).toBe(1);
  });

  it('redacts GitHub classic PATs', () => {
    const token = `ghp_${'a'.repeat(36)}`;
    const out = redactSecrets(`token=${token} end`);
    expect(out.text).toContain('<REDACTED:github-classic>');
    expect(out.byType['github-classic']).toBe(1);
  });

  it('redacts fine-grained GitHub tokens', () => {
    const token = `github_pat_${'x'.repeat(22)}`;
    const out = redactSecrets(`pat=${token} end`);
    expect(out.text).toContain('<REDACTED:github-fine>');
  });

  it('redacts AWS access keys', () => {
    const out = redactSecrets('AWS_ACCESS_KEY_ID=AKIA0123456789ABCDEF ok');
    expect(out.text).toContain('<REDACTED:aws-access-key>');
    expect(out.byType['aws-access-key']).toBe(1);
  });

  it('reports zero when nothing matches', () => {
    const out = redactSecrets('plain prose without secrets');
    expect(out.redactedCount).toBe(0);
    expect(out.text).toBe('plain prose without secrets');
  });
});
