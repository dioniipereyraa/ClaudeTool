// Exportal Companion — background service worker.
//
// MV3 service workers are short-lived: Chrome tears them down after ~30s
// idle and spins them up again on each event. Keep state in chrome.storage,
// not in module-level variables.
//
// This file is a stub for hito 10b. Real wiring (listening to
// chrome.downloads.onCreated, POSTing to the local Exportal server) lands
// in the next sub-hitos.

self.addEventListener('install', () => {
  // Nothing to precache — we're not a content-serving extension.
});

self.addEventListener('activate', () => {
  // No-op for now. Placeholder so the worker registers cleanly.
});
