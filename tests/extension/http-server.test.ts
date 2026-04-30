import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkRateLimit,
  generateToken,
  RATE_LIMITS,
  RATE_LIMIT_WINDOW_MS,
  startServer,
  type ImportHandler,
  type ImportInlineHandler,
  type RateLimitState,
  type ServerHandle,
} from '../../src/extension/http-server.js';

interface Harness {
  readonly handle: ServerHandle;
  readonly onImport: ReturnType<typeof vi.fn<ImportHandler>>;
  readonly onImportInline: ReturnType<typeof vi.fn<ImportInlineHandler>>;
  readonly baseUrl: string;
}

const noopHandler: ImportHandler = () => Promise.resolve();
const noopInlineHandler: ImportInlineHandler = () => Promise.resolve();

async function setup(
  options: { handler?: ImportHandler; inlineHandler?: ImportInlineHandler } = {},
): Promise<Harness> {
  const onImport = vi.fn<ImportHandler>(options.handler ?? noopHandler);
  const onImportInline = vi.fn<ImportInlineHandler>(
    options.inlineHandler ?? noopInlineHandler,
  );
  const token = generateToken();
  const handle = await startServer(token, { onImport, onImportInline });
  return {
    handle,
    onImport,
    onImportInline,
    baseUrl: `http://127.0.0.1:${String(handle.port)}`,
  };
}

