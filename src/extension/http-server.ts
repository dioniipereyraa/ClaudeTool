import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as http from 'node:http';
import { type AddressInfo } from 'node:net';

import { z } from 'zod';

/**
 * Local HTTP server that accepts POST /import from a Chrome companion
 * extension. The Chrome extension observes when claude.ai finishes an
 * official ZIP export (via `chrome.downloads` API) and forwards the
 * download path here — zero scraping, just automation of a legitimate
 * user-initiated export.
 *
 * Pure in terms of VS Code APIs so it can be unit-tested with `fetch`.
 *
 * ## Security
 * - Bound to 127.0.0.1 only — never accessible from other hosts.
 * - Bearer token required on every request. Constant-time compared.
 * - Request body capped at 64 KB (we only accept a small JSON payload).
 * - Port is picked from a fixed range so the Chrome extension can find
 *   us with a short probe sequence without any filesystem handshake.
 */

const PORT_RANGE_START = 9317;
const PORT_RANGE_END = 9326;
const MAX_BODY_BYTES = 64 * 1024;

const ImportPayload = z.object({
  zipPath: z.string().min(1),
});
export type ImportPayload = z.infer<typeof ImportPayload>;

export type ImportHandler = (payload: ImportPayload) => Promise<void>;

export interface ServerHandle {
  readonly port: number;
  readonly token: string;
  close(): Promise<void>;
}

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export async function startServer(
  token: string,
  onImport: ImportHandler,
): Promise<ServerHandle> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    try {
      return await listenOnPort(port, token, onImport);
    } catch (err) {
      if (isAddrInUse(err)) continue;
      throw err;
    }
  }
  throw new Error(
    `Exportal: no free port in ${String(PORT_RANGE_START)}-${String(PORT_RANGE_END)}`,
  );
}

function listenOnPort(
  port: number,
  token: string,
  onImport: ImportHandler,
): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      void handleRequest(req, res, token, onImport);
    });
    const onError = (err: Error): void => {
      reject(err);
    };
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError);
      const address = server.address() as AddressInfo;
      resolve({
        port: address.port,
        token,
        close: () =>
          new Promise((res) => {
            server.close(() => {
              res();
            });
          }),
      });
    });
  });
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  expectedToken: string,
  onImport: ImportHandler,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }
  if (req.url !== '/import') {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }
  const auth = req.headers.authorization ?? '';
  const provided = /^Bearer (.+)$/.exec(auth)?.[1];
  if (provided === undefined || !tokensMatch(provided, expectedToken)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }

  // Early reject by Content-Length so we don't even start reading an
  // oversized body. Defense-in-depth streaming limit below catches
  // clients that lie about Content-Length.
  const declaredLength = Number(req.headers['content-length'] ?? '0');
  if (declaredLength > MAX_BODY_BYTES) {
    sendJson(res, 413, { error: 'payload_too_large' });
    return;
  }

  let body: string;
  try {
    body = await readBody(req, MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      sendJson(res, 413, { error: 'payload_too_large' });
      return;
    }
    sendJson(res, 400, { error: 'body_read_failed' });
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    sendJson(res, 400, { error: 'invalid_json' });
    return;
  }

  const parsed = ImportPayload.safeParse(raw);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'invalid_payload' });
    return;
  }

  try {
    await onImport(parsed.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { error: 'import_failed', message });
    return;
  }

  sendJson(res, 200, { ok: true });
}

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

class PayloadTooLargeError extends Error {}

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let exceeded = false;
    req.on('data', (chunk: Buffer) => {
      if (exceeded) return;
      total += chunk.length;
      if (total > maxBytes) {
        exceeded = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (exceeded) reject(new PayloadTooLargeError());
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload).toString(),
  });
  res.end(payload);
}

function isAddrInUse(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'EADDRINUSE'
  );
}
