# Exportal

Puente entre **claude.ai** y **Claude Code** (VS Code). Exporta sesiones de Claude Code a Markdown limpio e importa exports de claude.ai como contexto con un click.

> **Estado**: MVP funcional. Extensión de VS Code + CLI.
> Avance detallado en [`DEVLOG.md`](./DEVLOG.md). Modelo de amenazas y redacción en [`SECURITY.md`](./SECURITY.md).

## Qué resuelve

Cuando pasás de charlar con Claude en la web a Claude Code (o al revés), perdés todo el contexto y hay que re-explicar el proyecto. Exportal genera un archivo Markdown limpio que podés pegar en la otra plataforma como contexto inicial.

## Extensión de VS Code

El camino feliz:

1. Exportá tu data desde `claude.ai` → recibís un email con un ZIP (`data-*.zip`).
2. Guardalo en `Downloads` o `Desktop`.
3. En VS Code: `Ctrl+Shift+P` → **Exportal: Import claude.ai ZIP**.
4. La extensión detecta el ZIP automáticamente, elegís una conversación del listado, y se abre como Markdown redactado en un editor nuevo.

Fallbacks transparentes:

- Si renombraste el ZIP: ofrece escanear por contenido en `Downloads` y `Desktop`.
- Si está en otra carpeta: file picker tradicional.

**Instalación (por ahora desde `.vsix`)**:

```bash
npm install
npm run build
npm run package:vsix
code --install-extension exportal-*.vsix
```

## Chrome companion (opcional)

Extensión de Chrome que detecta cuando claude.ai termina de descargar un export oficial y se lo pasa a la extensión de VS Code por un servidor HTTP local. Click-free: no pega, no navega, no escanea carpetas.

**Instalación**:

1. Descargá `exportal-companion-<version>.zip` desde [Releases](https://github.com/dioniipereyraa/ClaudeTool/releases) y extraelo.
2. Chrome → `chrome://extensions` → activá **Modo desarrollador** → **Cargar sin empaquetar** → elegí la carpeta extraída.
3. En VS Code: `Ctrl+Shift+P` → **Exportal: Show bridge pairing token** → copiá el token.
4. Click derecho sobre el icono de Exportal Companion → **Opciones** → pegá el token → **Guardar**.

Desde ahí, cada vez que pidas un export en claude.ai y hagas click en el link del mail, la extensión lo reenvía a VS Code automáticamente. El badge del icono muestra el estado (`OK` verde, `AUTH`/`OFF` rojo, `SET` amarillo).

Para buildearlo desde fuente: `npm run package:chrome` genera el zip en la raíz del repo.

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
