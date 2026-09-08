# HANDOFF.md: Exportal

> **Solo lo que hace falta para SEGUIR desarrollando.** Estado vigente, decisiones abiertas y el
> próximo paso, en presente. Los bugs que ya nos costaron caro y las reglas del proyecto están en
> `CLAUDE.md`; el relato de cada sesión, en pasado, en `DEVLOG.md`; la cola larga de ideas en
> `ROADMAP.md`; los releases en `CHANGELOG.md`.

## 1. Estado al 2026-09-08

- **Versión publicada: 0.11.10**, en el VS Code Marketplace, en la Chrome Web Store (en review,
  puede tardar horas o días) y como GitHub Release `v0.11.10` con VSIX y ZIP adjuntos (el tag
  lo creó Claude tras el merge; `release.yml` corrió verde). Contenido: email de la cuenta
  opt-in en el Markdown (issue #2) y documentación + test de un VS Code con varios navegadores
  (issue #1). Detalle en `CHANGELOG.md`.
- **`main` limpio:** PR #4 (feature) y PR #5 (reorganización de docs) mergeados, cero issues y
  cero PRs abiertos, ramas de trabajo borradas. Solo existe `main`.
- **Tags:** entre `v0.11.2` y `v0.11.10` no hay tags ni GitHub Releases (esas versiones se
  subieron a las tiendas a mano sin taggear). No hace falta rehacerlas; queda anotado para no
  extrañarse.
- **Smoke test hecho** en claude.ai con sesión real, toggle prendido y apagado. Pendiente de
  probar en vivo: chatgpt.com (la fila `> Account:`) y el toggle tocado desde el panel (se probó
  vía `settings.json`; usa el mismo `update` que los otros dos toggles).
- **Máquina de Dionisio:** sigue cargado el Companion *unpacked* y el de la Web Store
  desactivado. Hay que sacar el unpacked y reactivar el de la tienda cuando salga la review.
- **Landing** (exportal.dev) publicada con el rediseño monocromo desde el PR #3.

## 2. Próximo paso (acordado el 2026-09-08): publicar a las dos tiendas desde CI

Hoy `release.yml` (tag `v*`) corre `npm run ci`, empaqueta VSIX y ZIP y los cuelga de un GitHub
Release. Falta el paso que los sube a las tiendas. Plan acordado el 2026-09-08, sin empezar:

1. **VS Code Marketplace primero** (se prueba en diez minutos). Job nuevo en `release.yml`:
   `npx @vscode/vsce publish --packagePath <vsix> --pat $VSCE_PAT`. Secret: PAT de Azure DevOps
   con scope *Marketplace → Manage* (vence, anotar la fecha). Opcional y gratis en el mismo paso:
   `ovsx publish` a Open VSX (Cursor, VSCodium, Windsurf).
2. **Chrome Web Store después.** API oficial: `PUT` del ZIP al item + `POST .../publish`
   (envuelto por `chrome-webstore-upload-cli` o la action `PlasmoHQ/bpp`). Credencial OAuth2:
   proyecto en Google Cloud, habilitar *Chrome Web Store API*, OAuth client, consentimiento a mano
   una vez, y secrets `client_id`, `client_secret`, `refresh_token`. **Dos gotchas:** la app OAuth
   tiene que estar *In production*, en *Testing* el refresh token expira a los 7 días; y `publish`
   no publica, encola la review.
3. **Cuidados:** un job por tienda con `continue-on-error` en el de Chrome; los secrets solo en el
   workflow de tags, nunca en `ci.yml` (corre en PRs); un `environment` con *required reviewers*
   para tener un botón de aprobar antes de salir; y un chequeo de que el tag coincide con
   `package.json` y `chrome/manifest.json`, que hoy nadie hace.

Después de esto, sigue `ROADMAP.md` §Near-term (instalación en máquina limpia, Search Console,
capturas reales, video, blog) y el Hito 35 (pairing en `exportal.dev/pair`).

## 3. Cómo relanzar

- Setup, build, tests y cómo correr la extensión con F5: `CONTRIBUTING.md`.
- Bridge local: escucha en `127.0.0.1:9317-9326`; el token de pairing vive en el `globalState`
  de VS Code (uno por perfil). Para probar `/ping` a mano:
  `curl -X POST http://127.0.0.1:9317/ping -H "Authorization: Bearer <token>"`.
- Un Companion cargado *unpacked* tiene OTRO id de extensión que el de la tienda: storage y
  pairing aparte. Se empareja abriendo `https://claude.ai/#exportal-pair=<token>`.
- Release a mano mientras no exista el CI: bump en `package.json`, `package-lock.json`
  (dos campos) y `chrome/manifest.json`, `CHANGELOG.md`, `npm run package:vsix` y
  `npm run package:chrome`, subir los dos archivos, tag `vX.Y.Z`.
