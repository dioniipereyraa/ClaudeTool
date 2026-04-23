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
// UI: a small ambient orb sits at bottom-right; clicking it toggles a
// popover card that matches the Graphite Citrus design (dark surface,
// lime accent, jetbrains-mono kbd chips). Success becomes a full-panel
// pulse showing real metrics (ms + message count) instead of a button
// flash. Keyboard shortcuts (Alt+Shift+E / Alt+Shift+O) skip the
// popover entirely and trigger a toast.
//
// This script DOES NOT read the DOM for conversation content. The
// primary action uses the internal JSON API directly — same data the
// claude.ai frontend itself consumes. CSRF/auth is enforced by
// Anthropic's session cookies.
//
// claude.ai is a SPA with client-side navigation. Content scripts run
// in an isolated world, so we can't wrap history.pushState — we poll
// the URL instead (cheap: one regex + one string compare per tick).

const STYLE_ID = 'exportal-styles';
const PANEL_ID = 'exportal-panel';
const FAB_ID = 'exportal-fab';
const POPOVER_ID = 'exportal-popover';
const PULSE_ID = 'exportal-pulse';
const PRIMARY_BTN_ID = 'exportal-send-now';
const SECONDARY_BTN_ID = 'exportal-prepare-official';
const TOAST_ID = 'exportal-toast';
const POLL_INTERVAL_MS = 500;

// Design tokens — ported from design-cds/components/tokens.jsx
// (Graphite Citrus / dark / cozy). Exposed as CSS variables under the
// --exportal- prefix so inline styles and keyframes can share them.
const TOKENS = {
  bg: '#0A0B0D',
  surface: '#111315',
  surface2: '#181A1D',
  line: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.13)',
  text: '#F2F3F0',
  textDim: 'rgba(242,243,240,0.60)',
  textMute: 'rgba(242,243,240,0.36)',
  accent: '#D4FF3A',
  accentHover: '#E4FF5C',
  accentInk: '#0A0B0D',
  ok: '#86EFAC',
  err: '#FCA5A5',
  fsXs: '11px',
  fsSm: '13px',
  fsBase: '14px',
  fsLg: '18px',
  pad: '16px',
  padSm: '10px',
  radius: '10px',
  radiusLg: '14px',
};

let lastPathname = '';
let shortcutsInstalled = false;
let actionInFlight = false;

function currentConversationId() {
  return ExportalPure.extractConversationIdFromPath(window.location.pathname);
}

