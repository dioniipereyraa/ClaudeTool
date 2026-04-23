// Exportal Companion — options page script.
//
// Single responsibility: persist the pairing token in chrome.storage.local
// so the background worker (future sub-hitos) can read it when it needs
// to POST to the Exportal local server.
//
// i18n: statically rendered text is marked in options.html with
// `data-i18n` (innerHTML) / `data-i18n-placeholder` (attribute), and
// bootstrapped here on load. Dynamic status strings go through
// `chrome.i18n.getMessage` at the call site.

const TOKEN_KEY = 'exportal.pairingToken';
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const tokenInput = /** @type {HTMLInputElement} */ (document.getElementById('token'));
const saveButton = document.getElementById('save');
const clearButton = document.getElementById('clear');
const statusEl = document.getElementById('status');
const banner = document.getElementById('banner');
const bannerText = document.getElementById('banner-text');

function localizeStaticText() {
  // innerHTML is safe here: all translations are shipped with the
  // extension (no user input) and some messages contain <kbd>/<code>
  // markup that would be lost with textContent.
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (key !== null) el.innerHTML = chrome.i18n.getMessage(key);
  }
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key !== null) el.setAttribute('placeholder', chrome.i18n.getMessage(key));
  }
}

function setStatus(kind, message) {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
}

function setBannerState(paired) {
  if (paired) {
    banner.dataset.state = 'ok';
    bannerText.textContent = chrome.i18n.getMessage('bannerPaired');
  } else {
    banner.dataset.state = 'missing';
    bannerText.textContent = chrome.i18n.getMessage('bannerNotPaired');
  }
}

async function load() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const token = stored[TOKEN_KEY];
  if (typeof token === 'string' && token.length > 0) {
    tokenInput.value = token;
    setStatus('', chrome.i18n.getMessage('tokenSaved'));
    setBannerState(true);
  } else {
    setBannerState(false);
  }
}

async function save() {
  const value = tokenInput.value.trim();
  if (!TOKEN_PATTERN.test(value)) {
    setStatus('err', chrome.i18n.getMessage('tokenInvalid'));
    return;
  }
  await chrome.storage.local.set({ [TOKEN_KEY]: value });
  setStatus('ok', chrome.i18n.getMessage('tokenSaved'));
  setBannerState(true);
}

async function clear() {
  await chrome.storage.local.remove(TOKEN_KEY);
  tokenInput.value = '';
  setStatus('', chrome.i18n.getMessage('tokenCleared'));
  setBannerState(false);
}

saveButton.addEventListener('click', () => {
  void save();
});
clearButton.addEventListener('click', () => {
  void clear();
});

localizeStaticText();
void load();
