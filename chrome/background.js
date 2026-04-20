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

const PORT_RANGE_START = 9317;
const PORT_RANGE_END = 9326;
const TOKEN_KEY = 'exportal.pairingToken';
const LAST_PORT_KEY = 'exportal.lastPort';
const PENDING_CONVERSATION_KEY = 'exportal.pendingConversationId';

// claude.ai export ZIPs are named `data-<something>.zip`. We match the
// basename loosely — any dash-separated token after `data-` — because
// Anthropic has shifted naming schemes over time (date, UUID, batch).
const FILENAME_PATTERN = /(^|[\\/])data-.+\.zip$/i;

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
      title: 'Exportal Companion — click para emparejar con VS Code',
    });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({
      title: 'Exportal Companion — emparejado',
    });
  }
}

// Messages from the claude.ai content script:
//   - exportal:setPending → remember the conversation UUID so the next
//     official-export ZIP we observe gets auto-opened in VS Code.
//   - exportal:sendInline → POST the scraped conversation JSON to the
//     VS Code bridge right now, no ZIP in the middle.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept from claude.ai tabs — defense-in-depth against any other
  // page that somehow tries to talk to us.
  const url = sender.tab?.url ?? sender.url ?? '';
  if (!url.startsWith('https://claude.ai/')) {
    sendResponse({ ok: false, error: 'bad_origin' });
    return false;
  }

  if (message?.type === 'exportal:setPending') {
    const id = message.conversationId;
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
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
    forwardInlineConversation(conversation)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});

async function handleCompletedDownload(id) {
  const items = await chrome.downloads.search({ id });
  const item = items[0];
  if (!item) return;
  if (!isClaudeAiExport(item)) return;
  await forwardToExportal(item.filename);
}

function isClaudeAiExport(item) {
  const filename = item.filename ?? '';
  if (!FILENAME_PATTERN.test(filename)) return false;
  // Defense-in-depth against unrelated ZIPs that happen to start with
  // `data-`: require the download to have originated from claude.ai.
  const url = item.url ?? '';
  const referrer = item.referrer ?? '';
  return url.includes('claude.ai') || referrer.includes('claude.ai');
}

async function forwardToExportal(zipPath) {
  const token = await getToken();
  if (token === undefined) {
    await setBadge('SET', '#ca8a04');
    console.warn('Exportal: token no configurado. Abrí Opciones de la extensión.');
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
    console.warn('Exportal: token rechazado. Revisá Opciones.');
  } else {
    await setBadge('OFF', '#dc2626');
    console.warn('Exportal: no pude contactar al servidor local. ¿VS Code está abierto?');
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

async function forwardInlineConversation(conversation) {
  const token = await getToken();
  if (token === undefined) {
    await setBadge('SET', '#ca8a04');
    return { ok: false, error: 'no_token' };
  }
  const body = JSON.stringify({ conversation });
  const ports = await buildPortOrder();
  let sawAuthError = false;
  let sawOutdated = false;
  for (const port of ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/import-inline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body,
      });
      if (res.status === 200) {
        await chrome.storage.session.set({ [LAST_PORT_KEY]: port });
        await setBadge('OK', '#16a34a');
        return { ok: true };
      }
      if (res.status === 401) {
        sawAuthError = true;
        break;
      }
      // Any HTTP response that isn't 200/401 means a server is there
      // but doesn't accept us — most commonly our own bridge on an
      // older build (404: /import-inline didn't exist yet). We keep
      // probing the remaining ports in case the user has a second
      // VS Code instance running a newer build, but remember that we
      // saw HTTP so we can report "outdated" instead of "offline" if
      // nothing else answers.
      sawOutdated = true;
    } catch {
      // network error — keep probing
    }
  }
  if (sawAuthError) {
    await setBadge('AUTH', '#dc2626');
    return { ok: false, error: 'bridge_auth' };
  }
  if (sawOutdated) {
    await setBadge('OLD', '#dc2626');
    return { ok: false, error: 'bridge_outdated' };
  }
  await setBadge('OFF', '#dc2626');
  return { ok: false, error: 'bridge_offline' };
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
  const all = [];
  for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) all.push(p);
  if (typeof lastPort === 'number' && all.includes(lastPort)) {
    return [lastPort, ...all.filter((p) => p !== lastPort)];
  }
  return all;
}

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}