function injectStyles() {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // Scoped via #exportal-panel so host-page rules can't bleed in and we
  // can't bleed out. Keyframes are global (kept unprefixed intentionally
  // so Chrome's anim engine treats them as one registration).
  const vars = Object.entries(TOKENS)
    .map(([k, v]) => `--exp-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
    .join(';');
  style.textContent = `
    #${PANEL_ID}{${vars};font-family:'Inter Tight',Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--exp-text);-webkit-font-smoothing:antialiased}
    #${PANEL_ID} .exp-mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    @keyframes expPop{0%{transform:scale(.96);opacity:0}100%{transform:scale(1);opacity:1}}
    @keyframes expCheckIn{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
    @keyframes expDraw{to{stroke-dashoffset:0}}
    @keyframes expSpin{to{transform:rotate(360deg)}}
    @keyframes expPulse{0%,100%{opacity:1}50%{opacity:.55}}
    @keyframes expRise{0%{transform:translateY(6px);opacity:0}100%{transform:translateY(0);opacity:1}}
    @keyframes expToastIn{0%{transform:translateY(8px);opacity:0}100%{transform:translateY(0);opacity:1}}
  `;
  document.head.appendChild(style);
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

  injectStyles();
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

// Ambient orb: ExportalMark on surface with a pulsing dot in the
// corner that signals "ready". Borrows from FabAmbient in the design
// but keeps our click-to-expand behavior.
function buildFab() {
  const fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.type = 'button';
  fab.setAttribute('aria-label', chrome.i18n.getMessage('fabAriaLabel'));
  fab.setAttribute('aria-expanded', 'false');
  fab.title = chrome.i18n.getMessage('fabTooltip');
  Object.assign(fab.style, {
    position: 'relative',
    width: '46px',
    height: '46px',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: TOKENS.surface,
    border: `1px solid ${TOKENS.line}`,
    borderRadius: '23px',
    boxShadow: '0 10px 28px rgba(0,0,0,0.28), 0 2px 4px rgba(0,0,0,0.14)',
    cursor: 'pointer',
    transition: 'transform 120ms ease',
  });
  fab.innerHTML = `
    ${exportalMarkSvg({ size: 24, bg: 'transparent', accent: TOKENS.accent, ink: TOKENS.text, rounded: 0.28 })}
    <span data-exp-dot style="position:absolute;top:5px;right:5px;width:8px;height:8px;border-radius:4px;background:${TOKENS.accent};box-shadow:0 0 0 3px ${TOKENS.accent}33;animation:expPulse 2.2s ease-in-out infinite"></span>
  `;
  fab.addEventListener('mouseenter', () => { fab.style.transform = 'translateY(-1px)'; });
  fab.addEventListener('mouseleave', () => { fab.style.transform = 'translateY(0)'; });
  fab.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const panel = document.getElementById(PANEL_ID);
    const expanded = panel?.dataset.expanded === 'true';
    setExpanded(!expanded);
  });
  return fab;
}

// FabExpanded card — brand header with status chip, primary CTA with
// arrow glyph, secondary ghost button, kbd chips. The SuccessPulse
// overlay lives inside this container so it covers the whole card.
function buildPopover() {
  const popover = document.createElement('div');
  popover.id = POPOVER_ID;
  Object.assign(popover.style, {
    position: 'relative',
    display: 'none',
    flexDirection: 'column',
    width: '280px',
    padding: TOKENS.pad,
    background: TOKENS.surface,
    border: `1px solid ${TOKENS.line}`,
    borderRadius: TOKENS.radiusLg,
    boxShadow: '0 12px 32px rgba(0,0,0,0.24), 0 2px 6px rgba(0,0,0,0.12)',
  });

  popover.appendChild(buildBrandHeader());

  const primary = makePrimaryButton({
    id: PRIMARY_BTN_ID,
    label: chrome.i18n.getMessage('btnSendNow'),
    onClick: handlePrimaryClick,
  });
  const secondary = makeSecondaryButton({
    id: SECONDARY_BTN_ID,
    label: chrome.i18n.getMessage('btnPrepareOfficial'),
    onClick: handleSecondaryClick,
  });

  popover.appendChild(primary);
  popover.appendChild(secondary);
  popover.appendChild(buildKbdRow());

  return popover;
}

function buildBrandHeader() {
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  });
  const mark = document.createElement('span');
  mark.style.display = 'inline-flex';
  mark.innerHTML = exportalMarkSvg({ size: 22, bg: TOKENS.surface2, accent: TOKENS.accent, ink: TOKENS.text, rounded: 0.28 });
  const name = document.createElement('span');
  name.textContent = 'Exportal';
  Object.assign(name.style, {
    fontSize: TOKENS.fsSm,
    fontWeight: '600',
    color: TOKENS.text,
    letterSpacing: '-0.01em',
  });
  const status = document.createElement('span');
  Object.assign(status.style, {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: TOKENS.fsXs,
    color: TOKENS.textDim,
  });
  status.innerHTML = `
    <span style="width:6px;height:6px;border-radius:3px;background:${TOKENS.ok};box-shadow:0 0 0 3px ${TOKENS.ok}22"></span>
    <span>VS Code</span>
  `;
  header.appendChild(mark);
  header.appendChild(name);
  header.appendChild(status);
  return header;
}

function buildKbdRow() {
  const row = document.createElement('div');
  row.className = 'exp-mono';
  Object.assign(row.style, {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '10px',
    fontSize: TOKENS.fsXs,
    color: TOKENS.textMute,
  });
  // Spelled-out modifiers rather than ⌥⇧ glyphs. Those are Mac shorthand
  // but the Windows/Linux users pressing the actual keys see "Alt" and
  // "Shift" on their keycaps — the glyph chips were aspirationally
  // cross-platform but functionally misleading. Also consistent with
  // the fabTooltip i18n string.
  row.innerHTML = `${kbdChip('Alt+Shift+E')}${kbdChip('Alt+Shift+O')}`;
  return row;
}

function kbdChip(label) {
  return `<span style="padding:2px 6px;border-radius:4px;background:${TOKENS.surface2};border:1px solid ${TOKENS.line};color:${TOKENS.textDim};font-size:${TOKENS.fsXs}">${label}</span>`;
}

function setExpanded(expanded) {
  const panel = document.getElementById(PANEL_ID);
  const fab = document.getElementById(FAB_ID);
  const popover = document.getElementById(POPOVER_ID);
  if (panel === null || fab === null || popover === null) return;
  panel.dataset.expanded = expanded ? 'true' : 'false';
  fab.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  popover.style.display = expanded ? 'flex' : 'none';
  if (expanded) {
    popover.style.animation = 'expRise 180ms cubic-bezier(.2,1,.3,1) both';
  }
}

function makePrimaryButton({ id, label, onClick }) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.type = 'button';
  Object.assign(btn.style, {
    width: '100%',
    padding: '12px 16px',
    borderRadius: TOKENS.radius,
    border: 'none',
    cursor: 'pointer',
    background: TOKENS.accent,
    color: TOKENS.accentInk,
    fontSize: TOKENS.fsBase,
    fontWeight: '600',
    letterSpacing: '-0.01em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontFamily: 'inherit',
    transition: 'transform 120ms, background 120ms',
  });
  btn.dataset.bg = TOKENS.accent;
  btn.dataset.bgHover = TOKENS.accentHover;
  btn.innerHTML = `${arrowSvg(TOKENS.accentInk)}<span data-exp-label>${escapeHtml(label)}</span>`;
  btn.addEventListener('mouseenter', () => {
    if (!btn.disabled) btn.style.background = TOKENS.accentHover;
  });
  btn.addEventListener('mouseleave', () => {
    if (!btn.disabled) btn.style.background = TOKENS.accent;
  });
  btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.98)'; });
  btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1)'; });
  btn.addEventListener('click', () => { void onClick(btn); });
  return btn;
}

function makeSecondaryButton({ id, label, onClick }) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.type = 'button';
  btn.textContent = label;
  Object.assign(btn.style, {
    width: '100%',
    marginTop: '6px',
    padding: '10px 16px',
    borderRadius: TOKENS.radius,
    border: `1px solid ${TOKENS.line}`,
    background: 'transparent',
    color: TOKENS.textDim,
    fontSize: TOKENS.fsSm,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 120ms, color 120ms',
  });
  btn.dataset.bg = 'transparent';
  btn.dataset.bgHover = TOKENS.surface2;
  btn.addEventListener('mouseenter', () => {
    if (!btn.disabled) {
      btn.style.background = TOKENS.surface2;
      btn.style.color = TOKENS.text;
    }
  });
  btn.addEventListener('mouseleave', () => {
    if (!btn.disabled) {
      btn.style.background = 'transparent';
      btn.style.color = TOKENS.textDim;
    }
  });
  btn.addEventListener('click', () => { void onClick(btn); });
  return btn;
}

async function handleSecondaryClick(btn) {
  const id = panelConversationId();
  if (id === undefined) return;
  try {
    await runSecondaryAction(id);
    flash(btn, chrome.i18n.getMessage('feedbackOfficialPrepared'), 'ok');
  } catch (err) {
    console.warn('Exportal: could not save pending conversation.', err);
    flash(btn, chrome.i18n.getMessage('feedbackError'), 'err');
  }
}

async function handlePrimaryClick(btn) {
  const id = panelConversationId();
  if (id === undefined) return;
  const labelEl = btn.querySelector('[data-exp-label]');
  const originalLabel = labelEl?.textContent ?? '';
  btn.disabled = true;
  if (labelEl !== null) labelEl.textContent = chrome.i18n.getMessage('feedbackSearching');
  const t0 = performance.now();
  try {
    const conversation = await fetchConversation(id);
    if (labelEl !== null) labelEl.textContent = chrome.i18n.getMessage('feedbackSending');
    await sendInline(conversation);
    const ms = Math.round(performance.now() - t0);
    const messages = countMessages(conversation);
    if (labelEl !== null) labelEl.textContent = originalLabel;
    showSuccessPulse({ ms, messages });
  } catch (err) {
    console.warn('Exportal: inline export failed.', err);
    if (labelEl !== null) labelEl.textContent = originalLabel;
    flash(btn, explainError(err), 'err');
  } finally {
    btn.disabled = false;
  }
}

// Shortcut-driven variants: same underlying actions, but feedback is a
// floating toast (the popover may be collapsed).
async function runPrimaryFromShortcut() {
  if (actionInFlight) return;
  const id = currentConversationId();
  if (id === undefined) return;
  actionInFlight = true;
  showToast(chrome.i18n.getMessage('toastExporting'), 'info');
  const t0 = performance.now();
  try {
    const conversation = await fetchConversation(id);
    await sendInline(conversation);
    const ms = Math.round(performance.now() - t0);
    const messages = countMessages(conversation);
    showToast(`${chrome.i18n.getMessage('feedbackOpenedInVsCode')} · ${ms}ms · ${messages}`, 'ok');
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

function countMessages(conversation) {
  // claude.ai's internal shape uses chat_messages; older responses
  // (or shape drift) may expose messages. Both are best-effort — a
  // wrong count isn't a failure, so fall back to 0 silently.
  const a = conversation?.chat_messages;
  if (Array.isArray(a)) return a.length;
  const b = conversation?.messages;
  if (Array.isArray(b)) return b.length;
  return 0;
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

// For errors on either button: swap label + bg briefly. Uses tokens so
// error color stays consistent with the rest of the surface.
function flash(btn, text, kind) {
  const labelEl = btn.querySelector('[data-exp-label]');
  const originalLabel = labelEl !== null ? labelEl.textContent : btn.textContent;
  const originalBg = btn.dataset.bg ?? btn.style.background;
  const color = kind === 'ok' ? TOKENS.ok : kind === 'err' ? TOKENS.err : TOKENS.surface2;
  if (labelEl !== null) labelEl.textContent = text; else btn.textContent = text;
  btn.style.background = color;
  btn.style.color = TOKENS.accentInk;
  btn.disabled = true;
  setTimeout(() => {
    if (labelEl !== null) labelEl.textContent = originalLabel; else btn.textContent = originalLabel;
    btn.style.background = originalBg;
    btn.style.color = btn.dataset.bgHover === TOKENS.accentHover ? TOKENS.accentInk : TOKENS.textDim;
    btn.disabled = false;
  }, 1800);
}

// Full-card overlay on success: check glyph pops in, then the ms/count
// line slides up underneath. Auto-dismisses (and re-collapses the
// popover) after 2.2s — same timing as the design.
function showSuccessPulse({ ms, messages }) {
  const popover = document.getElementById(POPOVER_ID);
  if (popover === null) return;
  const existing = document.getElementById(PULSE_ID);
  if (existing !== null) existing.remove();

  const pulse = document.createElement('div');
  pulse.id = PULSE_ID;
  Object.assign(pulse.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    background: TOKENS.surface,
    borderRadius: TOKENS.radiusLg,
    animation: 'expPop 320ms cubic-bezier(.2,1.2,.4,1) both',
  });
  const messagesLabel = chrome.i18n.getMessage('pulseMessagesSuffix') || 'mensajes';
  pulse.innerHTML = `
    <div style="width:44px;height:44px;border-radius:22px;background:${TOKENS.accent};color:${TOKENS.accentInk};display:flex;align-items:center;justify-content:center;animation:expCheckIn 360ms cubic-bezier(.2,1.5,.3,1) both">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" style="stroke-dasharray:24;stroke-dashoffset:24;animation:expDraw 280ms 120ms cubic-bezier(.2,1,.4,1) forwards"/>
      </svg>
    </div>
    <div style="font-size:${TOKENS.fsSm};color:${TOKENS.text};font-weight:600;letter-spacing:-0.01em">${escapeHtml(chrome.i18n.getMessage('pulseHeadline') || 'Enviado a VS Code')}</div>
    <div class="exp-mono" style="font-size:${TOKENS.fsXs};color:${TOKENS.textDim}">${ms}ms · ${messages} ${escapeHtml(messagesLabel)}</div>
  `;
  popover.appendChild(pulse);
  setTimeout(() => {
    const p = document.getElementById(PULSE_ID);
    if (p !== null) p.remove();
    setExpanded(false);
  }, 2200);
}

function showToast(text, kind) {
  const existing = document.getElementById(TOAST_ID);
  if (existing !== null) existing.remove();

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.textContent = text;
  const bg = kind === 'ok' ? TOKENS.ok : kind === 'err' ? TOKENS.err : TOKENS.surface;
  const fg = kind === 'info' ? TOKENS.text : TOKENS.accentInk;
  const border = kind === 'info' ? `1px solid ${TOKENS.line}` : 'none';
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '82px',
    right: '20px',
    zIndex: '2147483647',
    padding: '10px 14px',
    background: bg,
    color: fg,
    fontFamily: "'Inter Tight', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: TOKENS.fsSm,
    fontWeight: '500',
    letterSpacing: '-0.01em',
    borderRadius: TOKENS.radius,
    border,
    boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
    animation: 'expToastIn 180ms cubic-bezier(.2,1,.3,1) both',
    pointerEvents: 'none',
  });
  document.body.appendChild(toast);
  const ttl = kind === 'info' ? 1200 : 2000;
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    toast.style.transition = 'opacity 180ms ease, transform 180ms ease';
    setTimeout(() => toast.remove(), 200);
  }, ttl);
}

// ——— SVG helpers ——————————————————————————————————————————————————————
// Ported from design-cds/components/logo.jsx: rounded square bg,
// E strokes in `ink`, middle "portal" bar in `accent` that extends
// right with an arrowhead cap to hint the bridge direction.
function exportalMarkSvg({ size, bg, accent, ink, rounded }) {
  const r = rounded * 100;
  const bgRect = bg === 'transparent'
    ? ''
    : `<rect x="0" y="0" width="100" height="100" rx="${r}" fill="${bg}"/>`;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${bgRect}
      <rect x="22" y="20" width="56" height="14" rx="2" fill="${ink}"/>
      <rect x="22" y="20" width="14" height="60" rx="2" fill="${ink}"/>
      <rect x="22" y="66" width="56" height="14" rx="2" fill="${ink}"/>
      <rect x="36" y="43" width="36" height="14" rx="2" fill="${accent}"/>
      <path d="M 72 50 L 82 50" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>
    </svg>
  `;
}

function arrowSvg(color) {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6"/></svg>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

// Inject styles up-front (idempotent — the actual FAB/panel DOM is
// created lazily in syncPanel). We do this at script load so the
// pairing-success toast can animate even on pages without a chat UUID
// (e.g. the landing page `https://claude.ai/`).
injectStyles();
consumePairingFragment();
installShortcuts();
setInterval(tick, POLL_INTERVAL_MS);
tick();

// Auto-pair trampoline. VS Code's webview opens claude.ai with a URL
// fragment of the form `#exportal-pair=<64 hex>`. We pick it off the
// first time the content script runs, forward it to the service worker
// for persistence, and strip the fragment so a later reload can't
// re-pair with a stale token. Fragments never hit the server, so the
// token stays on the device.
//
// Malicious inbound links (someone else's token) can overwrite the
// user's pairing but can't exfiltrate data — the VS Code bridge holds
// its own token and rejects mismatched requests with a 401. See
// showPairingPanel in src/extension/extension.ts for the source side.
//
// Robustness notes:
//  - VS Code serializes `Uri.from({fragment: 'exportal-pair=HEX'})`
//    through encoding rules that sometimes turn `=` into `%3D`. We
//    read the hash via URLSearchParams after stripping the leading
//    `#`, which decodes percent-escapes automatically.
//  - At document_idle claude.ai's SPA may have already called
//    history.replaceState and erased the hash. If `location.hash` is
//    empty we fall back to the Performance navigation entry's URL,
//    which preserves the address the browser actually loaded.
//  - `console.info` lines stay in place — they surface in DevTools
//    so the user can diagnose a stuck pairing without attaching a
//    debugger. Noise is negligible (one log per page load).
function consumePairingFragment() {
  const hash = readInitialHash();
  if (hash === '' || hash === '#') return;
  const token = extractPairingToken(hash);
  if (token === undefined) {
    console.info('[Exportal] pair: hash present but no valid token found', hash);
    return;
  }
  console.info('[Exportal] pair: token detected, forwarding to service worker');
  chrome.runtime.sendMessage(
    { type: 'exportal:setPairingToken', token },
    (response) => {
      // chrome.runtime.lastError is set when the service worker is
      // unreachable (very rare — Chrome spins it up on demand). Swallow
      // silently; the user can still paste the token manually.
      if (chrome.runtime.lastError !== undefined) {
        console.warn('[Exportal] pair: sendMessage failed', chrome.runtime.lastError);
        return;
      }
      if (response?.ok !== true) {
        console.warn('[Exportal] pair: service worker rejected token', response);
        return;
      }
      console.info('[Exportal] pair: success, stored in chrome.storage.local');
      stripPairingFragment();
      showToast(chrome.i18n.getMessage('toastPairedWithVsCode'), 'ok');
      // Surface the "paired" state in the extension's own UI instead
      // of only a transient claude.ai toast. openOptionsPage opens
      // the page as a full tab (manifest has open_in_tab: true) so
      // the OnboardingChrome card renders at the intended size.
      // Fire-and-forget: if opening fails (rare), the toast above is
      // still enough confirmation.
      chrome.runtime.sendMessage({ type: 'exportal:openOptionsPage' });
    },
  );
}

function readInitialHash() {
  const live = window.location.hash;
  if (live !== '' && live !== '#') return live;
  // Fallback: claude.ai's SPA may have already rewritten history. The
  // Performance navigation entry keeps the URL the browser first
  // loaded, including the fragment.
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav === undefined) return '';
    const url = new URL(nav.name);
    return url.hash;
  } catch {
    return '';
  }
}

function extractPairingToken(hash) {
  // URLSearchParams handles percent-decoding (`%3D` → `=`, etc.) and
  // tolerates both `key=value` and `%26`-joined forms, so it works
  // whether VS Code encoded the fragment or not.
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  let raw;
  try {
    raw = new URLSearchParams(body).get('exportal-pair');
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) return undefined;
  return raw.toLowerCase();
}

function stripPairingFragment() {
  try {
    const clean = window.location.pathname + window.location.search;
    history.replaceState(null, '', clean);
  } catch {
    // replaceState throws if the target URL doesn't match the page's
    // origin (shouldn't happen — pathname+search stays same-origin) or
    // in sandboxed iframes. Non-fatal: the pairing already succeeded.
  }
}
