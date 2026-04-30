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
const SOUND_KEY = 'exportSound';

const card = /** @type {HTMLDivElement} */ (document.getElementById('card'));
const tokenInput = /** @type {HTMLInputElement} */ (document.getElementById('token'));
const primaryBtn = /** @type {HTMLButtonElement} */ (document.getElementById('primary'));
const primaryLabel = document.getElementById('primary-label');
const unpairBtn = /** @type {HTMLButtonElement} */ (document.getElementById('unpair'));
const chipText = document.getElementById('chip-text');
const headlineEl = document.getElementById('headline');
const subtitleEl = document.getElementById('subtitle');
const soundToggle = /** @type {HTMLInputElement} */ (document.getElementById('export-sound-toggle'));
const testSoundBtn = /** @type {HTMLButtonElement} */ (document.getElementById('test-sound'));

// Cache of the currently-saved token, kept in sync with chrome.storage
// via init() / pair() / unpair() / storage.onChanged. Lets the input
// listener compare against "what's saved" so the user can edit the
// token in-place — typing the same value back returns to 'paired',
// typing a different valid token transitions to 'detected' so they
// can save without having to click Unpair first (Hito 32 follow-up).
let savedToken = '';

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
  const stored = await chrome.storage.local.get([TOKEN_KEY, SOUND_KEY]);
  // Sound toggle defaults to ON. Only `false` flips the checkbox off —
  // missing key (first install) and `true` both render checked.
  soundToggle.checked = stored[SOUND_KEY] !== false;
  const saved = stored[TOKEN_KEY];
  if (typeof saved === 'string' && TOKEN_PATTERN.test(saved)) {
    savedToken = saved;
    tokenInput.value = saved;
    setState('paired');
    return;
  }
  savedToken = '';
  setState('waiting');
}

// A=432Hz major arpeggio (A → C# → E). Duplicated near-verbatim
// from chrome/content-script.js so the Test button works without
// loading the full content script. Keep the two in sync if the
// sound design changes — see comment over playSuccessTone in
// content-script.js for the full design rationale.
async function playSuccessTone() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (Ctor === undefined) return;
  const ctx = new Ctor();
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { return; }
  }
  const playTone = (freq, startTime, duration, volume) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  };
  const t0 = ctx.currentTime;
  playTone(432, t0,         0.30, 0.10);   // A — root
  playTone(540, t0 + 0.08,  0.40, 0.11);   // C# — major third (432 × 5/4)
  playTone(648, t0 + 0.16,  0.55, 0.13);   // E — perfect fifth (432 × 3/2)
  setTimeout(() => { void ctx.close(); }, 900);
}

async function pair() {
  // Only actionable in 'detected' state. We guard here rather than
  // disabling the button outright so keyboard users (Enter on a
  // focused input) still behave predictably.
  const value = tokenInput.value.trim();
  if (!TOKEN_PATTERN.test(value)) return;
  await chrome.storage.local.set({ [TOKEN_KEY]: value });
  savedToken = value;
  setState('paired');
  // Explicit hide as belt-and-suspenders alongside the
  // storage.session listener at the bottom of this file. The
  // listener catches real state transitions when BADGE_STATE_KEY
  // changes — but if the banner was shown via URL param without a
  // matching live state in session storage (manual test path, or
  // a state that was already cleared elsewhere), removing a
  // non-existent key fires no onChanged, and the listener never
  // runs. Calling hideBanner() here guarantees the banner closes
  // when the user takes the recovery action.
  hideBanner();
}

async function unpair() {
  await chrome.storage.local.remove(TOKEN_KEY);
  savedToken = '';
  tokenInput.value = '';
  setState('waiting');
  tokenInput.focus();
}

