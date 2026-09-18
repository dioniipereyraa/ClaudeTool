# Screenshots

Imágenes referenciadas por el README principal y por los listings del Marketplace y Chrome Web Store. Resolución estándar: **1280×800** (formato preferido por ambos stores).

| Archivo | Qué muestra | Dónde se usa |
|---|---|---|
| `exportal-s1-fab-1280x800.png` | Botón flotante de Exportal expandido en `claude.ai/chat/<uuid>`. | README principal + Chrome Web Store. |
| `exportal-s2-onboarding-1280x800.png` | Panel de onboarding en VS Code la primera vez que se instala: token + botón "Copiar y abrir Chrome". | README principal + Marketplace de VS Code. |
| `exportal-s3-success-1280x800.png` | Página de opciones del companion en estado *"Listo, Todo conectado"*. | README principal + Chrome Web Store. |
| `exportal-s4-vscode-1280x800.png` | Tab de Exportal en la activity bar de VS Code con toggles + acciones. | README principal + Marketplace de VS Code. |
| `exportal-s5-jsonl-sync-1280x800.png` | Conversación importada apareciendo en `/resume` de Claude Code (feature `exportal.alsoWriteJsonl`). | README principal + Marketplace de VS Code. |
| `exportal-demo.gif` | El flujo completo, misma toma que `exportal-demo.mp4`: 800 px, 10 fps, 692 KB. | Markdown de terceros (awesome-lists, foros), donde un `<video>` no embebe. |

Convención de nombres: `exportal-s<N>-<slug>-1280x800.png`. El número refleja el orden narrativo (s0 = entrada al producto, s5 = última feature). Cuando se reemplaza un screenshot mantené el mismo nombre para no romper referencias.

URLs en el README usan rutas relativas porque la versión que se publica al Marketplace de VS Code es `README.vsix.md` (sin imágenes). GitHub resuelve los relativos sin problema.

El `.mp4` es el que va en la landing y en el README principal, porque pesa 165 KB contra los 692 KB del `.gif`. El `.gif` existe para el caso contrario: markdown que no controlamos, donde GitHub sanitiza `<video>` y una URL pelada no embebe. Se regenera desde el `.mp4` con:

```sh
ffmpeg -i exportal-demo.mp4 -vf "fps=10,scale=800:-1:flags=lanczos,palettegen=max_colors=128" palette.png
ffmpeg -i exportal-demo.mp4 -i palette.png \
  -lavfi "fps=10,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" exportal-demo.gif
```
