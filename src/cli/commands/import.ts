import { type Command } from 'commander';

import { readClaudeAiExport } from '../../importers/claudeai/reader.js';
import { type ClaudeAiConversation } from '../../importers/claudeai/schema.js';

interface ImportListOptions {
  readonly source: string;
}

const PREVIEW_MAX = 60;

export function registerImport(program: Command): void {
  const importCmd = program
    .command('import')
    .description('Import conversations from an external source (claude.ai)');

  importCmd
    .command('list <zip>')
    .description('List conversations contained in a claude.ai export ZIP')
    .option(
      '--source <source>',
      'Source of the export (only "claudeai" is supported for now)',
      'claudeai',
    )
    .action(async (zipPath: string, opts: ImportListOptions) => {
      if (opts.source !== 'claudeai') {
        throw new Error(`Unsupported import source: ${opts.source}`);
      }

      const exp = await readClaudeAiExport(zipPath);

      for (const warning of exp.warnings) {
        process.stderr.write(`WARN: ${warning}\n`);
      }

      const count = exp.conversations.length;
      const label = count === 1 ? 'conversation' : 'conversations';
      process.stdout.write(`\n# claude.ai export  (${String(count)} ${label})\n\n`);

      const sorted = [...exp.conversations].sort(compareByCreatedDesc);
      for (const conv of sorted) {
        const date = conv.created_at.slice(0, 10);
        const messages = conv.chat_messages.length;
        const name = truncate(conv.name.length > 0 ? conv.name : '(untitled)', PREVIEW_MAX);
        process.stdout.write(
          `  ${conv.uuid}  [${date}] messages=${String(messages)}  ${name}\n`,
        );
      }
    });
}

function compareByCreatedDesc(a: ClaudeAiConversation, b: ClaudeAiConversation): number {
  if (a.created_at === b.created_at) return 0;
  return a.created_at < b.created_at ? 1 : -1;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}
