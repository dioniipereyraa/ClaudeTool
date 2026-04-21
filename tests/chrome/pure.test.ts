import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';

import { describe, expect, it } from 'vitest';

/**
 * Loads chrome/pure.js in an isolated vm context. The file is a
 * classic script that declares `var ExportalPure = (() => { ... })()`
 * and (for Node consumers) writes to `module.exports`. We evaluate it
 * with a fresh sandbox so each test sees a clean copy, though the
 * functions themselves are pure and would share just fine.
 *
 * We intentionally go through vm instead of a regular `import`
 * because chrome/pure.js is not an ESM module — it has to stay
 * classic-script-compatible so Chrome can load it in MV3 content
 * scripts (which don't support ESM in manifest declarations) and
 * inside service workers via importScripts.
 */
interface Pure {
  readonly UUID_PATTERN: RegExp;
  readonly FILENAME_PATTERN: RegExp;
  readonly PORT_RANGE_START: number;
  readonly PORT_RANGE_END: number;
  extractConversationIdFromPath(pathname: unknown): string | undefined;
  isClaudeAiExport(filename: unknown, url?: unknown, referrer?: unknown): boolean;
  buildPortOrder(lastPort?: number): number[];
  extractOrgIds(data: unknown): string[];
  parseBridgeErrorCode(body: unknown): string | undefined;
  explainError(msgOrError: unknown): string;
}