describe('startServer', () => {
  let h: Harness;

  afterEach(async () => {
    await h.handle.close();
  });

  it('accepts POST /import with valid token and payload', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ zipPath: '/tmp/data.zip' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.onImport).toHaveBeenCalledExactlyOnceWith({ zipPath: '/tmp/data.zip' });
  });

  it('rejects wrong token with 401', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/import`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ zipPath: '/tmp/x.zip' }),
    });
    expect(res.status).toBe(401);
    expect(h.onImport).not.toHaveBeenCalled();
  });

  it('rejects missing Authorization header with 401', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ zipPath: '/tmp/x.zip' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects token with matching prefix but wrong length with 401', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token.slice(0, 10)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ zipPath: '/tmp/x.zip' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 for payload missing zipPath', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ foo: 'bar' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_payload');
  });

  it('accepts optional conversationId and forwards it to the handler', async () => {
    h = await setup();
    const conversationId = 'a1b2c3d4-5678-90ab-cdef-1234567890ab';
    const res = await fetch(`${h.baseUrl}/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ zipPath: '/tmp/data.zip', conversationId }),
    });
    expect(res.status).toBe(200);
    expect(h.onImport).toHaveBeenCalledExactlyOnceWith({
      zipPath: '/tmp/data.zip',
      conversationId,
    });
  });

  it('rejects conversationId with invalid characters', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ zipPath: '/tmp/x.zip', conversationId: '../etc/passwd' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_payload');
    expect(h.onImport).not.toHaveBeenCalled();
  });

  it('returns 413 for payloads larger than 64 KB', async () => {
    h = await setup();
    const big = 'x'.repeat(100 * 1024);
    const res = await fetch(`${h.baseUrl}/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ zipPath: big }),
    });
    expect(res.status).toBe(413);
  });

  it('returns 404 for unknown paths', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/unknown`, {
      method: 'POST',
      headers: { authorization: `Bearer ${h.handle.token}` },
    });
    expect(res.status).toBe(404);
  });

  it('returns 405 for non-POST methods on /import', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/import`, {
      method: 'GET',
      headers: { authorization: `Bearer ${h.handle.token}` },
    });
    expect(res.status).toBe(405);
  });

  it('propagates 500 when the import handler throws', async () => {
    h = await setup({
      handler: () => Promise.reject(new Error('boom')),
    });
    const res = await fetch(`${h.baseUrl}/import`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ zipPath: '/tmp/x.zip' }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('import_failed');
    expect(body.message).toBe('boom');
  });
});

describe('startServer — /import-inline', () => {
  let h: Harness;

  afterEach(async () => {
    await h.handle.close();
  });

  it('accepts a conversation payload and forwards it to the inline handler', async () => {
    h = await setup();
    const conversation = { uuid: 'abc', name: 'test', chat_messages: [] };
    const res = await fetch(`${h.baseUrl}/import-inline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ conversation }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.onImportInline).toHaveBeenCalledExactlyOnceWith({ conversation });
    expect(h.onImport).not.toHaveBeenCalled();
  });

  it('rejects wrong token with 401', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/import-inline`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ conversation: {} }),
    });
    expect(res.status).toBe(401);
    expect(h.onImportInline).not.toHaveBeenCalled();
  });

  it('returns 400 for payloads missing conversation', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/import-inline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ foo: 'bar' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_payload');
  });

  it('accepts payloads up to several MB', async () => {
    h = await setup();
    // ~2 MB of conversation text — comfortably above the /import 64 KB
    // limit, well below the /import-inline 50 MB cap.
    const conversation = { uuid: 'abc', name: 'big', text: 'x'.repeat(2 * 1024 * 1024) };
    const res = await fetch(`${h.baseUrl}/import-inline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ conversation }),
    });
    expect(res.status).toBe(200);
    expect(h.onImportInline).toHaveBeenCalledOnce();
  });

  it('returns 413 for payloads larger than 50 MB', async () => {
    h = await setup();
    // 51 MB of payload — just over the 50 MB cap that hito 28 raised
    // from the original 10 MB to leave room for Design assets bundles.
    const huge = 'x'.repeat(51 * 1024 * 1024);
    const res = await fetch(`${h.baseUrl}/import-inline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ conversation: { text: huge } }),
    });
    expect(res.status).toBe(413);
  });

  it('propagates 500 when the inline handler throws', async () => {
    h = await setup({
      inlineHandler: () => Promise.reject(new Error('boom-inline')),
    });
    const res = await fetch(`${h.baseUrl}/import-inline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ conversation: { uuid: 'x' } }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('import_failed');
    expect(body.message).toBe('boom-inline');
  });

  it('maps BridgeError("invalid_shape") to 422', async () => {
    const { BridgeError } = await import('../../src/extension/http-server.js');
    h = await setup({
      inlineHandler: () =>
        Promise.reject(new BridgeError('invalid_shape', 'schema mismatch')),
    });
    const res = await fetch(`${h.baseUrl}/import-inline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ conversation: { uuid: 'x' } }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('invalid_shape');
    expect(body.message).toBe('schema mismatch');
  });

  it('forwards provider="chatgpt" to the inline handler (Hito 30)', async () => {
    h = await setup();
    const conversation = {
      conversation_id: 'c-1',
      title: 'ChatGPT chat',
      mapping: {},
      current_node: 'a',
    };
    const res = await fetch(`${h.baseUrl}/import-inline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ conversation, provider: 'chatgpt' }),
    });
    expect(res.status).toBe(200);
    expect(h.onImportInline).toHaveBeenCalledExactlyOnceWith({
      conversation,
      provider: 'chatgpt',
    });
  });

  it('rejects an unknown provider value with 400', async () => {
    h = await setup();
    const res = await fetch(`${h.baseUrl}/import-inline`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${h.handle.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ conversation: { uuid: 'x' }, provider: 'random_thing' }),
    });
    expect(res.status).toBe(400);
    expect(h.onImportInline).not.toHaveBeenCalled();
  });
});

describe('startServer — port selection', () => {
  const handlers = {
    onImport: () => Promise.resolve(),
    onImportInline: () => Promise.resolve(),
  };

  it('picks a port in the 9317-9326 range', async () => {
    const handle = await startServer(generateToken(), handlers);
    try {
      expect(handle.port).toBeGreaterThanOrEqual(9317);
      expect(handle.port).toBeLessThanOrEqual(9326);
    } finally {
      await handle.close();
    }
  });

  it('falls through to the next port when the first is taken', async () => {
    const first = await startServer(generateToken(), handlers);
    try {
      const second = await startServer(generateToken(), handlers);
      try {
        expect(second.port).not.toBe(first.port);
      } finally {
        await second.close();
      }
    } finally {
      await first.close();
    }
  });
});

