// Exportal Companion — pure logic shared between content-script.js,
// background.js, and unit tests.
//
// Plain classic script (no ES modules): runs unchanged in MV3 service
// workers (via importScripts), manifest content_scripts arrays (as a
// sibling file loaded before content-script.js), and Node/vitest
// harnesses that load it with vm.runInNewContext.
//
// Everything in here is a pure function or a constant. No DOM access,
// no chrome.* calls, no network I/O.

var ExportalPure = (function () {
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // claude.ai export ZIPs are named `data-<something>.zip`. We match
  // the basename loosely — any dash-separated token after `data-` —
  // because Anthropic has shifted naming schemes over time (date,
  // UUID, batch).
  const FILENAME_PATTERN = /(^|[\\/])data-.+\.zip$/i;

  const PORT_RANGE_START = 9317;
  const PORT_RANGE_END = 9326;

  function extractConversationIdFromPath(pathname) {
    if (typeof pathname !== 'string') return undefined;
    const match = /^\/chat\/([^/?#]+)/.exec(pathname);
    if (match === null) return undefined;
    const id = match[1];
    return UUID_PATTERN.test(id) ? id : undefined;
  }

  // claude.ai/design/p/<UUID> is a Claude Design project. The pattern
  // is parallel to /chat/<UUID> — same UUID shape, same trailing
  // tolerance for query strings (`?file=...`) and extra path segments.
  function extractDesignProjectIdFromPath(pathname) {
    if (typeof pathname !== 'string') return undefined;
    const match = /^\/design\/p\/([^/?#]+)/.exec(pathname);
    if (match === null) return undefined;
    const id = match[1];
    return UUID_PATTERN.test(id) ? id : undefined;
  }

  // chatgpt.com/c/<UUID> is the conversation surface. Same UUID shape
  // as claude.ai. Hito 30 — see ROADMAP.
  function extractChatGptConversationIdFromPath(pathname) {
    if (typeof pathname !== 'string') return undefined;
    const match = /^\/c\/([^/?#]+)/.exec(pathname);
    if (match === null) return undefined;
    const id = match[1];
    return UUID_PATTERN.test(id) ? id : undefined;
  }

  // Single entry point for routing the FAB. Each call site passes its
  // own pathname AND host so the same function works on both
  // claude.ai (chat / design) and chatgpt.com. Returns the route
  // kind + id when we recognize the page, otherwise undefined.
  function routeFromPath(pathname, host) {
    if (host === 'chatgpt.com') {
      const id = extractChatGptConversationIdFromPath(pathname);
      return id !== undefined ? { kind: 'chatgpt', id } : undefined;
    }
    // Default: assume claude.ai (the legacy single-arg call site stays
    // working — chrome companion content script passes only pathname
    // when on claude.ai).
    const chatId = extractConversationIdFromPath(pathname);
    if (chatId !== undefined) return { kind: 'chat', id: chatId };
    const designId = extractDesignProjectIdFromPath(pathname);
    if (designId !== undefined) return { kind: 'design', id: designId };
    return undefined;
  }

  function isClaudeAiExport(filename, url, referrer) {
    if (typeof filename !== 'string') return false;
    if (!FILENAME_PATTERN.test(filename)) return false;
    // Defense-in-depth against unrelated ZIPs that happen to start
    // with `data-`: require the download to have originated from
    // claude.ai.
    const u = typeof url === 'string' ? url : '';
    const r = typeof referrer === 'string' ? referrer : '';
    return u.includes('claude.ai') || r.includes('claude.ai');
  }

  function buildPortOrder(lastPort) {
    const all = [];
    for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) all.push(p);
    if (typeof lastPort === 'number' && all.includes(lastPort)) {
      return [lastPort, ...all.filter((p) => p !== lastPort)];
    }
    return all;
  }

  function extractOrgIds(data) {
    if (!Array.isArray(data)) return [];
    return data
      .map((o) => (o !== null && typeof o === 'object' ? o.uuid : undefined))
      .filter((v) => typeof v === 'string' && v.length > 0);
  }

  function parseBridgeErrorCode(body) {
    if (body === null || typeof body !== 'object') return undefined;
    const code = body.error;
    return typeof code === 'string' && code.length > 0 ? code : undefined;
  }

  function explainError(msgOrError) {
    // Returns an i18n message ID (not a user-facing string). The caller
    // resolves it against the current locale via chrome.i18n.getMessage.
    // Keeping this file chrome.*-free is what lets it run inside the
    // vitest vm sandbox.
    //
    // Duck-type rather than `instanceof Error` — Errors thrown across
    // realm boundaries (content script vs page, vm sandbox vs outer)
    // don't share a prototype chain. Reading .message if present
    // handles both cases without a try/catch.
    const msg =
      msgOrError !== null &&
      typeof msgOrError === 'object' &&
      typeof msgOrError.message === 'string'
        ? msgOrError.message
        : typeof msgOrError === 'string'
          ? msgOrError
          : String(msgOrError);
    // claude.ai fetch errors
    if (msg === 'no_org') return 'errNoOrg';
    if (msg === 'not_found') return 'errNotFound';
    if (msg === 'session_expired') return 'errSessionExpired';
    if (msg === 'invalid_response') return 'errInvalidResponse';
    if (msg === 'timeout') return 'errTimeout';
    // Bridge errors
    if (msg === 'bridge_offline') return 'errBridgeOffline';
    if (msg === 'bridge_outdated') return 'errBridgeOutdated';
    if (msg === 'bridge_auth') return 'errBridgeAuth';
    if (msg === 'invalid_shape') return 'errInvalidShape';
    if (msg === 'payload_too_large') return 'errPayloadTooLarge';
    return 'errGeneric';
  }

  return {
    UUID_PATTERN,
    FILENAME_PATTERN,
    PORT_RANGE_START,
    PORT_RANGE_END,
    extractConversationIdFromPath,
    extractDesignProjectIdFromPath,
    extractChatGptConversationIdFromPath,
    routeFromPath,
    isClaudeAiExport,
    buildPortOrder,
    extractOrgIds,
    parseBridgeErrorCode,
    explainError,
  };
})();

// Node/vitest harness: expose via CommonJS when imported from tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExportalPure;
}
