// Swap README.md → README.vsix.md around `vsce package` so the vsix ships the
// slim, image-less README (VS Code's extension viewer can't resolve relative
// image paths) while README.md on GitHub keeps its screenshots. Both files are
// tracked in git; keep them in sync by hand when one changes.

import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readme = join(root, 'README.md');
const vsixReadme = join(root, 'README.vsix.md');

const original = await readFile(readme, 'utf8');

try {
  const slim = await readFile(vsixReadme, 'utf8');
  await writeFile(readme, slim, 'utf8');

  const result = spawnSync(
    'npx',
    ['vsce', 'package', '--no-dependencies', '--no-rewrite-relative-links'],
    { stdio: 'inherit', cwd: root, shell: true },
  );
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
} finally {
  await writeFile(readme, original, 'utf8');
}
