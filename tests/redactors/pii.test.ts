import { describe, expect, it } from 'vitest';

import { redactPii } from '../../src/redactors/pii.js';

describe('redactPii', () => {
  it('redacts a basic email address', () => {
    const out = redactPii('contact me at alice@example.com or skip');
    expect(out.text).toBe('contact me at <REDACTED:email> or skip');
    expect(out.byType.email).toBe(1);
  });

  it('redacts emails with plus-tag and dots', () => {
    const out = redactPii('first.last+tag@sub.example.co.uk reaches me');
    expect(out.text).toContain('<REDACTED:email>');
    expect(out.byType.email).toBe(1);
  });

  it('redacts an IPv4 address', () => {
    const out = redactPii('the server at 192.168.1.42 is mine');
    expect(out.text).toBe('the server at <REDACTED:ipv4> is mine');
    expect(out.byType.ipv4).toBe(1);
  });

  it('rejects out-of-range IPv4 octets', () => {
    const out = redactPii('not 999.1.1.1 not 256.0.0.0 ok');
    expect(out.byType.ipv4).toBeUndefined();
  });

  it('redacts a canonical IPv6 address', () => {
    const out = redactPii('reach 2001:0db8:85a3:0000:0000:8a2e:0370:7334 over');
    expect(out.text).toContain('<REDACTED:ipv6>');
  });

  it('redacts a shortened IPv6 form like 2001:db8::1', () => {
    const out = redactPii('host 2001:db8::1 fine');
    expect(out.text).toContain('<REDACTED:ipv6>');
  });

  it('reports zero when nothing matches', () => {
    const out = redactPii('plain prose without contact details');
    expect(out.redactedCount).toBe(0);
    expect(out.text).toBe('plain prose without contact details');
  });

  it('counts multiple occurrences in one pass', () => {
    const out = redactPii('a@b.com c@d.org 10.0.0.1 1.2.3.4');
    expect(out.byType.email).toBe(2);
    expect(out.byType.ipv4).toBe(2);
    expect(out.redactedCount).toBe(4);
  });
});
