import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { describeSession } from '../../src/core/session.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', 'fixtures', 'minimal.jsonl');

describe('describeSession', () => {
  it('derives metadata from events', async () => {
    const meta = await describeSession(FIXTURE);
    expect(meta.sessionId).toBe('minimal');
    expect(meta.turnCount).toBe(2);
    expect(meta.model).toBe('claude-opus-4-7');
    expect(meta.startedAt).toBe('2026-04-15T10:00:01.000Z');
    expect(meta.gitBranch).toBe('main');
    expect(meta.firstUserText).toContain('Hola');
    expect(meta.compactCount).toBe(0);
  });

  it('picks up ai-title and custom-title events', async () => {
    const meta = await describeSession(FIXTURE);
    expect(meta.aiTitle).toBe('Test session for the fixture suite');
    expect(meta.customTitle).toBe('My fixture chat');
  });

  it('reports lastActiveAt from file mtime', async () => {
    const meta = await describeSession(FIXTURE);
    expect(meta.lastActiveAt).toBeInstanceOf(Date);
    // Sanity: mtime must not be in the future.
    expect(meta.lastActiveAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
