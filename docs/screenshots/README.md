# Screenshots

Imágenes referenciadas por el README principal y por los listings del Marketplace y Chrome Web Store. Resolución estándar: **1280×800** (formato preferido por ambos stores).

| Archivo | Qué muestra | Dónde se usa |
|---|---|---|
| `exportal-s0-claude-design-1280x800.png` | Export desde un proyecto de Claude Design — chat + carpeta hermana con assets generados (HTML/JSX/JSON). | README principal, sección "Cómo se usa". |
| `exportal-s1-fab-1280x800.png` | Botón flotante de Exportal expandido en `claude.ai/chat/<uuid>`. | README principal + Chrome Web Store. |
| `exportal-s2-onboarding-1280x800.png` | Panel de onboarding en VS Code la primera vez que se instala: token + botón "Copiar y abrir Chrome". | README principal + Marketplace de VS Code. |
| `exportal-s3-success-1280x800.png` | Página de opciones del companion en estado *"Listo — Todo conectado"*. | README principal + Chrome Web Store. |
| `exportal-s4-vscode-1280x800.png` | Tab de Exportal en la activity bar de VS Code con toggles + acciones. | README principal + Marketplace de VS Code. |
| `exportal-s5-jsonl-sync-1280x800.png` | Conversación importada apareciendo en `/resume` de Claude Code (feature `exportal.alsoWriteJsonl`). | README principal + Marketplace de VS Code. |

Convención de nombres: `exportal-s<N>-<slug>-1280x800.png`. El número refleja el orden narrativo (s0 = entrada al producto, s5 = última feature). Cuando se reemplaza un screenshot mantené el mismo nombre para no romper referencias.

URLs en el README usan rutas relativas porque la versión que se publica al Marketplace de VS Code es `README.vsix.md` (sin imágenes). GitHub resuelve los relativos sin problema.
