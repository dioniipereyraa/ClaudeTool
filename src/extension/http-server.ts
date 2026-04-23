import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as http from 'node:http';
import { type AddressInfo } from 'node:net';

import { z } from 'zod';

/**
 * Local HTTP server talking to the Chrome companion. Three endpoints,
 * all bearer-authenticated and bound to 127.0.0.1:
 *
 *   POST /import         — filesystem path to an official claude.ai
 *                          export ZIP that just finished downloading.
 *                          Companion watches chrome.downloads and
 *                          forwards the path; we open the chosen
 *                          conversation as Markdown.
 *   POST /import-inline  — full conversation JSON scraped by the
 *                          companion via claude.ai's internal API.
 *                          No ZIP in the loop; instant export.
 *   POST /ping           — pairing confirmation. Companion hits this
 *                          after saving the pairing token so VS Code
 *                          can close the loop (notification + webview
 *                          success state).
 *
 * Pure in terms of VS Code APIs so it can be unit-tested with `fetch`.
 *
 * ## Security
 * - Bound to 127.0.0.1 only — never accessible from other hosts.
 * - Bearer token required on every request. Constant-time compared.
 * - Request body capped (64 KB for /import, 10 MB for /import-inline,
 *   /ping has no body).
 * - Port is picked from a fixed range so the Chrome extension can find
 *   us with a short probe sequence without any filesystem handshake.
 */

const PORT_RANGE_START = 9317;
const PORT_RANGE_END = 9326;
// The ZIP-path endpoint only carries a filesystem path + UUID.
const MAX_BODY_BYTES_IMPORT = 64 * 1024;
// The inline endpoint carries a full conversation JSON scraped from
// claude.ai's internal API. Real conversations with long tool_use/tool_result
// blocks can easily exceed 1 MB; 50 MB gives comfortable headroom even when
// the payload also bundles design assets (HTML + base64-encoded PNGs from
// Claude Design projects, hito 28). Bearer-token auth is still required so
// the limit is a memory-bounding sanity check, not a security boundary.
const MAX_BODY_BYTES_IMPORT_INLINE = 50 * 1024 * 1024;

// Permissive UUID-ish shape: hex + hyphens, typical claude.ai conversation
// UUIDs are RFC-4122 (36 chars) but we accept a wider range to stay robust
// against format tweaks. We never use this as a security boundary — it only
// controls which conversation we pre-select.
const ConversationIdSchema = z
  .string()
  .regex(/^[0-9a-f-]{8,64}$/i, 'invalid conversation id');

const ImportPayload = z.object({
  zipPath: z.string().min(1),
  conversationId: ConversationIdSchema.optional(),
});
export type ImportPayload = z.infer<typeof ImportPayload>;

// Inline payload: a single conversation object, as returned by claude.ai's
// internal `/api/organizations/<org>/chat_conversations/<id>` endpoint. We
// leave the shape opaque here — the importer module owns the schema and
// will reject malformed data with its own error message. `z.unknown()`
// would accept `undefined` as a valid absent field, so we explicitly
// refine to require a non-null object.
// Files generated alongside a Claude Design conversation. Each carries
// the file basename + the base64-encoded byte content + the original
// MIME type so we can pick a sensible decode (text/* → UTF-8 string,
// other → raw bytes). Optional — only the Claude Design path ever
// populates this; chat exports leave it absent.
const InlineAsset = z.object({
  filename: z.string().min(1),
  content: z.string(), // base64-encoded
  contentType: z.string().min(1),
});
export type InlineAsset = z.infer<typeof InlineAsset>;

const ImportInlinePayload = z.object({
  conversation: z
    .unknown()
    .refine(
      (v): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v),
      { message: 'conversation must be an object' },
    ),
  assets: z.array(InlineAsset).optional(),
});
export type ImportInlinePayload = z.infer<typeof ImportInlinePayload>;

export type ImportHandler = (payload: ImportPayload) => Promise<void>;
export type ImportInlineHandler = (payload: ImportInlinePayload) => Promise<void>;
// Fired when the Chrome companion hits /ping with a valid token.
// The companion sends this right after it stores a pairing token
// from the claude.ai URL fragment, so VS Code can close the loop
// ("pair confirmed") instead of the user wondering whether the
// automatic flow worked. No payload: the bearer check is the only
// signal — Chrome has our token, therefore the pairing succeeded.
export type PingHandler = () => void;

/**
 * Thrown by handlers to propagate a specific error code back to the
 * Chrome companion. Generic Errors still map to 500 `import_failed`;
 * BridgeError gives us a distinct HTTP status + code so the companion
 * can show a specific message to the user (e.g. "Shape de claude.ai
 * cambió" vs "VS Code falló al importar").
 */
export class BridgeError extends Error {
  constructor(
    readonly code: 'invalid_shape',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'BridgeError';
  }
}

function statusForBridgeError(code: BridgeError['code']): number {
  // 422 Unprocessable Entity — body parsed fine, semantics rejected.
  if (code === 'invalid_shape') return 422;
  return 500;
}

export interface BridgeHandlers {
  readonly onImport: ImportHandler;
  readonly onImportInline: ImportInlineHandler;
  readonly onPing?: PingHandler;
}

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
  handlers: BridgeHandlers,
): Promise<ServerHandle> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    try {
      return await listenOnPort(port, token, handlers);
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
  handlers: BridgeHandlers,
): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      void handleRequest(req, res, token, handlers);
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
  handlers: BridgeHandlers,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  // /ping is the pair-confirmation probe: Chrome sends it after saving
  // the token from a claude.ai URL fragment. It carries no body — a
  // valid Bearer is the whole signal. We process it before the body
  // pipeline so an empty POST doesn't trip body-parse paths.
  if (req.url === '/ping') {
    const auth = req.headers.authorization ?? '';
    const provided = /^Bearer (.+)$/.exec(auth)?.[1];
    if (provided === undefined || !tokensMatch(provided, expectedToken)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    try {
      handlers.onPing?.();
    } catch {
      // A handler exception shouldn't leak back to Chrome — it already
      // has the token and the user still sees the (separate) toast on
      // claude.ai. Log once and move on.
      console.warn('Exportal: onPing handler threw');
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  let maxBytes: number;
  if (req.url === '/import') {
    maxBytes = MAX_BODY_BYTES_IMPORT;
  } else if (req.url === '/import-inline') {
    maxBytes = MAX_BODY_BYTES_IMPORT_INLINE;
  } else {
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
  if (declaredLength > maxBytes) {
    sendJson(res, 413, { error: 'payload_too_large' });
    return;
  }

  let body: string;
  try {
    body = await readBody(req, maxBytes);
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

  if (req.url === '/import') {
    const parsed = ImportPayload.safeParse(raw);
    if (!parsed.success) {
      sendJson(res, 400, { error: 'invalid_payload' });
      return;
    }
    try {
      await handlers.onImport(parsed.data);
    } catch (err) {
      sendHandlerError(res, err);
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  // /import-inline
  const parsed = ImportInlinePayload.safeParse(raw);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'invalid_payload' });
    return;
  }
  try {
    await handlers.onImportInline(parsed.data);
  } catch (err) {
    sendHandlerError(res, err);
    return;
  }
  sendJson(res, 200, { ok: true });
}

function sendHandlerError(res: http.ServerResponse, err: unknown): void {
  if (err instanceof BridgeError) {
    sendJson(res, statusForBridgeError(err.code), {
      error: err.code,
      message: err.message,
    });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  sendJson(res, 500, { error: 'import_failed', message });
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
