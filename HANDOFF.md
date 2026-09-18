# HANDOFF.md: Exportal

> **Solo lo que hace falta para SEGUIR desarrollando.** Estado vigente, decisiones abiertas y el
> próximo paso, en presente. Los bugs que ya nos costaron caro y las reglas del proyecto están en
> `CLAUDE.md`; el relato de cada sesión, en pasado, en `DEVLOG.md`; la cola larga de ideas en
> `ROADMAP.md`; los releases en `CHANGELOG.md`.

## 1. Estado al 2026-09-18

- **Versión publicada: 0.11.10**, en el VS Code Marketplace, en la Chrome Web Store (en review,
  puede tardar horas o días) y como GitHub Release `v0.11.10` con VSIX y ZIP adjuntos (el tag
  lo creó Claude tras el merge; `release.yml` corrió verde). Contenido: email de la cuenta
  opt-in en el Markdown (issue #2) y documentación + test de un VS Code con varios navegadores
  (issue #1). Detalle en `CHANGELOG.md`.
- **PR #6 mergeado y en vivo:** metadata legible por máquina en la landing (JSON-LD con
  `SoftwareApplication` + `Person` + `FAQPage`, canonical en la home, `llms.txt`, sitemap con
  fechas reales) más los 19 tests que la anclan. Verificado contra `exportal.dev` después del
  deploy: `llms.txt` da 200, la home sirve el bloque JSON-LD con `softwareVersion 0.11.10`.
  Es la capa 1 de tres para que los motores generativos puedan citar Exportal.
- **PR #7 mergeado y en vivo:** capa 2 de GEO, dos páginas de contenido
  (`/export-claude-chat-to-vscode` y `/compare`) más `scripts/build-landing-jsonld.mjs`, que
  genera el JSON-LD de las tres páginas en vez de mantenerlo a mano.
- **PR #8 mergeado y verificado en vivo:** el `canonical` de las cuatro subpáginas apuntaba a una
  URL que GitHub Pages responde con 301. Corregido a la forma con barra final en canonical,
  `og:url`, sitemap, `llms.txt`, JSON-LD y links internos, con un test que impide la recaída.
  Las cinco URLs del sitemap dan 200 directo y cada canonical apunta a sí misma.
- **Rich Results Test pasado** sobre las tres páginas con datos: cero errores. La home detecta
  `Software Apps` con una sola advertencia, `aggregateRating` faltante, que **se deja así a
  propósito**: inventar una calificación sin reseñas reales sería falsear un dato, y Google además
  descuenta los ratings autodeclarados. `/compare/` y la guía detectan `Breadcrumbs` sin
  advertencias. El `FAQPage` y el `HowTo` no generan rich result porque Google los restringió
  (FAQ, 2023) y deprecó (HowTo); siguen porque los motores generativos sí los leen.
- **Search Console: listo.** `exportal.dev` verificado como propiedad de **dominio** el
  2026-09-17 (TXT `google-site-verification` conviviendo con el SPF de Cloudflare), y sitemap
  enviado con **5 páginas descubiertas**. Ojo para la próxima: en una propiedad de dominio el
  campo pide la URL completa (`https://exportal.dev/sitemap.xml`), la ruta relativa da
  "Dirección de sitemap no válida".
- **Línea base de GEO tomada el 2026-09-17**, con las consultas textuales y los resultados en el
  `DEVLOG.md`. Lo esencial: por marca la respuesta es completa y exacta; en la consulta genérica
  Exportal aparece **tercero**, detrás de copiar y pegar y del Session history nativo, y de forma
  **inestable** (la misma pregunta dos veces citó y no citó); a *"what tools bridge claude.ai and
  Claude Code"* el modelo contesta **MCP** y no lo menciona. **`exportal.dev` no fue fuente citada
  en ninguna consulta**: hoy hablan por Exportal el repo y las dos tiendas.
- **PR #9 mergeado y en vivo:** sección en `/compare` contra las tres alternativas reales (copiar
  y pegar, Session history nativo con los requisitos sacados de la documentación de Anthropic, y
  MCP) y una quinta pregunta sobre MCP en su FAQ. Sale directo de lo que mostró la línea base.
  Verificado tras el deploy: la sección está publicada y el `FAQPage` en vivo tiene 5 preguntas.
