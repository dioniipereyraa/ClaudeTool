// Exportal Companion — background service worker.
//
// Flow: when a claude.ai export ZIP finishes downloading, forward the
// full path to the Exportal VS Code extension over the local HTTP bridge.
//
// MV3 service workers are evicted after ~30s idle. Do NOT keep state in
// module-level variables across events; persist it in chrome.storage.
// The single top-level `onChanged` listener is re-registered every time
// Chrome wakes the worker, which is the supported pattern for long-lived
// event handling.
//
// The worker is a classic service worker (not `"type": "module"`) so
// we can importScripts() the pure-logic helpers and share them with
// the content script + unit tests without a bundler.

importScripts('./pure.js');

const TOKEN_KEY = 'exportal.pairingToken';
const LAST_PORT_KEY = 'exportal.lastPort';
const PENDING_CONVERSATION_KEY = 'exportal.pendingConversationId';

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state?.current !== 'complete') return;
  void handleCompletedDownload(delta.id);
});

// Click on the toolbar icon: if the user hasn't paired yet, take them
// straight to the options page so they can paste the token. Once paired
// we let the click fall through (no popup) — the options page is still
// reachable from chrome://extensions → Details → Extension options.
chrome.action.onClicked.addListener(() => {
  void (async () => {
    const token = await getToken();
    if (token === undefined) {
      await chrome.runtime.openOptionsPage();
    } else {
      // Still open options — it's the only place the user can manage the
      // token or see pairing status. The badge is also cleared here so
      // a stale "SET"/"AUTH" doesn't linger after the user has dealt
      // with whatever prompted it.
      await chrome.runtime.openOptionsPage();
      await chrome.action.setBadgeText({ text: '' });
    }
  })();
});

// On install AND on every service-worker wake-up, reflect pairing state
// in the toolbar badge so the user can see at a glance whether the
// extension is ready to go.
chrome.runtime.onInstalled.addListener(() => {
  void refreshPairingBadge();
});
chrome.runtime.onStartup.addListener(() => {
  void refreshPairingBadge();
});
// Also reflect changes made from the options page without needing a
// reload — storage.onChanged fires in every context (including this SW).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!(TOKEN_KEY in changes)) return;
  void refreshPairingBadge();
});

async function refreshPairingBadge() {
  const token = await getToken();
  if (token === undefined) {
    await setBadge('SET', '#ca8a04');
    await chrome.action.setTitle({
      title: chrome.i18n.getMessage('actionTooltipUnpaired'),
    });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({
      title: chrome.i18n.getMessage('actionTooltipPaired'),
    });
  }
}

