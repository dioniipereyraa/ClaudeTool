import { describe, expect, it } from 'vitest';

import { stripTerminalControl } from '../../src/cli/io.js';

describe('stripTerminalControl', () => {
  it('preserves regular markdown text', () => {
    const input = '# Hello\n\nA paragraph with `code` and **bold**.';
    expect(stripTerminalControl(input)).toBe(input);
  });

  it('preserves tabs, newlines, and carriage returns', () => {
    const input = 'col1\tcol2\nrow2\r\n';
    expect(stripTerminalControl(input)).toBe(input);
  });

  it('strips ANSI escape sequences (CSI ESC [)', () => {
    const esc = String.fromCharCode(0x1b);
    const input = `before${esc}[31mred${esc}[0mafter`;
    const out = stripTerminalControl(input);
    expect(out).toBe('before[31mred[0mafter');
    expect(out).not.toContain(esc);
  });

  it('strips OSC 0 window-title spoof', () => {
    const esc = String.fromCharCode(0x1b);
    const bel = String.fromCharCode(0x07);
    const input = `start ${esc}]0;malicious title${bel} end`;
    const out = stripTerminalControl(input);
    expect(out).not.toContain(esc);
    expect(out).not.toContain(bel);
  });

  it('strips DEL (U+007F)', () => {
    const del = String.fromCharCode(0x7f);
    const input = `before${del}after`;
    expect(stripTerminalControl(input)).toBe('beforeafter');
  });

  it('strips C0 control range below 0x20 except 0x09 (tab), 0x0A (LF), 0x0D (CR)', () => {
    const buf = [];
    for (let i = 0; i < 0x20; i++) buf.push(String.fromCharCode(i));
    const input = buf.join('');
    const out = stripTerminalControl(input);
    expect(out.length).toBe(3); // tab, LF, CR survive
    expect(out).toContain('\t');
    expect(out).toContain('\n');
    expect(out).toContain('\r');
  });
});
