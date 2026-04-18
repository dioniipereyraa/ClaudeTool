import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import sharp from 'sharp';

const here = resolve(import.meta.dirname, '..');
const svg = await readFile(resolve(here, 'assets/icon.svg'));
const png = await sharp(svg).resize(128, 128).png().toBuffer();
await writeFile(resolve(here, 'assets/icon.png'), png);

console.log('Wrote assets/icon.png (128×128)');
