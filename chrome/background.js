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

// claude.ai export ZIPs are named `data-<something>.zip`. We match the
// basename loosely — any dash-separated token after `data-` — because
// Anthropic has shifted naming schemes over time (date, UUID, batch).
const FILENAME_PATTERN = /(^|[\\/])data-.+\.zip$/i;

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state?.current !== 'complete') return;
  void handleCompletedDownload(delta.id);
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

  const ports = await buildPortOrder();
  let sawAuthError = false;

  for (const port of ports) {
    const result = await tryPort(port, token, zipPath);
    if (result === 'ok') {
      await chrome.storage.session.set({ [LAST_PORT_KEY]: port });
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

async function tryPort(port, token, zipPath) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ zipPath }),
    });
    if (res.status === 200) return 'ok';
    if (res.status === 401) return 'auth';
    return 'other';
  } catch {
    return 'network';
  }
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