describe('generateToken', () => {
  it('returns 64 hex characters', () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces distinct tokens on each call', () => {
    const seen = new Set(Array.from({ length: 20 }, () => generateToken()));
    expect(seen.size).toBe(20);
  });
});

describe('rate limiting (unit, checkRateLimit)', () => {
  it('exposes the budgets the bridge enforces', () => {
    expect(RATE_LIMITS['/ping']).toBe(30);
    expect(RATE_LIMITS['/import']).toBe(10);
    expect(RATE_LIMITS['/import-inline']).toBe(30);
  });

  it('uses a 60-second sliding window', () => {
    expect(RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  it('lets requests through under the budget', () => {
    const store = new Map<string, RateLimitState>();
    for (let i = 0; i < RATE_LIMITS['/import']!; i++) {
      const r = checkRateLimit('/import', store, 1_000);
      expect(r.ok).toBe(true);
    }
  });

  it('rejects with 429 + Retry-After once over the budget', () => {
    const store = new Map<string, RateLimitState>();
    const start = 1_000;
    for (let i = 0; i < RATE_LIMITS['/import']!; i++) {
      checkRateLimit('/import', store, start);
    }
    const blocked = checkRateLimit('/import', store, start + 100);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it('resets the count once the window slides', () => {
    const store = new Map<string, RateLimitState>();
    const start = 1_000;
    for (let i = 0; i < RATE_LIMITS['/import']!; i++) {
      checkRateLimit('/import', store, start);
    }
    // Same instant: blocked.
    expect(checkRateLimit('/import', store, start).ok).toBe(false);
    // 60.001s later: budget refreshed.
    const after = start + RATE_LIMIT_WINDOW_MS + 1;
    expect(checkRateLimit('/import', store, after).ok).toBe(true);
  });

  it('keeps a separate budget per endpoint', () => {
    const store = new Map<string, RateLimitState>();
    for (let i = 0; i < RATE_LIMITS['/import']!; i++) {
      checkRateLimit('/import', store, 1_000);
    }
    // /import is over budget.
    expect(checkRateLimit('/import', store, 1_000).ok).toBe(false);
    // /ping is untouched.
    expect(checkRateLimit('/ping', store, 1_000).ok).toBe(true);
    // /import-inline is untouched.
    expect(checkRateLimit('/import-inline', store, 1_000).ok).toBe(true);
  });

  it('ignores unknown paths (returns ok regardless)', () => {
    const store = new Map<string, RateLimitState>();
    for (let i = 0; i < 100; i++) {
      const r = checkRateLimit('/unknown', store, 1_000);
      expect(r.ok).toBe(true);
    }
    expect(store.size).toBe(0);
  });

  it('Retry-After never goes below 1 second', () => {
    const store = new Map<string, RateLimitState>();
    const start = 1_000;
    for (let i = 0; i < RATE_LIMITS['/import']!; i++) {
      checkRateLimit('/import', store, start);
    }
    // Just before the window expires: 1ms left.
    const r = checkRateLimit('/import', store, start + RATE_LIMIT_WINDOW_MS - 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.retryAfter).toBeGreaterThanOrEqual(1);
  });
});

describe('rate limiting (integration)', () => {
  let h: Harness;

  afterEach(async () => {
    await h.handle.close();
  });

  it('returns 429 with Retry-After once /import is over budget', async () => {
    h = await setup();
    const goodReq = (): Promise<Response> =>
      fetch(`${h.baseUrl}/import`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${h.handle.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ zipPath: '/tmp/x.zip' }),
      });
    // Limit for /import is 10/min. The first 10 must pass, the 11th
    // must come back as 429 with a Retry-After header. This single
    // integration test exercises the wiring end-to-end; the rest of
    // the rate-limit semantics live in the unit tests above.
    for (let i = 0; i < 10; i++) {
      const ok = await goodReq();
      expect(ok.status).toBe(200);
    }
    const blocked = await goodReq();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toMatch(/^\d+$/);
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe('rate_limited');
  });
});
