import { describe, expect, it } from 'vitest';

import { redactPaths } from '../../src/redactors/paths.js';

describe('redactPaths', () => {
  it('redacts Windows paths', () => {
    const input = 'Read C:\\Users\\alice\\secrets.env and moved on.';
    const out = redactPaths(input);
    expect(out.text).toBe('Read <PATH> and moved on.');
    expect(out.redactedCount).toBe(1);
  });

  it('redacts Unix home paths', () => {
    const input = 'The file at /home/bob/app.log is large.';
    const out = redactPaths(input);
    expect(out.text).toContain('<PATH>');
    expect(out.redactedCount).toBe(1);
  });

  it('redacts /Users paths on macOS', () => {
    const input = 'opened /Users/charlie/docs/plan.md yesterday';
    const out = redactPaths(input);
    expect(out.text).toBe('opened <PATH> yesterday');
    expect(out.redactedCount).toBe(1);
  });

  it('leaves relative paths and unrelated text alone', () => {
    const input = 'src/index.ts and the README.md are fine';
    const out = redactPaths(input);
    expect(out.text).toBe(input);
    expect(out.redactedCount).toBe(0);
  });

  it('counts multiple paths', () => {
    const out = redactPaths('C:\\a\\b and C:\\c\\d');
    expect(out.redactedCount).toBe(2);
  });

  it('stops at backticks so markdown code spans stay intact', () => {
    const input = 'Edit `C:\\Users\\x\\file.ts` now';
    const out = redactPaths(input);
    expect(out.text).toBe('Edit `<PATH>` now');
  });
});
