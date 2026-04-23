// Exportal Companion — content script for claude.ai.
//
// Surfaces two export actions on /chat/<uuid>:
//
//   1. "Exportar este chat" (primary) — fetches the active conversation
//      from claude.ai's internal API (same origin, reuses session
//      cookies) and forwards the JSON to the VS Code bridge immediately.
//      No ZIP, no email wait.
//
//   2. "Preparar export oficial" (secondary) — stores the conversation
//      UUID so that when the user triggers Settings → Export data, the
//      background worker can match the eventually-downloaded ZIP to
//      this conversation and auto-open it in VS Code.
//
// UI: a small circular FAB sits at bottom-right. Clicking it toggles a
// popover with the two buttons. The FAB stays out of the way of
// conversation content — expanding only on demand keeps the panel
// discoverable without being intrusive. Keyboard shortcuts
// (Alt+Shift+E / Alt+Shift+O) trigger the same actions without needing
// to open the popover.
//
// This script DOES NOT read the DOM for conversation content. The
// primary action uses the internal JSON API directly — same data the
// claude.ai frontend itself consumes. CSRF/auth is enforced by
// Anthropic's session cookies.
//
// claude.ai is a SPA with client-side navigation. Content scripts run
// in an isolated world, so we can't wrap history.pushState — we poll
// the URL instead (cheap: one regex + one string compare per tick).

const PANEL_ID = 'exportal-panel';
const FAB_ID = 'exportal-fab';
const POPOVER_ID = 'exportal-popover';
const PRIMARY_BTN_ID = 'exportal-send-now';
const SECONDARY_BTN_ID = 'exportal-prepare-official';
const TOAST_ID = 'exportal-toast';
const POLL_INTERVAL_MS = 500;

// Brand palette (matches assets/icon.svg): navy frame, white body,
// orange highlight. FAB + popover wear the navy; the primary action
// uses orange as the call-to-action accent from the logo.
const BRAND_NAVY = '#1e1b4b';
const BRAND_NAVY_HOVER = '#312e81';
const BRAND_ORANGE = '#fb923c';

let lastPathname = '';
let shortcutsInstalled = false;
let actionInFlight = false;

function currentConversationId() {
  return ExportalPure.extractConversationIdFromPath(window.location.pathname);
}

function syncPanel() {
  const existing = document.getElementById(PANEL_ID);
  const id = currentConversationId();

  if (id === undefined) {
    if (existing !== null) existing.remove();
    return;
  }

  if (existing !== null) {
    existing.dataset.conversationId = id;
    return;
  }

  const panel = buildPanel(id);
  document.body.appendChild(panel);
}

function buildPanel(conversationId) {
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.dataset.conversationId = conversationId;
  Object.assign(panel.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '10px',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  });

  const popover = buildPopover();
  const fab = buildFab();
  panel.appendChild(popover);
  panel.appendChild(fab);

  // Collapse when clicking outside the panel.
  document.addEventListener('click', (ev) => {
    const p = document.getElementById(PANEL_ID);
    if (p === null) return;
    if (p.contains(ev.target)) return;
    setExpanded(false);
  });

  return panel;
}

function buildFab() {
  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.type = 'button';
  fab.setAttribute('aria-label', chrome.i18n.getMessage('fabAriaLabel'));
  fab.setAttribute('aria-expanded', 'false');
  fab.title = chrome.i18n.getMessage('fabTooltip');
  Object.assign(fab.style, {
    width: '44px',
    height: '44px',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: BRAND_NAVY,
    border: '1.5px solid rgba(255,255,255,0.08)',
    borderRadius: '50%',
    boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    transition: 'background 0.15s ease, transform 0.15s ease',
  });
  fab.innerHTML = iconSvg();
  fab.addEventListener('mouseenter', () => {
    fab.style.background = BRAND_NAVY_HOVER;
  });
  fab.addEventListener('mouseleave', () => {
    fab.style.background = BRAND_NAVY;
  });
  fab.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const panel = document.getElementById(PANEL_ID);
    const expanded = panel?.dataset.expanded === 'true';
    setExpanded(!expanded);
  });
  return fab;
}

function iconSvg() {
  // Download-style arrow. White shaft + chevron echo the white strokes
  // of the "E" in the logo; the orange base line mirrors the orange
  // highlight bar through the middle of the E in assets/icon.svg.
  return (
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" ` +
    `stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true">` +
    `<path d="M12 3v12" stroke="#ffffff"/>` +
    `<path d="M7 10l5 5 5-5" stroke="#ffffff"/>` +
    `<path d="M4 21h16" stroke="${BRAND_ORANGE}"/>` +
    `</svg>`
  );
}

