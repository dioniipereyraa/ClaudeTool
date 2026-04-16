#!/usr/bin/env node
import { VERSION } from '../index.js';

function main(): void {
  process.stdout.write(`exportal ${VERSION}\n`);
}

main();