tokenInput.addEventListener('input', () => {
  // Hito 32 follow-up: while paired, typing the same value back
  // keeps us in 'paired' (no flicker for a spurious keystroke).
  // Typing a *different* valid token moves to 'detected' so the
  // primary button activates and the user can save the new one
  // directly — no detour through Unpair. Anything that isn't 64
  // hex chars goes to 'waiting' (button disabled, headline hints
  // they're missing characters).
  const value = tokenInput.value.trim();
  if (savedToken !== '' && value === savedToken) {
    setState('paired');
    return;
  }
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

// Sound toggle persists immediately to chrome.storage.local. The
// content script reads the same key on each export, so the next
// export reflects the new value without reloading the page.
soundToggle.addEventListener('change', () => {
  void chrome.storage.local.set({ [SOUND_KEY]: soundToggle.checked });
});

// Test button always plays — even when the toggle is off — so the
// user can preview the sound before deciding to enable it. Treats
// each click as a fresh user gesture so AudioContext.resume() works
// reliably across browser autoplay rules.
testSoundBtn.addEventListener('click', () => {
  void playSuccessTone();
});

// ─── Hito 32 — state banner ──────────────────────────────────────
//
// When the toolbar icon is clicked while the badge shows an error
// (AUTH/OFF/OLD/ERR), background.js opens this page with
// `?reason=<state>`. We render a banner with a state-specific
// headline + body + 1-2 CTAs.
//
// Retry semantics: for "off" the Retry button pings the bridge via
// the existing exportal:pingBridge message. We do NOT replay the
// failed export — we don't have it buffered, and replaying would be
// fragile. The user's path is: bridge OK confirmed → re-trigger the
// export from claude.ai/ChatGPT.

const VS_CODE_MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/items?itemName=dioniipereyraa.exportal';
const VS_CODE_WAKE_URI = 'vscode://dioniipereyraa.exportal/wake';

const banner = document.getElementById('banner');
const bannerHeadline = document.getElementById('banner-headline');
const bannerText = document.getElementById('banner-text');
const bannerPrimary = /** @type {HTMLButtonElement} */ (document.getElementById('banner-primary'));
const bannerSecondary = /** @type {HTMLButtonElement} */ (document.getElementById('banner-secondary'));

// Reasons that drive a visible banner. Subset of the badge states
// declared in background.js; matches the `ERROR_STATES` set there.
const BANNER_REASONS = new Set(['auth', 'off', 'old', 'err']);
// Storage key (session area) where background persists the current
// badge state. Mirrored from background.js — keep in sync.
const BADGE_STATE_KEY = 'exportal.badgeState';

/** @type {Record<string, {headline: string, text: string, primary?: {key: string, action: string}, secondary?: {key: string, action: string}}>} */
const BANNER_MAP = {
  auth: {
    headline: 'bannerAuthHeadline',
    text: 'bannerAuthBody',
    // No CTA — the fix is to paste the right token in the input
    // already on the page. The headline + body point to that.
  },
  off: {
    headline: 'bannerOffHeadline',
    text: 'bannerOffBody',
    primary: { key: 'bannerRetryButton', action: 'retry' },
    secondary: { key: 'bannerOpenInVsCodeButton', action: 'open-vscode' },
  },
  old: {
    headline: 'bannerOldHeadline',
    text: 'bannerOldBody',
    primary: { key: 'bannerOpenMarketplaceButton', action: 'open-marketplace' },
  },
  err: {
    headline: 'bannerErrHeadline',
    text: 'bannerErrBody',
    // No CTA — the user's recourse is to retry from claude.ai
    // since we don't have the failed payload buffered.
  },
};

/**
 * Render the banner for the given reason. Idempotent — calling it
 * with the same reason refreshes the content; calling with a new
 * reason mutates the banner in place. Resets data-kind to 'error'
 * (the banner-actions :has() rule collapses the row when no CTA
 * is wired for the reason).
 */
function showBannerForReason(reason) {
  const def = BANNER_MAP[reason];
  if (def === undefined) {
    hideBanner();
    return;
  }
  banner.dataset.kind = 'error';
  bannerHeadline.textContent = chrome.i18n.getMessage(def.headline);
  bannerText.textContent = chrome.i18n.getMessage(def.text);
  if (def.primary !== undefined) {
    bannerPrimary.textContent = chrome.i18n.getMessage(def.primary.key);
    bannerPrimary.dataset.action = def.primary.action;
    bannerPrimary.hidden = false;
  } else {
    bannerPrimary.hidden = true;
  }
  if (def.secondary !== undefined) {
    bannerSecondary.textContent = chrome.i18n.getMessage(def.secondary.key);
    bannerSecondary.dataset.action = def.secondary.action;
    bannerSecondary.hidden = false;
  } else {
    bannerSecondary.hidden = true;
  }
  banner.classList.add('shown');
}

function hideBanner() {
  banner.classList.remove('shown');
}

/**
 * Reads `?reason=` and shows the banner. Called once on page load.
 * After load the banner is kept in sync with the live badge state
 * via the storage.onChanged listener at the bottom of this file —
 * if the user re-pairs or the next export succeeds, the banner
 * hides automatically.
 */
function maybeShowBanner() {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get('reason');
  if (reason === null) return;
  showBannerForReason(reason);
}

async function handleBannerAction(action) {
  if (action === 'retry') {
    // Single async ping. On success → switch banner to success state
    // and tell background to clear the OFF badge so the toolbar goes
    // neutral. On failure → leave the banner as-is; the user keeps
    // looking at the same instructions.
    bannerPrimary.disabled = true;
    let ok = false;
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'exportal:pingBridge' });
      ok = resp?.ok === true;
    } catch {
      ok = false;
    }
    bannerPrimary.disabled = false;
    if (ok) {
      banner.dataset.kind = 'success';
      bannerHeadline.textContent = chrome.i18n.getMessage('bannerRetryOkHeadline');
      bannerText.textContent = chrome.i18n.getMessage('bannerRetryOkBody');
      bannerPrimary.hidden = true;
      bannerSecondary.hidden = true;
      // Clear the OFF badge — paired/idle state. Background owns the
      // badge; we round-trip through it instead of touching
      // chrome.action directly from this page.
      void chrome.runtime.sendMessage({ type: 'exportal:clearBadge' });
    } else {
      // Pulse the headline so the user sees "we tried" without losing
      // context. Cheap visual feedback — no extra UI.
      banner.style.animation = 'none';
      requestAnimationFrame(() => {
        banner.style.animation = 'expBannerNudge 240ms ease';
      });
    }
    return;
  }
  if (action === 'open-vscode') {
    // The wake URI activates the Exportal VS Code extension, which
    // brings VS Code to the foreground if it's running and lets the
    // user start it (via the registered protocol handler) if it's not.
    window.location.href = VS_CODE_WAKE_URI;
    return;
  }
  if (action === 'open-marketplace') {
    window.open(VS_CODE_MARKETPLACE_URL, '_blank', 'noopener,noreferrer');
  }
}

