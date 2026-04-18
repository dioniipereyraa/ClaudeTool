import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  generateToken,
  startServer,
  type ImportHandler,
  type ServerHandle,
} from '../../src/extension/http-server.js';

interface Harness {
  readonly handle: ServerHandle;
  readonly onImport: ReturnType<typeof vi.fn<ImportHandler>>;
  readonly baseUrl: string;
}

const noopHandler: ImportHandler = () => Promise.resolve();

async function setup(options: { handler?: ImportHandler } = {}): Promise<Harness> {
  const onImport = vi.fn<ImportHandler>(options.handler ?? noopHandler);
  const token = generateToken();
  const handle = await startServer(token, onImport);
  return { handle, onImport, baseUrl: `http://127.0.0.1:${String(handle.port)}` };
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

describe('startServer — port selection', () => {
  it('picks a port in the 9317-9326 range', async () => {
    const handle = await startServer(generateToken(), () => Promise.resolve());
    try {
      expect(handle.port).toBeGreaterThanOrEqual(9317);
      expect(handle.port).toBeLessThanOrEqual(9326);
    } finally {
      await handle.close();
    }
  });

  it('falls through to the next port when the first is taken', async () => {
    const first = await startServer(generateToken(), () => Promise.resolve());
    try {
      const second = await startServer(generateToken(), () => Promise.resolve());
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
