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

  it('redacts /var, /etc, /opt, /srv, /mnt, /tmp on Linux', () => {
    const cases = [
      { input: 'Edit /var/log/nginx/access.log please', want: 'Edit <PATH> please' },
      { input: 'Read /etc/passwd carefully', want: 'Read <PATH> carefully' },
      { input: 'Build artifact at /opt/myapp/bin/app', want: 'Build artifact at <PATH>' },
      { input: 'Mount lives at /mnt/data/foo', want: 'Mount lives at <PATH>' },
      { input: 'Tmp file: /tmp/foo.txt removed', want: 'Tmp file: <PATH> removed' },
      { input: 'Service at /srv/www/index.html', want: 'Service at <PATH>' },
    ];
    for (const c of cases) {
      const out = redactPaths(c.input);
      expect(out.text).toBe(c.want);
      expect(out.redactedCount).toBe(1);
    }
  });

  it('does NOT redact /etc-like fragments inside URLs', () => {
    const input = 'See https://example.com/etc/foo and https://docs.x.org/var/y for refs';
    const out = redactPaths(input);
    expect(out.text).toBe(input);
    expect(out.redactedCount).toBe(0);
  });

  it('redacts the ~/ home shortcut', () => {
    const out = redactPaths('Tail ~/.bashrc and ~/projects/x.md');
    expect(out.text).toBe('Tail <PATH> and <PATH>');
    expect(out.redactedCount).toBe(2);
  });

  it('does NOT redact ~/ when prefixed with alphanumeric (URL fragment, etc.)', () => {
    const input = 'visit https://example.com/~user is fine';
    const out = redactPaths(input);
    expect(out.text).toBe(input);
    expect(out.redactedCount).toBe(0);
  });

  it('redacts Windows UNC paths', () => {
    const out = redactPaths('Saved to \\\\server01\\share\\folder\\file.txt today.');
    expect(out.text).toBe('Saved to <PATH> today.');
    expect(out.redactedCount).toBe(1);
  });

  it('redacts file:// URIs', () => {
    const out = redactPaths('Open file:///Users/alice/notes.md right now.');
    expect(out.text).toBe('Open <PATH> right now.');
    expect(out.redactedCount).toBe(1);
  });

  it('redacts /Volumes/ macOS external drive paths', () => {
    const out = redactPaths('Backup is at /Volumes/Backup/db/dump.sql daily.');
    expect(out.text).toBe('Backup is at <PATH> daily.');
    expect(out.redactedCount).toBe(1);
  });

  it('redacts /private/ macOS firmlink paths', () => {
    const out = redactPaths('See /private/etc/hosts for the override.');
    expect(out.text).toBe('See <PATH> for the override.');
    expect(out.redactedCount).toBe(1);
  });

  it('redacts /root/ Linux root home paths', () => {
    const out = redactPaths('Logs in /root/.bash_history were rotated.');
    expect(out.text).toBe('Logs in <PATH> were rotated.');
    expect(out.redactedCount).toBe(1);
  });
});
