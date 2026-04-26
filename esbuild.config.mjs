import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Bundle the VS Code extension into a single CommonJS file.
 *
 * Why CJS: VS Code's extension host still loads extensions via Node's
 * `require()`, so the `main` field must point at CJS output regardless
 * of what the source is written in. esbuild transpiles our ESM source
 * to CJS on the fly.
 *
 * Why bundle: VS Code extensions distribute as a single `.vsix` that
 * must contain all runtime deps. Bundling lets us ship one file
 * (`extension.cjs`) and avoid shipping `node_modules/` with the vsix.
 *
 * `vscode` is marked external because it's provided by the host at
 * runtime — bundling it would both bloat the output and fail (the
 * `vscode` module has no public package on npm).
 */
await build({
  entryPoints: ['src/extension/extension.ts'],
  bundle: true,
  outfile: 'dist/extension/extension.cjs',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
  minify: false,
  logLevel: 'info',
});

/**
 * Mirror the codicon assets into `assets/codicons/` so the webview
 * can load them via `webview.asWebviewUri()` at runtime. Shipping
 * via `assets/` is the reliable path — `.vscodeignore` exceptions
 * for paths under `node_modules/` are not honored consistently by
 * vsce, so we copy at build time instead of relying on negation.
 */
const codiconFiles = [
  'node_modules/@vscode/codicons/dist/codicon.css',
  'node_modules/@vscode/codicons/dist/codicon.ttf',
];
for (const src of codiconFiles) {
  const dst = src.replace('node_modules/@vscode/codicons/dist/', 'assets/codicons/');
  await mkdir(dirname(dst), { recursive: true });
  await copyFile(src, dst);
}
