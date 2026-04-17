import { describe, expect, it } from 'vitest';

import { parseEvent } from '../../src/core/schema.js';

const minimalUser = {
  type: 'user',
  uuid: 'u1',
  parentUuid: null,
  timestamp: '2026-01-01T00:00:00Z',
  sessionId: 's',
  message: { role: 'user', content: 'hello' },
};

const minimalAssistant = {
  type: 'assistant',
  uuid: 'a1',
  parentUuid: 'u1',
  timestamp: '2026-01-01T00:00:01Z',
  sessionId: 's',
  message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
};

const compactBoundary = {
  type: 'system',
  uuid: 's1',
  parentUuid: 'a1',
  timestamp: '2026-01-01T00:00:02Z',
  subtype: 'compact_boundary',
  compactMetadata: { trigger: 'manual', preTokens: 100 },
};

describe('parseEvent', () => {
  it('accepts a minimal user event', () => {
    const event = parseEvent(minimalUser);
    expect(event?.type).toBe('user');
  });

  it('accepts a minimal assistant event', () => {
    const event = parseEvent(minimalAssistant);
    expect(event?.type).toBe('assistant');
  });

  it('accepts a system compact_boundary event with metadata', () => {
    const event = parseEvent(compactBoundary);
    expect(event?.type).toBe('system');
    if (event?.type === 'system') {
      expect(event.subtype).toBe('compact_boundary');
      expect(event.compactMetadata?.preTokens).toBe(100);
    }
  });

  it('preserves unknown fields via passthrough (forward-compat)', () => {
    const event = parseEvent({ ...minimalUser, futureField: 42 });
    expect(event).not.toBeNull();
    expect((event as unknown as { futureField: number }).futureField).toBe(42);
  });

  it('rejects events with an unmodeled top-level type', () => {
    expect(parseEvent({ type: 'queue-operation', operation: 'enqueue' })).toBeNull();
    expect(parseEvent({ type: 'attachment', uuid: 'x' })).toBeNull();
  });

  it('rejects events missing required fields', () => {
    expect(parseEvent({ type: 'user' })).toBeNull();
    expect(parseEvent(null)).toBeNull();
    expect(parseEvent('not an object')).toBeNull();
  });

  it('accepts user events with isCompactSummary flag', () => {
    const event = parseEvent({ ...minimalUser, isCompactSummary: true });
    expect(event?.type).toBe('user');
    if (event?.type === 'user') {
      expect(event.isCompactSummary).toBe(true);
    }
  });
});