- **PR #10 y #11 mergeados y verificados (2026-09-18).** El #10 sacó el 301 de los links de los dos
  README a la landing, les sumó `/compare/` y metió los README en el test que impide la forma
  pelada: los cinco links medidos con `curl` dan 200 directo. El #11 agregó el GIF de la demo, que
  ya resuelve en `raw.githubusercontent.com` con 200 y `image/gif`, que era el requisito para abrir
  el PR a `awesome-vscode` sin que su `awesome_bot` lo marque en rojo.
- **Metadata del repo corregida el 2026-09-18:** `homepage` ahora es `https://exportal.dev` (estaba
  vacía, siendo el repo la fuente que los motores citan) y el topic `chatpgt` pasó a `chatgpt`.
  **Decisión abierta:** renombrar el repo de `ClaudeTool` a `exportal`. La marca dice una cosa y la
  URL citada dice otra; el costo es revisar los links raw de las imágenes y lo declarado en las
  dos tiendas.
- **`main` limpio:** PR #4 a #11 mergeados, cero issues y cero PRs abiertos, ramas de trabajo
  borradas. Solo existe `main`.
- **Tags:** entre `v0.11.2` y `v0.11.10` no hay tags ni GitHub Releases (esas versiones se
  subieron a las tiendas a mano sin taggear). No hace falta rehacerlas; queda anotado para no
  extrañarse.
- **Smoke test hecho** en claude.ai con sesión real, toggle prendido y apagado. Pendiente de
  probar en vivo: chatgpt.com (la fila `> Account:`) y el toggle tocado desde el panel (se probó
  vía `settings.json`; usa el mismo `update` que los otros dos toggles).
- **Máquina de Dionisio:** sigue cargado el Companion *unpacked* y el de la Web Store
  desactivado. Hay que sacar el unpacked y reactivar el de la tienda cuando salga la review.
- **Landing** (exportal.dev) publicada con el rediseño monocromo desde el PR #3. Con el PR #6
  suma JSON-LD, canonical y `llms.txt`. Atención: desde ahora el bump de versión también toca el
  `softwareVersion` de `docs/index.html` (lo vigila `tests/docs/landing-metadata.test.ts`).

## 2. Publicar a las dos tiendas desde CI: el Marketplace hecho, Chrome pendiente

**Paso 1 hecho en el PR #12 (2026-09-18), esperando review.** `release.yml` pasó a tres jobs:
`build` (chequeo de versiones contra el tag, `npm run ci`, `package:all`, notas del CHANGELOG,
sube los artefactos), `github-release` (el único con `contents: write`) y `publish-vscode`
(aprobación humana, publica al Marketplace y a Open VSX). Los artefactos se construyen una sola
vez y viajan entre jobs, así a las tiendas van los mismos bytes que cuelgan del Release. El
environment `stores` ya existe en GitHub, con Dionisio como revisor obligatorio y restringido a
tags `v*`.

**Lo único que falta para que el paso 1 funcione son los dos secrets, que son credenciales
personales de Dionisio** (documentados en `CONTRIBUTING.md` §Releasing):

- `VSCE_PAT`: PAT de Azure DevOps, scope *Marketplace → Manage*. Vence, anotar la fecha.
- `OVSX_PAT`: token de open-vsx.org, después de reclamar el namespace `dioniipereyraa`.

Se cargan en el environment `stores`, no en el repo:
`gh secret set VSCE_PAT --env stores`. Sin `VSCE_PAT` el job falla ruidosamente; sin `OVSX_PAT`
solo se saltea el paso secundario. **Hasta que existan, un tag publica el GitHub Release igual y
la publicación a las tiendas queda esperando aprobación.**