// Messages from the claude.ai content script:
//   - exportal:setPending → remember the conversation UUID so the next
//     official-export ZIP we observe gets auto-opened in VS Code.
//   - exportal:sendInline → POST the scraped conversation JSON to the
//     VS Code bridge right now, no ZIP in the middle.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept from origins our content script runs on (manifest matches):
  // claude.ai for chat + Claude Design, chatgpt.com for ChatGPT (Hito 30).
  // Defense-in-depth against any other page that somehow tries to talk
  // to us.
  const url = sender.tab?.url ?? sender.url ?? '';
  const ok = url.startsWith('https://claude.ai/') || url.startsWith('https://chatgpt.com/');
  if (!ok) {
    sendResponse({ ok: false, error: 'bad_origin' });
    return false;
  }

  if (message?.type === 'exportal:setPending') {
    const id = message.conversationId;
    if (typeof id !== 'string' || !ExportalPure.UUID_PATTERN.test(id)) {
      sendResponse({ ok: false, error: 'bad_id' });
      return false;
    }
    chrome.storage.session
      .set({ [PENDING_CONVERSATION_KEY]: id })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // keep message channel open for async sendResponse
  }

  if (message?.type === 'exportal:sendInline') {
    const conversation = message.conversation;
    if (conversation === null || typeof conversation !== 'object') {
      sendResponse({ ok: false, error: 'bad_payload' });
      return false;
    }
    // Provider tag tells the bridge which schema to validate against.
    // Backward compat: if missing, the bridge defaults to 'claude' so
    // older Companion installs keep working.
    const provider = message.provider === 'chatgpt' ? 'chatgpt'
      : message.provider === 'claude' ? 'claude'
      : undefined;
    // Optional `assets` only fires for Claude Design exports — the
    // bridge schema treats it as optional, so chats keep their old
    // shape. Defensive shape check: must be an array of objects with
    // string filename + string content + string contentType. Anything
    // else gets dropped before forwarding.
    const rawAssets = Array.isArray(message.assets) ? message.assets : [];
    const assets = rawAssets
      .filter((a) =>
        a !== null && typeof a === 'object'
        && typeof a.filename === 'string'
        && typeof a.content === 'string'
        && typeof a.contentType === 'string',
      )
      .map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType }));
    forwardInlineConversation(conversation, assets, provider)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type === 'exportal:pingBridge') {
    // One-shot probe driven by the content-script's wake-and-retry
    // loop. We answer fast (no work besides a few fetches that
    // either ECONNREFUSED quickly or return 200/401). The content
    // script polls this on a timer it controls — that timer lives
    // in the page context, where MV3 SW eviction can't kill it
    // mid-loop.
    isBridgeReachable()
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === 'exportal:openOptionsPage') {
    // Content-script requests this right after a successful auto-pair
    // so the user lands on the brand UI (the three-state
    // OnboardingChrome panel) instead of just a transient toast. The
    // origin guard above already restricts this to claude.ai — we
    // re-assert intent by looking at the URL here would be redundant.
    chrome.runtime
      .openOptionsPage()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type === 'exportal:setPairingToken') {
    // Auto-pair from a VS Code → claude.ai URL fragment. The content
    // script pre-validated the 64-hex shape; we re-validate here as
    // defense-in-depth against a tampered page context. On success,
    // refreshPairingBadge fires automatically via the storage.onChanged
    // listener already wired at the top of this file.
    const token = message.token;
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
      sendResponse({ ok: false, error: 'bad_token' });
      return false;
    }
    chrome.storage.local
      .set({ [TOKEN_KEY]: token })
      .then(() => {
        // Fire-and-forget confirmation ping to the VS Code bridge.
        // We probe the same port range used by /import; the first
        // port that answers 200 is our match. Failure is silent —
        // the user still sees the toast on claude.ai, and their
        // first real export will surface any actual connectivity
        // problem with its own error path.
        void pingBridge(token);
        sendResponse({ ok: true });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});

async function handleCompletedDownload(id) {
  const items = await chrome.downloads.search({ id });
  const item = items[0];
  if (!item) return;
  if (!ExportalPure.isClaudeAiExport(item.filename, item.url, item.referrer)) return;
  await forwardToExportal(item.filename);
}

async function forwardToExportal(zipPath) {
  const token = await getToken();
  if (token === undefined) {
    await setBadge('SET', '#ca8a04');
    console.warn('Exportal: token not configured. Open the extension Options.');
    return;
  }

  const conversationId = await getPendingConversationId();
  const ports = await buildPortOrder();
  let sawAuthError = false;

  for (const port of ports) {
    const result = await tryPort(port, token, zipPath, conversationId);
    if (result === 'ok') {
      await chrome.storage.session.set({ [LAST_PORT_KEY]: port });
      // Clear the pending ID only after a successful forward. If the user
      // re-exports without clicking the button again, the next export
      // goes through the normal QuickPick path instead of a stale match.
      if (conversationId !== undefined) {
        await chrome.storage.session.remove(PENDING_CONVERSATION_KEY);
      }
      await setBadge('OK', '#16a34a');
      return;
    }
    if (result === 'auth') {
      // Exportal is reachable but rejects the token. Don't keep probing —
      // other ports, if they respond, aren't ours.
      sawAuthError = true;
      break;
    }
    // network error or unknown response: keep probing.
  }

  if (sawAuthError) {
    await setBadge('AUTH', '#dc2626');
    console.warn('Exportal: token rejected. Check Options.');
  } else {
    await setBadge('OFF', '#dc2626');
    console.warn('Exportal: could not reach the local server. Is VS Code running?');
  }
}

