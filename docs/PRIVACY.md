# Privacy Policy, Exportal

**Last updated**: 2026-04-29

The canonical version of this policy lives at
**<https://exportal.dev/privacy>**. This file is a Markdown mirror
kept in the repo for code auditors. Both versions reflect the same
content; if they diverge, the website is authoritative.

*Versión en español más abajo · Spanish version below.*

---

## Summary

Exportal is a **local-first** browser + editor extension pair. It does
not collect, transmit, or store any personal data on remote servers.
All data stays on your machine and is sent only to your own local VS
Code installation via the loopback address (`127.0.0.1`).

## What Exportal does

Exportal is a bidirectional bridge between AI chat services
(claude.ai, chatgpt.com) and Claude Code in VS Code. It consists of
two pieces:

- **Exportal Companion** (Chrome extension): adds a floating button
  to claude.ai and chatgpt.com. When you click it, the active
  conversation is sent to your local VS Code bridge.
- **Exportal** (VS Code extension): runs a local HTTP server on
  `127.0.0.1` that receives the conversation, writes a Markdown file
  in your workspace, and (optionally) attaches it to Claude Code as
  `@-mention`.

## What happens when you click "Export this chat"

1. You click the floating Exportal button on a chat at `claude.ai`,
   `claude.ai/design/p`, or `chatgpt.com`, or you use the keyboard
   shortcut `Alt+Shift+E`.
2. The Companion reads the active conversation using your existing
   browser session cookies, the same way the website renders the
   conversation for you. No automation, no scraping.
3. The conversation JSON is sent to `http://127.0.0.1:<port>/...`
   (your local VS Code bridge, **never a remote server**).
4. VS Code receives it and writes a Markdown file locally.

## What data we handle

The extensions handle the following data, **only on your device**:

- **Conversation content from claude.ai and chatgpt.com**: messages,
  titles, and metadata of conversations you explicitly choose to
  export. Used only to generate the Markdown file. Not stored,
  logged, or transmitted anywhere except your local VS Code bridge.
- **Pairing token**: a random 64-character hex token you copy from
  VS Code into the Companion (or via the auto-pair URL fragment).
  Used to authenticate requests to your local bridge. Stored in
  `chrome.storage.local` on your device only.
- **Pending conversation UUID** (temporary): when you trigger the
  "official export" flow, the UUID of the chat you were on is
  stored briefly so the Companion can open the correct conversation
  when the export ZIP finishes downloading. Overwritten on each use.
- **Per-provider preferences** (e.g. last-used pairing host):
  stored in `chrome.storage.local` for UX continuity.

## What we do NOT collect

- No analytics, telemetry, or crash reporting.
- No advertising identifiers.
- No user accounts, profiles, or tracking of any kind.
- Your claude.ai or ChatGPT credentials are **never** read, stored,
  or transmitted. The extensions use the browser's existing session
  cookies, they don't see the credentials themselves.
- No data is sent to the extension author or to any third party.

## Permissions explained

| Permission | Why we need it |
|---|---|
| `storage` | Store the pairing token, pending conversation UUID, and per-provider preferences on your device. |
| `downloads` | Detect when the official claude.ai or ChatGPT export ZIP finishes downloading, to forward it to VS Code. |
| `host_permissions: http://127.0.0.1/*` | Communicate with the local VS Code bridge. `127.0.0.1` is loopback, traffic never leaves your device. |
| Content scripts on `https://claude.ai/*` and `https://chatgpt.com/*` | Render the floating button, read the active conversation when you click "Export", and consume the pairing URL fragment for auto-pair. |

## Data retention

All data is stored locally on your device, in `chrome.storage.local`
for the Companion and in your workspace's `.exportal/` folder for VS
Code. Uninstalling either extension deletes all data managed by that
extension. There is no remote storage to clear.

## Third parties

The browser extensions do not integrate with any third-party service.
Conversation content you export is sent only to your local VS Code
installation at `127.0.0.1`.

The website `exportal.dev` uses one third-party service: the contact
form on the Support page is backed by **Web3Forms**, which forwards
form submissions to the maintainer's email. This only applies if you
choose to use the website's contact form. The browser extensions
never interact with Web3Forms.

## Open source

Both extensions are open source under the MIT license. You can audit
the entire codebase at:

<https://github.com/dioniipereyraa/ClaudeTool>

## Contact

