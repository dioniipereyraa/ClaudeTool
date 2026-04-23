// Exportal Companion — options page script.
//
// Drives the three-state OnboardingChrome UI:
//
//   waiting  — no saved token, input empty. Prompt user to paste.
//   detected — input contains a 64-hex string; shimmer + primary
//              "Emparejar" button is active. Pressing it saves.
//   paired   — a token is persisted. Chip turns green, primary
//              button becomes the informational "Todo conectado",
//              and a low-contrast "Unpair" text button appears so
//              the user can reset without editing chrome.storage.
//
// We deliberately don't call `navigator.clipboard.readText()` on load:
// that API needs a `clipboardRead` permission which would trigger a
// new CWS review for every existing user. The auto-pair URL fragment
// flow (see content-script.js consumePairingFragment) covers the
// happy path; this page is the manual fallback.
//
// i18n: static elements use `data-i18n` / `data-i18n-placeholder`,
// bootstrapped on load. Dynamic per-state text is set in setState.

const TOKEN_KEY = 'exportal.pairingToken';
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const card = /** @type {HTMLDivElement} */ (document.getElementById('card'));
const tokenInput = /** @type {HTMLInputElement} */ (document.getElementById('token'));
const primaryBtn = /** @type {HTMLButtonElement} */ (document.getElementById('primary'));
const primaryLabel = document.getElementById('primary-label');
const unpairBtn = /** @type {HTMLButtonElement} */ (document.getElementById('unpair'));
const chipText = document.getElementById('chip-text');
const headlineEl = document.getElementById('headline');
const subtitleEl = document.getElementById('subtitle');

function localizeStaticText() {
  // innerHTML is safe here: all translations ship with the extension
  // (no user input) and some messages contain <strong>/<code>/<kbd>
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

/**
 * Switch the UI to one of the three states. The CSS does the heavy
 * lifting via [data-state] on the card; we just update the text nodes
 * for chip/headline/subtitle/button-label.
 */
function setState(state) {
  card.dataset.state = state;
  const key = /** @type {const} */ ({
    waiting: {
      chip: 'chipWaiting',
      headline: 'headlineWaiting',
      subtitle: 'subtitleWaiting',
      primary: 'btnPair',
    },
    detected: {
      chip: 'chipDetected',
      headline: 'headlineDetected',
      subtitle: 'subtitleDetected',
      primary: 'btnPair',
    },
    paired: {
      chip: 'chipPaired',
      headline: 'headlinePaired',
      subtitle: 'subtitlePaired',
      primary: 'btnAllConnected',
    },
  })[state];
  if (key === undefined) return;
  chipText.textContent = chrome.i18n.getMessage(key.chip);
  headlineEl.textContent = chrome.i18n.getMessage(key.headline);
  subtitleEl.innerHTML = chrome.i18n.getMessage(key.subtitle);
  primaryLabel.textContent = chrome.i18n.getMessage(key.primary);
}

async function init() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const saved = stored[TOKEN_KEY];
  if (typeof saved === 'string' && TOKEN_PATTERN.test(saved)) {
    tokenInput.value = saved;
    setState('paired');
    return;
  }
  setState('waiting');
}

async function pair() {
  // Only actionable in 'detected' state. We guard here rather than
  // disabling the button outright so keyboard users (Enter on a
  // focused input) still behave predictably.
  const value = tokenInput.value.trim();
  if (!TOKEN_PATTERN.test(value)) return;
  await chrome.storage.local.set({ [TOKEN_KEY]: value });
  setState('paired');
}

async function unpair() {
  await chrome.storage.local.remove(TOKEN_KEY);
  tokenInput.value = '';
  setState('waiting');
  tokenInput.focus();
}

tokenInput.addEventListener('input', () => {
  // Never leave 'paired' via typing alone — require the explicit
  // "Unpair" click. Otherwise a stray keystroke on a saved token
  // would downgrade the UI confusingly.
  if (card.dataset.state === 'paired') return;
  const value = tokenInput.value.trim();
  setState(TOKEN_PATTERN.test(value) ? 'detected' : 'waiting');
});

// Enter on the input commits the pair when we're in 'detected'.
tokenInput.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  if (card.dataset.state === 'detected') void pair();
});

primaryBtn.addEventListener('click', () => {
  if (card.dataset.state !== 'detected') return;
  void pair();
});

unpairBtn.addEventListener('click', () => {
  void unpair();
});

// Reflect external changes: if the auto-pair flow on claude.ai saves
// a token while this options tab is open, we want the UI to transition
// to "paired" automatically instead of staying on "waiting".
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!(TOKEN_KEY in changes)) return;
  const next = changes[TOKEN_KEY]?.newValue;
  if (typeof next === 'string' && TOKEN_PATTERN.test(next)) {
    tokenInput.value = next;
    setState('paired');
  } else {
    setState('waiting');
  }
});

localizeStaticText();
void init();