async function tryPort(port, token, zipPath, conversationId) {
  const body = { zipPath };
  if (conversationId !== undefined) body.conversationId = conversationId;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.status === 200) return 'ok';
    if (res.status === 401) return 'auth';
    return 'other';
  } catch {
    return 'network';
  }
}

async function forwardInlineConversation(conversation, assets, provider) {
  const token = await getToken();
  if (token === undefined) {
    await setBadge('SET', '#ca8a04');
    return { ok: false, error: 'no_token' };
  }
  // Quick reachability probe BEFORE serializing + uploading the
  // (potentially many-MB) conversation body. Without this we'd send
  // the full payload to every port in the range and only learn the
  // bridge is offline after each transmission completes. With it,
  // the offline-detection latency drops from "depends on payload
  // size + N ports" to "10 instant ECONNREFUSED responses" (~50ms).
  if (!(await isBridgeReachable())) {
    await setBadge('OFF', '#dc2626');
    return { ok: false, error: 'bridge_offline' };
  }
  // Bundle the assets into the JSON body only when present — keeps
  // chat exports byte-identical to before this change. Provider tag
  // is sent only when set; absent means the bridge defaults to claude.
  const payload = { conversation };
  if (Array.isArray(assets) && assets.length > 0) payload.assets = assets;
  if (provider !== undefined) payload.provider = provider;
  const body = JSON.stringify(payload);
  // Cold-start (wake VS Code + retry) is handled in the content
  // script, not here. MV3 service workers get evicted during the
  // long polling loop — moving the wait loop into the page context
  // sidesteps that. Background just answers a one-shot ping check
  // (`exportal:pingBridge`) when the content script asks.
  const result = await tryAllPortsForInline(body, token);
  return finalizeForwardResult(result);
}

