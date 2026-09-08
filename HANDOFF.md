# HANDOFF.md: Exportal

> Estado **vigente** para retomar en la sesión siguiente. Solo presente. El relato de cada sesión
> está en `DEVLOG.md` (en pasado), los releases en `CHANGELOG.md`, la cola larga en `ROADMAP.md`.

## 1. Estado al 2026-09-08

- **Versión publicada:** 0.11.9 (VS Code Marketplace y Chrome Web Store). **0.11.10 empaquetada en la rama, sin publicar:** `exportal-0.11.10.vsix` y `exportal-companion-0.11.10.zip` en la raíz del repo (ignorados por git), listos para subir tras el merge del PR #4.
- **Rama `feat/account-email-multi-browser`, PR abierto, sin mergear.** Cierra los dos issues
  abiertos. Medido en la rama: 27 archivos de test, **331 tests** verdes (eran 314), lint y
  typecheck en 0, `npm run build` ok. Sin bump de versión.
- **Issue #1 (varios navegadores por VS Code): ya funcionaba.** El token es por perfil de VS Code
  y el bridge solo compara el Bearer. Probado con sockets crudos: tres orígenes distintos, mismo
  token, seis requests concurrentes, todas 200. Quedó test de regresión, párrafo en README y FAQ en
  `docs/support/`. Se respondió en GitHub.
- **Issue #2 (email de la cuenta): implementado, opt-in con toggle.** Setting
  `exportal.includeAccountEmail` (default false), tercer toggle del panel, flag
  `--include-account-email` en el CLI. Fila `Account:` en la cabecera de los dos formateadores,
  enmascarada por `--redact-pii`. Fuentes: `users.json` (ZIP claude.ai), `user.json` (ZIP
  ChatGPT) y, en un click, el Companion consulta `/api/account` o `/api/auth/session` **solo si**
  `/ping` devolvió `wantsAccountEmail: true`.
- **Smoke test end-to-end HECHO el 2026-09-08** con el VSIX de la rama instalado y el Companion
  cargado unpacked, contra claude.ai con la sesión de Dionisio:
  - `/api/account` responde 200 y el campo es `email_address` (lo que lee el código).
  - Toggle prendido: `/ping` → `wantsAccountEmail: true`, el Companion llamó a `/api/account`, y
    el `.md` salió con `- **Account:** dionipereyrab@gmail.com` debajo de Title.
  - Toggle apagado (sin recargar nada): `/ping` → `false`, cero llamadas a `/api/account`, sin
    fila Account. El CLI dio lo esperado en las tres variantes (sin flag, con flag, con
    `--redact-pii` → `<REDACTED:email>`).
  - Falta solo el lado ChatGPT en vivo y el toggle desde el panel (se probó vía settings.json).
- **Landing:** mergeada y publicada en exportal.dev (PR #3). Sin cambios en esta sesión salvo la
  FAQ nueva de support.

## 2. Decisiones tomadas, con su porqué

- **El email es opt-in en TODAS las capas.** `SECURITY.md` lo trata como PII y el `.md` se pega
  en Claude Code. Con el toggle apagado el Companion ni consulta el endpoint de cuenta.
- **El flag viaja en `/ping`, no en un setting del Companion.** Una sola fuente de verdad (el
  setting de VS Code); un flip en el panel aplica al siguiente export sin re-emparejar. Un bridge
  viejo no manda el flag y el Companion nuevo no manda el email; un Companion viejo ignora el flag.
- **Issue #1 se cierra con doc + test, sin cambios de producto.** Dionisio eligió esa opción entre
  tres (doc+test, doc+test+ajuste UX del panel, solo responder).
- **Marca y commits:** monocromo estricto en la landing; commits y PR en inglés, DEVLOG y HANDOFF
  en castellano; sin firma de Claude.

## 3. Por dónde seguir, en orden

1. Smoke test pendiente solo en chatgpt.com (la fila `> Account:`) y del toggle desde el panel
   (el setting se probó editando `settings.json`; el toggle usa el mismo `update` que los otros dos).
2. Mergear el PR #4 y decidir el release (0.11.10: VSIX + ZIP del Companion). Después del release,
   Dionisio tiene que sacar el Companion cargado unpacked y reactivar el de la Web Store: el
   unpacked tiene OTRO id de extensión, así que su storage y su pairing son aparte.
4. Opcional: regenerar la imagen de Open Graph a 1200x630 con el hero nuevo.
5. Lo de `ROADMAP.md` §Near-term sigue vigente y no se tocó.

## 4. Cómo relanzar

```bash
cd docs && python3 -m http.server 8765 --bind 127.0.0.1   # http://127.0.0.1:8765/
pkill -f "http.server 8765"                                 # para apagarlo
```

Capturas headless: `chrome --headless=new --window-size=390,...` **no da 390 en macOS** (clampa a
500 y recorta). Para móvil, envolver la página en un `<iframe width="390">` dentro de una ventana
más ancha. Para auditar contraste, usar una copia con las animaciones apagadas: el fade-in falsea
los ratios.