Falta el paso 2, la otra tienda:
1. **Chrome Web Store.** API oficial: `PUT` del ZIP al item + `POST .../publish`
   (envuelto por `chrome-webstore-upload-cli` o la action `PlasmoHQ/bpp`). Credencial OAuth2:
   proyecto en Google Cloud, habilitar *Chrome Web Store API*, OAuth client, consentimiento a mano
   una vez, y secrets `client_id`, `client_secret`, `refresh_token`. **Dos gotchas:** la app OAuth
   tiene que estar *In production*, en *Testing* el refresh token expira a los 7 días; y `publish`
   no publica, encola la review.
2. **Cuidados:** `continue-on-error` en el job de Chrome. Lo demás de esta lista ya está hecho en
   el PR #12: secrets solo en el workflow de tags, environment con *required reviewers*, y el
   chequeo de versiones, que resultó estar a medias por un motivo que conviene recordar:
   `scripts/package-chrome.mjs` pisa `manifest.version` con la de `package.json` al empaquetar, así
   que el ZIP sale bien nombrado aunque el manifest en disco esté viejo. El paquete nunca miente,
   el repositorio sí. Ahora lo vigilan `npm run check:versions` y
   `tests/release/version-sync.test.ts`.

Después de esto, sigue `ROADMAP.md` §Near-term (instalación en máquina limpia, Search Console,
capturas reales, video, blog) y el Hito 35 (pairing en `exportal.dev/pair`).

### Hilo GEO: al retomar, empezar por acá

Capas 1 y 2 hechas y en vivo, Rich Results limpio, Search Console con el sitemap enviado, línea
base tomada. Todo mergeado y verificado en vivo. **Lo primero al retomar es la capa 3**, que es la que mueve
la aguja y no es código:

1. ~~PRs a las tres awesome-lists.~~ **Medido el 2026-09-18 y corregido:** `awesome-claude-code`
   (54k estrellas, viva) **prohíbe los PRs**, pide el issue form del web UI y exige que lo mande
   una persona; el texto de los seis campos está redactado en el DEVLOG de ese día, listo para
   pegar, y el sexto checkbox del form es una trampa que va sin marcar. `awesome-vscode` no mergea
   desde agosto de 2023 y poda extensiones de baja tracción: el PR está preparado en el fork
   `dioniipereyraa/awesome-vscode`, rama `add-exportal`, y se abre a sabiendas de que es lotería.
   `awesome-chrome-extensions` no existe como lista canónica viva, no hay a dónde mandar nada.
   **Queda pendiente en la cancha de Dionisio: mandar el issue form y abrir el PR**, que ya no
   tiene bloqueantes: el GIF que referencia está en `main` y responde 200.
2. Show HN y Reddit (`r/ClaudeAI`, `r/vscode`), con los prerrequisitos que ya fija `ROADMAP.md`:
   Chrome Store aprobado, VSIX estable, video bueno, landing andando. Un solo intento de Show HN,
   no quemarlo antes de tiempo.
3. Volver a medir dentro de dos o tres meses con **las mismas consultas del DEVLOG**, repitiendo
   cada una dos o tres veces porque la respuesta es inestable. **La métrica no es "aparece o no"**
   en la consulta genérica, que ya aparece, sino **si `exportal.dev` entra entre las fuentes
   citadas**. Eso es lo que dirá si las capas 1 y 2 sirvieron. **No medir antes:** el sitemap se
   envió el 2026-09-17 y la indexación tarda días o semanas, así que una medición temprana devuelve
   ruido.
4. Mientras tanto, la señal objetiva es Search Console, sección **Páginas**: las cinco URLs
   deberían pasar a "Indexada" en unos días. Si a los diez días siguen sin indexar, eso sí hay que
   mirarlo.

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