async function tryAllPortsForInline(body, token) {
  const ports = await buildPortOrder();
  let sawAuthError = false;
  // Captures the first response that unambiguously identifies our own
  // bridge rejecting the payload (422 shape mismatch, 413 too large).
  // When we see one of these there's no point continuing to probe —
  // the conversation itself is the problem, not which VS Code instance
  // we're talking to.
  let definiteError;
  let sawOutdated = false;
  for (const port of ports) {
    let res;
    try {
      res = await fetch(`http://127.0.0.1:${port}/import-inline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body,
      });
    } catch {
      // network error — keep probing
      continue;
    }
    if (res.status === 200) {
      await chrome.storage.session.set({ [LAST_PORT_KEY]: port });
      return { kind: 'ok' };
    }
    if (res.status === 401) {
      sawAuthError = true;
      break;
    }
    if (res.status === 422 || res.status === 413) {
      const code = await readErrorCode(res);
      definiteError = code ?? (res.status === 413 ? 'payload_too_large' : 'invalid_shape');
      break;
    }
    // Any other HTTP response (most commonly 404 when /import-inline
    // didn't exist in an older build) suggests an outdated VS Code. We
    // keep probing in case the user has multiple instances running,
    // but remember the state so we report "outdated" not "offline".
    sawOutdated = true;
  }
  if (sawAuthError) return { kind: 'auth' };
  if (definiteError !== undefined) return { kind: 'definite', code: definiteError };
  if (sawOutdated) return { kind: 'outdated' };
  return { kind: 'offline' };
}

async function finalizeForwardResult(result) {
  if (result.kind === 'ok') {
    await setBadge('OK', '#16a34a');
    return { ok: true };
  }
  if (result.kind === 'auth') {
    await setBadge('AUTH', '#dc2626');
    return { ok: false, error: 'bridge_auth' };
  }
  if (result.kind === 'definite') {
    await setBadge('ERR', '#dc2626');
    return { ok: false, error: result.code };
  }
  if (result.kind === 'outdated') {
    await setBadge('OLD', '#dc2626');
    return { ok: false, error: 'bridge_outdated' };
  }
  await setBadge('OFF', '#dc2626');
  return { ok: false, error: 'bridge_offline' };
}

// Long-running poll port. The content script opens this after firing
// the `vscode://` wake — the loop runs HERE in the service worker
// instead of the page so:
//   1. Background tab throttling doesn't apply (SWs aren't throttled
//      by tab visibility — only the page's own setTimeout is).
//   2. The active port keeps the SW alive past its normal eviction
//      window, so `await sleep(N)` inside the loop actually wakes
//      back up instead of getting silently dropped.
//
// Sleep cadence is tight (100ms) — once VS Code is up, we want to
// detect it within the next probe window, not wait for the old
// 400ms / 800ms heartbeat. ECONNREFUSED on localhost is ~1ms per
// port, so total CPU is negligible during the brief wake window.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'pollBridgeReady') return;
  let cancelled = false;
  port.onDisconnect.addListener(() => { cancelled = true; });
  void runBridgePollLoop(port, () => cancelled);
});

async function runBridgePollLoop(port, isCancelled) {
  const MAX_WAIT_MS = 60000;
  const POLL_INTERVAL_MS = 100;
  const deadline = Date.now() + MAX_WAIT_MS;
  let attempt = 0;
  while (!isCancelled() && Date.now() < deadline) {
    attempt += 1;
    if (await isBridgeReachable()) {
      console.info('[Exportal] poll: bridge ready after', attempt, 'attempts');
      safePostAndDisconnect(port, { ready: true });
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  console.warn('[Exportal] poll: timeout after', attempt, 'attempts');
  safePostAndDisconnect(port, { ready: false });
}

function safePostAndDisconnect(port, message) {
  // Both calls can throw if the content-script tab navigated away
  // (port already torn down). Either failure means the consumer is
  // gone; no recovery needed beyond not crashing the loop.
  try { port.postMessage(message); } catch { /* port gone */ }
  try { port.disconnect(); } catch { /* port gone */ }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Single-port probe shared by the wake polling loop above and the
// pre-check called via `exportal:pingBridge` (one-shot from the
// content script). Returns true iff at least one port answers
// 200/401 — meaning some VS Code instance is listening.
async function isBridgeReachable() {
  const token = await getToken();
  if (token === undefined) return false;
  const ports = await buildPortOrder();
  for (const port of ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ping`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      // 200 = our bridge with our token; 401 = a bridge is listening
      // but with a different token (still proves VS Code is up). Any
      // 2xx/4xx response means *something* answered, which is what we
      // care about for "is VS Code listening yet".
      if (res.status === 200 || res.status === 401) return true;
    } catch {
      // connection refused on this port — keep probing
    }
  }
  return false;
}

async function readErrorCode(res) {
  try {
    const body = await res.json();
    return ExportalPure.parseBridgeErrorCode(body);
  } catch {
    return undefined;
  }
}

async function getPendingConversationId() {
  const stored = await chrome.storage.session.get(PENDING_CONVERSATION_KEY);
  const id = stored[PENDING_CONVERSATION_KEY];
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

async function getToken() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const token = stored[TOKEN_KEY];
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

async function buildPortOrder() {
  const stored = await chrome.storage.session.get(LAST_PORT_KEY);
  const lastPort = stored[LAST_PORT_KEY];
  return ExportalPure.buildPortOrder(typeof lastPort === 'number' ? lastPort : undefined);
}

// Fire-and-forget probe to close the pairing loop from Chrome's side.
// On success we remember the port so future /import requests hit the
// right one first (same cache the forward-flow already uses). All
// failures are silent — if VS Code isn't listening, the user will
// find out when their first actual export fails with a specific
// error. No need to surface a generic "couldn't confirm" here.
async function pingBridge(token) {
  const ports = await buildPortOrder();
  for (const port of ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ping`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 200) {
        await chrome.storage.session.set({ [LAST_PORT_KEY]: port });
        return;
      }
      // 401 means a different VS Code window is listening on this port
      // with a different token; keep probing.
    } catch {
      // network error — keep probing
    }
  }
}

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}
