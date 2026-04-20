# Exportal

Puente entre **claude.ai** y **Claude Code** (VS Code). Exportá cualquier chat de claude.ai a Markdown limpio con un click o un atajo de teclado — listo para pegar como contexto en Claude Code.

> **Estado**: v0.1.0 — primera release usable. Extensión de VS Code + companion de Chrome + CLI.
> Changelog: [`CHANGELOG.md`](./CHANGELOG.md). Modelo de amenazas: [`SECURITY.md`](./SECURITY.md). Avance detallado: [`DEVLOG.md`](./DEVLOG.md). Qué viene: [`ROADMAP.md`](./ROADMAP.md).

## Qué resuelve

Cuando pasás de claude.ai a Claude Code (o viceversa), perdés todo el contexto y toca re-explicar el proyecto. Exportal genera un Markdown limpio con toda la conversación — incluyendo tool use, pensamientos y resultados — que pegás como contexto inicial.

## Cómo se usa — camino feliz

Con las dos extensiones instaladas y emparejadas:

1. Abrí cualquier chat en `claude.ai/chat/<uuid>`.
2. Click en el botón flotante de Exportal (esquina inferior derecha) → **Exportar este chat**.
3. VS Code guarda la conversación en `<workspace>/.exportal/<timestamp>-<slug>.md`, abre el archivo, **y automáticamente abre el panel de Claude Code con el Markdown adjunto como `@-mention`**. Solo escribís tu prompt y listo.

O con atajo de teclado (sin abrir el panel):

- `Alt+Shift+E` — exportá el chat actual a VS Code.
- `Alt+Shift+O` — preparar el export oficial (por si querés la versión con todos tus chats; la extensión reenvía el ZIP cuando llega por email).

El auto-attach al chat de Claude Code se puede desactivar con el setting `exportal.autoAttachToClaudeCode`. Agregá `.exportal/` a tu `.gitignore` si no querés versionar los imports.

![FAB expandido en claude.ai](docs/screenshots/fab.png)

## Instalación

### Extensión de VS Code

```bash
npm install
npm run package:vsix
code --install-extension exportal-*.vsix
```

Al abrir VS Code por primera vez aparece un modal con el **token de emparejamiento** y los pasos para configurar Chrome. Si te distraés, lo reabrís con `Ctrl+Shift+P` → **Exportal: Show bridge pairing token**.

![Modal de onboarding en VS Code](docs/screenshots/onboarding.jpeg)

### Companion de Chrome

1. Descargá `exportal-companion-<version>.zip` desde [Releases](https://github.com/dioniipereyraa/ClaudeTool/releases) y extraelo — o corré `npm run package:chrome` para buildearlo.
2. Chrome → `chrome://extensions` → activá **Modo desarrollador** → **Cargar sin empaquetar** → elegí la carpeta.
3. Click en el ícono de Exportal Companion en la barra → pegá el token de VS Code → **Guardar**.

El badge del ícono refleja el estado: `OK` verde (importó), `SET` amarillo (falta token), `OFF` rojo (VS Code no responde), `AUTH` rojo (token inválido), `OLD` rojo (VS Code desactualizado), `ERR` rojo (otros).

![Página de opciones del companion](docs/screenshots/options.png)

## Dos formas de exportar

| Método | Cuándo sirve | Qué hace |
|---|---|---|
| **Exportar este chat** (botón o `Alt+Shift+E`) | Querés *este* chat ahora mismo. | Lee la API interna de claude.ai (mismas cookies de sesión), manda el JSON al bridge local de VS Code, abre el Markdown. Cero ZIPs, cero mails. |
| **Preparar export oficial** (botón o `Alt+Shift+O`) | Querés *todos* tus chats, o el export oficial completo con attachments/proyectos. | Guarda el UUID del chat actual. Cuando el ZIP oficial de claude.ai termina de descargar, el companion se lo pasa a VS Code y VS Code abre directo ese chat del listado. |

## CLI (opcional)

```bash
# Export de una sesión de Claude Code
npx exportal export <sessionId> --out session.md

# Import desde un ZIP de claude.ai
npx exportal import list ./data-abc.zip              # lista conversaciones
npx exportal import show ./data-abc.zip <uuid>       # renderiza una
```

Ambos redactan secretos por defecto. Ver `--help`.

## CLI

Para exportar sesiones de Claude Code a Markdown, o para importar un ZIP de claude.ai desde la terminal:

```bash
# Export de una sesión de Claude Code
npx exportal export <sessionId> --out session.md

# Import desde un ZIP de claude.ai
npx exportal import list ./data-abc.zip              # lista conversaciones
npx exportal import show ./data-abc.zip <uuid>       # renderiza una
```

Ambos comandos redactan secretos por defecto. Ver `--help`.

## Principios

- **Local-first, zero-network**: nada sale de tu máquina.
- **Fail-closed en seguridad**: redacción activa por defecto, tanto en CLI como en extensión.
- **Preview obligatoria** en el CLI antes de escribir un export.
- **Boring tech**: TypeScript estricto, Node 20+, dependencias mínimas.

## Requisitos

- Node.js ≥ 20
- VS Code ≥ 1.85 (para la extensión)

## Desarrollo

```bash
npm install
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build      # compila a ./dist (CLI + bundle de extensión)
npm run ci         # todo lo anterior en orden
```

La extensión se debuggea con F5 (abre un Extension Development Host con el bundle fresco).

## Licencia

MIT — ver [`LICENSE`](./LICENSE).
