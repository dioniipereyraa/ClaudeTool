# HANDOFF.md: Exportal

> **Solo lo que hace falta para SEGUIR desarrollando.** Estado vigente, decisiones abiertas y el
> próximo paso, en presente. Los bugs que ya nos costaron caro y las reglas del proyecto están en
> `CLAUDE.md`; el relato de cada sesión, en pasado, en `DEVLOG.md`; la cola larga de ideas en
> `ROADMAP.md`; los releases en `CHANGELOG.md`.

## 1. Estado al 2026-09-17

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
- **PR #9 abierto:** sección en `/compare` contra las tres alternativas reales (copiar y pegar,
  Session history nativo, MCP) y una quinta pregunta sobre MCP en su FAQ. Sale directo de lo que
  mostró la línea base.
- **`main` limpio:** PR #4 a #8 mergeados, cero issues, ramas de trabajo borradas.
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

### Hilo GEO: al retomar, empezar por acá

Capas 1 y 2 hechas y en vivo, Rich Results limpio, Search Console con el sitemap enviado, línea
base tomada. **Lo primero de mañana: mergear el PR #9** (o revisarlo), borrar su rama y seguir con
la **capa 3**, que es la que mueve la aguja y no es código:

1. PRs a `awesome-claude-code`, `awesome-vscode` y `awesome-chrome-extensions`, una línea
   descriptiva cada uno. Los puedo preparar yo; publicarlos va con la cuenta de Dionisio.
2. Show HN y Reddit (`r/ClaudeAI`, `r/vscode`), con los prerrequisitos que ya fija `ROADMAP.md`:
   Chrome Store aprobado, VSIX estable, video bueno, landing andando. Un solo intento de Show HN,
   no quemarlo antes de tiempo.
3. Volver a medir dentro de dos o tres meses con **las mismas consultas del DEVLOG**, repitiendo
   cada una dos o tres veces porque la respuesta es inestable. **La métrica no es "aparece o no"**
   en la consulta genérica, que ya aparece, sino **si `exportal.dev` entra entre las fuentes
   citadas**. Eso es lo que dirá si las capas 1 y 2 sirvieron.

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
