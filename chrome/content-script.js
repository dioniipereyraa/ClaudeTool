// Exportal Companion — content script for claude.ai.
//
// Two export actions surface as a small floating panel on /chat/<uuid>:
//
//   1. "Exportar este chat" (primary)
//      Fetches the active conversation from claude.ai's internal API
//      (same origin, reuses session cookies) and forwards the JSON to
//      the VS Code bridge immediately. No ZIP, no email wait.
//
//   2. "Preparar export oficial" (secondary)
//      Stores the conversation UUID so that when the user triggers the
//      Settings → Export data flow, the background worker can match the
//      eventually-downloaded ZIP to this conversation and auto-open it
//      in VS Code.
//
// This script DOES NOT read the DOM for conversation content. The first
// action uses the internal JSON API directly — same data the claude.ai
// frontend itself consumes. The CSRF/auth boundary is already enforced
// by Anthropic's session cookies.
//
// claude.ai is a SPA with client-side navigation. Content scripts run in
// an isolated world, so we can't wrap the page's history.pushState — we
// poll the URL with a light interval instead (cheap: one regex + one
// string compare per tick).

const PANEL_ID = 'exportal-panel';
const PRIMARY_BTN_ID = 'exportal-send-now';
const SECONDARY_BTN_ID = 'exportal-prepare-official';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLL_INTERVAL_MS = 500;

let lastPathname = '';

function currentConversationId() {
  const match = /^\/chat\/([^/?#]+)/.exec(window.location.pathname);
  if (match === null) return undefined;
  const id = match[1];
  return UUID_PATTERN.test(id) ? id : undefined;
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

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.dataset.conversationId = id;
  Object.assign(panel.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  });

  const primary = makeButton({
    id: PRIMARY_BTN_ID,
    label: 'Exportar este chat',
    primary: true,
    onClick: handlePrimaryClick,
  });
  const secondary = makeButton({
    id: SECONDARY_BTN_ID,
    label: 'Preparar export oficial',
    primary: false,
    onClick: handleSecondaryClick,
  });

  panel.appendChild(primary);
  panel.appendChild(secondary);
  document.body.appendChild(panel);
}

function makeButton({ id, label, primary, onClick }) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.type = 'button';
  btn.textContent = label;
  const palette = primary
    ? { bg: '#7c3aed', bgHover: '#6d28d9', fg: '#fff', padding: '10px 14px', fontSize: '13px', fontWeight: '600' }
    : { bg: '#27272a', bgHover: '#3f3f46', fg: '#e4e4e7', padding: '7px 12px', fontSize: '12px', fontWeight: '500' };
  Object.assign(btn.style, {
    padding: palette.padding,
    fontSize: palette.fontSize,
    fontWeight: palette.fontWeight,
    color: palette.fg,
    background: palette.bg,
    border: 'none',
    borderRadius: '999px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
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
    const response = await chrome.runtime.sendMessage({
      type: 'exportal:setPending',
      conversationId: id,
    });
    if (response?.ok !== true) throw new Error(response?.error ?? 'unknown');
    flash(btn, 'Listo — dispará el export oficial', '#16a34a');
  } catch (err) {
    console.warn('Exportal: no pude guardar la conversación pendiente.', err);
    flash(btn, 'Error — ver consola', '#dc2626');
  }
}

async function handlePrimaryClick(btn) {
  const id = panelConversationId();
  if (id === undefined) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Buscando conversación…';
  try {
    const conversation = await fetchConversation(id);
    btn.textContent = 'Enviando a VS Code…';
    const response = await chrome.runtime.sendMessage({
      type: 'exportal:sendInline',
      conversation,
    });
    if (response?.ok !== true) {
      throw new Error(response?.error ?? 'unknown');
    }
    btn.textContent = originalText;
    flash(btn, 'Abierto en VS Code', '#16a34a');
  } catch (err) {
    console.warn('Exportal: export inline falló.', err);
    btn.textContent = originalText;
    flash(btn, explainError(err), '#dc2626');
  } finally {
    btn.disabled = false;
  }
}

function explainError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'no_org') return 'Sin organización — ver consola';
  if (msg === 'not_found') return 'No encontré la conversación';
  if (msg === 'bridge_offline') return 'VS Code no responde';
  if (msg === 'bridge_outdated') return 'VS Code desactualizado — rebuildeá';
  if (msg === 'bridge_auth') return 'Token inválido — revisá Opciones';
  return 'Error — ver consola';
}

async function fetchConversation(conversationId) {
  const orgIds = await fetchOrganizationIds();
  if (orgIds.length === 0) throw new Error('no_org');
  for (const orgId of orgIds) {
    const url =
      `/api/organizations/${encodeURIComponent(orgId)}` +
      `/chat_conversations/${encodeURIComponent(conversationId)}` +
      `?tree=True&rendering_mode=messages`;
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`claude_api_${String(res.status)}`);
    return await res.json();
  }
  throw new Error('not_found');
}

async function fetchOrganizationIds() {
  const res = await fetch('/api/organizations', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`claude_api_${String(res.status)}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((o) => (o !== null && typeof o === 'object' ? o.uuid : undefined))
    .filter((v) => typeof v === 'string' && v.length > 0);
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

function tick() {
  if (window.location.pathname === lastPathname) return;
  lastPathname = window.location.pathname;
  syncPanel();
}

setInterval(tick, POLL_INTERVAL_MS);
tick();
