# Política de Privacidad — Exportal Companion

**Última actualización**: 2026-04-21

*Versión en inglés abajo · English version below.*

---

## Resumen

Exportal Companion es una extensión de navegador **local-first**. No
recolecta, transmite, ni almacena datos personales en servidores
remotos. Toda la información queda en tu máquina y sólo se envía a tu
propia instalación local de VS Code vía loopback (`127.0.0.1`).

## Qué hace la extensión

Exportal Companion exporta tus conversaciones de claude.ai a la
extensión local de VS Code (Exportal para VS Code), para que las
puedas usar como contexto en Claude Code. El flujo es:

1. Hacés click en "Exportar este chat" dentro de una página de
   claude.ai (o usás el atajo de teclado).
2. La extensión lee la conversación usando tus propias cookies de
   sesión de claude.ai — de la misma forma que el sitio te la
   renderiza.
3. El JSON de la conversación se envía a
   `http://127.0.0.1:<port>/...` (el puente local de tu VS Code,
   nunca a un servidor remoto).
4. VS Code la recibe y abre un archivo Markdown localmente.

## Qué datos manejamos

La extensión maneja los siguientes datos, **solo en tu dispositivo**:

- **Contenido de conversaciones de claude.ai**: mensajes, títulos y
  metadata de conversaciones que vos elegís exportar explícitamente.
  Se usan solo para generar el Markdown. No se guardan, loggean ni
  transmiten a ningún lado excepto tu puente local de VS Code.
- **Token de emparejamiento**: un token aleatorio que copiás desde VS
  Code a la página de opciones de la extensión, usado para
  autenticar requests al puente local. Se guarda en
  `chrome.storage.local` solo en tu dispositivo.
- **UUID de conversación pendiente** (temporal): cuando disparás el
  flujo de "export oficial", el UUID del chat actual se guarda
  brevemente en `chrome.storage.local` para que la extensión abra la
  conversación correcta cuando el ZIP termina de descargarse. Se
  sobrescribe en cada uso.

## Qué NO recolectamos

- No analytics, telemetría ni reportes de crash.
- No identificadores publicitarios.
- No cuentas de usuario, perfiles, ni ningún tipo de tracking.
- Tus credenciales de claude.ai **nunca** son leídas, guardadas ni
  transmitidas. La extensión usa las cookies de sesión del browser —
  no las ve.
- Ningún dato va al autor de la extensión ni a terceros.

## Permisos explicados

| Permiso | Por qué lo necesitamos |
|---|---|
| `storage` | Guardar el token de emparejamiento y el UUID temporal en tu dispositivo. |
| `downloads` | Detectar cuando el ZIP oficial de claude.ai termina de descargarse, para reenviarlo a VS Code. |
| `host_permissions: http://127.0.0.1/*` | Comunicarse con tu puente local de VS Code. `127.0.0.1` es loopback — el tráfico nunca sale de tu dispositivo. |
| Content script en `https://claude.ai/*` | Inyectar el botón flotante de exportación y leer la conversación activa cuando hacés click en "Exportar". |

## Retención de datos

Todos los datos se guardan localmente en tu dispositivo en
`chrome.storage.local`. Desinstalar la extensión elimina todo. No hay
almacenamiento remoto que limpiar.

## Terceros

La extensión no integra con ningún servicio de terceros. El contenido
de conversaciones que exportás se envía solo a tu instalación local
de VS Code en `127.0.0.1`.

## Código abierto

La extensión es open source bajo licencia MIT. Podés auditar todo el
código en:

<https://github.com/dioniipereyraa/ClaudeTool>

## Contacto

Preguntas sobre esta política: **dionipereyrab@gmail.com**

---

# Privacy Policy — Exportal Companion (English)

**Last updated**: 2026-04-21

## Summary

Exportal Companion is a local-first browser extension. It does **not**
collect, transmit, or store any personal data on remote servers. All
data stays on your machine and is only sent to your own local VS Code
installation via a loopback address (`127.0.0.1`).

## What the extension does

Exportal Companion exports your claude.ai conversations to a local VS
Code extension (Exportal for VS Code) so you can use them as context
in Claude Code. The export flow is:

1. You click "Export this chat" on a claude.ai page (or use the
   keyboard shortcut).
2. The extension reads the conversation using your existing claude.ai
   session cookies — the same way the website renders it for you.
3. The conversation JSON is sent to `http://127.0.0.1:<port>/...`
   (your local VS Code bridge, never a remote server).
4. VS Code receives it and opens a Markdown file locally.

## What data we handle

The extension handles the following data, **only on your device**:

- **Conversation content from claude.ai**: messages, titles, and
  metadata of conversations you explicitly choose to export. Used only
  to generate the Markdown export. Not stored, logged, or transmitted
  anywhere except your local VS Code bridge.
- **Pairing token**: a random token you copy from VS Code into the
  extension's options page, used to authenticate requests to your
  local bridge. Stored in `chrome.storage.local` on your device only.
- **Pending conversation UUID** (temporary): when you trigger the
  "official export" flow, the UUID of the chat you were on is stored
  briefly in `chrome.storage.local` so the extension can open the
  correct conversation when the ZIP finishes downloading. Overwritten
  on each use.

## What data we do NOT collect

- No analytics, telemetry, or crash reporting.
- No advertising identifiers.
- No user accounts, profiles, or tracking of any kind.
- Your claude.ai credentials are **never** read, stored, or
  transmitted. The extension relies on the browser's existing session
  cookies — it does not see them.
- No data is sent to the extension author or any third party.

## Permissions explained

| Permission | Why we need it |
|---|---|
| `storage` | Store the pairing token and the pending conversation UUID on your device. |
| `downloads` | Detect when the official claude.ai export ZIP finishes downloading, so we can forward it to VS Code. |
| `host_permissions: http://127.0.0.1/*` | Communicate with the local VS Code bridge on your machine. `127.0.0.1` is loopback — traffic never leaves your device. |
| Content script on `https://claude.ai/*` | Inject the floating export button and read the active conversation's content when you click "Export". |

## Data retention

All data is stored locally on your device in `chrome.storage.local`.
Uninstalling the extension deletes everything. There is no remote
storage to clear.

## Third parties

The extension does not integrate with any third-party service.
Conversation content you export is sent only to your local VS Code
installation at `127.0.0.1`.

## Open source

The extension is open source under the MIT license. You can audit the
entire codebase at:

<https://github.com/dioniipereyraa/ClaudeTool>

## Contact

Questions about this policy: **dionipereyrab@gmail.com**
