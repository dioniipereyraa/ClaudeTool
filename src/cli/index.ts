#!/usr/bin/env node
import { Command } from 'commander';

import { VERSION } from '../index.js';

import { registerExport } from './commands/export.js';
import { registerList } from './commands/list.js';

const program = new Command();
program
  .name('exportal')
  .description('Bridge between claude.ai and Claude Code — export Claude Code sessions.')
  .version(VERSION);

registerList(program);
registerExport(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
