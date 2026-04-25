# Chrome Web Store — Listing draft

Textos listos para pegar en el dashboard del CWS. Cada sección indica
dónde va dentro del formulario.

---

## Store listing tab

### Extension name
`Exportal Companion`

### Short description (132 chars max)
`Exporta chats de claude.ai a VS Code con un click. Requiere la extensión Exportal en VS Code.`

### Detailed description (16384 chars max)

```
Exportal Companion es el puente entre claude.ai y tu editor. Con un
click exporta cualquier conversación a Markdown limpio — listo para
pegar como contexto en Claude Code o cualquier otro agente.

CÓMO FUNCIONA

1. Instalá la extensión "Exportal" para VS Code desde el Marketplace.
2. Instalá este companion y emparejá con el token que aparece en VS
   Code (Ctrl+Shift+P → "Exportal: Show bridge pairing token").
3. Abrí cualquier chat en claude.ai.
4. Click en el botón flotante → "Exportar este chat".
5. VS Code guarda la conversación en tu workspace y la adjunta
   automáticamente al panel de Claude Code como @-mention.

CARACTERÍSTICAS

• Dos formas de exportar: chat individual (al toque) o export oficial
  completo de claude.ai (cuando el ZIP oficial termina de descargarse,
  se reenvía automáticamente).
• Atajos de teclado: Alt+Shift+E para exportar el chat actual,
  Alt+Shift+O para preparar el export oficial.
• Badge de estado en la barra de Chrome que refleja el estado del
  puente: verde cuando todo funciona, amarillo si falta emparejar,
  rojo si hay un problema.
• Mensajes de error claros: distingue entre sesión expirada, cambio
  de API de claude.ai, payload demasiado grande, timeout o VS Code
  desactualizado.

LOCAL-FIRST

Todo pasa en tu máquina. Las conversaciones se envían a un servidor
HTTP local en 127.0.0.1 (loopback) dentro de tu propia VS Code. No
hay servidores remotos, ni analytics, ni telemetría.

Código abierto bajo licencia MIT. Auditable en:
https://github.com/dioniipereyraa/ClaudeTool
```

### Category
`Developer Tools`

### Language
`Spanish`

---

## Privacy practices tab

### Single purpose (required)

```
Export claude.ai conversations to a local VS Code extension so users
can reuse them as context in Claude Code or other agents, without
manually copying and pasting.
```

### Permission justifications

**`storage`**:
```
Store the pairing token (copied from the VS Code extension) and a
pending conversation UUID used during the official-export flow. Both
are kept only in chrome.storage.local, never transmitted remotely.
```

**`downloads`**:
```
Listen for download completion events to detect when the user's
official claude.ai export ZIP finishes downloading, so the extension
can forward its path to the local VS Code bridge. Only ZIPs matching
the claude.ai export filename pattern are acted upon.
```

**`host_permissions: http://127.0.0.1/*`**:
```
Communicate with the user's own VS Code Exportal bridge over loopback.
127.0.0.1 is the local machine only; traffic never leaves the device.
The bridge listens on ports 9317-9326 and requires bearer-token
authentication.
```

**Content script on `https://claude.ai/*`**:
```
Inject the floating export button into claude.ai pages and read the
active conversation's content via claude.ai's own internal API
(reusing the user's existing session cookies) when the user explicitly
clicks "Export".
```

### Data usage disclosure

Tick in the form:

- [x] Personally identifiable information (the conversation content
      itself may include the user's own text)
- [x] Website content (messages from claude.ai conversations the user
      chooses to export)
- [ ] Everything else: unchecked

For each ticked item, declare:

- **Is the data collected for the extension's single purpose?** YES.
- **Is the data sold to third parties?** NO.
- **Is the data used for purposes unrelated to the core functionality?** NO.
- **Is the data used to determine creditworthiness or lending?** NO.
- **Does the extension handle data transfer only over secure channels?**
  YES — 127.0.0.1 loopback with bearer-token auth.

### Privacy policy URL

```
https://github.com/dioniipereyraa/ClaudeTool/blob/main/docs/PRIVACY.md
```

---

## Distribution tab

### Visibility
`Public` — listado en la store, buscable.

### Regions
`All regions`

### Pricing
`Free`

---

## Assets a subir

- **Icon**: `chrome/icon-128.png` (ya empaquetado en el ZIP).
- **Screenshots** (1280×800 — subí al menos 1, ideal 3-5):
  - `docs/screenshots/exportal-s1-fab-1280x800.png` (botón flotante en claude.ai)
  - `docs/screenshots/exportal-s3-success-1280x800.png` (companion conectado)
  - `docs/screenshots/exportal-s0-claude-design-1280x800.png` (export desde Claude Design)
  - `docs/screenshots/exportal-s4-vscode-1280x800.png` (tab en VS Code, opcional)
  - `docs/screenshots/exportal-s5-jsonl-sync-1280x800.png` (/resume sync, opcional)
- **Promotional tile** (440×280): opcional, podés skippearlo para la
  primera versión.
- **ZIP del package**: `exportal-companion-<version>.zip` (generar con `npm run package:chrome`; la versión se toma de `chrome/manifest.json`).

---

## Notas sobre el review

- **Primer review**: típicamente 1-3 días hábiles.
- **Señales que pueden disparar review manual extendido**:
  - `host_permissions` sobre `127.0.0.1` — patrón común en malware
    que habla con C2 locales. La justificación clara + link al repo
    público + privacy policy deberían resolverlo.
  - `downloads` permission + content script de un sitio popular. Hay
    que dejar claro que solo se actúa sobre ZIPs de export de
    claude.ai, nada más.
- **Si el review rechaza**: Google manda mail con razón específica.
  Se itera sobre las justificaciones o se ajusta el manifest y se
  sube una nueva versión.