function buildPopover() {
  const popover = document.createElement('div');
  popover.id = POPOVER_ID;
  Object.assign(popover.style, {
    display: 'none',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px',
    background: BRAND_NAVY,
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
    minWidth: '220px',
  });

  const primary = makeButton({
    id: PRIMARY_BTN_ID,
    label: chrome.i18n.getMessage('btnSendNow'),
    primary: true,
    onClick: handlePrimaryClick,
  });
  const secondary = makeButton({
    id: SECONDARY_BTN_ID,
    label: chrome.i18n.getMessage('btnPrepareOfficial'),
    primary: false,
    onClick: handleSecondaryClick,
  });

  const hint = document.createElement('div');
  hint.textContent = 'Alt+Shift+E · Alt+Shift+O';
  Object.assign(hint.style, {
    fontSize: '10.5px',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: '4px',
    letterSpacing: '0.02em',
  });

  popover.appendChild(primary);
  popover.appendChild(secondary);
  popover.appendChild(hint);
  return popover;
}

function setExpanded(expanded) {
  const panel = document.getElementById(PANEL_ID);
  const fab = document.getElementById(FAB_ID);
  const popover = document.getElementById(POPOVER_ID);
  if (panel === null || fab === null || popover === null) return;
  panel.dataset.expanded = expanded ? 'true' : 'false';
  fab.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  popover.style.display = expanded ? 'flex' : 'none';
}

function makeButton({ id, label, primary, onClick }) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.type = 'button';
  btn.textContent = label;
  const palette = primary
    ? { bg: '#ffffff', bgHover: '#f1f1f4', fg: BRAND_NAVY, fontWeight: '700' }
    : { bg: 'rgba(255,255,255,0.08)', bgHover: 'rgba(255,255,255,0.16)', fg: '#e4e4e7', fontWeight: '500' };
  Object.assign(btn.style, {
    padding: '9px 14px',
    fontSize: '13px',
    fontWeight: palette.fontWeight,
    color: palette.fg,
    background: palette.bg,
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    textAlign: 'center',
  });
  btn.dataset.bg = palette.bg;
  btn.dataset.bgHover = palette.bgHover;
  btn.addEventListener('mouseenter', () => {
    if (!btn.disabled) btn.style.background = palette.bgHover;
  });
  btn.addEventListener('mouseleave', () => {
    if (!btn.disabled) btn.style.background = palette.bg;
  });
  btn.addEventListener('click', () => {
    void onClick(btn);
  });
  return btn;
}

async function handleSecondaryClick(btn) {
  const id = panelConversationId();
  if (id === undefined) return;
  try {
    await runSecondaryAction(id);
    flash(btn, chrome.i18n.getMessage('feedbackOfficialPrepared'), '#16a34a');
  } catch (err) {
    console.warn('Exportal: could not save pending conversation.', err);
    flash(btn, chrome.i18n.getMessage('feedbackError'), '#dc2626');
  }
}

async function handlePrimaryClick(btn) {
  const id = panelConversationId();
  if (id === undefined) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = chrome.i18n.getMessage('feedbackSearching');
  try {
    const conversation = await fetchConversation(id);
    btn.textContent = chrome.i18n.getMessage('feedbackSending');
    await sendInline(conversation);
    btn.textContent = originalText;
    flash(btn, chrome.i18n.getMessage('feedbackOpenedInVsCode'), '#16a34a');
  } catch (err) {
    console.warn('Exportal: inline export failed.', err);
    btn.textContent = originalText;
    flash(btn, explainError(err), '#dc2626');
  } finally {
    btn.disabled = false;
  }
}

// Shortcut-driven variants: same underlying actions, but feedback is a
// floating toast (the popover may be closed).
async function runPrimaryFromShortcut() {
  if (actionInFlight) return;
  const id = currentConversationId();
  if (id === undefined) return;
  actionInFlight = true;
  showToast(chrome.i18n.getMessage('toastExporting'), 'info');
  try {
    const conversation = await fetchConversation(id);
    await sendInline(conversation);
    showToast(chrome.i18n.getMessage('feedbackOpenedInVsCode'), 'ok');
  } catch (err) {
    console.warn('Exportal: inline export failed.', err);
    showToast(explainError(err), 'err');
  } finally {
    actionInFlight = false;
  }
}

async function runSecondaryFromShortcut() {
  if (actionInFlight) return;
  const id = currentConversationId();
  if (id === undefined) return;
  actionInFlight = true;
  try {
    await runSecondaryAction(id);
    showToast(chrome.i18n.getMessage('feedbackOfficialPrepared'), 'ok');
  } catch (err) {
    console.warn('Exportal: could not save pending conversation.', err);
    showToast(chrome.i18n.getMessage('feedbackError'), 'err');
  } finally {
    actionInFlight = false;
  }
}

