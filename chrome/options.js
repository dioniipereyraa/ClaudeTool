// Exportal Companion — options page script.
//
// Single responsibility: persist the pairing token in chrome.storage.local
// so the background worker (future sub-hitos) can read it when it needs
// to POST to the Exportal local server.

const TOKEN_KEY = 'exportal.pairingToken';
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const tokenInput = /** @type {HTMLInputElement} */ (document.getElementById('token'));
const saveButton = document.getElementById('save');
const clearButton = document.getElementById('clear');
const statusEl = document.getElementById('status');

function setStatus(kind, message) {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
}

async function load() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const token = stored[TOKEN_KEY];
  if (typeof token === 'string' && token.length > 0) {
    tokenInput.value = token;
    setStatus('', 'Token guardado.');
  }
}

async function save() {
  const value = tokenInput.value.trim();
  if (!TOKEN_PATTERN.test(value)) {
    setStatus('err', 'El token debe tener 64 caracteres hexadecimales.');
    return;
  }
  await chrome.storage.local.set({ [TOKEN_KEY]: value });
  setStatus('ok', 'Token guardado.');
}

async function clear() {
  await chrome.storage.local.remove(TOKEN_KEY);
  tokenInput.value = '';
  setStatus('', 'Token eliminado.');
}

saveButton.addEventListener('click', () => {
  void save();
});
clearButton.addEventListener('click', () => {
  void clear();
});

void load();