bannerPrimary.addEventListener('click', () => {
  const action = bannerPrimary.dataset.action;
  if (typeof action === 'string') void handleBannerAction(action);
});
bannerSecondary.addEventListener('click', () => {
  const action = bannerSecondary.dataset.action;
  if (typeof action === 'string') void handleBannerAction(action);
});

maybeShowBanner();
// ─── /Hito 32 ────────────────────────────────────────────────────

// Reflect external changes:
//  - `local` area + TOKEN_KEY: auto-pair from claude.ai or unpair
//    triggered elsewhere — refresh the input + state chip.
//  - `session` area + BADGE_STATE_KEY: the live badge state owned
//    by background.js. If the banner is showing AUTH and the user
//    re-pairs (or the next export fixes the state), the banner
//    self-updates here in real time. The success state from the
//    Retry CTA is exempt — `data-kind='success'` skips auto-hide
//    so the user reads the confirmation before dismissal.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && TOKEN_KEY in changes) {
    const next = changes[TOKEN_KEY]?.newValue;
    if (typeof next === 'string' && TOKEN_PATTERN.test(next)) {
      savedToken = next;
      tokenInput.value = next;
      setState('paired');
    } else {
      savedToken = '';
      setState('waiting');
    }
  }
  if (area === 'session' && BADGE_STATE_KEY in changes) {
    const newState = changes[BADGE_STATE_KEY]?.newValue;
    if (typeof newState === 'string' && BANNER_REASONS.has(newState)) {
      showBannerForReason(newState);
    } else if (banner.dataset.kind !== 'success') {
      hideBanner();
    }
  }
});

localizeStaticText();
void init();