async function runSecondaryAction(id) {
  const response = await chrome.runtime.sendMessage({
    type: 'exportal:setPending',
    conversationId: id,
  });
  if (response?.ok !== true) throw new Error(response?.error ?? 'unknown');
}

async function sendInline(conversation) {
  const response = await chrome.runtime.sendMessage({
    type: 'exportal:sendInline',
    conversation,
  });
  if (response?.ok !== true) throw new Error(response?.error ?? 'unknown');
}

function explainError(err) {
  // pure.js maps error codes to i18n message IDs; we resolve the ID
  // against the current locale here since pure.js must stay browser/
  // Node-agnostic for unit tests.
  return chrome.i18n.getMessage(ExportalPure.explainError(err));
}

// claude.ai's internal API is usually quick; 15s is a generous upper
// bound that still aborts a hung request instead of silently spinning.
const API_TIMEOUT_MS = 15000;

async function fetchConversation(conversationId) {
  const orgIds = await fetchOrganizationIds();
  if (orgIds.length === 0) throw new Error('no_org');
  for (const orgId of orgIds) {
    const url =
      `/api/organizations/${encodeURIComponent(orgId)}` +
      `/chat_conversations/${encodeURIComponent(conversationId)}` +
      `?tree=True&rendering_mode=messages`;
    const res = await fetchClaudeApi(url);
    if (res.status === 404) continue;
    if (res.status === 401 || res.status === 403) throw new Error('session_expired');
    if (!res.ok) throw new Error(`claude_api_${String(res.status)}`);
    return await parseJsonOrThrow(res);
  }
  throw new Error('not_found');
}

async function fetchOrganizationIds() {
  const res = await fetchClaudeApi('/api/organizations');
  if (res.status === 401 || res.status === 403) throw new Error('session_expired');
  if (!res.ok) throw new Error(`claude_api_${String(res.status)}`);
  const data = await parseJsonOrThrow(res);
  return ExportalPure.extractOrgIds(data);
}

async function fetchClaudeApi(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('timeout');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonOrThrow(res) {
  // claude.ai normally replies JSON, but a misrouted request (e.g.
  // session cookie dropped mid-deploy) can silently return the SPA
  // HTML shell with a 200. Reject that explicitly so the user sees
  // a useful message instead of the Zod shape-mismatch downstream.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) throw new Error('invalid_response');
  try {
    return await res.json();
  } catch {
    throw new Error('invalid_response');
  }
}

function panelConversationId() {
  const panel = document.getElementById(PANEL_ID);
  const id = panel?.dataset.conversationId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function flash(btn, text, color) {
  const originalText = btn.textContent;
  const originalBg = btn.dataset.bg ?? btn.style.background;
  btn.textContent = text;
  btn.style.background = color;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = originalBg;
    btn.disabled = false;
  }, 1800);
}

function showToast(text, kind) {
  const existing = document.getElementById(TOAST_ID);
  if (existing !== null) existing.remove();

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.textContent = text;
  const bg = kind === 'ok' ? '#16a34a' : kind === 'err' ? '#dc2626' : '#3f3f46';
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '78px',
    right: '20px',
    zIndex: '2147483647',
    padding: '10px 14px',
    background: bg,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSize: '13px',
    fontWeight: '500',
    borderRadius: '8px',
    boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
    opacity: '0',
    transform: 'translateY(6px)',
    transition: 'opacity 0.15s ease, transform 0.15s ease',
    pointerEvents: 'none',
  });
  document.body.appendChild(toast);
  // Force layout then animate in.
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  const ttl = kind === 'info' ? 1200 : 2000;
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => toast.remove(), 200);
  }, ttl);
}

function installShortcuts() {
  if (shortcutsInstalled) return;
  shortcutsInstalled = true;
  window.addEventListener(
    'keydown',
    (ev) => {
      // Require Alt+Shift, no Ctrl/Meta, and only on /chat/<uuid> pages.
      if (!ev.altKey || !ev.shiftKey || ev.ctrlKey || ev.metaKey) return;
      if (currentConversationId() === undefined) return;
      const key = ev.key.toLowerCase();
      if (key === 'e') {
        ev.preventDefault();
        void runPrimaryFromShortcut();
      } else if (key === 'o') {
        ev.preventDefault();
        void runSecondaryFromShortcut();
      }
    },
    true, // capture: fire before page handlers
  );
}

function tick() {
  if (window.location.pathname === lastPathname) return;
  lastPathname = window.location.pathname;
  syncPanel();
}

installShortcuts();
setInterval(tick, POLL_INTERVAL_MS);
tick();