function loadPure(): Pure {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const purePath = path.resolve(here, '..', '..', 'chrome', 'pure.js');
  const source = readFileSync(purePath, 'utf-8');
  const sandbox: { module: { exports: unknown } } = { module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.module.exports as Pure;
}

const pure = loadPure();

describe('ExportalPure.extractConversationIdFromPath', () => {
  const valid = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

  it('returns the UUID from a /chat/<uuid> path', () => {
    expect(pure.extractConversationIdFromPath(`/chat/${valid}`)).toBe(valid);
  });

  it('ignores trailing segments and query strings', () => {
    expect(pure.extractConversationIdFromPath(`/chat/${valid}?x=1`)).toBe(valid);
    expect(pure.extractConversationIdFromPath(`/chat/${valid}#foo`)).toBe(valid);
    expect(pure.extractConversationIdFromPath(`/chat/${valid}/subpath`)).toBe(valid);
  });

  it('returns undefined for non-chat paths', () => {
    expect(pure.extractConversationIdFromPath('/')).toBeUndefined();
    expect(pure.extractConversationIdFromPath('/projects')).toBeUndefined();
    expect(pure.extractConversationIdFromPath('/chats/abc')).toBeUndefined();
  });

  it('returns undefined when the segment is not a RFC-4122 UUID', () => {
    expect(pure.extractConversationIdFromPath('/chat/not-a-uuid')).toBeUndefined();
    expect(pure.extractConversationIdFromPath('/chat/12345')).toBeUndefined();
    // Missing hyphens:
    expect(
      pure.extractConversationIdFromPath('/chat/0f1e2d3c4b5a69788796a5b4c3d2e1f0'),
    ).toBeUndefined();
  });

  it('returns undefined for non-string input', () => {
    expect(pure.extractConversationIdFromPath(undefined)).toBeUndefined();
    expect(pure.extractConversationIdFromPath(null)).toBeUndefined();
    expect(pure.extractConversationIdFromPath(42)).toBeUndefined();
  });
});

describe('ExportalPure.isClaudeAiExport', () => {
  it('accepts data-*.zip from a claude.ai URL', () => {
    expect(
      pure.isClaudeAiExport(
        'C:/Users/x/Downloads/data-0123.zip',
        'https://claude.ai/api/export/data-0123.zip',
        '',
      ),
    ).toBe(true);
  });

  it('accepts when only the referrer mentions claude.ai', () => {
    expect(
      pure.isClaudeAiExport(
        '/home/me/Downloads/data-abc.zip',
        'https://cdn.example.com/download/xyz',
        'https://claude.ai/settings/data-controls',
      ),
    ).toBe(true);
  });

  it('rejects unrelated ZIPs that happen to start with data-', () => {
    expect(
      pure.isClaudeAiExport('data-not-claude.zip', 'https://example.com/x.zip', ''),
    ).toBe(false);
  });

  it('rejects files whose name does not match the pattern', () => {
    expect(
      pure.isClaudeAiExport('export.zip', 'https://claude.ai/foo', ''),
    ).toBe(false);
    expect(
      pure.isClaudeAiExport('data-0123.txt', 'https://claude.ai/foo', ''),
    ).toBe(false);
  });

  it('rejects non-string filenames', () => {
    expect(pure.isClaudeAiExport(undefined, 'https://claude.ai', '')).toBe(false);
    expect(pure.isClaudeAiExport(null, 'https://claude.ai', '')).toBe(false);
  });
});

describe('ExportalPure.buildPortOrder', () => {
  it('returns the full range in ascending order when lastPort is unknown', () => {
    const ports = pure.buildPortOrder();
    expect(ports).toEqual([9317, 9318, 9319, 9320, 9321, 9322, 9323, 9324, 9325, 9326]);
  });

  it('promotes lastPort to the head of the list, preserving the rest in order', () => {
    const ports = pure.buildPortOrder(9322);
    expect(ports[0]).toBe(9322);
    expect(ports).toHaveLength(10);
    // The remaining nine ports should still cover the full range minus 9322
    expect(new Set(ports)).toEqual(
      new Set([9317, 9318, 9319, 9320, 9321, 9322, 9323, 9324, 9325, 9326]),
    );
  });

  it('ignores lastPort values outside the range', () => {
    expect(pure.buildPortOrder(9000)[0]).toBe(9317);
    expect(pure.buildPortOrder(10000)[0]).toBe(9317);
  });

  it('ignores non-numeric lastPort', () => {
    // @ts-expect-error testing runtime guard
    expect(pure.buildPortOrder('9320')[0]).toBe(9317);
  });
});

describe('ExportalPure.extractOrgIds', () => {
  it('returns the uuid field from each object', () => {
    const data = [{ uuid: 'a' }, { uuid: 'b' }];
    expect(pure.extractOrgIds(data)).toEqual(['a', 'b']);
  });

  it('skips objects missing a uuid and non-string uuids', () => {
    const data = [{ uuid: 'a' }, { name: 'no-uuid' }, { uuid: 42 }, { uuid: '' }];
    expect(pure.extractOrgIds(data)).toEqual(['a']);
  });

  it('returns [] for non-array input', () => {
    expect(pure.extractOrgIds(null)).toEqual([]);
    expect(pure.extractOrgIds(undefined)).toEqual([]);
    expect(pure.extractOrgIds({ uuid: 'nope' })).toEqual([]);
    expect(pure.extractOrgIds('a,b,c')).toEqual([]);
  });

  it('tolerates null entries inside the array', () => {
    expect(pure.extractOrgIds([null, { uuid: 'ok' }, null])).toEqual(['ok']);
  });
});

describe('ExportalPure.parseBridgeErrorCode', () => {
  it('returns the error code from a well-formed body', () => {
    expect(pure.parseBridgeErrorCode({ error: 'invalid_shape' })).toBe('invalid_shape');
  });

  it('returns undefined when body has no error field', () => {
    expect(pure.parseBridgeErrorCode({ ok: true })).toBeUndefined();
  });

  it('returns undefined for empty or non-string error fields', () => {
    expect(pure.parseBridgeErrorCode({ error: '' })).toBeUndefined();
    expect(pure.parseBridgeErrorCode({ error: 42 })).toBeUndefined();
    expect(pure.parseBridgeErrorCode({ error: null })).toBeUndefined();
  });

  it('returns undefined for non-object input', () => {
    expect(pure.parseBridgeErrorCode(null)).toBeUndefined();
    expect(pure.parseBridgeErrorCode(undefined)).toBeUndefined();
    expect(pure.parseBridgeErrorCode('invalid_shape')).toBeUndefined();
  });
});

describe('ExportalPure.explainError', () => {
  // explainError returns an i18n *message ID*, not a user-facing string.
  // The caller (content-script.js) resolves the ID via
  // chrome.i18n.getMessage against the current locale. This keeps
  // pure.js chrome.*-free so it can run inside the vitest vm sandbox.

  it('maps known claude.ai error codes to i18n message IDs', () => {
    expect(pure.explainError('session_expired')).toBe('errSessionExpired');
    expect(pure.explainError('timeout')).toBe('errTimeout');
    expect(pure.explainError('invalid_response')).toBe('errInvalidResponse');
    expect(pure.explainError('no_org')).toBe('errNoOrg');
    expect(pure.explainError('not_found')).toBe('errNotFound');
  });

  it('maps known bridge error codes to i18n message IDs', () => {
    expect(pure.explainError('bridge_offline')).toBe('errBridgeOffline');
    expect(pure.explainError('bridge_outdated')).toBe('errBridgeOutdated');
    expect(pure.explainError('bridge_auth')).toBe('errBridgeAuth');
    expect(pure.explainError('invalid_shape')).toBe('errInvalidShape');
    expect(pure.explainError('payload_too_large')).toBe('errPayloadTooLarge');
  });

  it('accepts an Error instance and reads .message', () => {
    expect(pure.explainError(new Error('session_expired'))).toBe('errSessionExpired');
  });

  it('falls back to the generic message ID for unknown codes', () => {
    expect(pure.explainError('wat')).toBe('errGeneric');
    expect(pure.explainError(undefined)).toBe('errGeneric');
    expect(pure.explainError(null)).toBe('errGeneric');
  });
});