Questions about this policy: **support@exportal.dev** (or
**dionipereyrab@gmail.com** directly).

---

# Política de Privacidad, Exportal (Español)

**Última actualización**: 2026-04-29

## Resumen

Exportal es una extensión **local-first**. No recolecta, transmite,
ni almacena datos personales en servidores remotos. Toda la
información queda en tu máquina y solo se envía a tu propia
instalación local de VS Code vía loopback (`127.0.0.1`).

## Qué hace Exportal

Exportal es un puente bidireccional entre servicios de chat IA
(claude.ai, chatgpt.com) y Claude Code en VS Code. Tiene dos piezas:

- **Exportal Companion** (extensión de Chrome): agrega un botón
  flotante en claude.ai y chatgpt.com. Cuando hacés click, la
  conversación activa se envía al puente local de VS Code.
- **Exportal** (extensión de VS Code): corre un servidor HTTP local
  en `127.0.0.1` que recibe la conversación, escribe un archivo
  Markdown en tu workspace, y (opcionalmente) la adjunta a Claude
  Code como `@-mention`.

## Qué pasa al hacer click en "Exportar este chat"

1. Hacés click en el botón flotante de Exportal en un chat de
   `claude.ai`, `claude.ai/design/p`, o `chatgpt.com`, o usás el
   atajo `Alt+Shift+E`.
2. El Companion lee la conversación activa usando **tus cookies de
   sesión del browser**, de la misma forma que el sitio te la
   renderiza. Sin automatización ni scraping.
3. El JSON se envía a `http://127.0.0.1:<port>/...` (el puente local
   de tu VS Code, **nunca un servidor remoto**).
4. VS Code la recibe y abre un archivo Markdown localmente.

## Qué datos manejamos

Las extensiones manejan los siguientes datos, **solo en tu
dispositivo**:

- **Contenido de conversaciones de claude.ai y chatgpt.com**:
  mensajes, títulos y metadata de conversaciones que vos elegís
  exportar explícitamente.
- **Token de emparejamiento**: token aleatorio de 64 caracteres
  hexadecimales que copiás desde VS Code, guardado en
  `chrome.storage.local`.
- **UUID de conversación pendiente** (temporal): para el flujo de
  export oficial, sobrescrito en cada uso.
- **Preferencias por proveedor**: para continuidad de UX entre
  sesiones.

## Qué NO recolectamos

- No analytics, telemetría ni reportes de crash.
- No identificadores publicitarios.
- No cuentas de usuario, perfiles, ni tracking de ningún tipo.
- Tus credenciales de claude.ai o ChatGPT **nunca** son leídas,
  guardadas ni transmitidas.
- Ningún dato va al autor de la extensión ni a terceros.

## Permisos explicados

| Permiso | Por qué lo necesitamos |
|---|---|
| `storage` | Guardar token, UUID temporal y preferencias en tu dispositivo. |
| `downloads` | Detectar cuando el ZIP oficial de claude.ai/ChatGPT termina de bajar, para reenviarlo a VS Code. |
| `host_permissions: http://127.0.0.1/*` | Comunicarse con el puente local de VS Code. `127.0.0.1` es loopback, el tráfico nunca sale del dispositivo. |
| Content scripts en `https://claude.ai/*` y `https://chatgpt.com/*` | Renderizar el botón flotante, leer la conversación activa al hacer click en "Exportar", y consumir el fragment de emparejamiento. |

## Retención de datos

Todos los datos se guardan localmente. Desinstalar cualquiera de las
extensiones elimina todo lo que esa extensión maneja. No hay
almacenamiento remoto que limpiar.

## Terceros

Las extensiones de browser no integran con ningún servicio de
terceros. El contenido que exportás se envía solo a tu VS Code local
en `127.0.0.1`.

El sitio `exportal.dev` usa **un** servicio de terceros: el formulario
de contacto en la página de Support está backed por **Web3Forms**,
que reenvía los submits al mail del mantenedor. Solo aplica si elegís
usar el formulario del sitio. Las extensiones nunca interactúan con
Web3Forms.

## Código abierto

Ambas extensiones son open source bajo licencia MIT. Auditá todo el
código en:

<https://github.com/dioniipereyraa/ClaudeTool>

## Contacto

Preguntas sobre esta política: **support@exportal.dev** (o
**dionipereyrab@gmail.com** directo).
