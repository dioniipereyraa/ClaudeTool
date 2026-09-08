# HANDOFF.md: Exportal

> Estado **vigente** para retomar en la sesión siguiente. Solo presente. El relato de cada sesión
> está en `DEVLOG.md` (en pasado), los releases en `CHANGELOG.md`, la cola larga en `ROADMAP.md`.

## 1. Estado al 2026-09-08

- **Versión publicada:** 0.11.9 (VS Code Marketplace y Chrome Web Store). Sin cambios de código
  de producto desde entonces.
- **Landing rediseñada y MERGEADA a `main`** (PR #3, merge `5e1c39f`, 2026-09-08). GitHub Pages
  publica `docs/` desde `main`, así que exportal.dev ya tiene el diseño nuevo. Dionisio lo aprobó
  viéndolo en su navegador.
- **Marca:** monocromo estricto. Tinta `#1F1F1F`, papel blanco, un solo gris secundario
  (`rgba(31,31,31,0.66)`, 5.33:1). Sin acento de color en la landing. El naranja `#D97757` queda
  solo en el FAB de claude.ai y en el ícono del Marketplace. `design-cds/` es anterior al rebrand y
  no sirve como referencia de color.
- **Tipografía:** Inter Tight y JetBrains Mono, variables, vendoreadas en `docs/fonts/` (el CSP
  exige `font-src 'self'`).
- **Verificado:** capturas a 1280 y a 390 reales, ningún recurso fuera de `self`, audit de
  accesibilidad limpio en `index`, `support` y `privacy`. Dionisio lo vio en su navegador y los
  hilos con paquetes se ven cruzar.

## 2. Decisiones tomadas en el rediseño, con su porqué

- **Cero cards, cero sombras, cero acento.** La firma más reconocible del HTML generado eran las
  cards idénticas con hover-lift y un azul de Tailwind que no era de la marca. La jerarquía la hacen
  la escala tipográfica, las reglas de 1px y el espacio.
- **Un solo elemento con movimiento:** los hilos detrás del hero. Se dibujan al cargar con la
  longitud real medida en JS, y los paquetes viajan con `<animateMotion>` + `<mpath>`. Se eligió
  SVG nativo porque la primera versión (`pathLength` + `non-scaling-stroke`, y `offset-path` sobre
  `<circle>`) salía a medio dibujar y sin paquetes en el navegador de Dionisio.
- **Los commits de este repo van en inglés** (el historial, el README, el CHANGELOG y los PR lo
  están; el DEVLOG y el ROADMAP en castellano). Los tres commits del PR #3 salieron en castellano
  por error y ya están mergeados; no se reescribe historia publicada.
- **Los HTML de `docs/` no se formatean con prettier.** `main` tampoco lo hacía; solo `script.js`
  pasa por prettier. No hay workflow que lo exija.

## 3. Por dónde seguir, en orden

1. Opcional: regenerar la imagen de Open Graph a 1200x630 con el hero nuevo; hoy `og:image`
   apunta a la captura vieja de la Chrome Web Store.
2. **Issue #2, "Include Account Email in Exported Claude Conversations"** (geekyouth,
   2026-09-06). Pide el email de la cuenta en el Markdown exportado. **No es agregar un campo:**
   `SECURITY.md` trata el email como PII con redacción opt-in (`--redact-pii`) y la redacción
   general es fail-closed por defecto. Hay que decidir si va opt-in, dónde se lee (sesión de
   claude.ai vs ChatGPT), y cómo convive con el redactor. Consultar con Dionisio antes de codear:
   es una decisión de diseño con dos ramas defendibles.
3. **Issue #1, "one vscode Pair multiple browsers"** (kellke2026, 2026-08-29, sin cuerpo; un
   comentario de geekyouth dice "yes, test pass" sin contexto). Hoy el bridge tiene un token de
   pairing por instancia de VS Code. Primero medir qué pasa al emparejar un segundo navegador
   (¿el segundo pisa al primero, o el token es el mismo y ya funciona?), y recién después
   responder en el issue o diseñar.
4. Lo de `ROADMAP.md` §Near-term sigue vigente y no se tocó en esta sesión.

## 4. Cómo relanzar

```bash
cd docs && python3 -m http.server 8765 --bind 127.0.0.1   # http://127.0.0.1:8765/
pkill -f "http.server 8765"                                 # para apagarlo
```

Capturas headless: `chrome --headless=new --window-size=390,...` **no da 390 en macOS** (clampa a
500 y recorta). Para móvil, envolver la página en un `<iframe width="390">` dentro de una ventana
más ancha. Para auditar contraste, usar una copia con las animaciones apagadas: el fade-in falsea
los ratios.
