// Package the Chrome companion as a flat .zip suitable for "Load unpacked"
// after extraction. Source files in `chrome/` stay untouched; we patch the
// manifest version in memory so it always matches `package.json` at release
// time without leaving the tree dirty.

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import JSZip from 'jszip';

const root = resolve(import.meta.dirname, '..');
const chromeDir = join(root, 'chrome');

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const manifestPath = join(chromeDir, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3) {
  throw new Error(`Expected manifest_version 3, got ${manifest.manifest_version}`);
}
manifest.version = version;

const zip = new JSZip();
zip.file('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

async function addRecursive(dir, prefix) {
  for (const entry of await readdir(dir)) {
    if (entry === 'manifest.json') continue;
    const full = join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) {
      await addRecursive(full, prefix + entry + '/');
    } else {
      zip.file(prefix + entry, await readFile(full));
    }
  }
}
await addRecursive(chromeDir, '');

const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const outName = `exportal-companion-${version}.zip`;
const outPath = join(root, outName);
await writeFile(outPath, buffer);

console.log(`Wrote ${outName} (${(buffer.length / 1024).toFixed(1)} KB)`);
